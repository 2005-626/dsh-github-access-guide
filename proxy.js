/**
 * Local racing proxy.
 *
 * Why this exists: on networks where github.com is reachable through *some*
 * addresses and reset through others (and which ones changes with the network),
 * no fixed hosts entry or accelerator prefix helps — the only thing that does is
 * trying every candidate address at once and keeping whichever answers first.
 *
 * That is exactly what a browser cannot do: it resolves one address (or a small
 * set, serially) and waits for the timeout. So this module listens on loopback as
 * an HTTP proxy and, for every `CONNECT host:port`, races all candidate addresses
 * of that host in parallel, keeps the winner, and pipes bytes through it.
 *
 * Everything is per-connection and stateless beyond a short cache, so stopping the
 * proxy simply closes the listener; established tunnels die with it.
 */
import net from 'node:net'
import tls from 'node:tls'
import { Resolver, promises as dns } from 'node:dns'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const PROXY_HOST = '127.0.0.1'
export const DEFAULT_PORT = 17897
const PORT_ATTEMPTS = 12

const CACHE_TTL_MS = 60_000
/** Shorter reuse for the seed-only answer handed out before DNS comes back. */
const FAST_TTL_MS = 5_000
const DIAL_TIMEOUT_MS = 6_000
const SUSPECT_MS = 45_000
/** How long a handshake-verified address is trusted before it is checked again. */
const HEALTHY_TTL_MS = 120_000
/** Budget for the TLS probe race; it happens before the browser's own TLS starts. */
const PROBE_TIMEOUT_MS = 4_000
/** A tunnel that carried no bytes and died faster than this was almost certainly reset. */
const SUSPECT_MAX_LIFETIME_MS = 1_500

/**
 * Extra addresses per host.
 *
 * DNS usually returns one or two; the whole point of racing is to have several.
 * These are the long-lived GitHub front-door ranges plus the Fastly addresses that
 * serve raw/objects content, and they are only ever *added* to what DNS says.
 */
const POOL = Object.freeze({
  'github.com': ['20.27.177.113', '57.155.223.240', '20.205.243.166', '140.82.112.3', '140.82.114.3'],
  'api.github.com': ['20.27.177.113', '57.155.223.240', '20.205.243.166', '140.82.112.6'],
  'codeload.github.com': ['20.27.177.113', '57.155.223.240', '20.205.243.166'],
  'gist.github.com': ['20.27.177.113', '57.155.223.240', '20.205.243.166'],
  'raw.githubusercontent.com': ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133'],
  'objects.githubusercontent.com': ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133'],
  'gist.githubusercontent.com': ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133'],
  'avatars.githubusercontent.com': ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133'],
  'camo.githubusercontent.com': ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133'],
  'github.githubassets.com': ['185.199.108.154', '185.199.109.154', '185.199.110.154', '185.199.111.154'],
})

const GITHUB_HOSTS = new Set(Object.keys(POOL))

/** Hosts the panel reports about; racing applies to every host, this is just the summary. */
export const WATCHED_HOSTS = Object.freeze([
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
])

/**
 * Public resolvers used only when the system resolver returns nothing usable.
 *
 * A captive portal or a mis-set DHCP option can leave the machine with a resolver
 * that answers nothing at all for GitHub names; asking two well-known Chinese
 * resolvers directly is faster than failing the whole tunnel.
 */
const FALLBACK_DNS = ['223.5.5.5', '119.29.29.29']

/** Where the last winning address per host is remembered across process restarts. */
function seedPath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')
  return path.join(home, 'github-access-guide', 'racing-seed.json')
}

/**
 * Test one address the way the browser will actually use it: connect TCP *and*
 * complete a TLS handshake with the real SNI.
 *
 * TCP reachability alone is not enough. The common failure on campus networks is a
 * connection that is accepted and then reset during the handshake, so a race on
 * `connect` alone happily picks an address that fails one millisecond later.
 */
function probeTls(address, servername, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        /* already gone */
      }
      resolve({ address, ms: Date.now() - started, ...value })
    }
    let socket
    try {
      socket = tls.connect({ host: address, port: 443, servername, rejectUnauthorized: false })
    } catch (error) {
      resolve({ address, ok: false, ms: Date.now() - started, error: (error && error.code) || 'connect-failed' })
      return
    }
    socket.setTimeout(timeoutMs, () => done({ ok: false, error: 'timeout' }))
    socket.once('secureConnect', () => done({ ok: true }))
    socket.once('error', (error) => done({ ok: false, error: (error && error.code) || 'tls-error' }))
  })
}

