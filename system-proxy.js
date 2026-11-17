/**
 * Point Windows, git and the shell at the local racing proxy — reversibly.
 *
 * Three separate switches, because they cover different consumers and only one of
 * them needs elevation:
 *
 *   WinINET (registry, HKCU)   browsers and anything using the system proxy.
 *                              HKCU is writable without administrator rights, which
 *                              is why this is the primary switch — the hosts file is
 *                              NOT writable here and `netsh winhttp` needs elevation.
 *   git config --global        git does not read the Windows proxy settings.
 *   HKCU\Environment           command-line tools that honour HTTP(S)_PROXY.
 *
 * Before the first change we snapshot the original values, so `restore()` puts the
 * machine back exactly as it was — including "there was no proxy at all".
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { PAC_PATH } from './proxy.js'

const execFileAsync = promisify(execFile)

const INTERNET_SETTINGS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
const ENVIRONMENT_KEY = 'HKCU\\Environment'
/* Values that only this plugin ever writes: a PAC URL or a manual proxy pointing at
 * loopback. They are recognised so a leftover can be removed even when the snapshot is
 * gone, which is the only way to guarantee that no browser is left fetching a PAC from
 * a port that stopped listening. */
const LOOPBACK_PAC = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/proxy\.pac\/?$/iu
const LOOPBACK_APEX = /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost):\d+(?:[;,]|$)/iu
const PROXY_OVERRIDE = 'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>'

/**
 * The URL the browser fetches its proxy decision from.
 *
 * Manual `ProxyServer` cannot express "only these hosts": Windows' `ProxyOverride` is
 * a *bypass* list, so with it the machine sends everything here and every unreachable
 * site comes back as this plugin's 502. A PAC script is the only non-elevated way to
 * describe a whitelist, and it also means unrelated traffic never enters this process.
 */
export function pacUrl(port) {
  return `http://127.0.0.1:${port}${PAC_PATH}`
}

async function reg(...args) {
  try {
    const { stdout } = await execFileAsync('reg', args, { windowsHide: true, timeout: 10_000 })
    return { ok: true, stdout }
  } catch (error) {
    const stderr = String((error && error.stderr) || '').trim()
    const stdout = String((error && error.stdout) || '').trim()
    return { ok: false, stdout, stderr, code: error && error.code }
  }
}

/** `reg query` prints `    Name    REG_TYPE    value`; return the raw strings by name. */
function parseRegQuery(stdout) {
  const values = {}
  for (const line of String(stdout || '').split(/\r?\n/u)) {
    const match = /^\s{2,}(\S[^\s]*)\s+(REG_[A-Z_]+)\s*(.*)$/u.exec(line)
    if (match === null) continue
    values[match[1]] = { type: match[2], value: match[3].trim() }
  }
  return values
}

async function queryKey(key) {
  const result = await reg('query', key)
  if (!result.ok) return {}
  return parseRegQuery(result.stdout)
}

async function writeString(key, name, value) {
  const result = await reg('add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f')
  return result.ok
}

async function writeDword(key, name, value) {
  const result = await reg('add', key, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f')
  return result.ok
}

async function deleteValue(key, name) {
  const result = await reg('delete', key, '/v', name, '/f')
  return result.ok
}

/**
 * Tell running applications that the proxy settings changed.
 *
 * Without this, Chromium-based browsers keep the value they read at start-up.
 * Best effort: it needs a PowerShell round trip and is harmless when it fails.
 */
async function notifyProxyChange() {
  const script = [
    '$sig = @"',
    '[System.Runtime.InteropServices.DllImport("wininet.dll", SetLastError = true)]',
    'public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);',
    '"@',
    '$t = Add-Type -MemberDefinition $sig -Name WinInet -Namespace DshProxy -PassThru',
    '$null = $t::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)',
    '$null = $t::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)',
  ].join('\n')
  try {
    await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 15_000,
    })
    return true
  } catch {
    return false
  }
}

