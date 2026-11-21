# monitor-theme-design

[monitor](https://github.com/monitor-probe/monitor) 的 Arc 风格公开状态页主题。

![预览](preview.png)

## 特性

- **Arc 浏览器式空间外壳**：桌面端采用「多点渐变外框 + 可折叠左侧栏（`Ctrl+\` / `Cmd+\`）+ 悬浮主画布」布局，左侧栏与右侧画布独立滚动；移动端自动切换为顶部精简栏与抽屉侧栏。
- **动态 Arc 色彩与图表 Token 引擎**：内置 2D 点阵自由色盘（支持 1–3 个独立拖拽色点）、一键随机和谐配色与 5 页 Arc 色板；基于 OKLCH 感知色域自动派生深浅双半面画布、纸面层级与 5 色协调图表色板，全站界面与图表色调统一。
- **质感与透光微调**：配备正弦波浪显色强度滑块、20 点环形胶片颗粒旋钮与画布磨砂透光控制；支持浅色、深色与跟随系统三种外观模式，站长登录后可一键保存为全站默认外观。
- **集群遥测总览（`/`）**：支持按节点分组筛选，呈现在线节点、平均 CPU、集群内存与实时总吞吐 4 项核心指标，以及节点实时负载对比（可切换综合 / CPU / 内存）、实时集群带宽趋势、本期流量排行与交互联动地区分布环图。
- **单节点监控工作台（`/node/{id}`）**：顶部提供上一台 / 下一台快捷切换与全局时间窗口选择，依次呈现 4 项实时指标、全宽网络延迟探测图（支持削峰、EWMA 平滑、单探针抖动带与区间缩放）、2×2 历史面积图（CPU / 内存 / 网络 / 硬盘）以及主机硬件、连接进程、周期流量与账期信息。
- **轻量化与双语支持**：自托管单文件国旗字体 `TwemojiCountryFlags.woff2`，零外部 CDN 依赖；内置简体中文与英文（`zh-CN` / `en-US`）双语界面，默认跟随浏览器语言并支持即时切换。

## 路由

- `/`：集群运行总览
- `/node/{id}`：单节点实时指标、延迟探测与历史图表

如站点前端配置了按路径放行的反向代理或 WAF，请放行 `/node/` 路径前缀以确保刷新详情页正常访问。

## 安装

### 方法一：后台上传压缩包

1. 在 [Releases](https://github.com/tom2almighty/monitor-theme-design/releases) 页面下载最新的 `theme.tar.gz`。
2. 登录 monitor hub 后台，进入「主题」管理页面。
3. 上传 `theme.tar.gz` 完成安装，后续可通过卡片上的检查更新按钮一键升级。

### 方法二：解压至主题目录

将 release 产物解压到 hub 所在主机 `--themes` 目录下的 `Design/`（或 `monitor-theme-design/`）目录：

```bash
mkdir -p /path/to/monitor/themes/Design
tar -xzf theme.tar.gz -C /path/to/monitor/themes/Design
```

随后在后台「主题」页刷新并切换启用。

## 本地开发

```bash
pnpm install
MONITOR_HUB=https://hub.example.com pnpm dev
pnpm lint
pnpm test
pnpm build
```

## 开源协议

- 基于 [MIT License](LICENSE) 开源。
- 面向 [monitor-probe/monitor](https://github.com/monitor-probe/monitor) 构建；国旗字体回退使用 [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill) 与 Twemoji。