/**
 * Race TLS probes and keep the first one that completes a handshake.
 *
 * Returns the winning address plus every probe's result, so the caller can tell the
 * panel which addresses are healthy and demote the ones that only looked reachable.
 */
function raceTls(addresses, servername, timeoutMs) {
  return new Promise((resolve) => {
    if (addresses.length === 0) {
      resolve({ ok: false, error: 'no-address', results: [] })
      return
    }
    const results = []
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ ok: false, error: 'timeout', results })
    }, timeoutMs)
    for (const address of addresses) {
      probeTls(address, servername, timeoutMs).then((result) => {
        results.push(result)
        if (result.ok === true && settled === false) {
          settled = true
          clearTimeout(timer)
          resolve({ ok: true, address: result.address, ms: result.ms, results })
        } else if (results.length === addresses.length && settled === false) {
          settled = true
          clearTimeout(timer)
          resolve({ ok: false, error: results[0] ? results[0].error : 'tls-failed', results })
        }
      }).catch(() => { /* probeTls never rejects, but a bug here must not hang a tunnel */ })
    }
  })
}

/**
 * Try every address in parallel and resolve with the first socket that connects.
 * The losers are destroyed immediately so a slow address never costs the user time.
 */
function dialRace(addresses, port, timeoutMs) {
  return new Promise((resolve) => {
    if (addresses.length === 0) {
      resolve({ ok: false, error: 'no-address' })
      return
    }
    const sockets = []
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      for (const socket of sockets) {
        if (value.ok === true && socket === value.socket) continue
        try {
          socket.destroy()
        } catch {
          /* already gone */
        }
      }
      resolve(value)
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs)
    for (const address of addresses) {
      const socket = net.connect({ host: address, port })
      sockets.push(socket)
      socket.setTimeout(timeoutMs, () => {
        try {
          socket.destroy()
        } catch {
          /* already gone */
        }
      })
      socket.once('connect', () => finish({ ok: true, socket, address }))
      socket.once('error', () => {
        try {
          socket.destroy()
        } catch {
          /* already gone */
        }
      })
    }
  })
}

/**
 * @param {object} [options]
 * @param {number} [options.port] preferred port; nearby ports are tried when taken.
 */
