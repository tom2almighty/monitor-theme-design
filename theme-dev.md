开发指南

# 主题开发

本页内容

- [主题包](https://monitor-document.pages.dev/dev/theme#%E4%B8%BB%E9%A2%98%E5%8C%85)
- [theme.json](https://monitor-document.pages.dev/dev/theme#themejson)
- [上限](https://monitor-document.pages.dev/dev/theme#%E4%B8%8A%E9%99%90)
- [可以用的接口](https://monitor-document.pages.dev/dev/theme#%E5%8F%AF%E4%BB%A5%E7%94%A8%E7%9A%84%E6%8E%A5%E5%8F%A3)
- [匿名拿不到什么](https://monitor-document.pages.dev/dev/theme#%E5%8C%BF%E5%90%8D%E6%8B%BF%E4%B8%8D%E5%88%B0%E4%BB%80%E4%B9%88)
- [三种要处理的状态](https://monitor-document.pages.dev/dev/theme#%E4%B8%89%E7%A7%8D%E8%A6%81%E5%A4%84%E7%90%86%E7%9A%84%E7%8A%B6%E6%80%81)
- [路由](https://monitor-document.pages.dev/dev/theme#%E8%B7%AF%E7%94%B1)
- [本地开发](https://monitor-document.pages.dev/dev/theme#%E6%9C%AC%E5%9C%B0%E5%BC%80%E5%8F%91)
- [安装与切换](https://monitor-document.pages.dev/dev/theme#%E5%AE%89%E8%A3%85%E4%B8%8E%E5%88%87%E6%8D%A2)
- [参考实现](https://monitor-document.pages.dev/dev/theme#%E5%8F%82%E8%80%83%E5%AE%9E%E7%8E%B0)

主题是纯静态 SPA，决定公开状态页长什么样。hub 把它当文件伺服：不编译，不注入，不提供构建期变量。

后台和登录页始终由 hub 内置提供，不属于主题，所以主题不必重做节点管理、OAuth 和密码设置。

## 主题包 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E4%B8%BB%E9%A2%98%E5%8C%85)

一个可安装主题是一个目录，名字必须和 `theme.json` 里的 `short` 相同：

```
<themes-dir>/<short>/
├── theme.json
├── preview.png        # 可选，面板上的预览图。文件名是约定，不是字段
└── dist/
    └── index.html
```

发布时打成 `theme.tar.gz`，解开就是这个目录。

### theme.json [链接到本节](https://monitor-document.pages.dev/dev/theme\#themejson)

字段都是字符串：

| 字段 | 必需 | 含义 |
| --- | --- | --- |
| `name` | 是 | 显示名称 |
| `short` | 是 | 唯一短名，限字母、数字、`-`、`_`。取 `default` 则顶替 hub 内置的那份 |
| `description` | 否 | 简介 |
| `version` | 否 | 主题版本 |
| `author` | 否 | 作者 |
| `url` | 否 | 源码地址。指向 GitHub 仓库时，面板的一键更新从它的 release 取 `theme.tar.gz` |

### 上限 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E4%B8%8A%E9%99%90)

| 限制 | 值 |
| --- | --- |
| 整包 | 32 MiB |
| 解压总量 | 64 MiB |
| 单个文件 | 8 MiB |

解压总量要和上传上限分开限制，gz 的压缩比没有上界。

## 可以用的接口 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E5%8F%AF%E4%BB%A5%E7%94%A8%E7%9A%84%E6%8E%A5%E5%8F%A3)

只有这四个，全部同源：

| 接口 | 用途 |
| --- | --- |
| `GET /api/me` | 站点名、登录状态、公开页开关 |
| `GET /api/nodes` | 节点列表、实时指标、累计流量 |
| `GET /api/nodes/{id}/metrics` | 历史指标和延迟记录 |
| `GET /api/ws` | 每 2 秒推送一次节点快照的 WebSocket |

`metrics` 的三个查询参数都可以省：

- `hours=N` 窗口宽度。匿名上限 168，登录后 2160，超出静默收窄
- `points=W` 画得下几个点。只会让 hub 抽得更稀，不会更密
- `series=metrics|ping` 只取要画的那一半，省掉的那半原本占响应的三分之一到三分之二

探测曲线的名字在响应的 `probes` 里随样本一起下发，匿名可读，所以画延迟图不需要第二个请求，也不需要管理员身份。

## 匿名拿不到什么 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E5%8C%BF%E5%90%8D%E6%8B%BF%E4%B8%8D%E5%88%B0%E4%BB%80%E4%B9%88)

匿名访问 `GET /api/nodes` 只返回公开的节点，响应里没有地址（`ip`、`ipv4`、`ipv6`、`ipv4_pin`、`ipv6_pin`）、
`hostname`、`remark`、`token` 这些 key——不是空字符串，是根本不存在。国家码只给一个 `country`，手填优先。

指标部分走白名单，所以 `boot_id`、`iface`、`net_rx_total`、`net_tx_total` 也只给登录后的面板。

字段定义以 hub 的源码为准。写主题时按「这个 key 可能不存在」处理。

## 三种要处理的状态 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E4%B8%89%E7%A7%8D%E8%A6%81%E5%A4%84%E7%90%86%E7%9A%84%E7%8A%B6%E6%80%81)

| 状态 | 长什么样 |
| --- | --- |
| 离线节点 | `metrics: null` |
| 刚连上还没上报 | `online: true` \+ `metrics: null` |
| 坏数据 | 字段缺失或类型不对 |

第二种最容易漏。默认主题在渲染入口再检查一次完整指标，缺失或畸形时显示「不可用」，不让一个节点的坏数据把整个页面白屏。

## 路由 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E8%B7%AF%E7%94%B1)

未知路径回落到主题自己的 `dist/index.html`，客户端路由因此可用。`/admin/*` 由 hub 内置后台接管，主题覆盖不了它。

默认主题用 `/node/{id}` 做详情页。hub 的回落对它够用，但前面若有按路径做正向白名单的反代或
WAF，要把这个前缀放行。从列表点进去只是 pushState，边缘看不见，刷新详情页才会真的请求这个路径，症状是「点进去正常，一刷新就被拦」。

## 本地开发 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E6%9C%AC%E5%9C%B0%E5%BC%80%E5%8F%91)

起一个 hub 实例：

```
monitor-hub --listen 127.0.0.1:9911 --db /tmp/monitor.db --site http://127.0.0.1:9911
```

bash

主题的开发服务器把 `/api` 和 WebSocket 代理到它。默认主题的 `vite.config.ts` 里就是这么配的，照抄即可。

## 安装与切换 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E5%AE%89%E8%A3%85%E4%B8%8E%E5%88%87%E6%8D%A2)

**主题** 页选一个即可切换，无需重启；选中的主题缺失或损坏时自动回落到内置默认主题。

装有两种方式：把 `theme.tar.gz` 拖进面板，或者把主题目录直接放到 hub 的 `--themes` 位置（一键脚本装出来的是 `/opt/monitor/data/themes/`）。卡片上的 ⟳ 从 `theme.json` 里 `url` 指的
GitHub 仓库拉最新 release，tag 和已装版本相同就不下载。

内置默认主题同样可以就地更新，无需升级 hub：⟳ 把新版装进 `themes/default/`，此后由磁盘上这份伺服，卡片上的「内置」标记随之消失，删掉它则回到二进制里那份。因此公开页有两层兜底——磁盘上的主题损坏时回落到内置默认主题，而内置的那份始终在二进制里，删不掉也换不坏。

上传的主题是在访客浏览器里运行的第三方代码，和 hub 同源。装之前的检查挡的是写到目录外和撑爆磁盘，不体检里面的 JS。只装信得过的来源。

## 参考实现 [链接到本节](https://monitor-document.pages.dev/dev/theme\#%E5%8F%82%E8%80%83%E5%AE%9E%E7%8E%B0)

[monitor-theme-default](https://github.com/monitor-probe/monitor-theme-default)，React + Vite +
shadcn/ui，黑白配色。它同时是内置默认主题和第三方主题的范本：hub 嵌进去的那个包，和解到
`themes/` 的那个是同一个文件。

[在 GitHub 上修改这一页](https://github.com/monitor-probe/monitor-document/edit/main/src/content/dev/theme.mdx) 最后更新 2026-09-19