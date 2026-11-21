# monitor-theme-design

[monitor](https://github.com/monitor-probe/monitor) 的公开页主题。

Fork 自 [stqfdyr/monitor-theme-serverstatus](https://github.com/monitor-probe/monitor-theme-serverstatus)，融合原生 Arc 自由调色渐变背景、tweakcn(ShadcnUI) Tokens 与胶片颗粒磨砂质感的现代化监控主题。

![预览](preview.png)

## 特性

- **原生 Arc 浏览器外壳**：桌面端采用「彩色渐变画框 + 可折叠左侧栏（`Ctrl+\` / `Cmd+\`）+ 右侧圆角悬浮主画布」结构，移动端自动切换为精简顶栏与抽屉侧栏。
- **原生 Arc 自由调色背景**：支持 2D 点阵自由色盘（1~3 个独立可拖拽颜色圆点）、一键随机配色、5 页 Arc 原生色板，自动派生深浅双半面背景与和谐强调色。
- **双模式与质感微调**：支持「Arc 背景」与「经典纯色（Claude / Vercel / Twitter / Default）」切换，内置正弦波浪显色强度滑块、20 点环形颗粒旋钮与画布磨砂透光调节，站长登录后可一键保存为全站默认外观。
- **轻量化自托管国旗**：使用 `country-flag-emoji-polyfill` 自托管单文件 `TwemojiCountryFlags.woff2`（约 76 KB），替代数百个静态 SVG 文件，无外部 CDN 依赖且在 Windows / macOS / 移动端一致显示。
- **双语国际化（i18n）**：完整支持简体中文与英文（`zh-CN` / `en-US`），默认自动匹配浏览器语言，并可在界面一键切换。
- **流畅节点导航**：侧栏提供实时搜索、「仅看在线」筛选、按节点顺序排列的可折叠分组文件夹与单行状态预览；右侧主画布首页只放全站汇总遥测，单节点页依次展示实时指标卡、延迟探测与历史图表。

## 路由

- `/`：集群遥测总览
- `/node/{id}`：单节点实时指标、延迟探测与历史图表

## 安装

### 方法一：后台上传压缩包

1. 在 [Releases](https://github.com/tom2almighty/monitor-theme-design/releases) 页面下载最新的 `theme.tar.gz`。
2. 登录 monitor hub 后台，进入「主题」管理页面。
3. 上传 `theme.tar.gz` 完成安装。卡片上的 ⟳ 按钮可检查本仓库是否有新版本。

### 方法二：解压至目录

将 release 产物解压到 hub 所在主机 `--themes` 目录下的 `monitor-theme-design/` 文件夹：

```bash
mkdir -p /path/to/monitor/themes/monitor-theme-design
tar -xzf theme.tar.gz -C /path/to/monitor/themes/monitor-theme-design
```

然后在后台「主题」页刷新并选中切换。

## 协议与致谢

- 本项目基于 [MIT License](LICENSE) 开源。
- 感谢 [monitor-probe/monitor](https://github.com/monitor-probe/monitor)。
- 感谢 [stqfdyr](https://github.com/stqfdyr) 的原版 [monitor-theme-serverstatus](https://github.com/monitor-probe/monitor-theme-serverstatus) 主题。
- 国旗字体回退来自 [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill)（MIT 协议）与 Twemoji。