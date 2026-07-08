# 多语言 Hello World & macOS 模拟器

# Multilingual Hello World & macOS Simulator

---

## 项目简介 / Project Introduction

本项目是一个基于 Svelte + Vite 的组件化静态网站，展示了多语言 Hello World 代码示例，并提供完整的 macOS 桌面模拟器和 3D 赛车游戏体验。

This project is a component-based static website built with Svelte + Vite, showcasing multilingual Hello World code examples along with a full-featured macOS desktop simulator and a 3D racing game experience.

### 主要功能 / Main Features

- **多语言 Hello World** — 展示 21 种编程语言的经典问候代码
- **macOS 桌面模拟器** — 包含终端、访达、文本编辑器、计算器、飞机大战游戏
- **3D 赛车游戏** — 使用 Three.js 渲染的竞速游戏

- **Multilingual Hello World** — Display classic greeting code in 21 programming languages
- **macOS Desktop Simulator** — Terminal, Finder, Text Editor, Calculator, Airplane Battle Game
- **3D Racing Game** — Racing game rendered with Three.js

---

## 环境要求 / Environment Requirements

| 要求 / Requirement | 版本 / Version | 说明 / Description |
|-------------------|----------------|-------------------|
| Node.js | 18+ | JavaScript 运行时 / JavaScript runtime |
| npm | 9+ | Node.js 包管理器 / Node.js package manager |
| Git | 任意 / Any | 版本控制（可选）/ Version control (optional) |

---

## 安装步骤 / Installation

```bash
# 克隆项目（如果使用 Git）
git clone <repository-url>
cd hello-world-collection

# 安装依赖
npm install
```

---

## 常用命令 / Common Commands

| 命令 / Command | 说明 / Description |
|---------------|-------------------|
| `npm run dev` | 启动开发服务器（默认 http://localhost:5173）/ Start development server (default http://localhost:5173) |
| `npm run build` | 构建生产版本到 `dist/` 目录 / Build production version to `dist/` directory |
| `npm run preview` | 预览构建产物 / Preview the built production files |
| `npm test` | 运行 Vitest 单元测试 / Run Vitest unit tests |
| `npm run check` | 运行 svelte-check 类型检查 / Run svelte-check type checking |

---

## 页面功能详解 / Pages Overview

### 首页 (Home) — `/#/`

首页是整个应用的导航入口，提供四个主要功能的快速跳转入口。

Home serves as the navigation hub for the entire application, providing quick access to all four main features.

**功能特点 / Features:**
- 四个功能卡片，分别对应四个页面
- 简洁的 UI 设计，清晰的视觉引导
- Four feature cards corresponding to four pages
- Clean UI design with clear visual guidance

### Hello World — `/#/hello-world`

多语言代码展示页面，呈现 21 种编程语言的 Hello World 示例代码。

Multilingual code display page showcasing Hello World examples in 21 programming languages.

**支持的语言 / Supported Languages:**

| 语言 / Language | 语言 / Language | 语言 / Language |
|----------------|----------------|----------------|
| C | C++ | Python |
| Java | JavaScript | Go |
| Rust | Ruby | Swift |
| Kotlin | PHP | C# |
| TypeScript | Lua | Shell |
| SQL | R | Scala |
| Perl | Dart | Haskell |

**功能特点 / Features:**
- 代码语法高亮（使用 highlight.js）
- 搜索过滤功能，支持按语言名称搜索
- 代码卡片展示，点击可复制代码
- Code syntax highlighting (using highlight.js)
- Search/filter functionality by language name
- Code card display with click-to-copy feature

### macOS 模拟器 — `/#/macos`

模拟完整的 macOS 桌面环境，包含菜单栏、桌面图标、Dock 栏和应用窗口。

Simulates a complete macOS desktop environment with menu bar, desktop icons, Dock, and application windows.

#### 菜单栏 (Menu Bar)

- 苹果菜单、应用程序菜单、文件菜单、编辑菜单、窗口菜单
- Apple menu, application menus, file menu, edit menu, window menu

#### Dock 栏 (Dock)

