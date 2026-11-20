/**
 * Host half of the GitHub access guide.
 *
 * The panel is not a manual any more: every button in it lands here and does
 * something real on this machine. Three actions, all reversible:
 *
 *   status  probe the actual network (direct TLS to github.com + every known
 *           accelerator), read the current git rewrite rules, report whether
 *           the hosts file is even writable here.
 *   fix     pick the best accelerator that really answers, install a
 *           `url.<prefix>.insteadOf https://github.com/` rewrite, then verify
 *           by running `git ls-remote` against the plain GitHub URL.
 *   revert  remove exactly the rewrite rules this plugin owns.
 *
 * Why `insteadOf` and not hosts: on a network that resets every GitHub
 * connection at the IP layer (the TLS handshake dies even when the SNI is
 * swapped for an unrelated host), a hosts entry changes nothing. A rewrite
 * keeps the user's URLs untouched and moves only the transport.
 *
 * Everything here is reachable from the panel over `/api/<ns>/...` POST routes
 * registered on the host `webServer`, the same shape other installed bundles
 * use for panel-to-host actions.
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { connect as tlsConnect } from 'node:tls'
import { request as httpsRequest } from 'node:https'
import { createProxy, DEFAULT_PORT, normalizeRouting, routingSignature } from './proxy.js'
import { engage, restore, readSnapshot, readSystemProxy, readToolProxy } from './system-proxy.js'

const execFileAsync = promisify(execFile)

export const name = 'github-access-guide'
export const inject = []

const NS = 'github-access-guide'
const GITHUB_PREFIX = 'https://github.com/'
const PROBE_RAW = 'https://raw.githubusercontent.com/octocat/Hello-World/master/README'
const PROBE_RAW_EXPECT = 'Hello World'
const PROBE_REPO = 'octocat/Hello-World.git'
const MAX_BODY_BYTES = 64 * 1024
const GIT_TIMEOUT_MS = 25_000
const NET_TIMEOUT_MS = 8_000
/* A channel probe is a go/no-go test, not a transfer. A prefix that cannot answer
 * `ls-remote` in twelve seconds is not one worth installing, and waiting the full
 * transfer timeout for it makes the panel's channel list take half a minute. */
const PROBE_GIT_TIMEOUT_MS = 12_000
/* Some accelerators are reachable only intermittently: measured on a campus
 * network, one prefix answered two of ten identical `ls-remote` calls and reset
 * the rest. A single attempt therefore reports "unusable" for a channel that
 * would have worked, so a probe retries. The retries are cheap in the common
 * case — a reset arrives in a fraction of a second, not at the timeout — and
 * the attempt count is reported so the panel can say what it took. */
const PROBE_GIT_ATTEMPTS = 3
const PROBE_GIT_RETRY_TIMEOUT_MS = 8_000

/**
 * Accelerators, most reliable first.
 *
 * `gitPrefix` replaces `https://github.com/` verbatim, so it must end with
 * `github.com/`; `urlPrefix` is prepended to a whole GitHub URL for downloads
 * and is null when the service cannot serve plain files that way.
 */
const CHANNELS = Object.freeze([
  {
    id: 'gh301',
    label: 'gh.301.ee',
    urlPrefix: 'https://gh.301.ee/',
    gitPrefix: 'https://gh.301.ee/https://github.com/',
  },
  {
    id: 'monkeyray',
    label: 'ghproxy.monkeyray.net',
    urlPrefix: 'https://ghproxy.monkeyray.net/',
    gitPrefix: 'https://ghproxy.monkeyray.net/https://github.com/',
  },
  {
    id: 'gitclone',
    label: 'gitclone.com',
    urlPrefix: null,
    gitPrefix: 'https://gitclone.com/github.com/',
  },
])

/** Mirrors that can stand in for browsing, where a transport proxy cannot. */
const MIRRORS = Object.freeze([
  { id: 'gitcode', label: 'gitcode.com', home: 'https://gitcode.com/explore' },
  { id: 'jsdelivr', label: 'jsDelivr', home: 'https://www.jsdelivr.com/' },
])

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (e) {
        reject(new Error(`invalid json body: ${e.message}`))
      }
    })
    req.on('error', reject)
  })
}

