# GitHub access guide

A DeepSeek-Harness bundle that adds a **GitHub 访问排查 / GitHub access guide** entry to the sidebar. It repairs GitHub access on networks where only some GitHub server addresses are reachable — the usual campus-network and mainland-China situation — and it explains itself when a repair is impossible.

It ships two different fixes, because "GitHub is broken" is two different problems:

| Fix | What it does | When it helps |
| --- | --- | --- |
| **Start proxy** (加速代理) | Starts a local racing proxy on `127.0.0.1:17897` and points the system at it | Individual addresses are blocked or reset mid-flight, so direct connections flip between working and timing out |
| **Repair** (一键修复) | Installs a reversible `git url.<accelerator>.insteadOf` rewrite | `git` specifically is what fails, and an accelerator host is reachable |

## Install

Inside DSH, open **Settings → Plugins**, search for `dsh-github-access-guide`, and install it. From a terminal with the same profile:

```sh
dsh plugin --profile <profile> add dsh-github-access-guide
```

The panel appears in the sidebar between **Automations** and **Context insights**. Nothing starts on its own: the proxy listens only after you press **Start proxy**.

## The racing proxy

An ordinary address lookup returns one address per host, and on a restricted network that one address is often the broken one. The proxy asks for every candidate address it can find (system DNS plus a small built-in pool of known GitHub addresses), dials **all of them at once**, and keeps whichever connects first — killing the rest immediately. Failure is therefore a race, not a wait for a timeout.

For the GitHub hosts, opening a socket is not the finish line: these networks often accept the TCP connection and then reset it during the TLS handshake, so a race on `connect` alone picks an address that dies one millisecond later. For those hosts the proxy races the **handshake** instead, and only hands the browser an address that actually negotiated TLS. The verified address is remembered for two minutes. Everything else — every other site the machine loads through the same proxy — stays a plain TCP race, so nothing unrelated pays for the check.

The winning address per host is written to `$DSH_HOME/github-access-guide/racing-seed.json`, so the first request after a restart starts from the address that worked last time instead of waiting for DNS. Only GitHub hosts are remembered.

Measured on a network where direct connections mostly timed out: 1 of 8 direct requests to `github.com` succeeded (each failure took 15 s), while 8 of 8 requests through the proxy succeeded in 0.71–1.10 s. On a second network, after the handshake check was added: 2 of 4 direct requests failed, while 6 of 6 through the proxy succeeded in 0.67–0.90 s.

Turning it on changes three layers, all of them reversible:

1. **WinINET** — `ProxyEnable`, `ProxyServer`, `ProxyOverride` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`. This is what browsers read. It is a per-user key, so no administrator rights are needed and the hosts file is never touched.
2. **git** — `http.proxy` and `https.proxy` in the global git config.
3. **Environment** — `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` under `HKCU\Environment`, for child processes started afterwards.

Before the first change, the previous values are written to `$DSH_HOME/github-access-guide/proxy-state.json`. **Stop proxy** restores that snapshot exactly, including deleting `ProxyServer` when you had no proxy to begin with, and then stops the listener. The same restore runs when the plugin is disabled or removed.

If DSH exits while the proxy is engaged, the system would be left pointing at a dead port. On the next start the plugin checks that — and it checks all three layers, not just the system setting, because an orphaned `http.proxy` in the global git config makes every `git clone` fail with `Could not connect to server` and nothing else would ever clean it up. With a snapshot it re-engages; without one it clears whatever is still aimed at this port.

## The accelerator rewrite

**Repair** tries the accelerator channels in order, installs `git config --global url.<prefix>.insteadOf https://github.com/`, and then verifies with the **plain** GitHub URL — the one you actually type. A channel that installs but does not verify is removed before the next one is tried, so a reported success means a real `git ls-remote https://github.com/...` worked.

**Undo repair** removes only the rules this plugin installed and leaves any rewrite of your own alone. Repair refuses to run while the proxy is engaged, because stacking the two sends git through an accelerator *and* through the proxy.

## URL converter

Paste a GitHub address and the panel returns the forms this network can open: mirror and search pages plus a `git clone` line for repository pages, accelerator-prefixed addresses and a jsDelivr equivalent for raw files and release archives.

## What it cannot do

- **A network that drops the whole GitHub address range is out of reach.** The proxy needs at least one reachable address. When all candidates are reset, the tunnel establishes and the TLS handshake is then cut — measured as 0 reachable addresses out of 50 probed, twice, on a campus network. The panel says so instead of pretending.
- **Accelerator prefixes serve files, not pages.** `github.com` HTML comes back `403`/`404` through them, so browsing the site itself still needs a different network or a network administrator who lifts the block.
- **No mirror hunting.** Public GitHub web mirrors were probed repeatedly and were all unreachable from the restricted networks this was built on; the panel does not pretend a dead mirror works.
- **The rewrite is for git only.** Browsers, `curl` and package managers are covered by the proxy instead.

## Requirements

- Windows 10 or 11 (the system-proxy layer is WinINET plus `HKCU\Environment`).
- git in `PATH` for the repair and channel probes.
- No administrator rights.

## Layout

```
index.js         Host half: HTTP routes, status, repair, proxy engage/disengage
proxy.js         The racing proxy (node:net + node:dns, no dependencies)
system-proxy.js  Three-layer reversible system proxy takeover
client.js        Sidebar entry and panel (React via the host's module table)
locale/*.json    Card title and description
```

Routes, all `POST`, all requiring the normal DSH session:

```
/api/github-access-guide/status     full state, probes every channel (cached 20 s)
/api/github-access-guide/live       cheap state only: listener, system proxy, git, env
/api/github-access-guide/fix        install and verify an accelerator rewrite
/api/github-access-guide/revert     remove the rules this plugin installed
/api/github-access-guide/proxy/on   start the proxy and take over the system settings
/api/github-access-guide/proxy/off  restore the snapshot and stop the proxy
```

## Privacy

Nothing is sent anywhere except the GitHub hosts and accelerator channels this plugin probes, and the pages you open yourself. No telemetry, no accounts, no credentials.

## License

MIT
