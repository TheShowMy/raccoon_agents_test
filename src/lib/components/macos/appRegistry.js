/**
 * macOS application registry.
 * Each app has an id, display name, icon SVG, menus, and either:
 * - a `component` field (Svelte component constructor) for real apps
 * - a `placeholder` function (returns HTML string) for not-yet-implemented apps
 */

import Terminal from './apps/Terminal.svelte';
import Finder from './apps/Finder.svelte';
import TextEditor from './apps/TextEditor.svelte';
import Calculator from './apps/Calculator.svelte';
import AirplaneGame from './apps/AirplaneGame.svelte';

function placeholderContent(appName) {
  return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.45);font-size:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;user-select:none;">${appName} — 占位组件</div>`;
}

export const APP_REGISTRY = {
  terminal: {
    id: 'terminal',
    name: '终端',
    icon: `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="44" height="44" rx="11" fill="#2a2a2a"/>
      <text x="25" y="33" text-anchor="middle" fill="#0f0" font-size="22" font-family="monospace" font-weight="bold">&gt;_</text>
    </svg>`,
    menus: [
      { title: '终端', items: ['关于终端', '---', '偏好设置…', '---', '服务', '隐藏终端', '退出终端'] },
      { title: '文件', items: ['新建窗口', '新建标签页', '---', '打开…', '关闭窗口', '关闭'] },
      { title: '编辑', items: ['撤销', '重做', '---', '剪切', '拷贝', '粘贴', '---', '全选', '查找'] },
      { title: '显示', items: ['显示标签页栏', '显示所有窗口', '---', '放大', '缩小', '实际大小'] },
      { title: '窗口', items: ['最小化', '缩放', '---', '全部前置'] },
      { title: '帮助', items: ['终端帮助'] },
    ],
    component: Terminal,
  },
  finder: {
    id: 'finder',
    name: '访达',
    icon: `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="44" height="44" rx="11" fill="#4a9eff"/>
      <path d="M13,17 C13,15.5 14,14.5 15.4,14.5 L22,14.5 L24.5,17 L33,17 C34.4,17 35.4,18 35.4,19.5 L35.4,33 C35.4,34.5 34.4,35.5 33,35.5 L15.4,35.5 C14,35.5 13,34.5 13,33 Z" fill="rgba(255,255,255,0.15)"/>
    </svg>`,
    menus: [
      { title: '文件', items: ['新 Finder 窗口', '新建文件夹', '---', '打开', '关闭窗口'] },
      { title: '编辑', items: ['撤销', '剪切', '拷贝', '粘贴', '全选'] },
      { title: '显示', items: ['为列表', '为图标', '为分栏', '为封面流', '---', '显示路径栏'] },
      { title: '前往', items: ['前往文件夹…', '---', '个人收藏', '最近使用', '---', '连接到服务器…'] },
      { title: '窗口', items: ['最小化', '缩放', '---', '全部合并', '全部前置'] },
      { title: '帮助', items: ['访达帮助', 'macOS 帮助'] },
    ],
    component: Finder,
  },
  'text-editor': {
    id: 'text-editor',
    name: '文本编辑器',
    icon: `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="5" width="34" height="40" rx="8" fill="#0077ed"/>
      <rect x="14" y="18" width="16" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
      <rect x="14" y="23" width="22" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
      <rect x="14" y="28" width="12" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
      <rect x="14" y="33" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
    </svg>`,
    menus: [
      { title: '文本编辑器', items: ['关于文本编辑器', '---', '偏好设置…', '---', '隐藏文本编辑器', '退出'] },
      { title: '文件', items: ['新建', '打开…', '---', '存储', '存储为…', '---', '关闭'] },
      { title: '编辑', items: ['撤销', '重做', '---', '剪切', '拷贝', '粘贴', '---', '全选'] },
      { title: '格式', items: ['显示字体', '显示颜色', '---', '制表符', '自动换行'] },
      { title: '窗口', items: ['最小化', '缩放', '---', '全部前置'] },
      { title: '帮助', items: ['文本编辑器帮助'] },
    ],
    component: TextEditor,
  },
  calculator: {
    id: 'calculator',
    name: '计算器',
    icon: `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="44" height="44" rx="11" fill="#2d2d2d"/>
      <rect x="11" y="11" width="12" height="12" rx="3" fill="#ff9500"/>
      <rect x="27" y="11" width="12" height="12" rx="3" fill="#555"/>
      <rect x="11" y="27" width="12" height="12" rx="3" fill="#555"/>
      <rect x="27" y="27" width="12" height="12" rx="3" fill="#555"/>
    </svg>`,
    menus: [
      { title: '计算器', items: ['关于计算器', '---', '偏好设置…', '---', '隐藏', '退出计算器'] },
      { title: '文件', items: ['新建', '打开…', '保存'] },
      { title: '编辑', items: ['撤销', '剪切', '拷贝', '粘贴'] },
      { title: '显示', items: ['基本', '科学', '程序员', '统计', '---', '十进制', '十六进制'] },
      { title: '窗口', items: ['最小化', '缩放', '---', '全部前置'] },
      { title: '帮助', items: ['计算器帮助'] },
    ],
    component: Calculator,
  },
  airplane: {
    id: 'airplane',
    name: '飞机大战',
    icon: `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="44" height="44" rx="11" fill="#16213e"/>
      <polygon points="25,11 31,36 25,30 19,36" fill="#e94560"/>
      <circle cx="25" cy="25" r="3" fill="#ff6b6b"/>
    </svg>`,
    menus: [
      { title: '飞机大战', items: ['关于飞机大战', '排行榜', '---', '偏好设置…', '---', '退出'] },
      { title: '游戏', items: ['开始新游戏', '暂停', '重新开始', '---', '结束游戏'] },
      { title: '编辑', items: ['撤销', '剪切', '拷贝', '粘贴'] },
      { title: '窗口', items: ['最小化', '缩放', '---', '全部前置'] },
      { title: '帮助', items: ['操作说明', '关于'] },
    ],
    component: AirplaneGame,
  },
};

/** Ordered list of app ids for Dock display */
export const DOCK_APPS = ['terminal', 'finder', 'text-editor', 'calculator', 'airplane'];