/** Where the "how it was before we touched anything" snapshot lives. */
function statePath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')
  return path.join(home, 'github-access-guide', 'proxy-state.json')
}

async function readState() {
  try {
    const raw = await fs.readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

async function writeState(state) {
  const file = statePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function gitConfig(key) {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--global', '--get', key], {
      windowsHide: true,
      timeout: 10_000,
    })
    return { present: true, value: stdout.trim() }
  } catch {
    return { present: false, value: undefined }
  }
}

async function gitSet(key, value) {
  try {
    await execFileAsync('git', ['config', '--global', key, value], { windowsHide: true, timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

async function gitUnset(key) {
  try {
    await execFileAsync('git', ['config', '--global', '--unset-all', key], { windowsHide: true, timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

/** What the system proxy currently is, without changing anything. */
export async function readSystemProxy() {
  const values = await queryKey(INTERNET_SETTINGS)
  const enabled = values.ProxyEnable !== undefined && Number(values.ProxyEnable.value) === 1
  return {
    enabled,
    server: values.ProxyServer !== undefined ? values.ProxyServer.value : undefined,
    override: values.ProxyOverride !== undefined ? values.ProxyOverride.value : undefined,
    autoConfigURL: values.AutoConfigURL !== undefined ? values.AutoConfigURL.value : undefined,
  }
}

/** git + shell proxy state, for the panel. */
export async function readToolProxy() {
  const http = await gitConfig('http.proxy')
  const https = await gitConfig('https.proxy')
  const env = await queryKey(ENVIRONMENT_KEY)
  const read = (name) => (env[name] !== undefined ? env[name].value : undefined)
  return {
    git: http.present || https.present ? http.value || https.value : undefined,
    env: {
      HTTP_PROXY: read('HTTP_PROXY'),
      HTTPS_PROXY: read('HTTPS_PROXY'),
      ALL_PROXY: read('ALL_PROXY'),
    },
  }
}

/**
 * Point everything at `127.0.0.1:<port>`.
 *
 * Idempotent: the snapshot is only taken when none exists yet, so calling this twice
 * never records the proxy we installed as if it were the user's own setting.
 */
export async function engage(port) {
  const server = `127.0.0.1:${port}`
  const steps = {}

  let state = await readState()
  if (state === undefined) {
    const current = await readSystemProxy()
    const gitHttp = await gitConfig('http.proxy')
    const gitHttps = await gitConfig('https.proxy')
    const env = await queryKey(ENVIRONMENT_KEY)
    const envValue = (name) => (env[name] !== undefined ? env[name].value : undefined)
    state = {
      takenAt: new Date().toISOString(),
      wininet: current,
      git: { http: gitHttp.present ? gitHttp.value : undefined, https: gitHttps.present ? gitHttps.value : undefined },
      env: {
        HTTP_PROXY: envValue('HTTP_PROXY'),
        HTTPS_PROXY: envValue('HTTPS_PROXY'),
        ALL_PROXY: envValue('ALL_PROXY'),
      },
    }
    await writeState(state)
  }

  steps.wininet = await writeDword(INTERNET_SETTINGS, 'ProxyEnable', 1)
  steps.server = await writeString(INTERNET_SETTINGS, 'ProxyServer', server)
  steps.override = await writeString(INTERNET_SETTINGS, 'ProxyOverride', PROXY_OVERRIDE)
  /* The PAC is what browsers actually obey, so it is written last and only after the
   * manual settings are in place: if the script cannot be fetched they fall back to
   * these, which still work because the proxy forwards what it is not racing. */
  const pac = pacUrl(port)
  steps.pac = await writeString(INTERNET_SETTINGS, 'AutoConfigURL', pac)
  steps.notified = await notifyProxyChange()

  steps.git = (await gitSet('http.proxy', `http://${server}`)) && (await gitSet('https.proxy', `http://${server}`))

  steps.env = true
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
    if ((await writeString(ENVIRONMENT_KEY, name, `http://${server}`)) !== true) steps.env = false
  }

  return { server, pac, steps, snapshot: state, system: await readSystemProxy(), tools: await readToolProxy() }
}

/**
 * Put everything back the way the snapshot recorded it.
 *
 * Values that did not exist before are deleted rather than zeroed, so "no proxy" is
 * restored as "no proxy" and not as "proxy disabled".
 */
export async function restore() {
  const state = await readState()
  const steps = {}

  if (state !== undefined) {
    const wininet = state.wininet || {}
    if (wininet.enabled === true && wininet.server !== undefined) {
      steps.enabled = await writeDword(INTERNET_SETTINGS, 'ProxyEnable', 1)
      steps.server = await writeString(INTERNET_SETTINGS, 'ProxyServer', wininet.server)
    } else {
      steps.enabled = await writeDword(INTERNET_SETTINGS, 'ProxyEnable', 0)
      steps.server = wininet.server === undefined ? await deleteValue(INTERNET_SETTINGS, 'ProxyServer') : await writeString(INTERNET_SETTINGS, 'ProxyServer', wininet.server)
    }
    /* The override list was overwritten to keep loopback and the LAN out of the proxy;
     * it belongs to the user's settings, so it goes back whether or not they had a proxy. */
    if (wininet.override !== undefined) {
      steps.override = await writeString(INTERNET_SETTINGS, 'ProxyOverride', wininet.override)
    }
    /* The PAC URL belongs to this plugin, so "there was none" has to mean *remove* it:
     * leaving it behind points every browser at a port that will stop listening, and
     * that is precisely the broken state this module exists to avoid. */
    steps.autoConfigURL = wininet.autoConfigURL === undefined
      ? await deleteValue(INTERNET_SETTINGS, 'AutoConfigURL')
      : await writeString(INTERNET_SETTINGS, 'AutoConfigURL', wininet.autoConfigURL)
    steps.notified = await notifyProxyChange()

    const git = state.git || {}
    steps.git = true
    if (git.http === undefined) await gitUnset('http.proxy')
    else if ((await gitSet('http.proxy', git.http)) !== true) steps.git = false
    if (git.https === undefined) await gitUnset('https.proxy')
    else if ((await gitSet('https.proxy', git.https)) !== true) steps.git = false

    const env = state.env || {}
    steps.env = true
    for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
      const original = env[name]
      const ok = original === undefined
        ? await deleteValue(ENVIRONMENT_KEY, name)
        : await writeString(ENVIRONMENT_KEY, name, original)
      if (ok !== true) steps.env = false
    }
  } else {
    /* No snapshot means we have no record of what was there before. Turning the flag off is
     * not enough: a PAC URL or manual proxy still pointing at a loopback port keeps every
     * browser pointed at a server that is about to stop listening, and a failed PAC fetch
     * looks like a broken internet. Loopback values are ours by definition, so they go. */
    steps.enabled = await writeDword(INTERNET_SETTINGS, 'ProxyEnable', 0)
    const live = await readSystemProxy()
    steps.autoConfigURL = live.autoConfigURL !== undefined && LOOPBACK_PAC.test(live.autoConfigURL) === true
      ? await deleteValue(INTERNET_SETTINGS, 'AutoConfigURL')
      : true
    steps.server = live.server !== undefined && LOOPBACK_APEX.test(live.server) === true
      ? await deleteValue(INTERNET_SETTINGS, 'ProxyServer')
      : true
    steps.notified = await notifyProxyChange()
    await gitUnset('http.proxy')
    await gitUnset('https.proxy')
    for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) await deleteValue(ENVIRONMENT_KEY, name)
  }

  await fs.rm(statePath(), { force: true }).catch(() => {})
  return { steps, system: await readSystemProxy(), tools: await readToolProxy() }
}

/** Snapshot on disk, so the panel can say whether a restore is still possible. */
export async function readSnapshot() {
  const state = await readState()
  if (state === undefined) return undefined
  return { takenAt: state.takenAt, wininet: state.wininet, git: state.git, env: state.env }
}
