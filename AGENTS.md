# AGENTS.md

## 项目定位

monitor 探针的公开状态页主题。构建产物是一份纯静态 SPA，hub 只负责把 `dist/` 当静态文件提供，不参与编译，也不注入构建期变量。后台、登录、OAuth、节点管理都由 hub 内置，不在本仓库实现。

主题同时通过 `theme.json` 向 hub 声明名称、版本、源码地址和站长可调的站点设置。

上游开发文档：

- 在线：<https://monitor-document.pages.dev/dev/theme>
- 仓库内副本：[theme-dev.md](theme-dev.md)

两份文档冲突时以在线文档为准；改主题行为前先读「可以用的接口」「到期天数」「节点分组」「主题设置」几节。

## 技术栈

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4（`@tailwindcss/vite`，无 `tailwind.config`）
- shadcn/ui 风格组件，源码放在 `src/components/ui/`
- recharts 3 绘制历史图表
- lucide-react、simple-icons、flag-icons 提供图标

不引入新的 UI 框架、图表库或状态管理库。需要 shadcn 组件时用 `pnpm dlx shadcn@latest add <component>` 生成到 `src/components/ui/`，不要手写高仿版。

## 常用命令

```bash
pnpm install                 # 安装依赖；CI 使用 npm ci
MONITOR_HUB=https://hub.example.com pnpm dev
pnpm lint                    # oxlint
pnpm test                    # node 直接跑 src/lib/*.test.ts
pnpm build                   # tsc -b && vite build
pnpm preview
```

不设置 `MONITOR_HUB` 时，Vite 把 `/api` 和 WebSocket 代理到 `http://127.0.0.1:9911`。

仓库同时保留 `package-lock.json` 和 `pnpm-lock.yaml`。CI 走 `npm ci`，本地用什么包管理器都可以，但升级依赖后两份锁文件都要同步。

## 目录结构

```text
src/
├── App.tsx                 应用外壳、导航、主题/深浅色/质感设置、路由分发
├── components/
│   ├── MonitorPage.tsx     监控页：上方筛选，下方图表
│   ├── NodeFilterBar.tsx   监控页筛选栏（搜索、分组、地区、系统、节点选择）
│   ├── ServerTable.tsx     首页服务器列表、搜索、分组筛选、排序
│   ├── NodeDetail.tsx      节点图表页与延迟图（recharts 懒加载）
│   ├── RowDetails.tsx      首页表格展开行
│   ├── NodeMarks.tsx       状态点、国旗、系统图标、进度条、数字槽位
│   └── ui/                 shadcn 风格基础组件
├── lib/
│   ├── api.ts              Node 类型、safeNodes、useNodes（WebSocket + 轮询兜底）
│   ├── history.ts          历史数据请求、时间范围、60 秒缓存
│   ├── filters.ts          监控页的节点筛选类型与纯函数
│   ├── format.ts           字节、速率、时长、坐标轴刻度等纯函数
│   ├── prefs.ts            访客本地偏好（localStorage）
│   ├── config.ts           读取/保存 theme.json 声明的站点设置
│   ├── route.tsx           `/node/{id}` 路由与客户端 Link
│   ├── themes.ts           内置配色方案
│   └── pings.ts            节点是否有延迟探测的本地记录
└── index.css               主题 Token、Tailwind 入口、噪点纹理
```

## 路由

- `/`：服务器列表
- `/node/{id}`：单节点监控页

未知路径由 hub 回落到主题的 `dist/index.html`，所以客户端路由和刷新详情页都可用。`/admin`、`/api`、`/install.sh`、`/agent/*` 由 hub 占用，主题不能覆盖。新增路由前缀要同步写进 README，方便反代和 WAF 放行。

## 数据接口

主题只能使用下面五个同源接口：

| 接口 | 用途 |
|---|---|
| `GET /api/me` | 站点名、登录状态、公开页开关 |
| `GET /api/nodes` | 节点列表、实时指标、累计流量 |
| `GET /api/nodes/{id}/metrics` | 历史指标与延迟 |
| `GET /api/ws` | 每 2 秒推送节点快照 |
| `GET /api/themes/{short}/config` | 主题站点设置（管理员可 `PUT`） |

`/api/nodes/{id}/metrics` 的 `hours`、`points`、`series` 三个参数都可省略。匿名窗口上限 168 小时，登录后 2160 小时，超出会被静默收窄。

字段处理以 hub 源码为准，所有字段都按「可能不存在」处理：