底部应用快捷栏，包含以下应用：
Bottom application dock with the following apps:

| 应用 / App | 图标 / Icon | 说明 / Description |
|-----------|-------------|-------------------|
| 终端 Terminal | 🖥️ | 命令行模拟器 / Command line simulator |
| 访达 Finder | 📁 | 文件浏览器 / File browser |
| 文本编辑器 TextEdit | 📝 | 简易文本编辑器 / Simple text editor |
| 计算器 Calculator | 🔢 | 基本计算器 / Basic calculator |
| 飞机大战 Airplane Game | ✈️ | 经典射击游戏 / Classic shooting game |

#### 应用详情 / App Details

**终端 (Terminal)**
- 支持基本命令：pwd, ls, cd, cat, echo, clear, help, date, whoami
- 滚动输出历史
- Support basic commands: pwd, ls, cd, cat, echo, clear, help, date, whoami
- Scrollable output history

**访达 (Finder)**
- 模拟文件系统，支持文件夹导航
- 静态文件数据展示
- Simulated file system with folder navigation
- Static file data display

**文本编辑器 (TextEdit)**
- 基本的文本输入和编辑功能
- 支持多行文本输入
- Basic text input and editing functionality
- Support for multi-line text input

**计算器 (Calculator)**
- 支持加减乘除运算
- 支持清空和退格
- Basic arithmetic operations
- Support for clear and backspace

**飞机大战 (Airplane Game)**
- Three.js 渲染的 3D 射击游戏
- 键盘控制：方向键移动，空格键发射
- Three.js rendered 3D shooting game
- Keyboard controls: Arrow keys to move, Space to fire

### 3D 赛车游戏 — `/#/racing-game`

使用 Three.js 渲染的 3D 赛车游戏页面。

3D racing game page rendered with Three.js.

**功能特点 / Features:**
- 3D 赛道环境渲染
- 赛车控制（键盘操作）
- 实时帧率显示
- 3D track environment rendering
- Race car controls (keyboard operation)
- Real-time frame rate display

---

## 技术栈 / Tech Stack

