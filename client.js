window.__ModuleLoader__.load({
  id: 'dsh-github-access-guide',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'github-access-guide';
    const PANEL_ID = 'github-access-guide';

    /* ------------------------------------------------------------------ *
     * Bilingual copy. Every visible string lives here and is registered
     * through the Client locale service, so switching the UI language
     * re-renders the panel in the same pass as the rest of the shell.
     * ------------------------------------------------------------------ */
    const TEXT = {
      panel: { zh: 'GitHub 访问排查', en: 'GitHub access guide' },
      subtitle: {
        zh: '网页打不开、图片缺失、clone 卡住、下载中断 —— 先判断问题出在哪一层，再对症处理。',
        en: 'Pages timing out, broken images, stalled clones, aborted downloads — find the failing layer first, then fix that layer.',
      },
      envBadge: { zh: '适用 Windows 10 / 11', en: 'Windows 10 / 11' },
      copy: { zh: '复制', en: 'Copy' },
      copied: { zh: '已复制', en: 'Copied' },
      failed: { zh: '复制失败', en: 'Copy failed' },

      fixTitle: { zh: '一键修复', en: 'One-click repair' },
      fixIntro: {
        zh: '下面三个按钮会直接在这台机器上执行动作，不只是说明：先探测真实网络，再写入可撤销的 git 加速规则，最后用原生 GitHub 地址验证是否真的通了。',
        en: 'These three buttons act on this machine rather than explaining: probe the real network, install a reversible git accelerator rule, then verify it against the plain GitHub URL.',
      },
      btnCheck: { zh: '重新检测', en: 'Re-check' },
      btnFix: { zh: '一键修复', en: 'Repair now' },
      btnRevert: { zh: '撤销修复', en: 'Undo' },
      busyCheck: { zh: '正在探测…', en: 'Probing…' },
      busyFix: { zh: '正在修复并验证…', en: 'Repairing and verifying…' },
      busyRevert: { zh: '正在撤销…', en: 'Undoing…' },
      stDirect: { zh: '直连 GitHub', en: 'Direct GitHub' },
      stGit: { zh: 'git 加速规则', en: 'git accelerator' },
      stChannels: { zh: '加速通道状态', en: 'Accelerator channels' },
      reachable: { zh: '可握手', en: 'handshake OK' },
      unreachable: { zh: '被阻断', en: 'blocked' },
      rewriteOn: { zh: '已启用', en: 'installed' },
      rewriteOff: { zh: '未启用', en: 'not installed' },
      fixApplied: { zh: '修复成功，原生地址已验证可用', en: 'Repaired — the plain URL now works' },
      fixVerified: { zh: '验证输出', en: 'verification' },
      fixFailed: { zh: '没有可用通道，修复未生效', en: 'No working channel; nothing changed' },
      fixProxyOn: { zh: '加速代理正在运行，直连地址已经可用，不需要再装加速规则。先关闭代理再试。', en: 'The racing proxy is running, so the plain URL already works — an accelerator rule would only add a detour. Turn the proxy off first.' },
      fixReverted: { zh: '已撤销，git 配置恢复原样', en: 'Undone — git config is back to its previous state' },
      fixNoop: { zh: '当前没有本插件写入的规则', en: 'No rule installed by this plugin' },
      chOk: { zh: '可用', en: 'works' },
      chBad: { zh: '不可用', en: 'fails' },
      chGitOk: { zh: 'git 可用', en: 'git ok' },
      chGitNo: { zh: 'git 不可用', en: 'git down' },
      chTries: { zh: ' 次试通', en: 'tries' },
      chFileOk: { zh: '文件可用', en: 'files ok' },
      chFileNo: { zh: '文件不可用', en: 'files down' },
      chGitOnly: { zh: '仅 git', en: 'git only' },
      blockedNote: {
        zh: '直连被阻断说明问题不在域名解析：换 DNS、改 hosts 都不会让握手通过，只能改走加速通道或换网络。下面的排查手册仍可用于判断具体是哪一层出了问题。',
        en: 'A blocked handshake means name resolution is not the problem: another DNS or a hosts entry cannot make the handshake succeed. Only a transport detour or a different network can. The guide below still tells you which layer is failing.',
      },
      revertNote: {
        zh: '撤销只删除本插件写入的规则，你自己原有的 git 配置不受影响。',
        en: 'Undo removes only the rule this plugin installed; your own git config is untouched.',
      },
      urlLabel: { zh: '粘贴一个 GitHub 地址，转成这个网络能打开的形态', en: 'Paste a GitHub URL to get forms that work on this network' },
      urlHint: {
        zh: '支持仓库页、raw.githubusercontent.com 文件、Release 包。仓库页给出镜像页与 clone 地址（gitcode 的镜像只有被人导入过才存在，所以同时给直连页与搜索页，哪个能开用哪个）；文件与压缩包额外给出加速前缀地址。加速前缀只取文件，打不开网页本身。',
        en: 'Accepts repo pages, raw.githubusercontent.com files, and Release assets. A repo page yields mirror pages and the clone command: a gitcode mirror exists only after someone imported it, so the direct page and a search page are listed too. Files and archives also get the accelerator prefix. The prefix fetches files only and cannot open an HTML page.',
      },

      navProxy: { zh: '加速代理', en: 'Racing proxy' },
      proxyTitle: { zh: '本机加速代理', en: 'Local racing proxy' },
      proxyIntro: {
        zh: '同一台 GitHub 服务器往往有好几个入口地址，这个网络能通的可能只有其中一两个，而且换个网络就变了。代理把该域名的所有候选地址同时发起连接，谁先连上就用谁，其余立刻丢弃——所以不会卡在失效的那一个地址上等超时。浏览器、git、命令行都受益。',
        en: 'One GitHub host usually has several entry addresses, only one or two of which work on a given network — and which ones change with the network. The proxy dials every candidate address of the host in parallel, keeps whichever answers first, and drops the rest, so it never waits out a timeout on a dead address. Browsers, git and command-line tools all benefit.',
      },
      btnProxyOn: { zh: '开启加速', en: 'Turn on' },
      btnProxyOff: { zh: '关闭并还原', en: 'Turn off and restore' },
      busyProxyOn: { zh: '正在开启…', en: 'Starting…' },
      busyProxyOff: { zh: '正在还原…', en: 'Restoring…' },
      proxyOn: { zh: '运行中', en: 'running' },
      proxyOff: { zh: '未运行', en: 'stopped' },
      proxyListening: { zh: '监听', en: 'listening on' },
      proxyConns: { zh: '连接', en: 'connections' },
      proxyTunnels: { zh: '成功隧道', en: 'tunnels' },
      proxyFails: { zh: '失败', en: 'failures' },
      proxyAvg: { zh: '平均建连', en: 'avg connect' },
      proxyTraffic: { zh: '流量', en: 'traffic' },
      proxyWinners: { zh: '胜出的地址', en: 'winning addresses' },
      proxySuspect: { zh: '暂时降级的地址', en: 'deprioritised addresses' },
      proxyProbes: { zh: '握手验证', en: 'handshake checks' },
      proxyHealthy: { zh: '已验证可握手的地址', en: 'handshake-verified addresses' },
      proxySeed: { zh: '记住的地址', en: 'remembered addresses' },
      proxySysOn: { zh: '系统代理已指向本机', en: 'system proxy points here' },
      proxySysOff: { zh: '系统代理未指向本机', en: 'system proxy does not point here' },
      proxyGitOn: { zh: 'git 已走代理', en: 'git uses the proxy' },
      proxyGitOff: { zh: 'git 未走代理', en: 'git does not use the proxy' },
      proxyEnvOn: { zh: '命令行环境变量已设置', en: 'shell variables set' },
      proxyEnvOff: { zh: '命令行环境变量未设置', en: 'shell variables not set' },
      proxyOnDone: { zh: '已开启，浏览器和 git 现在都走本机代理', en: 'On — the browser and git now go through the local proxy' },
      proxyOffDone: { zh: '已关闭，系统代理恢复为原来的设置', en: 'Off — the system proxy is back to its previous setting' },
      proxyRestoreNote: {
        zh: '开启前会记下你原来的代理设置（包括「原本没有代理」），关闭时原样还原；不改 hosts，不需要管理员权限。',
        en: 'The previous proxy settings are recorded before the first change — including "there was none" — and restored on turn-off. No hosts edit, no administrator rights.',
      },
      proxyNeedsDirect: {
        zh: '当前直连握手是通的，也可以先不开；等出现「无法访问此页面」再开启即可。',
        en: 'The direct handshake works right now, so this is optional — turn it on when a page starts failing again.',
      },
      proxyLastError: { zh: '最近一次失败', en: 'last failure' },

      routeTitle: { zh: '加速范围', en: 'Acceleration scope' },
      routeIntro: {
        zh: '默认只把 GitHub 系站点交给本机代理竞速，其余站点一律直连——代理出问题时也不会连累它们。要加速别的站点就填进下面的列表；想让所有站点都走竞速，打开全站模式。',
        en: 'By default only GitHub-family sites use the local racing proxy and everything else stays direct, so a proxy problem cannot take other sites down. Add the sites you want raced below, or switch on full mode to race everything.',
      },
      routeFull: { zh: '全站模式：其它网站也走本机代理', en: 'Full mode: route every site through the proxy' },
      routeFullNote: {
        zh: '全站模式下每个站点都先试本机代理，代理连不上会自动回退直连，代价是比直连多一次失败的往返。',
        en: 'In full mode every site tries the proxy first and falls back to direct when it cannot connect — one extra failed round trip compared with going direct.',
      },
      routeExtra: { zh: '额外加速的站点', en: 'Extra sites to accelerate' },
      routeExtraHint: {
        zh: '域名或后缀，用逗号或换行分隔，子域名自动包含；本地地址和局域网地址永远直连。',
        en: 'Domains or suffixes separated by commas or newlines; subdomains are included. Loopback and LAN addresses always stay direct.',
      },
      routeSave: { zh: '保存范围', en: 'Save scope' },
      routeSaved: { zh: '已保存，下一次请求就按新范围生效', en: 'Saved — the next request uses the new scope' },
      busySave: { zh: '保存中…', en: 'saving…' },

      navFix: { zh: '一键修复', en: 'Repair' },
      navSymptoms: { zh: '症状对照', en: 'Symptoms' },
      navChecks: { zh: '五分钟自查', en: 'Quick checks' },
      navHosts: { zh: 'hosts 修复', en: 'hosts repair' },
      navAccel: { zh: '加速与续传', en: 'Accelerators' },
      navLong: { zh: '换一个入口', en: 'Alternate routes' },
      navErrors: { zh: '错误对照', en: 'Error map' },
      navCmd: { zh: '命令速查', en: 'Commands' },
      navSafety: { zh: '安全提醒', en: 'Safety' },
      navRefs: { zh: '参考来源', en: 'Sources' },

      layerTitle: { zh: '先判断问题出在哪一层', en: 'Find the failing layer first' },
      layerBody: {
        zh: 'GitHub 没有在大陆部署服务器和 CDN，所有请求都要走跨境出口。高峰期出口拥塞丢包，就表现为长时间转圈、连接超时；部分域名长期解析异常，会拿到已经失效的 IP。所以会出现「早上能开、晚上打不开」「手机流量能开、校园网打不开」，一次性修好往往只对当下有效。',
        en: 'GitHub serves mainland China from outside the region, so every request crosses an international gateway. Congestion there shows up as long spinners and timeouts, while stale DNS answers hand out expired IPs. That is why the same page opens in the morning and fails at night, or works on mobile data but not on campus Wi-Fi: a one-off repair only fixes the moment.',
      },
      causeCol: { zh: '原因', en: 'Cause' },

      sym1: { zh: '浏览器长时间转圈，最后提示连接超时', en: 'The browser spins for a long time and ends in a connection timeout' },
      'sym1.cause': { zh: '跨境链路拥塞，或 hosts 里记录的 IP 已失效', en: 'Congested cross-border link, or the IPs recorded in hosts are stale' },
      'sym1.fix': { zh: '先用加速前缀打开（加速与续传），再更新 hosts（hosts 修复）', en: 'Open it through an accelerator prefix first, then refresh hosts' },
      sym2: { zh: '页面能打开，头像、配图、样式缺块', en: 'The page loads but avatars, images and styles are missing' },
      'sym2.cause': { zh: '静态资源域名解析错误：github.githubassets.com、avatars.githubusercontent.com', en: 'Static-asset domains resolve incorrectly: github.githubassets.com, avatars.githubusercontent.com' },
      'sym2.fix': { zh: '用 hosts 定点修复这几个域名', en: 'Repair those exact domains in hosts' },
      sym3: { zh: '网页正常，git clone 停在 Receiving objects', en: 'Browsing is fine but git clone stalls at Receiving objects' },
      'sym3.cause': { zh: 'HTTPS 443 端口跨境丢包严重', en: 'Heavy packet loss on HTTPS port 443 across the gateway' },
      'sym3.fix': { zh: '用 clone 加速前缀，或改用 SSH（必要时走 443）', en: 'Use a clone accelerator prefix, or switch to SSH over 443' },
      sym4: { zh: 'Release 包、源码 zip 下载几 KB 就中断', en: 'Release assets and source zips abort after a few KB' },
      'sym4.cause': { zh: '资源走 S3 域名，跨境带宽不足', en: 'Assets are served from S3 domains with little cross-border bandwidth' },
      'sym4.fix': { zh: '把完整地址接到下载前缀后面，并用断点续传重试', en: 'Put the full URL behind a download prefix and resume instead of restarting' },
      sym5: { zh: '所有网站都慢，不止 GitHub', en: 'Every site is slow, not only GitHub' },
      'sym5.cause': { zh: '本地网络、DNS 或校园网策略', en: 'Local network, DNS, or a campus network policy' },
      'sym5.fix': { zh: '先做下面的本机自查，别急着改 hosts', en: 'Run the local checks below before touching hosts' },

      checksTitle: { zh: '本机自查：五分钟定位问题', en: 'Local checks: locate the problem in five minutes' },
      'check1.title': { zh: '换一个网络对比', en: 'Compare against another network' },
      'check1.body': { zh: '用手机热点连电脑试一次。热点正常 → 原网络的问题；热点也打不开 → 跨境链路，直接看「加速与续传」；手机流量能开而电脑不能 → 不是 GitHub 不可达，问题在电脑或所在网络。', en: 'Tether the computer to a phone hotspot. Works on hotspot: the original network is at fault. Fails on hotspot too: the cross-border link, go to accelerators. Works on phone data but not on the computer: GitHub is reachable, so the fault is the computer or its network.' },
      'check2.title': { zh: '查一次域名解析', en: 'Check one DNS answer' },
      'check2.body': { zh: '正常应看到 140.82.x.x 网段。结果为空、不是 GitHub 地址、或每次查询都不一样，说明 DNS 被干扰，走 hosts 修复。', en: 'A healthy answer sits in 140.82.x.x. Empty results, non-GitHub addresses, or a different answer each time mean DNS interference: repair with hosts.' },
      'check3.title': { zh: '排除浏览器自身因素', en: 'Rule out the browser' },
      'check3.body': { zh: '用无痕窗口对比一次。另外关掉浏览器的「使用安全 DNS」开关：它会绕过系统 hosts，让 hosts 的修改看起来完全没生效。', en: 'Repeat in a private window. Also turn off the browser’s secure-DNS switch: it bypasses the system hosts file, which makes a hosts edit look completely ineffective.' },
      'check4.title': { zh: '换公共 DNS', en: 'Switch to a public resolver' },
      'check4.body': { zh: '换成 223.5.5.5（阿里）或 119.29.29.29（腾讯），然后刷新缓存。能解决一部分解析错误，但对链路拥塞无效。', en: 'Use 223.5.5.5 (Alibaba) or 119.29.29.29 (Tencent), then flush the cache. This fixes some resolution errors but cannot fix congestion.' },

      hostsTitle: { zh: 'hosts 定点修复', en: 'Targeted hosts repair' },
      hostsBody: { zh: '系统解析域名时先查 hosts，命中就不再查 DNS。所以把正确的 IP 写进 hosts，可以绕开被污染的解析结果。需要覆盖的不止 github.com，还包括静态资源域名：', en: 'The OS consults hosts before DNS, so a hit there bypasses a poisoned answer. Cover more than github.com — the static-asset domains matter too:' },
      'hosts.step1': { zh: '取社区维护的 hosts 内容。不要自己 ping 一个地址就写进去，单次 ping 的 IP 往往几分钟就失效。', en: 'Take community-maintained hosts content. Never ping one address and write that down: a single ping’s IP often expires within minutes.' },
      'hosts.step2': { zh: '用管理员身份打开记事本 →「文件 → 打开」，选中 C:\\Windows\\System32\\drivers\\etc\\hosts，把内容粘到末尾保存。文件名仍然是 hosts，不能存成 hosts.txt；没有管理员权限时，可以先复制到桌面改完再覆盖回去。', en: 'Open Notepad as administrator, choose File → Open, select C:\\Windows\\System32\\drivers\\etc\\hosts, paste at the end and save. The file must stay named hosts, not hosts.txt; without admin rights, copy it to the desktop, edit, then copy it back.' },
      'hosts.step3': { zh: '刷新 DNS 缓存，然后重启浏览器。', en: 'Flush the DNS cache, then restart the browser.' },
      'hosts.auto': { zh: '让它自动更新：装 SwitchHosts，添加一条「远程」规则，URL 填 hosts 原始文件地址，自动刷新设为 1 小时，并确认左侧那条规则处于开启状态。', en: 'Keep it fresh: install SwitchHosts, add a Remote rule whose URL is the raw hosts file, set auto-refresh to one hour, and confirm the rule on the left is switched on.' },
      'hosts.limit': { zh: '局限：只解决「解析错了」，不解决「链路慢」；部分校园网和单位网络在出口层拦截，改 hosts 也绕不开。', en: 'Limit: this only fixes wrong answers, not a slow link. Some campus and corporate networks filter at the egress, where no hosts edit helps.' },
      hostsSources: { zh: '社区维护的 hosts 源', en: 'Community hosts sources' },

      accelTitle: { zh: '加速前缀与断点续传', en: 'Accelerator prefixes and resumable downloads' },
      accelBody: { zh: '请求先发到能稳定连通的加速节点，由它取回内容再返回给你。不同服务商的路径规则不一样，公益服务稳定性会波动，不建议长期只依赖同一个。', en: 'The request goes to a node that can reach GitHub reliably, and that node fetches the content for you. Path rules differ per provider and free services fluctuate, so do not depend on a single one for long.' },
      accelClone: { zh: 'clone：把用户名和仓库名接在加速域名后面', en: 'Clone: append the owner and repository to the accelerator host' },
      accelFile: { zh: '下载 Release 包或源码 zip：把完整 GitHub 地址整体接在前缀后面', en: 'Release assets and source zips: put the whole GitHub URL behind the prefix' },
      accelResume: { zh: '命令行断点续传', en: 'Resumable downloads from the shell' },
      accelLimit: { zh: '限制：只对公开内容有效，私有仓库和需要登录的操作走不通；部分服务限制单次大小与并发；服务可能随时下线。', en: 'Limits: public content only — private repositories and anything needing a login do not work; some services cap size and concurrency; a service can disappear without notice.' },

      longTitle: { zh: '换一个入口的长期做法', en: 'Longer-term alternate routes' },
      'long1.title': { zh: '用 Gitee 做镜像仓库', en: 'Mirror the repository on Gitee' },
      'long1.body': { zh: '在 Gitee 用「从 GitHub/GitLab 导入仓库」建一个镜像，之后从 Gitee 拉取。注意是手动同步，不是实时。', en: 'Import the repository into Gitee, then clone from there. Syncing is manual, not live.' },
      'long2.title': { zh: '改用 SSH，必要时走 443', en: 'Switch to SSH, over 443 when needed' },
      'long2.body': { zh: '把本机公钥加到 GitHub，远端改成 SSH 地址。22 端口不通时，在 ~/.ssh/config 里为 github.com 指定 HostName ssh.github.com 与 Port 443，再改远端地址。', en: 'Add the local public key to GitHub and point the remote at the SSH URL. If port 22 is blocked, set HostName ssh.github.com and Port 443 for github.com in ~/.ssh/config, then update the remote.' },
      'long3.title': { zh: '校园网与单位网络', en: 'Campus and corporate networks' },
      'long3.body': { zh: '出口是统一策略，个人能做的只有换网络，或者请网络管理员放行 github.com 与相关资源域名。', en: 'Egress policy is central. An individual can only switch networks or ask the network administrator to allow github.com and its asset domains.' },

      errorsTitle: { zh: '常见错误对照', en: 'Common errors' },
      err1: { zh: '改完 hosts 没有任何变化', en: 'Nothing changes after editing hosts' },
      'err1.cause': { zh: '存成了 hosts.txt / 没用管理员权限保存 / 浏览器开着安全 DNS 绕过系统解析', en: 'Saved as hosts.txt, saved without admin rights, or the browser’s secure DNS bypasses system resolution' },
      'err1.fix': { zh: '确认没有扩展名；用管理员保存；关闭浏览器的「使用安全 DNS」', en: 'Confirm there is no extension, save as administrator, turn off secure DNS in the browser' },
      err2: { zh: 'hosts 生效几天后又失效', en: 'hosts works, then stops a few days later' },
      'err2.cause': { zh: '记录里的 IP 过期了', en: 'The recorded IPs expired' },
      'err2.fix': { zh: '改用可自动更新的 hosts 源，按 1 小时定时刷新', en: 'Use an auto-updating hosts source with an hourly refresh' },
      err3: { zh: 'RPC failed; curl 56、early EOF', en: 'RPC failed; curl 56, early EOF' },
      'err3.cause': { zh: '单次传输量太大，链路中途断开', en: 'The transfer is too large for the link and drops midway' },
      'err3.fix': { zh: '提高缓冲区到 500MB，或改用 --depth 1 只取最新一次提交', en: 'Raise the buffer to 500 MB, or clone with --depth 1' },
      err4: { zh: 'SSL certificate problem', en: 'SSL certificate problem' },
      'err4.cause': { zh: '系统时间错误，或中间设备替换了证书', en: 'Wrong system clock, or an intermediary replacing the certificate' },
      'err4.fix': { zh: '先校准系统时间再换网络，不要长期关闭证书校验', en: 'Fix the clock and try another network; never disable verification permanently' },
      err5: { zh: '22 端口连不上', en: 'Port 22 is unreachable' },
      'err5.cause': { zh: '出口封了 SSH 端口', en: 'The egress blocks the SSH port' },
      'err5.fix': { zh: '让 SSH 走 443：ssh.github.com:443', en: 'Move SSH to 443: ssh.github.com:443' },
      err6: { zh: '代理软件关了，git 还是走代理', en: 'git still uses a proxy after the proxy app is closed' },
      'err6.cause': { zh: 'git 全局配置里残留 http.proxy', en: 'A leftover http.proxy in the global git config' },
      'err6.fix': { zh: '执行 git config --global --unset http.proxy', en: 'Run git config --global --unset http.proxy' },
      err7: { zh: 'clone 报 403 或要求登录', en: 'Clone returns 403 or asks for a login' },
      'err7.cause': { zh: '私有仓库，或镜像前缀不支持鉴权', en: 'A private repository, or an accelerator that cannot authenticate' },
      'err7.fix': { zh: '私有仓库不要用公共加速，改用 SSH 或登录后走正常地址', en: 'Never put private repositories behind public accelerators; use SSH or the normal URL while signed in' },

      cmdTitle: { zh: '命令速查', en: 'Command cheat sheet' },
      'cmd.flush': { zh: '刷新本机 DNS 缓存', en: 'Flush the local DNS cache' },
      'cmd.nslookup': { zh: '用阿里 DNS 查一次解析结果', en: 'Resolve github.com through Alibaba DNS' },
      'cmd.depth': { zh: '只取最新一次提交，减小传输量', en: 'Fetch only the latest commit to shrink the transfer' },
      'cmd.buffer': { zh: '把传输缓冲区提到 500MB', en: 'Raise the transfer buffer to 500 MB' },
      'cmd.unproxy': { zh: '清掉残留的代理配置', en: 'Remove a leftover proxy setting' },
      'cmd.remote': { zh: '把远端改成 SSH 地址', en: 'Point the remote at the SSH URL' },
      'cmd.wget': { zh: '断点续传下载，中断后接着下', en: 'Resume an interrupted download' },

      safetyTitle: { zh: '安全与合规提醒', en: 'Safety and compliance' },
      safety1: { zh: '只用公开可查的镜像与加速服务。来源不明的「GitHub 加速器」「浏览助手」安装包一律不装，夹带广告与后门很常见。', en: 'Use only public, auditable mirrors and accelerators. Never install an unsigned “GitHub accelerator” or “browser helper”: bundled adware and backdoors are common.' },
      safety2: { zh: '任何第三方镜像都不需要你的 GitHub 账号。要求登录的一律关掉页面。', en: 'No third-party mirror needs your GitHub account. Close any page that asks for a login.' },
      safety3: { zh: '私有仓库、公司代码不要经过公共加速前缀。', en: 'Keep private repositories and company code off public accelerator prefixes.' },
      safety4: { zh: '学校机房与校园网按学校规定使用，不要拿他人账号或单位设备去试。', en: 'Follow the school’s rules on lab machines and campus networks; do not experiment with someone else’s account or a work device.' },

      refsTitle: { zh: '参考来源', en: 'Sources' },
      footNote: { zh: '本面板内容整理自《GitHub 访问受限排查手册》（2026 年 11 月）。', en: 'Content adapted from the GitHub access troubleshooting manual (November 2026).' },
    };

    const dictZh = {};
    const dictEn = {};
    for (const key of Object.keys(TEXT)) {
      dictZh[key] = TEXT[key].zh;
      dictEn[key] = TEXT[key].en;
    }

    const DOMAINS = [
      'github.com',
      'github.githubassets.com',
      'avatars.githubusercontent.com',
      'objects.githubusercontent.com',
    ];

    const COMMANDS = [
      { id: 'flush', cmd: 'ipconfig /flushdns', label: 'cmd.flush' },
      { id: 'nslookup', cmd: 'nslookup github.com 223.5.5.5', label: 'cmd.nslookup' },
      { id: 'depth', cmd: 'git clone --depth 1 <仓库地址>', label: 'cmd.depth' },
      { id: 'buffer', cmd: 'git config --global http.postBuffer 524288000', label: 'cmd.buffer' },
      { id: 'unproxy', cmd: 'git config --global --unset http.proxy', label: 'cmd.unproxy' },
      { id: 'remote', cmd: 'git remote set-url origin git@github.com:<用户名>/<仓库名>.git', label: 'cmd.remote' },
      { id: 'wget', cmd: 'wget -c <文件地址>', label: 'cmd.wget' },
    ];

    const REFS = [
      { label: '521xueweihan/GitHub520', url: 'https://github.com/521xueweihan/GitHub520' },
      { label: 'godfather1103/github-hosts', url: 'https://gitee.com/godfather1103/github-hosts' },
      { label: 'TheDarkStar/github-hosts', url: 'https://gitee.com/TheDarkStar/github-hosts' },
      { label: 'developer.aliyun.com/article/1683408', url: 'https://developer.aliyun.com/article/1683408' },
      { label: 'developer.aliyun.com/article/1767403', url: 'https://developer.aliyun.com/article/1767403' },
    ];

    const CLONE_TPL = 'git clone https://<加速域名>/<用户名>/<仓库>.git';
    const FILE_TPL = 'https://<加速域名>/https://github.com/<用户名>/<仓库>/archive/refs/heads/main.zip';
    const REMOTE_TPL = 'git remote set-url origin git@github.com:<用户名>/<仓库名>.git';
    const SSH_TPL = 'Host github.com\n  HostName ssh.github.com\n  Port 443\n  User git';
    const FLUSH = 'ipconfig /flushdns';

    /* ------------------------------------------------------------------ *
     * Styles. Only alias theme tokens, so light and dark both follow the
     * host. Class names carry this plugin's prefix.
     * ------------------------------------------------------------------ */
    const CSS = [
      '.ghg-root{box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6}',
      '.ghg-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-gutter:stable}',
      '.ghg-inner{box-sizing:border-box;width:100%;max-width:940px;margin:0 auto;padding:28px 20px 56px}',
      '[data-platform=darwin] .ghg-inner{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}',
      '.ghg-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 6px}',
      '.ghg-title{margin:0;font-size:20px;font-weight:500;line-height:28px}',
      '.ghg-badge{flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 9px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.ghg-sub{margin:0 0 18px;color:var(--dsw-alias-label-secondary);max-width:74ch}',
      '.ghg-nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 22px}',
      '.ghg-navbtn{font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:3px 11px;cursor:pointer;transition:color .15s ease,border-color .15s ease}',
      '.ghg-navbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.ghg-sec{margin:0 0 26px;scroll-margin-top:16px}',
      '.ghg-sech{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:14px;font-weight:600}',
      '.ghg-sech::before{content:"";flex:none;width:3px;height:14px;border-radius:2px;background:var(--dsw-alias-brand-primary)}',
      '.ghg-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px 14px;margin:0 0 10px}',
      '.ghg-p{margin:0}',
      '.ghg-muted{color:var(--dsw-alias-label-secondary)}',
      '.ghg-row{display:flex;gap:10px;align-items:flex-start}',
      '.ghg-row+.ghg-row{margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.ghg-idx{flex:none;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1)}',
      '.ghg-rowbody{min-width:0;flex:1}',
      '.ghg-rowtitle{font-weight:600}',
      '.ghg-tag{display:inline-block;font-size:11px;border-radius:5px;padding:0 6px;margin-right:6px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}',
      '.ghg-cmds{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '.ghg-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:3px 8px;color:var(--dsw-alias-label-primary);word-break:break-all}',
      '.ghg-block{display:block;margin:8px 0 0;padding:9px 12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-primary)}',
      '.ghg-copy{flex:none;font:inherit;font-size:11px;line-height:1;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 8px;cursor:pointer;transition:color .15s ease,border-color .15s ease}',
      '.ghg-copy:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.ghg-copy[data-done]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.ghg-cmdrow{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}',
      '.ghg-cmdmain{min-width:0;flex:1}',
      '.ghg-list{margin:0;padding-left:18px}',
      '.ghg-list li+li{margin-top:6px}',
      '.ghg-errcard{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:8px;padding:10px 12px;margin:0 0 10px}',
      '.ghg-errname{font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}',
      '.ghg-errfix{margin-top:4px}',
      '.ghg-errfix::before{content:"\\2192  ";color:var(--dsw-alias-state-success-primary)}',
      '.ghg-links{display:flex;flex-wrap:wrap;gap:6px 14px}',
      '.ghg-links a{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:12px;word-break:break-all}',
      '.ghg-links a:hover{text-decoration:underline}',
      '.ghg-foot{margin:26px 0 0;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.ghg-icon{display:block;pointer-events:none}',
      '.ghg-fix{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px 16px;margin:0 0 26px}',
      '.ghg-fixhead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}',
      '.ghg-fixhead .ghg-sech{margin:0}',
      '.ghg-fixbtns{display:flex;flex-wrap:wrap;gap:8px}',
      '.ghg-act{font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 12px;cursor:pointer;transition:border-color .15s ease,opacity .15s ease}',
      '.ghg-act:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.ghg-act:disabled{opacity:.55;cursor:default}',
      '.ghg-actprimary{color:var(--dsw-alias-bg-base);background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.ghg-statusbox{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 11px;margin:0 0 10px;background:var(--dsw-alias-bg-base)}',
      '.ghg-status{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;padding:3px 0}',
      '.ghg-statusname{font-weight:600;min-width:0}',
      '.ghg-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}',
      '.ghg-dot[data-ok="1"]{background:var(--dsw-alias-state-success-primary)}',
      '.ghg-dot[data-ok="0"]{background:var(--dsw-alias-state-error-primary)}',
      '.ghg-grouplabel{font-size:11px;color:var(--dsw-alias-label-secondary);margin:2px 0 4px}',
      '.ghg-actnote{margin:8px 0 0;font-size:12px;line-height:1.6}',
'.ghg-scope{margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
'.ghg-scopetoggle{display:flex;gap:8px;align-items:center;cursor:pointer;font-size:13px;font-weight:600}',
'.ghg-scopetoggle input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary)}',
      '.ghg-urlbox{border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}',
      '.ghg-input{box-sizing:border-box;width:100%;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:6px 10px;margin-top:4px}',
      '.ghg-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
    ].join('\n');

    function fallbackCopy(text) {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok;
      } catch (error) {
        return false;
      }
    }

    function CopyButton(props) {
      const t = props.t;
      const value = props.value;
      const [state, setState] = React.useState(0);
      const timer = React.useRef(undefined);
      React.useEffect(() => () => {
        if (timer.current !== undefined) window.clearTimeout(timer.current);
      }, []);
      const done = (ok) => {
        setState(ok ? 1 : 2);
        if (timer.current !== undefined) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState(0), 1400);
      };
      const copy = () => {
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(value).then(() => done(true), () => done(fallbackCopy(value)));
            return;
          }
        } catch (error) {
          /* fall through to the legacy path */
        }
        done(fallbackCopy(value));
      };
      const label = state === 1 ? t('copied') : state === 2 ? t('failed') : t('copy');
      return h('button', {
        type: 'button',
        className: 'ghg-copy',
        'data-done': state === 1 ? '1' : undefined,
        'aria-label': label,
        title: label,
        onClick: copy,
      }, label);
    }

    function Section(props) {
      return h('section', { className: 'ghg-sec', id: 'ghg-' + props.id },
        h('h2', { className: 'ghg-sech' }, props.title),
        props.children);
    }

    function Card(props) {
      return h('div', { className: 'ghg-card' }, props.children);
    }

    function CodeRow(props) {
      return h('div', { className: 'ghg-cmdrow', style: { marginTop: '8px' } },
        props.tag ? h('span', { className: 'ghg-tag' }, props.tag) : null,
        h('code', { className: 'ghg-block' }, props.value),
        h(CopyButton, { t: props.t, value: props.value }));
    }

    function PanelIcon(props) {
      const s = typeof props.size === 'number' && props.size > 0 ? props.size : 18;
      return h('svg', {
        className: 'ghg-icon',
        width: s,
        height: s,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        'aria-hidden': true,
        xmlns: 'http://www.w3.org/2000/svg',
      },
      h('circle', { cx: 12, cy: 12, r: 8.4 }),
      h('path', { d: 'M3.6 12h16.8' }),
      h('path', { d: 'M12 3.6c2.2 2.3 3.4 5.2 3.4 8.4S14.2 18.1 12 20.4C9.8 18.1 8.6 15.2 8.6 12S9.8 5.9 12 3.6z' }));
    }

    function symptomRows(t) {
      const out = [];
      for (let n = 1; n <= 5; n += 1) {
        out.push(h('div', { className: 'ghg-row', key: 'sym' + n },
          h('span', { className: 'ghg-idx' }, String(n)),
          h('div', { className: 'ghg-rowbody' },
            h('div', { className: 'ghg-rowtitle' }, t('sym' + n)),
            h('div', { className: 'ghg-muted' },
              h('span', { className: 'ghg-tag' }, t('causeCol')),
              t('sym' + n + '.cause')),
            h('div', { className: 'ghg-errfix' }, t('sym' + n + '.fix')))));
      }
      return out;
    }

    function checkRows(t) {
      const out = [];
      for (let n = 1; n <= 4; n += 1) {
        out.push(h('div', { className: 'ghg-row', key: 'chk' + n },
          h('span', { className: 'ghg-idx' }, String(n)),
          h('div', { className: 'ghg-rowbody' },
            h('div', { className: 'ghg-rowtitle' }, t('check' + n + '.title')),
            h('div', { className: 'ghg-muted' }, t('check' + n + '.body')))));
      }
      return out;
    }

    function errorCards(t) {
      const out = [];
      for (let n = 1; n <= 7; n += 1) {
        out.push(h('div', { className: 'ghg-errcard', key: 'err' + n },
          h('div', { className: 'ghg-errname' }, t('err' + n)),
          h('div', { className: 'ghg-muted' }, t('err' + n + '.cause')),
          h('div', { className: 'ghg-errfix' }, t('err' + n + '.fix'))));
      }
      return out;
    }

    function numRow(t, key, index, body) {
      return h('div', { className: 'ghg-row', key: key },
        h('span', { className: 'ghg-idx' }, index),
        h('div', { className: 'ghg-rowbody' }, body));
    }

    function hostsSection(t) {
      const domainChips = DOMAINS.map((domain) => h('code', { key: domain, className: 'ghg-code' }, domain));
      const steps = [
        numRow(t, 'h1', '1', t('hosts.step1')),
        numRow(t, 'h2', '2', t('hosts.step2')),
        numRow(t, 'h3', '3', [
          h('div', { key: 'txt' }, t('hosts.step3')),
          h('div', { key: 'cmd', className: 'ghg-cmdrow', style: { marginTop: '8px' } },
            h('code', { className: 'ghg-code' }, FLUSH),
            h(CopyButton, { t: t, value: FLUSH })),
        ]),
      ];
      return h(Section, { key: 'hosts', id: 'hosts', title: t('hostsTitle') },
        h(Card, null,
          h('p', { className: 'ghg-p ghg-muted' }, t('hostsBody')),
          h('div', { className: 'ghg-cmds' }, domainChips)),
        h(Card, null, steps),
        h(Card, null, h('p', { className: 'ghg-p' }, t('hosts.auto'))),
        h(Card, null, h('p', { className: 'ghg-p ghg-muted' }, t('hosts.limit'))),
        h(Card, null,
          h('p', { className: 'ghg-p ghg-muted' }, t('hostsSources')),
          h('div', { className: 'ghg-links', style: { marginTop: '6px' } },
            REFS.slice(0, 2).map((ref) => h('a', {
              key: ref.url, href: ref.url, target: '_blank', rel: 'noreferrer noopener',
            }, ref.label)))));
    }

    function accelSection(t) {
      const resume = ['wget -c <文件地址>', 'curl -fL -O <文件地址>', 'aria2c -x16 -s16 <文件地址>']
        .map((cmd) => h('code', { key: cmd, className: 'ghg-code' }, cmd));
      return h(Section, { key: 'accel', id: 'accel', title: t('accelTitle') },
        h(Card, null, h('p', { className: 'ghg-p ghg-muted' }, t('accelBody'))),
        h(Card, null,
          h('p', { className: 'ghg-p' }, t('accelClone')),
          h(CodeRow, { t: t, value: CLONE_TPL })),
        h(Card, null,
          h('p', { className: 'ghg-p' }, t('accelFile')),
          h(CodeRow, { t: t, value: FILE_TPL })),
        h(Card, null,
          h('p', { className: 'ghg-p' }, t('accelResume')),
          h('div', { className: 'ghg-cmds', style: { marginTop: '8px' } }, resume)),
        h(Card, null, h('p', { className: 'ghg-p ghg-muted' }, t('accelLimit'))));
    }

    function longSection(t) {
      return h(Section, { key: 'long', id: 'long', title: t('longTitle') },
        h(Card, null,
          h('div', { className: 'ghg-rowtitle' }, t('long1.title')),
          h('div', { className: 'ghg-muted' }, t('long1.body'))),
        h(Card, null,
          h('div', { className: 'ghg-rowtitle' }, t('long2.title')),
          h('div', { className: 'ghg-muted' }, t('long2.body')),
          h('code', { className: 'ghg-block' }, SSH_TPL),
          h(CodeRow, { t: t, value: REMOTE_TPL })),
        h(Card, null,
          h('div', { className: 'ghg-rowtitle' }, t('long3.title')),
          h('div', { className: 'ghg-muted' }, t('long3.body'))));
    }

    function cmdSection(t) {
      const rows = COMMANDS.map((row) => h('div', {
        className: 'ghg-cmdrow', key: row.id, style: { padding: '6px 0' },
      },
      h('div', { className: 'ghg-cmdmain' },
        h('code', { className: 'ghg-block' }, row.cmd),
        h('div', { className: 'ghg-muted', style: { marginTop: '4px', fontSize: '12px' } }, t(row.label))),
      h(CopyButton, { t: t, value: row.cmd })));
      return h(Section, { key: 'cmd', id: 'cmd', title: t('cmdTitle') }, h(Card, null, rows));
    }

    function safetySection(t) {
      return h(Section, { key: 'safety', id: 'safety', title: t('safetyTitle') },
        h(Card, null, h('ul', { className: 'ghg-list' },
          h('li', { key: 's1' }, t('safety1')),
          h('li', { key: 's2' }, t('safety2')),
          h('li', { key: 's3' }, t('safety3')),
          h('li', { key: 's4' }, t('safety4')))));
    }

    function refsSection(t) {
      return h(Section, { key: 'refs', id: 'refs', title: t('refsTitle') },
        h(Card, null, h('div', { className: 'ghg-links' },
          REFS.map((ref) => h('a', {
            key: ref.url, href: ref.url, target: '_blank', rel: 'noreferrer noopener',
          }, ref.label)))));
    }

    /* ------------------------------------------------------------------ *
     * Panel-to-host bridge. The three actions live in the host half; the
     * panel only renders their state. Results are always re-read from the
     * host instead of trusting the click, so a failed repair shows as failed.
     * ------------------------------------------------------------------ */
    const ROUTES = {
      status: '/api/github-access-guide/status',
      quick: '/api/github-access-guide/quick',
      channels: '/api/github-access-guide/channels',
      live: '/api/github-access-guide/live',
      fix: '/api/github-access-guide/fix',
      revert: '/api/github-access-guide/revert',
      proxyOn: '/api/github-access-guide/proxy/on',
      proxyOff: '/api/github-access-guide/proxy/off',
      routing: '/api/github-access-guide/routing',
    };

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const reply = await response.json();
      if (reply.ok !== true) throw new Error((reply.code || 'unknown') + ' ' + (reply.message || ''));
      return reply.value;
    }

    function ActionPanel(props) {
      const t = props.t;
      const [status, setStatus] = React.useState(undefined);
      const [channels, setChannels] = React.useState(undefined);
      const [channelsBusy, setChannelsBusy] = React.useState(false);
      const [busy, setBusy] = React.useState('');
      const [outcome, setOutcome] = React.useState(undefined);
      const [error, setError] = React.useState('');
      const channelsPolling = React.useRef(false);

      /* The channel sweep shells out to `git ls-remote` three times and on a network
       * that drops GitHub that takes tens of seconds. Asking for it together with the
       * direct/git state made this card sit on "Probing…" for the whole 43 s, so the
       * two are fetched separately: the card fills in at once, and the channel rows
       * arrive when they arrive. */
      const loadChannels = React.useCallback(() => {
        if (channelsPolling.current) return;
        channelsPolling.current = true;
        setChannelsBusy(true);
        postJson(ROUTES.channels)
          .then((value) => { setChannels(value); })
          .catch(() => { /* keep the last known rows */ })
          .then(() => { channelsPolling.current = false; setChannelsBusy(false); });
      }, []);

      const refresh = React.useCallback(() => {
        setBusy('check');
        setError('');
        postJson(ROUTES.quick)
          .then((value) => {
            setStatus(value);
            setBusy('');
            loadChannels();
          })
          .catch((e) => {
            setError(String(e && e.message ? e.message : e));
            setBusy('');
          });
      }, [loadChannels]);

      React.useEffect(() => {
        refresh();
      }, [refresh]);

      const run = (kind, path) => {
        setBusy(kind);
        setError('');
        setOutcome(undefined);
        postJson(path)
          .then((value) => {
            setOutcome({ kind: kind, value: value });
            return postJson(ROUTES.quick).then((next) => {
              setStatus(next);
              setBusy('');
              loadChannels();
            });
          })
          .catch((e) => {
            setError(String(e && e.message ? e.message : e));
            setBusy('');
          });
      };

      const btn = (kind, label, handler, primary) => h('button', {
        type: 'button',
        className: primary === true ? 'ghg-act ghg-actprimary' : 'ghg-act',
        disabled: busy !== '',
        onClick: handler,
      }, busy === kind ? t(kind === 'check' ? 'busyCheck' : kind === 'fix' ? 'busyFix' : 'busyRevert') : label);

      const dot = (ok) => h('span', {
        className: 'ghg-dot',
        'data-ok': ok === true ? '1' : '0',
      });

      const rows = [];
      if (status !== undefined) {
        rows.push(h('div', { className: 'ghg-status', key: 'direct' },
          dot(status.direct && status.direct.ok === true),
          h('span', { className: 'ghg-statusname' }, t('stDirect')),
          h('span', { className: 'ghg-muted' },
            status.direct && status.direct.ok === true
              ? t('reachable') + ' · ' + status.direct.ms + 'ms'
              : t('unreachable') + (status.direct && status.direct.error ? ' · ' + status.direct.error : ''))));
        rows.push(h('div', { className: 'ghg-status', key: 'git' },
          dot(status.git && status.git.rewrite === true),
          h('span', { className: 'ghg-statusname' }, t('stGit')),
          h('span', { className: 'ghg-muted' },
            status.git && status.git.rewrite === true
              ? t('rewriteOn') + (status.git.activePrefix ? ' · ' + status.git.activePrefix : '')
              : t('rewriteOff'))));
      }

      const channelRows = Array.isArray(channels)
        ? channels.map((channel) => {
          /* One channel serves two different purposes: the git rewrite the fix installs,
           * and the file prefix the URL converter hands out. They fail independently,
           * so both are shown instead of one merged verdict. */
          const gitOk = channel.gitOk === true || (channel.gitOk === undefined && channel.usable === true);
          const fileOk = channel.rawOk === true;
          const parts = [];
          /* An intermittent prefix answers some attempts and resets others, so the
           * number of tries is part of the answer: "git ok after 2 tries" is a
           * different thing from "git ok" on the first one. Only shown when it
           * took more than one. */
          const tries = channel.gitAttempts > 1 ? ' (' + channel.gitAttempts + t('chTries') + ')' : '';
          parts.push((gitOk ? t('chGitOk') : t('chGitNo')) + (channel.gitMs ? ' ' + channel.gitMs + 'ms' : '') + tries);
          parts.push(fileOk
            ? t('chFileOk') + (channel.rawMs ? ' ' + channel.rawMs + 'ms' : '')
            : t('chFileNo') + (channel.gitOnly === true ? ' · ' + t('chGitOnly') : (channel.rawError ? ' · ' + channel.rawError : '')));
          return h('div', { className: 'ghg-status', key: 'ch-' + channel.id },
            dot(gitOk || fileOk),
            h('span', { className: 'ghg-statusname' }, channel.label),
            h('span', { className: 'ghg-muted' }, parts.join(' · ')));
        })
        : [];

      const outcomeNodes = [];
      if (error !== '') {
        outcomeNodes.push(h('p', { className: 'ghg-actnote', key: 'err', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error));
      }
      if (outcome !== undefined) {
        if (outcome.kind === 'fix') {
          const value = outcome.value || {};
          if (value.applied === true) {
            outcomeNodes.push(h('p', { className: 'ghg-actnote', key: 'fixok' },
              h('strong', null, t('fixApplied')),
              value.channel ? ' · ' + value.channel.label : ''));
            if (value.verifyHead) {
              outcomeNodes.push(h('div', { key: 'vh' },
                h('div', { className: 'ghg-muted', style: { marginTop: '6px' } }, t('fixVerified')),
                h('code', { className: 'ghg-block' }, value.verifyHead)));
            }
          } else {
            outcomeNodes.push(h('p', { className: 'ghg-actnote', key: 'fixfail' },
              value.reason === 'proxy-running' ? t('fixProxyOn') : t('fixFailed')));
          }
        } else if (outcome.kind === 'revert') {
          const removed = outcome.value && Array.isArray(outcome.value.removed) ? outcome.value.removed : [];
          outcomeNodes.push(h('p', { className: 'ghg-actnote', key: 'rev' },
            removed.length > 0 ? t('fixReverted') : t('fixNoop')));
        }
      }

      return h('div', { className: 'ghg-fix' },
        h('div', { className: 'ghg-fixhead' },
          h('h2', { className: 'ghg-sech' }, t('fixTitle')),
          h('div', { className: 'ghg-fixbtns' },
            btn('check', t('btnCheck'), refresh, false),
            btn('fix', t('btnFix'), () => run('fix', ROUTES.fix), true),
            btn('revert', t('btnRevert'), () => run('revert', ROUTES.revert), false))),
        h('p', { className: 'ghg-muted', style: { margin: '0 0 10px' } }, t('fixIntro')),
        rows.length > 0 ? h('div', { className: 'ghg-statusbox' }, rows) : null,
        channelRows.length > 0
          ? h('div', { className: 'ghg-statusbox' },
            h('div', { className: 'ghg-grouplabel' }, t('stChannels') + (channelsBusy === true ? ' · ' + t('busyCheck') : '')), channelRows)
          : (channelsBusy === true
            ? h('div', { className: 'ghg-statusbox' }, h('div', { className: 'ghg-grouplabel' }, t('stChannels') + ' · ' + t('busyCheck')))
            : null),
        outcomeNodes.length > 0 ? h('div', { key: 'out' }, outcomeNodes) : null,
        h('div', { key: 'url', style: { marginTop: '12px' } },
          h(UrlBox, { t: t, channels: Array.isArray(channels) ? channels : [] })),
        h('p', { className: 'ghg-actnote ghg-muted' }, t('revertNote')),
        status !== undefined && status.direct && status.direct.ok !== true
          ? h('p', { className: 'ghg-actnote' }, t('blockedNote'))
          : null);
    }

    /* The racing proxy is the only control here that changes the whole machine's
     * network path, so it gets its own card with its own live counters. Everything
     * it reports comes from the host after the action, never from the click. */
    function ProxyPanel(props) {
      const t = props.t;
      const [status, setStatus] = React.useState(undefined);
      const [busy, setBusy] = React.useState('');
      const [outcome, setOutcome] = React.useState(undefined);
      const [error, setError] = React.useState('');

      /* The scope controls are a draft: they follow the host's value until the user
       * touches them, so a poll refresh never overwrites what is being typed. */
      const [draftExtra, setDraftExtra] = React.useState(undefined);
      const [draftFull, setDraftFull] = React.useState(undefined);
      const [scopeDone, setScopeDone] = React.useState(false);

      /* The proxy card only needs the cheap state (listener, system proxy, git,
       * env). The full status probes every accelerator channel, which can take
       * half a minute on a bad link, so this card never asks for it. */
      const refresh = React.useCallback(() => {
        postJson(ROUTES.live)
          .then((value) => setStatus(value))
          .catch((e) => setError(String(e && e.message ? e.message : e)));
      }, []);

      /* The counters change constantly but the full status costs a network probe, so
       * the poll asks the cheap route and folds its answer into the status already on
       * screen. One poll in flight at a time: a slow reply must not queue up behind it. */
      const polling = React.useRef(false);
      const poll = React.useCallback(() => {
        if (polling.current) return;
        polling.current = true;
        postJson(ROUTES.live)
          .then((value) => {
            setStatus((prev) => (prev === undefined ? prev : Object.assign({}, prev, value)));
          })
          .catch(() => { /* keep the last good numbers on screen */ })
          .then(() => { polling.current = false; });
      }, []);

      React.useEffect(() => {
        refresh();
        /* Counters move while the proxy runs, so poll — but only while the panel is
         * mounted, and slowly enough that it is invisible in the network log. */
        const handle = setInterval(poll, 4000);
        return () => clearInterval(handle);
      }, [refresh, poll]);

      const run = (kind, path) => {
        setBusy(kind);
        setError('');
        setOutcome(undefined);
        postJson(path)
          .then((value) => {
            setOutcome({ kind: kind, value: value });
            return postJson(ROUTES.live).then((next) => {
              setStatus((prev) => (prev === undefined ? next : Object.assign({}, prev, next)));
              setBusy('');
            });
          })
          .catch((e) => {
            setError(String(e && e.message ? e.message : e));
            setBusy('');
          });
      };

      const proxy = status !== undefined && status.proxy !== undefined ? status.proxy : undefined;
      const running = proxy !== undefined && proxy.running === true;
      const system = status !== undefined ? status.system : undefined;
      const tools = status !== undefined ? status.tools : undefined;
      const server = proxy !== undefined && proxy.port !== undefined ? '127.0.0.1:' + proxy.port : undefined;
      /* Either half of the WinINET takeover proves the machine points here: the PAC URL
       * is what browsers read, the manual entry is what non-PAC tools read. */
      const pacOn = system !== undefined && server !== undefined && typeof system.autoConfigURL === 'string'
        && system.autoConfigURL.indexOf('http://' + server + '/proxy.pac') === 0;
      const systemOn = pacOn
        || (system !== undefined && system.enabled === true && server !== undefined && system.server === server);
      const gitOn = tools !== undefined && tools.git !== undefined && server !== undefined && tools.git.indexOf(server) !== -1;
      const envOn = tools !== undefined && tools.env !== undefined && server !== undefined
        && (tools.env.HTTPS_PROXY === 'http://' + server || tools.env.HTTP_PROXY === 'http://' + server);

      const routing = proxy !== undefined && proxy.routing !== undefined && proxy.routing !== null
        ? proxy.routing
        : { extra: [], full: false };
      const extraText = draftExtra !== undefined
        ? draftExtra
        : (Array.isArray(routing.extra) ? routing.extra.join(', ') : '');
      const fullOn = draftFull !== undefined ? draftFull : routing.full === true;

      const saveScope = () => {
        setBusy('scope');
        setError('');
        setScopeDone(false);
        postJson(ROUTES.routing, { extra: extraText, full: fullOn })
          .then((value) => {
            setStatus((prev) => (prev === undefined ? prev : Object.assign({}, prev, { proxy: value.proxy })));
            /* Drop the draft so the controls follow the value the host just stored. */
            setDraftExtra(undefined);
            setDraftFull(undefined);
            setScopeDone(true);
            setBusy('');
          })
          .catch((e) => {
            setError(String(e && e.message ? e.message : e));
            setBusy('');
          });
      };

      const scopeCard = h('div', { className: 'ghg-scope' },
        h('div', { className: 'ghg-grouplabel' }, t('routeTitle')),
        h('p', { className: 'ghg-muted', style: { margin: '0 0 6px', fontSize: '12px', lineHeight: '1.6' } }, t('routeIntro')),
        h('label', { className: 'ghg-scopetoggle' },
          h('input', {
            type: 'checkbox',
            checked: fullOn,
            disabled: busy !== '',
            onChange: (event) => {
              setScopeDone(false);
              setDraftFull(event.target.checked);
            },
          }),
          h('span', {}, t('routeFull'))),
        h('p', { className: 'ghg-actnote ghg-muted', style: { margin: '4px 0 0' } }, t('routeFullNote')),
        h('label', { className: 'ghg-grouplabel', htmlFor: 'ghg-scope-extra', style: { display: 'block', marginTop: '10px' } }, t('routeExtra')),
        h('input', {
          id: 'ghg-scope-extra',
          className: 'ghg-input',
          type: 'text',
          spellCheck: false,
          placeholder: 'cdn.jsdelivr.net, files.pythonhosted.org',
          value: extraText,
          disabled: busy !== '',
          onChange: (event) => {
            setScopeDone(false);
            setDraftExtra(event.target.value);
          },
        }),
        h('p', { className: 'ghg-actnote ghg-muted', style: { margin: '4px 0 0' } }, t('routeExtraHint')),
        h('div', { style: { marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' } },
          h('button', { type: 'button', className: 'ghg-act', disabled: busy !== '', onClick: saveScope },
            busy === 'scope' ? t('busySave') : t('routeSave')),
          scopeDone === true ? h('span', { className: 'ghg-muted', style: { fontSize: '12px' } }, t('routeSaved')) : null));

      const btn = (kind, label, handler, primary) => h('button', {
        type: 'button',
        className: primary === true ? 'ghg-act ghg-actprimary' : 'ghg-act',
        disabled: busy !== '',
        onClick: handler,
      }, busy === kind ? t(kind === 'proxyOn' ? 'busyProxyOn' : 'busyProxyOff') : label);

      const line = (key, ok, name, detail) => h('div', { className: 'ghg-status', key: key },
        h('span', { className: 'ghg-dot', 'data-ok': ok === true ? '1' : '0' }),
        h('span', { className: 'ghg-statusname' }, name),
        detail ? h('span', { className: 'ghg-muted' }, detail) : null);

      const rows = [];
      if (proxy !== undefined) {
        rows.push(line('run', running, t('proxyTitle'), running ? t('proxyOn') : t('proxyOff')));
        if (running) {
          const counters = [
            t('proxyConns') + ' ' + proxy.connections,
            t('proxyTunnels') + ' ' + proxy.tunnels,
          ];
          if (proxy.failures > 0) counters.push(t('proxyFails') + ' ' + proxy.failures);
          if (typeof proxy.tlsProbes === 'number' && proxy.tlsProbes > 0) {
            counters.push(t('proxyProbes') + ' ' + proxy.tlsProbesOk + '/' + proxy.tlsProbes);
          }
          if (typeof proxy.avgConnectMs === 'number') counters.push(t('proxyAvg') + ' ' + proxy.avgConnectMs + 'ms');
          const kb = Math.round(((proxy.bytesDown || 0) + (proxy.bytesUp || 0)) / 1024);
          counters.push(t('proxyTraffic') + ' ' + kb + 'KB');
          rows.push(h('div', { className: 'ghg-status', key: 'stats' },
            h('span', { className: 'ghg-statusname' }, t('proxyListening')),
            h('span', { className: 'ghg-muted' }, server + ' · ' + counters.join(' · '))));
        }
        rows.push(line('sys', systemOn, t('proxySysOn'), systemOn ? undefined : (system !== undefined && system.server ? system.server : t('proxySysOff'))));
        rows.push(line('gitp', gitOn, gitOn ? t('proxyGitOn') : t('proxyGitOff'), undefined));
        rows.push(line('envp', envOn, envOn ? t('proxyEnvOn') : t('proxyEnvOff'), undefined));
      }

      const winnerRows = proxy !== undefined && Array.isArray(proxy.addresses) && proxy.addresses.length > 0
        ? proxy.addresses.map((entry) => h('div', { className: 'ghg-status', key: 'w-' + entry.address },
          h('span', { className: 'ghg-dot', 'data-ok': '1' }),
          h('span', { className: 'ghg-statusname' }, entry.address),
          h('span', { className: 'ghg-muted' }, entry.wins + '×')))
        : [];

      const outcomeNodes = [];
      if (error !== '') {
        outcomeNodes.push(h('p', { className: 'ghg-actnote', key: 'err', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error));
      }
      if (outcome !== undefined) {
        if (outcome.kind === 'proxyOn') {
          const value = outcome.value || {};
          outcomeNodes.push(h('p', { className: 'ghg-actnote', key: 'on' },
            value.engaged === true ? t('proxyOnDone') : t('proxyLastError') + ' · ' + (value.reason || 'not engaged')));
        } else {
          outcomeNodes.push(h('p', { className: 'ghg-actnote', key: 'off' }, t('proxyOffDone')));
        }
      }

      return h('div', { className: 'ghg-fix' },
        h('div', { className: 'ghg-fixhead' },
          h('h2', { className: 'ghg-sech' }, t('proxyTitle')),
          h('div', { className: 'ghg-fixbtns' },
            btn('proxyOn', t('btnProxyOn'), () => run('proxyOn', ROUTES.proxyOn), running !== true),
            btn('proxyOff', t('btnProxyOff'), () => run('proxyOff', ROUTES.proxyOff), false))),
        h('p', { className: 'ghg-muted', style: { margin: '0 0 10px' } }, t('proxyIntro')),
        rows.length > 0 ? h('div', { className: 'ghg-statusbox' }, rows) : null,
        scopeCard,
        winnerRows.length > 0
          ? h('div', { className: 'ghg-statusbox' },
            h('div', { className: 'ghg-grouplabel' }, t('proxyWinners')), winnerRows)
          : null,
        proxy !== undefined && Array.isArray(proxy.suspect) && proxy.suspect.length > 0
          ? h('p', { className: 'ghg-muted', style: { margin: '6px 0 0' } },
            t('proxySuspect') + ' · ' + proxy.suspect.join(', '))
          : null,
        proxy !== undefined && Array.isArray(proxy.healthy) && proxy.healthy.length > 0
          ? h('p', { className: 'ghg-muted', style: { margin: '6px 0 0' } },
            t('proxyHealthy') + ' · ' + proxy.healthy.map((entry) => entry.host + ' → ' + entry.address).join(', '))
          : null,
        proxy !== undefined && Array.isArray(proxy.seed) && proxy.seed.length > 0
          ? h('p', { className: 'ghg-muted', style: { margin: '6px 0 0' } },
            t('proxySeed') + ' · ' + proxy.seed.map((entry) => entry.host + ' → ' + entry.addresses.join('/')).join(', '))
          : null,
        outcomeNodes.length > 0 ? h('div', { key: 'out' }, outcomeNodes) : null,
        h('p', { className: 'ghg-actnote ghg-muted' }, t('proxyRestoreNote')),
        status !== undefined && status.direct !== undefined && status.direct.ok === true
          ? h('p', { className: 'ghg-actnote ghg-muted' }, t('proxyNeedsDirect'))
          : null);
    }

    /* Turns a plain GitHub URL into forms that work on a blocked network:
     * the raw/download path through a working channel, plus the mirror page. */
    function convertUrl(raw, channels) {
      const url = String(raw || '').trim().replace(/\/+$/, '');
      if (url === '') return null;
      if (!/^https?:\/\/([a-z0-9-]+\.)*github(usercontent)?\.com\//i.test(url)) return null;
      const primary = (channels || []).filter((c) => c.usable === true && c.urlPrefix)[0];
      const out = [];
      /* Accelerator prefixes only fetch files: a repo page is HTML and comes back 403.
       * So the prefix is offered for raw files, archives and Release assets only. */
      const isAsset = /^https?:\/\/raw\.githubusercontent\.com\//i.test(url)
        || /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(archive|releases\/download|codeload)\//i.test(url)
        || /^https?:\/\/codeload\.github\.com\//i.test(url);
      if (primary && isAsset) {
        out.push({ kind: 'download', label: primary.label, value: primary.urlPrefix + url });
      }
      const rawMatch = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i.exec(url);
      if (rawMatch) {
        out.push({
          kind: 'jsdelivr',
          label: 'jsDelivr',
          value: 'https://cdn.jsdelivr.net/gh/' + rawMatch[1] + '/' + rawMatch[2] + '@' + rawMatch[3] + '/' + rawMatch[4],
        });
      }
      const repoMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:[?#].*)?$/i.exec(url);
      if (repoMatch) {
        /* gitcode shards mirrors by the first two letters of the repo name: vuejs/vue -> gh_mirrors/vu/vue.
         * A mirror only exists once someone imported it, so the direct owner path and a search
         * link are offered too, and the reader picks whichever opens. */
        out.push({
          kind: 'mirror',
          label: 'gitcode',
          value: 'https://gitcode.com/gh_mirrors/' + repoMatch[2].slice(0, 2).toLowerCase() + '/' + repoMatch[2],
        });
        out.push({
          kind: 'mirror2',
          label: 'gitcode',
          value: 'https://gitcode.com/' + repoMatch[1] + '/' + repoMatch[2],
        });
        out.push({
          kind: 'search',
          label: 'gitcode',
          value: 'https://gitcode.com/explore/search?q=' + encodeURIComponent(repoMatch[1] + '/' + repoMatch[2]),
        });
        out.push({
          kind: 'clone',
          label: 'git clone',
          value: 'git clone ' + url.replace(/\/+$/, '') + '.git',
        });
      }
      return out;
    }

    function UrlBox(props) {
      const t = props.t;
      const channels = props.channels || [];
      const [raw, setRaw] = React.useState('');

      const rows = convertUrl(raw, channels) || [];
      return h('div', { className: 'ghg-urlbox' },
        h('label', { className: 'ghg-grouplabel', htmlFor: 'ghg-url' }, t('urlLabel')),
        h('input', {
          id: 'ghg-url',
          className: 'ghg-input',
          type: 'text',
          spellCheck: false,
          placeholder: 'https://github.com/user/repo',
          value: raw,
          onChange: (event) => setRaw(event.target.value),
        }),
        rows.length === 0
          ? h('p', { className: 'ghg-muted', style: { margin: '6px 0 0', fontSize: '12px' } }, t('urlHint'))
          : h('div', { style: { marginTop: '6px' } },
            rows.map((row) => h(CodeRow, { key: row.kind, t: t, value: row.value, tag: row.label }))));
    }

    function GuidePanel(props) {
      const t = props.t;
      const nav = [
        ['proxy', t('navProxy')],
        ['fix', t('navFix')],
        ['symptoms', t('navSymptoms')],
        ['checks', t('navChecks')],
        ['hosts', t('navHosts')],
        ['accel', t('navAccel')],
        ['long', t('navLong')],
        ['errors', t('navErrors')],
        ['cmd', t('navCmd')],
        ['safety', t('navSafety')],
        ['refs', t('navRefs')],
      ];
      const jump = (id) => {
        const node = document.getElementById('ghg-' + id);
        if (node !== null && typeof node.scrollIntoView === 'function') {
          node.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      };
      const navButtons = nav.map((pair) => h('button', {
        key: pair[0],
        type: 'button',
        className: 'ghg-navbtn',
        onClick: () => jump(pair[0]),
      }, pair[1]));
      const sections = [
        h('section', { key: 'proxy', className: 'ghg-sec', id: 'ghg-proxy' }, h(ProxyPanel, { t: t })),
        h('section', { key: 'fix', className: 'ghg-sec', id: 'ghg-fix' }, h(ActionPanel, { t: t })),
        h(Section, { key: 'symptoms', id: 'symptoms', title: t('layerTitle') },
          h(Card, null, h('p', { className: 'ghg-p ghg-muted' }, t('layerBody'))),
          h(Card, null, symptomRows(t))),
        h(Section, { key: 'checks', id: 'checks', title: t('checksTitle') },
          h(Card, null, checkRows(t))),
        hostsSection(t),
        accelSection(t),
        longSection(t),
        h(Section, { key: 'errors', id: 'errors', title: t('errorsTitle') }, errorCards(t)),
        cmdSection(t),
        safetySection(t),
        refsSection(t),
      ];
      const header = h('div', { className: 'ghg-head' },
        h('h1', { className: 'ghg-title' }, t('panel')),
        h('span', { className: 'ghg-badge' }, t('envBadge')));
      const inner = [
        header,
        h('p', { key: 'sub', className: 'ghg-sub' }, t('subtitle')),
        h('nav', { key: 'nav', className: 'ghg-nav' }, navButtons),
        sections,
        h('p', { key: 'foot', className: 'ghg-foot' }, t('footNote')),
      ];
      return h('div', { className: 'ghg-root' },
        h('div', { className: 'ghg-scroll' },
          h('div', { className: 'ghg-inner' }, inner)));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale');
        if (locale === undefined) return;
        ctx.effect(() => locale.register(NS, { zh: dictZh, en: dictEn }), 'github-access-guide: dictionaries');
        const t = locale.bind(NS);
        const slots = ctx.get('slots');
        if (slots === undefined) return;

        ctx.effect(() => {
          const doc = document;
          const existing = doc.querySelector('style[data-plugin-css="github-access-guide"]');
          if (existing !== null) return undefined;
          const tag = doc.createElement('style');
          tag.dataset.plugin = 'github-access-guide';
          tag.dataset.pluginCss = 'github-access-guide';
          tag.textContent = CSS;
          doc.head.appendChild(tag);
          return () => {
            if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
          };
        }, 'github-access-guide: styles');

        const Panel = (props) => h(GuidePanel, {
          t: typeof props.t === 'function' ? props.t : t,
          size: props.size,
        });

        ctx.effect(() => slots.inject('main', () => slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, Panel)), 'github-access-guide: main panel');

        ctx.effect(() => slots.inject('sidebar.panellist', () => slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 15,
          label: () => t('panel'),
          locale: NS,
        }, (props) => h(PanelIcon, { size: props.size }))), 'github-access-guide: sidebar entry');
      },
    };
  },
});