- 离线节点：`metrics: null`
- 已连接但还没上报：`online: true` 且 `metrics: null`
- 坏数据：字段缺失或类型不对，渲染入口要能降级，不能一个节点导致整页白屏
- 到期天数用快照里的 `expires_in`，不要拿 `expires_at` 按浏览器时钟自己算；只有 hub 1.2.0 及更早没有该字段时才回退
- 分组用 `group`，空字符串表示未分组。分组按节点顺序排，名字是任意文本（最多 13 字），可能和「全部」「未分组」重名，状态里不要用字符串冒充「全部」
- 匿名响应里没有地址、`hostname`、私有 `remark`、`token` 等字段，是 key 不存在而不是空字符串

实时数据统一走 `useNodes()`：它优先用 WebSocket，连接失败后降级为 5 秒轮询，不要在组件里另写一套拉取。

## 主题设置

站点级设置只在 `theme.json` 的 `config` 里声明，运行时通过 `/api/themes/{short}/config` 读取，登录后可以保存。规则：

- 默认值只写在 `theme.json`，代码里用导入的 manifest 补齐
- 读取失败、401、404、网络错误都按默认值渲染，不报错
- 保存时只写与默认值不同的项，先读后写，保留不认识的 key
- 设置是公开的，不能放密钥、token 或内网地址
- `key` 发布后不改名；含义变了就换新 key
- 设置值按纯文本渲染，禁止 `innerHTML`、`dangerouslySetInnerHTML`、`v-html`

访客自己的偏好（深浅色、图表类型、时间范围、削峰/平滑）放 `localStorage`，不要去写站点设置。优先级从低到高：`theme.json` 默认值、hub 站点设置、访客本地偏好。

## 监控页交互

监控页采用「上方筛选、下方图表」的单列结构，桌面端和移动端一致：

- 常用筛选默认展示：搜索、分组标签、仅在线
- 地区、系统等不常用条件收进「更多筛选」；已生效的条件用可移除的标签回显
- 分组很多时只列出前几个，其余收进「更多分组」；分组行横向滚动，不能把页面撑宽
- 节点很多时用下拉选择器配合顶部搜索，不要把所有节点铺成常驻列表
- 提供上一个/下一个节点按钮；筛选结果为空时显示空状态和清除筛选入口
- 当前节点被筛掉且仍有结果时，自动切到结果中的第一个节点

图表页不要再用「左侧固定节点列表 + 右侧图表」的双栏结构。侧栏高度跟视口绑定，节点多时会把 footer 顶到首屏之外，移动端也更容易溢出。

## 样式规范

- 只使用语义化 Token：`bg-background`、`text-foreground`、`text-muted-foreground`、`border-border`、`bg-card` 等。业务组件里不写 `bg-gray-100`、`text-zinc-600` 这类调色板色值
- 颜色倾向通过 `src/index.css` 主题变量调整，不在组件里堆色值。状态色（在线绿、告警黄、错误红）沿用现有 emerald/amber/red 用法
- 尺寸走 Tailwind 预设刻度和 4px 基线：`text-xs/sm/base/lg`、`p-2/3/4`、`gap-2`、`rounded-md/lg`。禁止滥用任意像素值；只有 recharts/SVG 画布或需要动态计算的定位才允许中括号
- 类名合并统一用 `cn()`（`clsx` + `tailwind-merge`）
- 交互元素要有 hover、focus-visible、active、disabled 状态
- 默认支持亮色、暗色、跟随系统三种模式；首帧脚本在 `index.html` 里
- 图标用 lucide，品牌图标用 simple-icons，国旗用 flag-icons。不用 Emoji 代替图标
- 移动端必须保证没有横向溢出：长文本 `min-w-0` + `truncate`，多按钮行 `flex-wrap`，标签行 `overflow-x-auto`
- 源码注释用英文，界面文案用中文

## 构建与发布

- `pnpm build` 产出 `dist/`，不要提交 `dist/`
- 发布包是 `theme.tar.gz`，解开必须是一个目录：`theme.json` + `preview.png` + `dist/index.html`
- `theme.json` 的 `version` 要和 release tag 对上（`v1.2.0` 对应 `1.2.0`），否则一键更新会重复安装
- 推送 `v*` tag 触发 `.github/workflows/release.yml`，自动构建并上传 `theme.tar.gz` 与 SHA256
- `main` 的 Push/PR 触发 CI：格式检查（oxlint）、测试、构建
- 包体上限：整包 32 MiB，解压后 64 MiB，单文件 8 MiB，文件与目录共 2000 个

## 改动约定

- 只改需求点名的文件和行为，不顺手改格式、命名或依赖
- 修改接口、配置、脚本、路由或用户可感知行为时，同步更新 README、`theme.json` 或相关文档
- 提交信息用约定式提交，例如 `feat: redesign monitor page`、`fix: prevent mobile overflow`
- 不主动 commit、push、打 tag，除非明确要求
