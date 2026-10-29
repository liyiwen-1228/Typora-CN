# Typora-CN

在 **Windows 上开发** 的 iOS 版 Typora 风格 Markdown 笔记应用，无需 Mac。

使用 React Native（Expo 托管工作流）+ WebView 承载 CodeMirror 6 编辑器：真机预览只需 iPhone 安装 **Expo Go** 扫码即可，上架打包交给 EAS Build 云端完成，全程不需要 Mac。

## 功能特性

**笔记管理**

- 笔记列表：标题 / 摘要 / 修改时间 / 大小，按修改时间排序，下拉刷新
- 搜索：按标题与摘要即时过滤
- 新建 / 重命名 / 删除（长按列表项弹出操作菜单）
- 从系统「文件」App / iCloud 云盘导入 `.md` 文件
- 首个一级标题自动作为笔记标题；保存时自动按标题重命名文件（冲突时保留原名）

**编辑器（CodeMirror 6）**

- 行号、当前行高亮、括号匹配、自动闭合、自动缩进、撤销/重做
- 格式化工具栏：H1–H6、加粗、斜体、删除线、行内代码、链接、图片、引用、无序/有序/任务列表、表格、代码块、分隔线
- 硬件键盘快捷键：Cmd/Ctrl+S 保存、Cmd/Ctrl+B 加粗、Cmd/Ctrl+I 斜体
- 顶栏实时统计：光标行/总行数、字数（中日韩按字计）、字符数
- 自动保存（输入停止 800ms 后写盘，退出编辑页前强制落盘）

**预览**

- 所见即所得切换：顶栏一键 编辑 ↔ 预览（marked + GFM 渲染）
- 表格、任务列表、代码块、引用、分隔线等完整排版
- 预览中的外链自动交给系统浏览器打开

**主题**

- 浅色 / 深色 / 跟随系统，顶栏一键循环切换，偏好持久化
- 编辑器、预览、界面三处主题同步切换

## 技术栈

| 模块 | 说明 |
| --- | --- |
| Expo ~58.0.0（托管工作流） | Mac-free 开发与预览（App Store 的 Expo Go 只支持最新 SDK，项目需与之同步升级） |
| react-native 0.88.1 / react 19.3.0 | 运行时 |
| react-native-webview 14.0.1 | 承载编辑器页面 |
| CodeMirror 6（@codemirror/* 6.x） | 编辑器内核，esbuild 打包为单文件 HTML 内嵌 |
| marked ^15 | 预览渲染（GFM） |
| expo-file-system ~58.0.13 | 笔记读写（经典 API 从 `expo-file-system/legacy` 导入） |
| expo-document-picker ~58.0.4 | 文件导入 |
| expo-asset ~58.0.19 | 加载打包好的 editor.html 到 WebView |
| @react-native-async-storage/async-storage 2.2.0 | 主题偏好持久化 |
| react-native-safe-area-context ~5.10.1 | 刘海屏安全区适配 |

## 目录结构

```
├── assets/
│   └── editor.html          # 构建产物（npm run build:editor 生成，仓库不入库）
├── src/
│   ├── App.tsx              # 根组件：SafeAreaProvider + ThemeProvider + 页面状态
│   ├── bridge/protocol.ts   # RN ↔ WebView 桥接协议（事件/命令类型）
│   ├── theme/ThemeContext.tsx  # 主题（system/light/dark）+ 持久化
│   ├── storage/notesRepo.ts    # 笔记仓库（CRUD/导入/自动重命名）
│   ├── components/
│   │   ├── EditorWebView.tsx   # WebView 容器：资源加载、命令缓冲、事件分发
│   │   └── EditorToolbar.tsx   # 格式化工具栏
│   └── screens/
│       ├── DocumentsScreen.tsx  # 笔记列表页
│       └── EditorScreen.tsx      # 编辑器页（统计/自动保存/预览切换）
├── webview-editor/          # WebView 编辑器子项目（独立 npm 包）
│   ├── build.mjs            # esbuild 打包 → 内联进 template.html → 输出 assets/editor.html
│   ├── template.html        # 页面模板 + 深浅色 CSS 变量 + 预览排版
│   └── src/
│       ├── main.ts          # CodeMirror 入口（扩展装配/模式切换/命令处理）
│       ├── bridge.ts         # RN 桥接（postEvent / onCommand）
│       ├── commands.ts       # 19 种格式化动作实现
│       ├── theme.ts         # 编辑器主题 + 语法高亮配色
│       ├── preview.ts       # marked 渲染 + 最小化安全清理
│       └── protocol.ts      # 协议类型（与 RN 侧一致）
├── metro.config.js          # assetExts 增加 html
└── app.json / package.json / tsconfig.json / babel.config.js
```

## 桥接协议

```
WebView → RN（window.ReactNativeWebView.postMessage）
  ready   编辑器就绪
  change  { content, cursorLine, totalLines, charCount, wordCount }
  save    { content }

RN → WebView（webviewRef.postMessage → window 'message' 事件）
  load    { content }              加载/替换全文
  exec    { action }                执行格式化动作（bold/table/hr 等 19 种）
  theme   { dark }                  切换深浅色
  mode    { mode: 'edit'|'preview' } 切换编辑/预览
```

## Windows 环境准备

1. 安装 Node.js 20 LTS（本机若为旧版本，建议先用 winget 升级）：

   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

2. 安装 Expo CLI（`npx expo` 随项目依赖自动可用，无需全局安装）。

3. iPhone 在 App Store 安装 **Expo Go**，并使用同一 Apple ID 登录。

## 运行步骤

```powershell
# 1. 安装依赖（根项目 + webview-editor 子项目）
npm install

# 2. 构建 WebView 编辑器资源（生成 assets/editor.html）
npm run build:editor

# 3. 启动开发服务器
npx expo start
```

然后：

- iPhone 打开 Expo Go → 扫终端中的二维码即可预览
- 手机与电脑需在同一局域网；跨网段时改用 `npx expo start --tunnel`
- 修改 `webview-editor/` 内代码后需重跑 `npm run build:editor` 并重启应用

常用脚本：

| 命令 | 作用 |
| --- | --- |
| `npm run build:editor` | 安装并构建 WebView 编辑器子项目 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npx expo start --tunnel` | 跨网段真机预览 |

## 打包上架（后续）

1. 注册 Apple Developer（¥688/年）
2. `npm i -g eas-cli && eas login`
3. `eas build --platform ios` 云端打包（无需 Mac）
4. `eas submit` 提交 App Store 审核

> 上架前需在 `assets/` 准备应用图标并在 `app.json` 中配置。

## 路线图

- **v1.1** 导出 PDF / 图片
- **v1.2** 数学公式（KaTeX）、Mermaid 图表
- **v1.3** iCloud 同步
- **v1.4** EAS Build 正式打包上架

## 说明

- 本项目在 Windows 上纯代码开发，未在本地运行任何构建/测试命令；请按上述步骤首次运行验证。
- 本地 `node -v` 为 v12.18.4 时无法运行构建，请先升级到 Node 20 LTS。
