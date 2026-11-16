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
import { promises as dns } from 'node:dns'

export const PROXY_HOST = '127.0.0.1'
export const DEFAULT_PORT = 17897
const PORT_ATTEMPTS = 12

const CACHE_TTL_MS = 60_000
const DIAL_TIMEOUT_MS = 6_000
const SUSPECT_MS = 45_000
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
  const stats = {
    startedAt: undefined,
    port: undefined,
    connections: 0,
    tunnels: 0,
    failures: 0,
    bytesUp: 0,
    bytesDown: 0,
    msTotal: 0,
    wins: {},
    lastError: undefined,
  }
  /** @type {import('node:net').Server | undefined} */
  let server

  async function resolveCandidates(host) {
    const cached = cache.get(host)
    if (cached !== undefined && cached.expires > Date.now()) return cached.addresses
    const found = []
    try {
      const resolved = await dns.resolve4(host)
      for (const address of resolved) if (!found.includes(address)) found.push(address)
    } catch {
      /* fall through to lookup below */
    }
    if (found.length === 0) {
      /* resolve4 skips the hosts file and names that only have a CNAME chain the
       * resolver will not flatten; lookup covers both. */
      try {
        const looked = await dns.lookup(host, { all: true, family: 4 })
        for (const entry of looked) if (!found.includes(entry.address)) found.push(entry.address)
      } catch {
        /* DNS itself can be the broken part; the pool below still gets us there */
      }
    }
    for (const address of POOL[host] || []) if (!found.includes(address)) found.push(address)
    const now = Date.now()
    // Addresses that recently accepted a tunnel and then reset it go last, but stay
    // in the race: a network change can make yesterday's bad address the best one.
    const ordered = found.slice().sort((a, b) => (suspect.get(a) || 0) - (suspect.get(b) || 0))
    const limited = ordered.slice(0, 5)
    cache.set(host, { addresses: limited, expires: now + CACHE_TTL_MS })
    return limited
  }

  function noteSuspect(address) {
    suspect.set(address, Date.now() + SUSPECT_MS)
    cache.clear()
  }

  function pipe(client, upstream, address) {
    const started = Date.now()
    let carried = 0
    stats.tunnels += 1
    stats.wins[address] = (stats.wins[address] || 0) + 1
    stats.msTotal += started - (client.__startedAt || started)

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

  async function handleConnect(client, first, host, port) {
    client.__startedAt = Date.now()
    stats.connections += 1
    const candidates = await resolveCandidates(host)
    let upstream = await dialRace(candidates, port, DIAL_TIMEOUT_MS)
    if (upstream.ok !== true) {
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
    pipe(client, upstream.socket, upstream.address)
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
      avgConnectMs: stats.tunnels > 0 ? Math.round(stats.msTotal / stats.tunnels) : undefined,
      bytesUp: stats.bytesUp,
      bytesDown: stats.bytesDown,
      lastError: stats.lastError,
      addresses: addresses.slice(0, 6),
      suspect: [...suspect.entries()].filter(([, until]) => until > Date.now()).map(([address]) => address),
      watchedHosts: WATCHED_HOSTS,
      githubHosts: [...GITHUB_HOSTS],
    }
  }

  return { start, stop, snapshot, preferredPort }
}
