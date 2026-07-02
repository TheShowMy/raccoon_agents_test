# 多语言 Hello World & macOS 模拟器

基于 Svelte + Vite 的组件化静态网站，包含多语言 Hello World 代码展示、macOS 桌面模拟器和 3D 赛车游戏。

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview

# 运行测试（Vitest）
npm test

# 类型检查（svelte-check）
npm run check
```

## 页面

- **首页** (`#/`) — 子页面入口导航
- **Hello World** (`#/hello-world`) — 20+ 种编程语言的经典问候，支持搜索过滤
- **macOS** (`#/macos`) — 模拟 macOS 桌面环境，包含终端、访达、文本编辑器、计算器、飞机大战游戏
- **赛车游戏** (`#/racing-game`) — 3D 赛车游戏页面，使用 Three.js 渲染

## 技术栈

- [Svelte](https://svelte.dev/) — 前端框架
- [Vite](https://vitejs.dev/) — 构建工具
- [Three.js](https://threejs.org/) — 3D 渲染（赛车游戏、飞机大战游戏）
- [Vitest](https://vitest.dev/) — 单元测试框架
- [@testing-library/svelte](https://testing-library.com/docs/svelte-testing-library/intro/) — Svelte 组件测试
- [jsdom](https://github.com/jsdom/jsdom) — DOM 模拟环境
- [svelte-check](https://github.com/sveltejs/language-tools/tree/master/packages/svelte-check) — 类型检查工具

## 项目结构

```
├── src/
│   ├── App.svelte          # 路由入口
│   ├── routes/
│   │   ├── Home.svelte     # 首页导航
│   │   ├── HelloWorld.svelte
│   │   ├── MacOS.svelte
│   │   └── RacingGame.svelte
│   └── ...
├── tests/                  # 测试文件
├── package.json
└── vite.config.js
```