/** GET a URL, resolve to a plain report instead of throwing. */
function httpGet(url, timeoutMs = NET_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve({ ...value, ms: Date.now() - started })
    }
    let req
    try {
      req = httpsRequest(url, { method: 'GET', headers: { 'user-agent': 'dsh-github-access-guide' } }, (res) => {
        const chunks = []
        let size = 0
        res.on('data', (chunk) => {
          if (size < 8192) {
            chunks.push(chunk)
            size += chunk.length
          }
        })
        res.on('end', () => {
          finish({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        })
        res.on('error', (e) => finish({ ok: false, status: 0, error: e.code || e.message }))
      })
    } catch (e) {
      finish({ ok: false, status: 0, error: e.code || e.message })
      return
    }
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      finish({ ok: false, status: 0, error: 'timeout' })
    })
    req.on('error', (e) => finish({ ok: false, status: 0, error: e.code || e.message }))
    req.end()
  })
}

/**
 * Does a TLS handshake to github.com complete?
 *
 * This is the honest test of "is GitHub reachable at all": a hosts file or a
 * DNS answer changes the address, never whether the handshake survives. When
 * the network resets the connection mid-handshake, no local name resolution
 * trick helps, and the panel must say so instead of selling a hosts edit.
 */
function probeDirectTls(host = 'github.com', timeoutMs = 6000) {
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve({ ...value, ms: Date.now() - started })
    }
    let socket
    try {
      socket = tlsConnect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate() || {}
        const subject = cert.subject && cert.subject.CN ? cert.subject.CN : undefined
        socket.end()
        done({ ok: true, subject })
      })
    } catch (e) {
      done({ ok: false, error: e.code || e.message })
      return
    }
    socket.setTimeout(timeoutMs, () => {
      socket.destroy()
      done({ ok: false, error: 'timeout' })
    })
    socket.on('error', (e) => done({ ok: false, error: e.code || e.message }))
  })
}

/**
 * Run git; resolve to `{ok, stdout, stderr}` and never throw.
 *
 * Deliberately runs through whatever proxy configuration the machine already
 * has, including this plugin's own takeover. A probe that bypassed the proxy
 * would answer a question nobody asked: what the channel does on a direct
 * connection. Measured here, bypassing made a working channel report as down —
 * the plugin's forwarded tunnel was the only route that reached it.
 */
async function git(args, timeoutMs = GIT_TIMEOUT_MS) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') }
  } catch (e) {
    return {
      ok: false,
      stdout: String(e && e.stdout ? e.stdout : ''),
      stderr: String(e && e.stderr ? e.stderr : e && e.message ? e.message : String(e)),
    }
  }
}

/** Rewrite rules currently in the global git config, as `{prefix, target}`. */
async function readRewrites() {
  const result = await git(['config', '--global', '--get-regexp', '^url\\..*\\.insteadof$'], 8000)
  if (!result.ok) return { ok: true, rules: [], raw: '' }
  const rules = []
  for (const line of result.stdout.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const space = trimmed.indexOf(' ')
    if (space < 0) continue
    const key = trimmed.slice(0, space)
    const target = trimmed.slice(space + 1).trim()
    const match = /^url\.(.*)\.insteadof$/iu.exec(key)
    if (match === null) continue
    rules.push({ prefix: match[1], target })
  }
  return { ok: true, rules }
}

/** The rewrite rules this plugin installed, i.e. the ones that target github.com. */
function ownedRewrites(rules) {
  return rules.filter((rule) => rule.target === GITHUB_PREFIX)
}

/* ------------------------------------------------------------------ */
/* the three actions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Probe every channel, in parallel.
 *
 * A channel that can serve plain files is tested with one small GET. A
 * git-only channel (gitclone.com) has no file endpoint, so the honest test is
 * a real `git ls-remote` through its prefix — which is also exactly what the
 * rewrite will be asked to do, so the probe predicts the outcome.
 */
