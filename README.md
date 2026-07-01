# 多语言 Hello World & macOS 模拟器 & 3D 赛车游戏

基于 Svelte + Vite 的组件化静态网站，包含多语言 Hello World 代码展示和 macOS 桌面模拟器。

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
```

## 页面

- **首页** (`#/`) — 子页面入口导航
- **Hello World** (`#/hello-world`) — 20+ 种编程语言的经典问候，支持搜索过滤
- **macOS** (`#/macos`) — 模拟 macOS 桌面环境，包含终端、访达、文本编辑器、计算器、飞机大战游戏
- **RacingGame** (`#/racing-game`) — 3D 赛车游戏，3D 赛道场景，支持键盘控制驾驶越野车，在无限盘山公路上躲避障碍物，包含计分系统

## 技术栈

- [Svelte](https://svelte.dev/) — 前端框架
- [Vite](https://vitejs.dev/) — 构建工具
- [Three.js](https://threejs.org/) — 3D 渲染（飞机大战游戏、3D 赛车游戏）
