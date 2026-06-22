/**
 * macOS Web Simulator — 主入口
 * ============================================================
 * 职责：全局状态、初始化顺序、模块挂载点、基础交互（桌面右键、
 * 菜单栏时间、Dock 悬停缩放），不包含具体应用逻辑。
 *
 * 全局命名空间：window.__macOS
 */

;(function () {
  "use strict";

  /* ==========================================================
   *  全局状态与常量
   * ========================================================== */

  const STATE = {
    /** 当前聚焦窗口 ID，null 表示无窗口 */
    focusedWindowId: null,
    /** 已打开窗口列表，按 z-index 排序 */
    windows: [],
    /** 应用注册表 { id: { name, icon, ... } } */
    apps: {},
    /** 窗口 z-index 计数器，每次新建窗口递增 */
    zIndexCounter: 200,
    /** 菜单栏显示的当前应用名 */
    activeAppName: "Finder",
    /** 是否已初始化 */
    ready: false,
  };

  /** DOM 引用缓存 */
  const DOM = {
    desktop: null,
    menubar: null,
    menubarTime: null,
    menubarAppName: null,
    menubarMenus: null,
    appleMenuBtn: null,
    windowLayer: null,
    dock: null,
    dockInner: null,
    contextMenu: null,
  };

  /* ==========================================================
   *  工具函数
   * ========================================================== */

  /** 生成唯一 ID */
  function uid(prefix = "el") {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  /** 节流 */
  function throttle(fn, delay = 16) {
    let last = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn.apply(this, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, delay - (now - last));
      }
    };
  }

  /** 确保数值在区间内 */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /* ==========================================================
   *  桌面壁纸
   * ========================================================== */

  function initDesktop() {
    DOM.desktop = document.getElementById("desktop");
    if (!DOM.desktop) return;

    // Sonoma/Sequoia 风格渐变色壁纸（默认）
    DOM.desktop.style.background =
      "linear-gradient(160deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #1a1a2e 100%)";

    // 右键菜单占位 —— 后续由 context menu 模块接管
    DOM.desktop.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      hideContextMenu();
    });
  }

  /* ==========================================================
   *  菜单栏
   * ========================================================== */

  /** 更新菜单栏时间 */
  function updateClock() {
    if (!DOM.menubarTime) return;
    const now = new Date();
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const date = now.getDate();
    const weekday = weekdays[now.getDay()];
    const month = months[now.getMonth()];
    DOM.menubarTime.textContent = `${weekday} ${month}${date}日  ${hh}:${mm}`;
  }

  /** 构建 Finder 默认菜单 */
  function buildFinderMenus() {
    if (!DOM.menubarMenus) return;
    const menus = ["文件", "编辑", "显示", "前往", "窗口", "帮助"];
    DOM.menubarMenus.innerHTML = menus
      .map((name) => `<span class="menubar-menu-item" data-menu="${name}">${name}</span>`)
      .join("");
  }

  function initMenubar() {
    DOM.menubar = document.getElementById("menubar");
    DOM.menubarTime = document.getElementById("menubar-time");
    DOM.menubarAppName = document.getElementById("menubar-app-name");
    DOM.menubarMenus = document.getElementById("menubar-menus");
    DOM.appleMenuBtn = document.getElementById("apple-menu-btn");

    buildFinderMenus();
    updateClock();
    setInterval(updateClock, 10_000);

    // Apple 菜单点击
    DOM.appleMenuBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      showAppleMenu(e);
    });

    // 点击空白关闭菜单
    document.addEventListener("click", hideContextMenu);
  }

  /* ==========================================================
   *  Apple 菜单
   * ========================================================== */

  function showAppleMenu(e) {
    const menu = document.getElementById("context-menu");
    if (!menu) return;
    menu.innerHTML = `
      <div class="context-menu-item">关于本机</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item">系统设置...</div>
      <div class="context-menu-item">App Store...</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item">强制退出...</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item">睡眠</div>
      <div class="context-menu-item">重新启动...</div>
      <div class="context-menu-item">关机...</div>
    `;
    menu.classList.remove("hidden");
    positionMenu(menu, e.currentTarget);
  }

  function hideContextMenu() {
    const menu = document.getElementById("context-menu");
    if (menu) {
      menu.classList.add("hidden");
      menu.innerHTML = "";
    }
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.top = rect.bottom + 4 + "px";
    menu.style.left = rect.left + "px";
  }

  /* ==========================================================
   *  Dock
   * ========================================================== */

  /** 内置 Dock 应用列表（不含 Finder 分隔线等，后续任务细化） */
  const DOCK_APPS = [
    { id: "finder", name: "Finder", icon: "finder" },
    { id: "safari", name: "Safari", icon: "safari" },
    { id: "terminal", name: "Terminal", icon: "terminal" },
    { id: "settings", name: "系统设置", icon: "settings" },
  ];

  function initDock() {
    DOM.dock = document.getElementById("dock");
    DOM.dockInner = document.getElementById("dock-inner");
    if (!DOM.dock || !DOM.dockInner) return;

    renderDockIcons();
    bindDockHover();
  }

  function renderDockIcons() {
    DOM.dockInner.innerHTML = DOCK_APPS.map((app) => {
      const iconSvg = getAppIconSvg(app.icon);
      return `
        <div class="dock-icon" data-app-id="${app.id}" title="${app.name}">
          ${iconSvg}
        </div>`;
    }).join("");
  }

  /** 返回应用图标 SVG 占位（后续任务替换为真实图标） */
  function getAppIconSvg(type) {
    const size = 44;
    const icons = {
      finder: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><rect x="4" y="4" width="36" height="36" rx="10" fill="#1fa2fc"/><rect x="10" y="12" width="24" height="8" rx="2" fill="#fff" opacity="0.9"/><rect x="10" y="24" width="16" height="8" rx="2" fill="#fff" opacity="0.6"/></svg>`,
      safari: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><circle cx="22" cy="22" r="18" fill="#1fa2fc"/><circle cx="22" cy="22" r="10" fill="#fff"/><line x1="22" y1="4" x2="22" y2="14" stroke="#f44" stroke-width="2"/><line x1="34" y1="12" x2="28" y2="18" stroke="#fa0" stroke-width="2"/></svg>`,
      terminal: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><rect x="4" y="4" width="36" height="36" rx="10" fill="#2d2d30"/><text x="12" y="28" font-size="18" fill="#4ec94e" font-family="monospace">&gt;_</text></svg>`,
      settings: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><rect x="4" y="4" width="36" height="36" rx="10" fill="#8e8e93"/><circle cx="22" cy="22" r="8" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="22" cy="22" r="3" fill="#fff"/></svg>`,
    };
    return icons[type] || icons.finder;
  }

  /** Dock 悬停放大动效 */
  function bindDockHover() {
    const icons = DOM.dockInner.querySelectorAll(".dock-icon");
    const baseSize = 52;  // CSS 中 --dock-icon-size
    const maxScale = 1.8;

    function onMouseMove(e) {
      const dockRect = DOM.dockInner.getBoundingClientRect();
      const mouseX = e.clientX;

      icons.forEach((icon) => {
        const rect = icon.getBoundingClientRect();
        const iconCenterX = rect.left + rect.width / 2;
        const distance = Math.abs(mouseX - iconCenterX);
        const maxDistance = 80; // 影响半径 px

        let scale = 1;
        if (distance < maxDistance) {
          // 距离越近放大越多
          scale = 1 + (maxScale - 1) * (1 - distance / maxDistance);
          scale = clamp(scale, 1, maxScale);
        }
        icon.style.transform = `scale(${scale})`;
      });
    }

    function onMouseLeave() {
      icons.forEach((icon) => {
        icon.style.transform = "scale(1)";
      });
    }

    DOM.dock.addEventListener("mousemove", throttle(onMouseMove, 16));
    DOM.dock.addEventListener("mouseleave", onMouseLeave);
  }

  /* ==========================================================
   *  窗口管理器 基础挂载
   * ========================================================== */

  function initWindowLayer() {
    DOM.windowLayer = document.getElementById("window-layer");
    DOM.contextMenu = document.getElementById("context-menu");
  }

  /**
   * 设置当前聚焦窗口
   * @param {string|null} id
   */
  function focusWindow(id) {
    STATE.focusedWindowId = id;
    // 后续任务：更新窗口边框高亮、菜单栏应用名等
  }

  /**
   * 分配下一个窗口 z-index
   * @returns {number}
   */
  function nextZIndex() {
    return ++STATE.zIndexCounter;
  }

  /* ==========================================================
   *  暴露全局 API
   * ========================================================== */

  window.__macOS = {
    STATE,
    DOM,
    util: { uid, throttle, clamp },
    focusWindow,
    nextZIndex,
    hideContextMenu,
  };

  /* ==========================================================
   *  初始化入口
   * ========================================================== */

  function init() {
    if (STATE.ready) return;

    initDesktop();
    initMenubar();
    initDock();
    initWindowLayer();

    STATE.ready = true;

    console.log(
      "%c🍎 macOS Web Simulator %cready",
      "font-size:16px;",
      "font-size:13px;color:#888;"
    );
  }

  // DOMContentLoaded 后启动
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