| 技术 / Technology | 版本 / Version | 说明 / Description |
|------------------|----------------|-------------------|
| [Svelte](https://svelte.dev/) | ^4.2.19 | 前端框架 / Frontend framework |
| [Vite](https://vitejs.dev/) | ^5.4.11 | 构建工具 / Build tool |
| [Three.js](https://threejs.org/) | ^0.170.0 | 3D 渲染库 / 3D rendering library |
| [Vitest](https://vitest.dev/) | ^2.1.8 | 单元测试框架 / Unit testing framework |
| [@testing-library/svelte](https://testing-library.com/docs/svelte-testing-library/intro/) | ^5.4.2 | Svelte 组件测试 / Svelte component testing |
| [svelte-check](https://github.com/sveltejs/language-tools/tree/master/packages/svelte-check) | ^4.7.1 | 类型检查工具 / Type checking tool |

---

## 项目结构 / Project Structure

```
hello-world-collection/
├── src/
│   ├── App.svelte              # 应用入口和路由 / App entry and routing
│   ├── main.js                 # 应用入口文件 / Application entry file
│   ├── app.css                 # 全局样式 / Global styles
│   ├── routes/
│   │   ├── Home.svelte         # 首页导航 / Home page navigation
│   │   ├── HelloWorld.svelte   # Hello World 页面 / Hello World page
│   │   ├── MacOS.svelte        # macOS 模拟器页面 / macOS simulator page
│   │   └── RacingGame.svelte   # 赛车游戏页面 / Racing game page
│   └── lib/
│       ├── components/         # 通用组件 / Common components
│       ├── data/               # 静态数据 / Static data
│       ├── macos/              # macOS 模拟器模块 / macOS simulator modules
│       ├── stores/             # Svelte 状态管理 / Svelte stores
│       └── utils/              # 工具函数 / Utility functions
├── tests/                      # 测试文件 / Test files
├── index.html                  # HTML 入口 / HTML entry
├── package.json
├── vite.config.js              # Vite 配置 / Vite configuration
├── svelte.config.js            # Svelte 配置 / Svelte configuration
└── jsconfig.json               # JavaScript 配置 / JavaScript configuration
```

---

## src/lib 目录详解 / src/lib Directory Details

### components/ — 通用组件

通用 UI 组件库，供各个页面复用。

Common UI component library reused across pages.

| 文件 / File | 说明 / Description |
|------------|-------------------|
| `BackNav.svelte` | 返回导航组件 / Back navigation component |
| `CodeCard.svelte` | 代码展示卡片组件（含语法高亮）/ Code display card component with syntax highlighting |
| `Footer.svelte` | 页脚组件 / Footer component |
| `Layout.svelte` | 布局组件 / Layout component |
| `PageHeader.svelte` | 页面标题组件 / Page header component |
| `RacingGameScene.svelte` | 3D 赛车游戏场景组件 / 3D racing game scene component |

### data/ — 静态数据

项目使用的静态数据文件。

Static data files used in the project.

| 文件 / File | 说明 / Description |
|------------|-------------------|
| `languages.js` | 21 种编程语言的 Hello World 代码数据 / Hello World code data for 21 programming languages |
| `finderData.js` | 访达应用的文件系统模拟数据 / File system mock data for Finder app |

### macos/ — macOS 模拟器核心模块

macOS 桌面模拟器的核心组件和状态管理。

Core components and state management for macOS desktop simulator.

| 文件 / File | 说明 / Description |
|------------|-------------------|
| `Desktop.svelte` | 桌面背景组件 / Desktop background component |
| `Dock.svelte` | 底部 Dock 栏组件 / Bottom Dock bar component |
| `MenuBar.svelte` | 顶部菜单栏组件 / Top menu bar component |
| `Window.svelte` | 窗口组件（可拖动、调整大小、最小化、关闭）/ Window component (draggable, resizable, minimizable, closable) |
| `WindowManager.svelte` | 窗口管理器组件 / Window manager component |
| `appRegistry.js` | 应用注册表（定义应用元数据）/ App registry (defines app metadata) |
| `apps/` | 各应用的实现组件 / Implementation components for each app |
| `apps/Terminal.svelte` | 终端应用 / Terminal app |
| `apps/Finder.svelte` | 访达应用 / Finder app |
| `apps/TextEditor.svelte` | 文本编辑器应用 / Text editor app |
| `apps/Calculator.svelte` | 计算器应用 / Calculator app |
| `apps/AirplaneGame.svelte` | 飞机大战游戏应用 / Airplane battle game app |

### stores/ — Svelte 状态管理

Svelte stores 用于管理全局状态。

Svelte stores for managing global state.

| 文件 / File | 说明 / Description |
|------------|-------------------|
| `windows.js` | 窗口状态管理（窗口列表、焦点、层级）/ Window state management (window list, focus, z-index) |
| `menuActions.js` | 菜单操作状态管理 / Menu actions state management |

### utils/ — 工具函数

通用工具函数库。

Common utility functions library.

| 文件 / File | 说明 / Description |
|------------|-------------------|
| `highlight.js` | 代码语法高亮工具 / Code syntax highlighting utility |
| `noise.js` | 噪声函数（用于游戏纹理）/ Noise functions (for game textures) |
| `airplaneGame.js` | 飞机大战游戏逻辑 / Airplane game logic |
| `racingGame.js` | 赛车游戏核心逻辑 / Racing game core logic |

---

## 组件开发指南 / Component Development Guide

### 创建新组件

1. 在 `src/lib/components/` 目录下创建新的 `.svelte` 文件
2. 按照 Svelte 组件规范编写组件代码

**示例 / Example:**

```svelte
<!-- src/lib/components/MyComponent.svelte -->
<script>
  export let title = 'Default Title';
</script>

<div class="my-component">
  <h2>{title}</h2>
  <slot />
</div>

<style>
  .my-component {
    padding: 1rem;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
</style>
```

### 添加新应用到 macOS 模拟器

1. 在 `src/lib/macos/apps/` 目录下创建新的应用组件
2. 在 `src/lib/macos/appRegistry.js` 中注册应用

**步骤 1：创建应用组件 / Step 1: Create App Component**

```svelte
<!-- src/lib/macos/apps/MyApp.svelte -->
<script>
  export let windowId;
</script>

<div class="my-app">
  <h1>My App</h1>
  <p>Application content here</p>
</div>

<style>
  .my-app {
    padding: 1rem;
  }
</style>
```

**步骤 2：注册应用 / Step 2: Register App**

编辑 `src/lib/macos/appRegistry.js`:

```javascript
import MyApp from './apps/MyApp.svelte';

export const appRegistry = {
  // ... existing apps
  myApp: {
    id: 'myApp',
    name: 'My App',
    icon: '🖼️',
    component: MyApp,
    defaultSize: { width: 400, height: 300 }
  }
};
```

### 添加新页面路由

1. 在 `src/routes/` 目录下创建新的 `.svelte` 文件作为页面组件
2. 修改 `src/App.svelte` 添加新的路由

---

## 状态管理说明 / State Management

项目使用 Svelte 内置的 stores 进行状态管理。

The project uses Svelte built-in stores for state management.

### windows.js — 窗口状态管理

```javascript
// 可写 stores 用于窗口列表和焦点管理
// Writable stores for window list and focus management
import { writable, derived } from 'svelte/store';

// 窗口列表
export const windowList = writable([]);

// 当前焦点窗口
export const focusedWindowId = writable(null);

// 计算属性：获取最高 z-index
export const topZIndex = derived(windowList, ($windowList) => {
  return Math.max(0, ...$windowList.map(w => w.zIndex || 0));
});
```

### menuActions.js — 菜单操作

管理 macOS 菜单栏的操作状态和回调函数。

Manages macOS menu bar operation states and callbacks.

---

## 常见问题解答 / FAQ

### Q: 如何启动开发服务器？

**A:** 运行 `npm run dev`，访问 http://localhost:5173

### Q: How to start the development server?

**A:** Run `npm run dev`, visit http://localhost:5173

---

### Q: 如何运行测试？

**A:** 运行 `npm test` 运行所有测试，或使用 `npm test -- --watch` 开启监视模式

### Q: How to run tests?

**A:** Run `npm test` to run all tests, or use `npm test -- --watch` for watch mode

---

### Q: 如何构建生产版本？

**A:** 运行 `npm run build`，构建产物会输出到 `dist/` 目录

### Q: How to build for production?

**A:** Run `npm run build`, the build output will be in the `dist/` directory

---

### Q: 如何添加新的编程语言到 Hello World 页面？

**A:** 编辑 `src/lib/data/languages.js`，按照现有格式添加新的语言数据：

```javascript
{ lang: '新语言', code: '代码内容' }
```

### Q: How to add a new programming language to the Hello World page?

**A:** Edit `src/lib/data/languages.js`, add new language data following the existing format:

```javascript
{ lang: 'NewLanguage', code: 'code content' }
```

---

### Q: 如何自定义 macOS 桌面壁纸？

**A:** 编辑 `src/lib/macos/Desktop.svelte`，修改背景样式或图片路径

### Q: How to customize the macOS desktop wallpaper?

**A:** Edit `src/lib/macos/Desktop.svelte`, modify the background style or image path

---

### Q: 飞机大战游戏如何操作？

**A:** 使用方向键移动飞机，空格键发射子弹

### Q: How to control the airplane battle game?

**A:** Use arrow keys to move the plane, spacebar to fire bullets

---

### Q: 赛车游戏如何操作？

**A:** 使用键盘控制赛车的方向和速度

### Q: How to control the racing game?

**A:** Use keyboard to control the car's direction and speed

---

## 许可证 / License

本项目仅供学习和参考使用。

This project is for learning and reference purposes only.

---

## 贡献 / Contributing

欢迎提交 Issue 和 Pull Request。

Contributions, issues and feature requests are welcome!

---

> 文档更新时间 / Last Updated: 2026-07-08