async function probeChannels() {
  const probes = await Promise.all(CHANNELS.map(async (channel) => {
    const started = Date.now()
    // Every channel is tested through git, because the rewrite is what the fix installs.
    // Retried: an intermittent prefix answers some attempts and resets others.
    let gitResult = { ok: false, stdout: '', stderr: '' }
    let gitAttempts = 0
    for (let attempt = 1; attempt <= PROBE_GIT_ATTEMPTS; attempt += 1) {
      gitAttempts = attempt
      gitResult = await git(
        ['ls-remote', `${channel.gitPrefix}${PROBE_REPO}`],
        attempt === 1 ? PROBE_GIT_TIMEOUT_MS : PROBE_GIT_RETRY_TIMEOUT_MS,
      )
      if (gitResult.ok === true && /refs\//u.test(gitResult.stdout)) break
    }
    const gitOk = gitResult.ok === true && /refs\//u.test(gitResult.stdout)
    const gitMs = Date.now() - started
    if (channel.urlPrefix === null) {
      // A git-only channel (gitclone.com) has no file endpoint at all.
      return {
        id: channel.id,
        label: channel.label,
        gitOnly: true,
        rawOk: false,
        gitOk,
        gitAttempts,
        gitMs,
        usable: gitOk,
        ms: gitMs,
        error: gitOk ? undefined : 'git unreachable',
      }
    }
    // A file channel is additionally tested for plain GETs, which is what the URL
    // converter sends through the prefix. Its git and file reachability differ in
    // practice, so both are reported instead of collapsing them into one flag.
    const raw = await httpGet(`${channel.urlPrefix}${PROBE_RAW}`)
    const rawOk = raw.ok === true && typeof raw.body === 'string' && raw.body.includes(PROBE_RAW_EXPECT)
    return {
      id: channel.id,
      label: channel.label,
      gitOnly: false,
      rawOk,
      gitOk,
      gitAttempts,
      gitMs,
      usable: rawOk,
      rawMs: raw.ms,
      rawStatus: raw.status,
      rawError: rawOk ? undefined : raw.error || `http ${raw.status}`,
    }
  }))
  return probes
}

/* Probing every channel costs tens of seconds when the network is bad, and the panel
 * refreshes far more often than the answer can change. One cached probe is shared by
 * every reader within the window, so the panel never stacks slow requests. */
const CHANNEL_CACHE_MS = 20_000
let channelCache = { at: 0, value: undefined }
let channelsInflight

async function probeChannelsCached(force) {
  const now = Date.now()
  if (force !== true && channelCache.value !== undefined && now - channelCache.at < CHANNEL_CACHE_MS) {
    return channelCache.value
  }
  /* Single flight. Three channels probed at once is slow enough that the panel would
   * otherwise start a second sweep while the first one is still running. */
  if (channelsInflight === undefined) {
    channelsInflight = probeChannels()
      .then((value) => {
        channelCache = { at: Date.now(), value }
        return value
      })
      .finally(() => {
        channelsInflight = undefined
      })
  }
  return channelsInflight
}

/** The cheap half: live counters plus what the machine is configured to do. */
async function collectLive() {
  const [proxy, system, tools, snapshot] = await Promise.all([
    Promise.resolve(proxyInstance.snapshot()),
    readSystemProxy(),
    readToolProxy(),
    readSnapshot(),
  ])
  return { proxy, system, tools, snapshot }
}

/** Full status: what the network does, what git is configured to do. */
async function collectStatus() {
  const [direct, rewrites, gitVersion, channels] = await Promise.all([
    probeDirectTls(),
    readRewrites(),
    git(['--version'], 8000),
    probeChannelsCached(),
  ])
  const rest = await collectRest(direct, rewrites, gitVersion)
  return { ...rest, channels, mirrors: MIRRORS }
}

/**
 * Everything except the channel sweep.
 *
 * The channel probe shells out to `git ls-remote` three times, and on a network that
 * drops GitHub that is tens of seconds. The panel has to show the direct and git
 * state immediately, so it asks for this first and for the channels separately.
 */
async function collectQuick() {
  const [direct, rewrites, gitVersion] = await Promise.all([
    probeDirectTls(),
    readRewrites(),
    git(['--version'], 8000),
  ])
  return collectRest(direct, rewrites, gitVersion)
}

async function collectRest(direct, rewrites, gitVersion) {
  const owned = ownedRewrites(rewrites.rules)
  const httpProxy = await git(['config', '--global', '--get', 'http.proxy'], 8000)
  const postBuffer = await git(['config', '--global', '--get', 'http.postBuffer'], 8000)
  const { proxy, system, tools, snapshot } = await collectLive()
  return {
    direct: { ok: direct.ok === true, ms: direct.ms, error: direct.ok ? undefined : direct.error },
    git: {
      available: gitVersion.ok === true,
      version: gitVersion.ok ? gitVersion.stdout.trim() : undefined,
      rewrite: owned.length > 0,
      activePrefix: owned.length > 0 ? owned[0].prefix : undefined,
      foreignRewrites: rewrites.rules.filter((rule) => rule.target !== GITHUB_PREFIX).length,
      httpProxy: httpProxy.ok ? httpProxy.stdout.trim() : undefined,
      postBuffer: postBuffer.ok ? postBuffer.stdout.trim() : undefined,
    },
    proxy,
    system,
    tools,
    snapshot,
    mirrors: MIRRORS,
  }
}

/** Install the rewrite for the best channel that actually works. */
async function applyFix(preferredId) {
  /* With the racing proxy on, the plain URL already works and a rewrite would only
   * add a detour on top of it. Refuse instead of silently making things worse. */
  if (proxyInstance.snapshot().running === true) {
    return { applied: false, reason: 'proxy-running', proxy: proxyInstance.snapshot() }
  }
  const channels = await probeChannels()
  // Either signal qualifies a channel to be *tried*: the probe's git result is the
  // better predictor, but a prefix that serves files while its git endpoint is flaky
  // still deserves the attempt, because the verification below is the real test.
  const usable = channels.filter((channel) => channel.gitOk === true || channel.usable === true)
  // Prefer a channel that also serves files: the rewrite and the URL converter are
  // better off on the same host, and a file-capable one is the more general service.
  usable.sort((a, b) => {
    const score = (channel) => (channel.usable === true ? 2 : 0) + (channel.gitOk === true ? 1 : 0)
    return score(b) - score(a)
  })
  const ordered = preferredId
    ? usable.sort((a, b) => (a.id === preferredId ? -1 : b.id === preferredId ? 1 : 0))
    : usable
  if (ordered.length === 0) {
    return { applied: false, reason: 'no-working-channel', channels }
  }

  // Clear whatever we installed before, so the fix is idempotent.
  await clearOwnedRewrites()

  const attempts = []
  for (const channel of ordered) {
    const definition = CHANNELS.find((entry) => entry.id === channel.id)
    if (definition === undefined) continue
    const add = await git(['config', '--global', `url.${definition.gitPrefix}.insteadOf`, GITHUB_PREFIX], 10_000)
    if (!add.ok) {
      attempts.push({ id: channel.id, label: channel.label, installed: false, error: add.stderr.trim() })
      continue
    }
    // Verify with the plain GitHub URL: this is what the user actually types.
    // Retried for the same reason the probe is: an intermittent accelerator resets
    // some connections and serves others, and one reset is not proof of failure.
    let verify = { ok: false, stdout: '', stderr: '' }
    let verifyAttempts = 0
    for (let attempt = 1; attempt <= PROBE_GIT_ATTEMPTS; attempt += 1) {
      verifyAttempts = attempt
      verify = await git(
        ['ls-remote', `${GITHUB_PREFIX}${PROBE_REPO}`],
        attempt === 1 ? GIT_TIMEOUT_MS : PROBE_GIT_RETRY_TIMEOUT_MS,
      )
      if (verify.ok === true && /refs\//u.test(verify.stdout)) break
    }
    const verified = verify.ok === true && /refs\//u.test(verify.stdout)
    attempts.push({ id: channel.id, label: channel.label, installed: true, verified, verifyAttempts })
    if (verified) {
      return {
        applied: true,
        channel: { id: channel.id, label: channel.label, prefix: definition.gitPrefix, urlPrefix: definition.urlPrefix },
        attempts,
        verifyAttempts,
        verifyHead: verify.stdout.split(/\r?\n/u)[0] || '',
      }
    }
    // Installed but the transport still fails: undo before trying the next one.
    await clearOwnedRewrites()
  }
  return { applied: false, reason: 'all-channels-failed', attempts, channels }
}

/** Remove exactly the rules that point github.com at an accelerator. */
async function clearOwnedRewrites() {
  const rewrites = await readRewrites()
  const owned = ownedRewrites(rewrites.rules)
  const removed = []
  for (const rule of owned) {
    const result = await git(['config', '--global', '--unset-all', `url.${rule.prefix}.insteadOf`], 8000)
    // An unset leaves an empty `url.<prefix>` section behind; drop it too.
    await git(['config', '--global', '--remove-section', `url.${rule.prefix}`], 8000)
    if (result.ok) removed.push(rule.prefix)
  }
  const after = await readRewrites()
  return { removed, remaining: ownedRewrites(after.rules).length }
}

/* ------------------------------------------------------------------ */
/* local racing proxy                                                  */
/* ------------------------------------------------------------------ */

const proxyInstance = createProxy({ port: DEFAULT_PORT })

/* ------------------------------------------------------------------ */
/* routing settings                                                    */
/* ------------------------------------------------------------------ */

/**
 * Where the panel's "extra domains" list and full-mode switch are remembered.
 *
 * Deliberately not inside proxy-state.json: that file records what the machine looked
 * like before the takeover and is deleted by `restore()`, while this is a preference
 * that has to survive a restore and a restart.
 */
function settingsPath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')
  return path.join(home, 'github-access-guide', 'settings.json')
}

let routing = normalizeRouting({})

/** Read the preference once per load; a missing or broken file means "defaults". */
async function loadRouting() {
  try {
    routing = normalizeRouting(JSON.parse(await fs.readFile(settingsPath(), 'utf8')))
  } catch {
    routing = normalizeRouting({})
  }
  proxyInstance.setRouting(routing)
  return routing
}

/**
 * Change the routing table and persist it.
 *
 * Unknown fields are ignored and a bad entry is dropped rather than rejected: the panel
 * writes what the user typed, and a typo in one domain should not discard the rest.
 */
async function saveRouting(patch) {
  const source = patch !== null && typeof patch === 'object' ? patch : {}
  const next = normalizeRouting({
    extra: source.extra !== undefined ? source.extra : routing.extra,
    full: source.full !== undefined ? source.full === true : routing.full,
  })
  routing = next
  proxyInstance.setRouting(next)
  /* Windows caches a PAC script per URL, so a scope change has to move the URL or the
   * browser keeps obeying yesterday's script. */
  const running = proxyInstance.snapshot()
  if (running.running === true && running.port !== undefined) {
    const reapplied = await engage(running.port, { pacSignature: routingSignature(next) })
    return { routing: next, pac: reapplied.pac, proxy: proxyInstance.snapshot() }
  }
  try {
    const file = settingsPath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch {
    /* a read-only home still works for this session */
  }
  return { routing: next, proxy: proxyInstance.snapshot() }
}

/* ------------------------------------------------------------------ */
/* watchdog                                                            */
/* ------------------------------------------------------------------ */

/**
 * Put the machine's proxy settings back the moment the listener disappears.
 *
 * The system proxy points at a loopback port, so a listener that died while the setting
 * survived turns *every* site into a browser error — the exact failure this plugin is
 * supposed to prevent. The host process is what can die, so as long as it is alive this
 * timer is the difference between one broken browser request and a permanently broken
 * one.
 */
const WATCHDOG_MS = 15_000

async function checkProxyHealth() {
  if (proxyInstance.snapshot().running === true) return { action: 'ok' }
  const system = await readSystemProxy()
  const pacOwned = typeof system.autoConfigURL === 'string'
    ? /^http:\/\/127\.0\.0\.1:\d+\/proxy\.pac(?:\?\S*)?\/?$/u.test(system.autoConfigURL.trim())
    : false
  const manualOwned = system.enabled === true && typeof system.server === 'string'
    ? /^127\.0\.0\.1:\d+$/u.test(system.server.trim())
    : false
  if (pacOwned !== true && manualOwned !== true) return { action: 'none' }

  const restored = await restore()
  /* Without a snapshot `restore()` only knows about WinINET's enable flag, so a PAC URL
   * written by an install whose snapshot was lost has to be removed here. */
  const after = await readSystemProxy()
  if (typeof after.autoConfigURL === 'string' && /^http:\/\/127\.0\.0\.1:\d+\/proxy\.pac(?:\?\S*)?\/?$/u.test(after.autoConfigURL.trim())) {
    await execFileAsync('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'AutoConfigURL', '/f'], { windowsHide: true, timeout: 10_000 }).catch(() => {})
  }
  return { action: 'restored', system: await readSystemProxy(), tools: restored.tools }
}

/**
 * Start the local proxy and point the system at it.
 *
 * This is the action for "make GitHub work reliably", and it is different in kind
 * from `applyFix`: the rewrite only helps git, while this covers the browser too,
 * because the racing happens below the HTTP layer.
 *
 * The PAC URL carries the routing fingerprint. Windows answers a PAC request from its
 * own cache keyed on the URL, so without a changing query the scope saved in the panel
 * would only take effect after a restart.
 */
async function engageProxy() {
  const started = await proxyInstance.start()
  if (started.running !== true) {
    return { engaged: false, reason: 'proxy-start-failed', proxy: proxyInstance.snapshot() }
  }
  const applied = await engage(started.port, { pacSignature: routingSignature(routing) })
  /* The rewrite and the proxy are two answers to the same problem, and stacking them
   * sends git through an accelerator *and* through the proxy. With the proxy running
   * the plain URL works, so drop the rewrite this plugin installed. */
  const cleared = await clearOwnedRewrites()
  return {
    /* The PAC is what browsers obey, so that is the value that proves the takeover
     * happened — `ProxyServer` alone can be stale from an older install. */
    engaged: applied.system.autoConfigURL === applied.pac,
    server: applied.server,
    pac: applied.pac,
    steps: applied.steps,
    clearedRewrites: cleared.removed,
    proxy: proxyInstance.snapshot(),
    system: applied.system,
    tools: applied.tools,
  }
}

/** Stop the proxy and put the previous system settings back. */
async function disengageProxy() {
  const restored = await restore()
  await proxyInstance.stop()
  return { engaged: false, steps: restored.steps, system: restored.system, tools: restored.tools, proxy: proxyInstance.snapshot() }
}

/**
 * Bring the machine back to a working state after a restart.
 *
 * The system proxy points at a loopback port, so if the host process dies while it is
 * engaged, every browser request fails until something puts the setting back. Two
 * cases, both handled here without asking:
 *
 *   a snapshot exists  the user had turned this on, so turn it back on;
 *   no snapshot        but the setting still points here, so the snapshot was lost —
 *                      clear it, because a proxy nobody listens on is worse than none.
 */
async function reconcileOnStart() {
  const [system, tools, snapshot] = await Promise.all([readSystemProxy(), readToolProxy(), readSnapshot()])
  const loopbackPort = (value) => {
    if (typeof value !== 'string') return undefined
    const match = /^http:\/\/127\.0\.0\.1:(\d+)\/?$/u.exec(value.trim())
    return match === null ? undefined : Number(match[1])
  }
  const pacPort = (value) => {
    if (typeof value !== 'string') return undefined
    const match = /^http:\/\/127\.0\.0\.1:(\d+)\/proxy\.pac(?:\?\S*)?\/?$/u.exec(value.trim())
    return match === null ? undefined : Number(match[1])
  }
  /* The PAC URL is the current form of the takeover; the manual server value is what
   * older installs wrote, and it still has to be recognised so an upgrade cleans up. */
  const pacOwned = system.autoConfigURL !== undefined ? pacPort(system.autoConfigURL) : undefined
  const manualOwned = system.enabled === true ? loopbackPort(`http://${String(system.server || '')}`) : undefined
  const systemPort = pacOwned !== undefined ? pacOwned : manualOwned
  const gitPort = loopbackPort(tools.git)
  const envPort = loopbackPort(tools.env && (tools.env.HTTPS_PROXY || tools.env.HTTP_PROXY))
  const leftHere = systemPort !== undefined || gitPort !== undefined || envPort !== undefined
  if (leftHere !== true) return { action: 'none' }

  if (snapshot !== undefined) {
    /* The user had this on: turn it back on, which also rewrites the git and env
     * values to the port we are about to listen on. */
    const resumed = await engageProxy()
    return { action: 'resumed', engaged: resumed.engaged, server: resumed.server }
  }

  /* No snapshot, but this plugin's settings survived it. `restore()` would only know
   * about WinINET here, so clear the tool-level leftovers explicitly — a git proxy
   * aimed at a closed loopback port makes `git clone` fail on every repository, and
   * nothing else would ever clean it up. */
  const restored = await restore()
  if (gitPort !== undefined) {
    await git(['config', '--global', '--unset-all', 'http.proxy'], 8000)
    await git(['config', '--global', '--unset-all', 'https.proxy'], 8000)
  }
  if (envPort !== undefined) {
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
      await execFileAsync('reg', ['delete', 'HKCU\\Environment', '/v', key, '/f'], { windowsHide: true, timeout: 10_000 }).catch(() => {})
    }
  }
  return { action: 'cleared-stale', system: restored.system, tools: await readToolProxy() }
}

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

function routePaths(ns) {
  return Object.freeze({
    status: `/api/${ns}/status`,
    quick: `/api/${ns}/quick`,
    channels: `/api/${ns}/channels`,
    live: `/api/${ns}/live`,
    fix: `/api/${ns}/fix`,
    revert: `/api/${ns}/revert`,
    proxyOn: `/api/${ns}/proxy/on`,
    proxyOff: `/api/${ns}/proxy/off`,
    routing: `/api/${ns}/routing`,
  })
}

/**
 * @param {unknown} webServer the host `webServer` service (only needs `register`)
 * @returns {Array<() => void>} unregister callbacks
 */
export function registerRoutes(webServer) {
  const register = typeof webServer?.register === 'function' ? webServer.register.bind(webServer) : undefined
  if (register === undefined) return []
  const paths = routePaths(NS)
  const offs = []

  const endpoint = (path, run) => {
    offs.push(register({
      kind: 'exact',
      path,
      handler: (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, code: 'method-not-allowed' })
          return
        }
        readJsonBody(req).then(async (body) => {
          const value = await run(body || {})
          sendJson(res, 200, { ok: true, value })
        }).catch((e) => {
          sendJson(res, 200, { ok: false, code: 'internal', message: String(e && e.message ? e.message : e) })
        })
      },
    }))
  }

  endpoint(paths.status, () => collectStatus())
  endpoint(paths.quick, () => collectQuick())
  endpoint(paths.channels, () => probeChannelsCached())
  endpoint(paths.live, () => collectLive())
  endpoint(paths.fix, (body) => applyFix(typeof body.channel === 'string' ? body.channel : undefined))
  endpoint(paths.revert, () => clearOwnedRewrites())
  endpoint(paths.proxyOn, () => engageProxy())
  endpoint(paths.proxyOff, () => disengageProxy())
  endpoint(paths.routing, (body) => saveRouting(body))
  return offs
}