export function createProxy(options = {}) {
  const preferredPort = Number.isInteger(options.port) ? options.port : DEFAULT_PORT
  const cache = new Map()
  /** @type {Map<string, number>} address -> epoch ms until which it is deprioritised */
  const suspect = new Map()
  /** Remembered winners per host, so the first request after a restart is fast. */
  const seed = new Map()
  /** host -> address that completed a TLS handshake, with an expiry. */
  const healthy = new Map()
  let seedDirty = false
  let seedTimer
  const stats = {
    startedAt: undefined,
    port: undefined,
    connections: 0,
    tunnels: 0,
    failures: 0,
    probes: 0,
    probeOk: 0,
    bytesUp: 0,
    bytesDown: 0,
    msTotal: 0,
    wins: {},
    lastError: undefined,
  }
  /** @type {import('node:net').Server | undefined} */
  let server

  /** Load remembered winners once; a missing or corrupt file is simply no seed. */
  async function loadSeed() {
    try {
      const raw = await fs.readFile(seedPath(), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed === null || typeof parsed !== 'object') return
      for (const [host, list] of Object.entries(parsed)) {
        if (Array.isArray(list) === false) continue
        /* Skip entries written by an older build that seeded every host it saw. */
        if (GITHUB_HOSTS.has(host) !== true) continue
        const clean = list.filter((entry) => typeof entry === 'string' && /^\d+\.\d+\.\d+\.\d+$/u.test(entry))
        if (clean.length > 0) seed.set(host, clean.slice(0, 5))
      }
    } catch {
      /* first run, or the file was removed — nothing to restore */
    }
  }

  /** Persist winners, debounced: races happen constantly, disk writes should not. */
  function scheduleSeedSave() {
    seedDirty = true
    if (seedTimer !== undefined) return
    seedTimer = setTimeout(() => {
      seedTimer = undefined
      if (seedDirty !== true) return
      seedDirty = false
      const out = {}
      for (const [host, list] of seed.entries()) if (list.length > 0) out[host] = list.slice(0, 5)
      const file = seedPath()
      fs.mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.writeFile(file, `${JSON.stringify(out, null, 2)}\n`, 'utf8'))
        .catch(() => { /* a read-only home is not worth failing a request over */ })
    }, 5_000)
    if (typeof seedTimer.unref === 'function') seedTimer.unref()
  }

  function noteWinner(host, address) {
    if (typeof host !== 'string' || typeof address !== 'string') return
    /* Only the GitHub hosts are worth remembering: this proxy carries every site the
     * machine loads, and a seed full of unrelated CDNs says nothing useful. */
    if (GITHUB_HOSTS.has(host) !== true) return
    const list = seed.get(host) || []
    const next = [address].concat(list.filter((entry) => entry !== address)).slice(0, 5)
    seed.set(host, next)
    scheduleSeedSave()
  }

  /** Ask the system resolver, then two public ones, for v4 addresses of `host`. */
  async function lookupAll(host) {
    const found = []
    const push = (address) => {
      if (typeof address === 'string' && /^\d+\.\d+\.\d+\.\d+$/u.test(address) && !found.includes(address)) found.push(address)
    }
    try {
      for (const address of await dns.resolve4(host)) push(address)
    } catch {
      /* fall through to lookup below */
    }
    if (found.length === 0) {
      /* resolve4 skips the hosts file and CNAME chains the resolver will not flatten;
       * lookup covers both. */
      try {
        for (const entry of await dns.lookup(host, { all: true, family: 4 })) push(entry.address)
      } catch {
        /* the system resolver itself is the broken part */
      }
    }
    if (found.length === 0) {
      const resolver = new Resolver({ timeout: 2_000, tries: 1 })
      resolver.setServers(FALLBACK_DNS)
      try {
        for (const address of await resolver.resolve4(host)) push(address)
      } catch {
        /* nothing left to try; the pool still gets us there */
      }
    }
    return found
  }

  function compose(host, resolved) {
    const found = []
    for (const address of seed.get(host) || []) if (!found.includes(address)) found.push(address)
    for (const address of resolved) if (!found.includes(address)) found.push(address)
    for (const address of POOL[host] || []) if (!found.includes(address)) found.push(address)
    const now = Date.now()
    // Addresses that recently accepted a tunnel and then reset it go last, but stay
    // in the race: a network change can make yesterday's bad address the best one.
    const ordered = found.slice().sort((a, b) => (suspect.get(a) || 0) - (suspect.get(b) || 0))
    return ordered.slice(0, 6)
  }

  async function resolveCandidates(host) {
    const cached = cache.get(host)
    if (cached !== undefined && cached.expires > Date.now()) return cached.addresses
    /* Fast path: an address that won a race for this host before is almost always the
     * best first guess, and returning it now avoids waiting for DNS before we can even
     * start dialling. The resolver refresh below fills in fresh addresses for the next
     * connection. */
    const remembered = seed.get(host)
    if (remembered !== undefined && remembered.length > 0) {
      const quick = compose(host, [])
      cache.set(host, { addresses: quick, expires: Date.now() + FAST_TTL_MS })
      lookupAll(host)
        .then((resolved) => {
          if (resolved.length === 0) return
          cache.set(host, { addresses: compose(host, resolved), expires: Date.now() + CACHE_TTL_MS })
        })
        .catch(() => {})
      return quick
    }
    const resolved = await lookupAll(host)
    const limited = compose(host, resolved)
    cache.set(host, { addresses: limited, expires: Date.now() + CACHE_TTL_MS })
    return limited
  }

  function noteSuspect(address) {
    suspect.set(address, Date.now() + SUSPECT_MS)
    cache.clear()
    /* The handshake cache answers per host, so a reset means it must be re-probed. */
    for (const [host, entry] of healthy.entries()) if (entry.address === address) healthy.delete(host)
  }

  function pipe(client, upstream, address, host) {
    const started = Date.now()
    let carried = 0
    stats.tunnels += 1
    stats.wins[address] = (stats.wins[address] || 0) + 1
    stats.msTotal += started - (client.__startedAt || started)
    noteWinner(host, address)

    client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    upstream.setTimeout(0)
    client.setTimeout(0)

    client.on('data', (chunk) => {
      carried += chunk.length
      stats.bytesUp += chunk.length
    })
    upstream.on('data', (chunk) => {
      carried += chunk.length
      stats.bytesDown += chunk.length
    })

    const teardown = () => {
      if (carried === 0 && Date.now() - started < SUSPECT_MAX_LIFETIME_MS) noteSuspect(address)
    }
    upstream.on('error', () => {
      teardown()
      try {
        client.destroy()
      } catch {
        /* already gone */
      }
    })
    client.on('error', () => {
      try {
        upstream.destroy()
      } catch {
        /* already gone */
      }
    })
    upstream.on('close', () => {
      teardown()
      try {
        client.destroy()
      } catch {
        /* already gone */
      }
    })
    client.on('close', () => {
      try {
        upstream.destroy()
      } catch {
        /* already gone */
      }
    })

    upstream.pipe(client)
    client.pipe(upstream)
  }

  /**
   * The address for `host` that we know completes a TLS handshake, or undefined.
   *
   * This is the difference between "the socket opened" and "the site works". On the
   * networks this plugin exists for, an address can accept a connection and then be
   * reset during the handshake; dialling such an address produces a browser error a
   * moment later, so it is worth one extra round trip to find an address that
   * actually negotiates. The answer is cached, so only the first connection of a
   * session pays for it.
   */
  async function resolveHealthy(host) {
    const cached = healthy.get(host)
    if (cached !== undefined && cached.expires > Date.now()) return cached.address
    const candidates = await resolveCandidates(host)
    if (candidates.length === 0) return undefined
    const raced = await raceTls(candidates, host, PROBE_TIMEOUT_MS)
    stats.probes += 1
    for (const result of raced.results) {
      if (result.ok === true) {
        stats.probeOk += 1
        healthy.set(host, { address: result.address, expires: Date.now() + HEALTHY_TTL_MS })
        noteWinner(host, result.address)
        return result.address
      }
      /* Only a handshake reset is evidence about the address itself. A timeout can
       * just as easily be a slow link, so it is not held against the address. */
      if (result.error === 'ECONNRESET' || result.error === 'EPIPE') noteSuspect(result.address)
    }
    healthy.delete(host)
    return undefined
  }

  async function handleConnect(client, first, host, port) {
    client.__startedAt = Date.now()
    stats.connections += 1

    let probedAll = false
    /* Port 443 is TLS, so we can check that the handshake really completes before
     * handing the browser a tunnel — but only for the hosts that actually go wrong
     * here. Probing every HTTPS host would add a round trip to every unrelated site
     * that shares this proxy, so everything else stays a plain TCP race. */
    if (port === 443 && GITHUB_HOSTS.has(host)) {
      const healthyAddress = await resolveHealthy(host)
      if (healthyAddress !== undefined) {
        const direct = await dialRace([healthyAddress], port, DIAL_TIMEOUT_MS)
        if (direct.ok === true) {
          pipe(client, direct.socket, direct.address, host)
          return
        }
        /* It answered a handshake a moment ago, so this is a fresh network blip: drop
         * the cached address and fall through to the wider race. */
        healthy.delete(host)
        noteSuspect(healthyAddress)
      } else {
        probedAll = true
      }
    }

    /* When every candidate already failed a real handshake, two more six-second TCP
     * rounds only turn a fast failure into a long hang: the browser is going to see a
     * dead page either way. One short round is enough to notice a blip, and the next
     * request probes again because failures are never cached. */
    const dialBudget = probedAll === true ? Math.min(DIAL_TIMEOUT_MS, 2_500) : DIAL_TIMEOUT_MS
    const candidates = await resolveCandidates(host)
    let upstream = await dialRace(candidates, port, dialBudget)
    if (upstream.ok !== true && probedAll !== true) {
      cache.delete(host)
      const fresh = await resolveCandidates(host)
      upstream = await dialRace(fresh, port, DIAL_TIMEOUT_MS)
    }
    if (upstream.ok !== true) {
      stats.failures += 1
      stats.lastError = `${host}:${port} ${upstream.error}`
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      return
    }
    pipe(client, upstream.socket, upstream.address, host)
  }

  /** Plain `GET http://host/path HTTP/1.1` — the proxy form browsers use for http URLs. */
  async function handlePlain(client, first, host, port) {
    client.__startedAt = Date.now()
    stats.connections += 1
    const candidates = await resolveCandidates(host)
    const upstream = await dialRace(candidates, port, DIAL_TIMEOUT_MS)
    if (upstream.ok !== true) {
      stats.failures += 1
      stats.lastError = `${host}:${port} ${upstream.error}`
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      return
    }
    const socket = upstream.socket
    socket.setTimeout(0)
    client.setTimeout(0)
    stats.tunnels += 1
    stats.wins[upstream.address] = (stats.wins[upstream.address] || 0) + 1
    noteWinner(host, upstream.address)
    socket.on('error', () => {
      try {
        client.destroy()
      } catch {
        /* already gone */
      }
    })
    client.on('error', () => {
      try {
        socket.destroy()
      } catch {
        /* already gone */
      }
    })
    socket.on('close', () => {
      try {
        client.destroy()
      } catch {
        /* already gone */
      }
    })
    client.on('close', () => {
      try {
        socket.destroy()
      } catch {
        /* already gone */
      }
    })
    socket.pipe(client)
    socket.write(first)
    client.pipe(socket)
  }

  function onConnection(client) {
    client.on('error', () => {})
    client.once('data', (first) => {
      const head = first.toString('latin1')
      const connect = /^CONNECT\s+([^\s:]+):(\d+)\s+HTTP\/1\.[01]/i.exec(head)
      if (connect !== null) {
        handleConnect(client, first, connect[1], Number(connect[2])).catch(() => {
          stats.failures += 1
          try {
            client.destroy()
          } catch {
            /* already gone */
          }
        })
        return
      }
      const absolute = /^(?:GET|HEAD|POST|PUT|DELETE|OPTIONS|PATCH)\s+http:\/\/([^/\s:]+)(?::(\d+))?/i.exec(head)
      if (absolute !== null) {
        handlePlain(client, first, absolute[1], absolute[2] ? Number(absolute[2]) : 80).catch(() => {
          stats.failures += 1
          try {
            client.destroy()
          } catch {
            /* already gone */
          }
        })
        return
      }
      client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n')
    })
  }

  function listen(port, remaining) {
    return new Promise((resolve, reject) => {
      const candidate = net.createServer(onConnection)
      candidate.once('error', (error) => {
        if (error && error.code === 'EADDRINUSE' && remaining > 0) {
          listen(port + 1, remaining - 1).then(resolve, reject)
          return
        }
        reject(error)
      })
      candidate.listen(port, PROXY_HOST, () => {
        server = candidate
        stats.port = port
        stats.startedAt = new Date().toISOString()
        resolve(port)
      })
    })
  }

  /**
   * @param {number} [port] preferred port; falls back to the configured one.
   */
  async function start(port) {
    if (server !== undefined) return { running: true, port: stats.port }
    await loadSeed()
    const bound = await listen(Number.isInteger(port) ? port : preferredPort, PORT_ATTEMPTS)
    return { running: true, port: bound }
  }

  async function stop() {
    if (server === undefined) return { running: false, port: undefined }
    const closing = server
    server = undefined
    stats.port = undefined
    await new Promise((resolve) => {
      closing.close(() => resolve())
      // `close()` waits for open tunnels; destroy them so stop is immediate.
      try {
        closing.closeAllConnections?.()
      } catch {
        /* older node */
      }
    })
    return { running: false, port: undefined }
  }

  function snapshot() {
    const addresses = Object.entries(stats.wins)
      .sort((a, b) => b[1] - a[1])
      .map(([address, wins]) => ({ address, wins }))
    return {
      running: server !== undefined,
      port: stats.port,
      startedAt: stats.startedAt,
      connections: stats.connections,
      tunnels: stats.tunnels,
      failures: stats.failures,
      tlsProbes: stats.probes,
      tlsProbesOk: stats.probeOk,
      avgConnectMs: stats.tunnels > 0 ? Math.round(stats.msTotal / stats.tunnels) : undefined,
      bytesUp: stats.bytesUp,
      bytesDown: stats.bytesDown,
      lastError: stats.lastError,
      addresses: addresses.slice(0, 6),
      suspect: [...suspect.entries()].filter(([, until]) => until > Date.now()).map(([address]) => address),
      seed: [...seed.entries()].map(([host, list]) => ({ host, addresses: list.slice(0, 3) })),
      healthy: [...healthy.entries()].filter(([, entry]) => entry.expires > Date.now()).map(([host, entry]) => ({ host, address: entry.address })),
      watchedHosts: WATCHED_HOSTS,
      githubHosts: [...GITHUB_HOSTS],
    }
  }

  return { start, stop, snapshot, preferredPort }
}