/**
 * @param {object} ctx Cordis context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (sctx) => {
    const server = typeof sctx.get === 'function' ? sctx.get('webServer') : undefined
    if (server === undefined) return
    const offs = registerRoutes(server)
    if (offs.length === 0) return
    sctx.effect(() => () => {
      offs.forEach((off) => {
        try {
          off()
        } catch {
          /* already released */
        }
      })
      /* Unloading while engaged would leave the system proxy aimed at a port that is
       * about to close, which breaks the browser. Put the user's settings back first,
       * then drop the listener. */
      restore().catch(() => {}).then(() => proxyInstance.stop()).catch(() => {})
    }, `${NS}: api routes`)
  })

  /* A system proxy pointing at a loopback port that nothing listens on breaks every
   * browser request, so this must not wait for the user to open the panel. It runs
   * once per load and never throws into the loader. */
  loadRouting()
    .catch(() => {})
    .then(() => reconcileOnStart())
    .catch(() => {})

  /* The snapshot above only repairs a *restart*. If the listener dies while the host is
   * still running, this timer is what stops a dead port from breaking every site. */
  const watchdog = setInterval(() => {
    checkProxyHealth().catch(() => {})
  }, WATCHDOG_MS)
  if (typeof watchdog.unref === 'function') watchdog.unref()
  ctx.effect(() => () => clearInterval(watchdog), `${NS}: proxy watchdog`)

  return {
    status: collectStatus,
    quick: collectQuick,
    channels: () => probeChannelsCached(),
    live: collectLive,
    fix: applyFix,
    revert: clearOwnedRewrites,
    proxyOn: engageProxy,
    proxyOff: disengageProxy,
    routing: () => routing,
    setRouting: saveRouting,
  }
}
