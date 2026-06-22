/**
 * macOS Web Simulator — Dock 系统
 * ============================================================
 * 集中管理 Dock 的所有交互：
 * - 图标渲染与注册
 * - 悬停放大动效（Sonoma/Sequoia 风格）
 * - 图标点击打开/聚焦/恢复对应应用窗口
 * - 运行指示器（运行中小白点）
 * - 图标倒影效果
 *
 * 挂载于 window.__macOS.dock
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) {
    console.error("macOS core not initialized, dock system aborted");
    return;
  }

  const { STATE, DOM, util } = macOS;

  /* ==========================================================
   *  应用图标 SVG
   * ========================================================== */

  function getAppIconSvg(type, size) {
    size = size || 44;
    const icons = {
      finder: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><rect x="4" y="4" width="36" height="36" rx="10" fill="#1fa2fc"/><rect x="10" y="12" width="24" height="8" rx="2" fill="#fff" opacity="0.9"/><rect x="10" y="24" width="16" height="8" rx="2" fill="#fff" opacity="0.6"/></svg>`,
      safari: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><circle cx="22" cy="22" r="18" fill="#1fa2fc"/><circle cx="22" cy="22" r="10" fill="#fff"/><line x1="22" y1="4" x2="22" y2="14" stroke="#f44" stroke-width="2"/><line x1="34" y1="12" x2="28" y2="18" stroke="#fa0" stroke-width="2"/></svg>`,
      terminal: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><rect x="4" y="4" width="36" height="36" rx="10" fill="#2d2d30"/><text x="12" y="28" font-size="18" fill="#4ec94e" font-family="monospace">&gt;_</text></svg>`,
      settings: `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><rect x="4" y="4" width="36" height="36" rx="10" fill="#8e8e93"/><circle cx="22" cy="22" r="8" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="22" cy="22" r="3" fill="#fff"/></svg>`,
    };
    return icons[type] || icons.finder;
  }

  /* ==========================================================
   *  Dock 内部状态
   * ========================================================== */

  /** 已注册的应用 { appId: { name, icon, order } } */
  const _apps = [];

  /** 运行中的应用 ID 集合 */
  const _running = new Set();

  /** Dock 中 Finder 之后是否有分隔线 */
  let _hasSeparator = true;

  /* ==========================================================
   *  渲染 Dock 图标
   * ========================================================== */

  function render() {
    if (!DOM.dockInner) return;

    let html = "";
    let finderDone = false;

    _apps.forEach((app) => {
      // Finder 之后插入分隔线
      if (!finderDone && app.id !== "finder" && _hasSeparator) {
        html += `<div class="dock-separator"></div>`;
        finderDone = true;
      }
      if (app.id === "finder") {
        finderDone = true;
      }

      const runningClass = _running.has(app.id) ? " running" : "";
      html += `
        <div class="dock-icon${runningClass}" data-app-id="${app.id}" title="${app.name}">
          ${getAppIconSvg(app.icon)}
        </div>`;
    });

    DOM.dockInner.innerHTML = html;
  }

  /* ==========================================================
   *  悬停放大动效
   * ========================================================== */

  function bindHoverEffect() {
    if (!DOM.dock || !DOM.dockInner) return;

    const baseSize = 52;
    const maxScale = 1.8;
    const maxDistance = 90;
    let rafId = null;

    function onMouseMove(e) {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const dockRect = DOM.dockInner.getBoundingClientRect();
        const mouseX = e.clientX;
        const icons = DOM.dockInner.querySelectorAll(".dock-icon");

        icons.forEach((icon) => {
          const rect = icon.getBoundingClientRect();
          const iconCenterX = rect.left + rect.width / 2;
          const distance = Math.abs(mouseX - iconCenterX);

          let scale = 1;
          if (distance < maxDistance) {
            scale = 1 + (maxScale - 1) * Math.pow(1 - distance / maxDistance, 2);
            scale = util.clamp(scale, 1, maxScale);
          }
          icon.style.transform = `scale(${scale.toFixed(3)})`;
        });
      });
    }

    function onMouseLeave() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      const icons = DOM.dockInner.querySelectorAll(".dock-icon");
      icons.forEach((icon) => {
        icon.style.transform = "scale(1)";
      });
    }

    // 移除旧事件后重新绑定
    DOM.dock.removeEventListener("mousemove", onMouseMove);
    DOM.dock.removeEventListener("mouseleave", onMouseLeave);
    DOM.dock.addEventListener("mousemove", onMouseMove, { passive: true });
    DOM.dock.addEventListener("mouseleave", onMouseLeave);
  }

  /* ==========================================================
   *  图标点击处理
   * ========================================================== */

  function bindClickHandler() {
    if (!DOM.dockInner) return;

    // 使用捕获阶段确保在 per-app handler（如 finder.js 绑定的图标级事件）之前处理
    DOM.dockInner.addEventListener("click", (e) => {
      const icon = e.target.closest(".dock-icon");
      if (!icon) return;

      const appId = icon.dataset.appId;
      if (!appId) return;

      // 阻止后续 per-app handler 重复触发
      e.stopPropagation();
      e.stopImmediatePropagation();

      handleIconClick(appId);
    }, true);
  }

  /**
   * 处理 Dock 图标点击：打开应用、聚焦窗口、或恢复最小化窗口
   */
  function handleIconClick(appId) {
    const wm = macOS.windowManager;
    if (!wm) return;

    // 查找该应用已有窗口
    const existingWindow = wm.getByAppId(appId);

    if (existingWindow) {
      // 查看是否最小化
      if (existingWindow.minimized) {
        existingWindow._restoreMinimized();
        wm.focus(existingWindow);
      } else if (existingWindow.focused) {
        // 已聚焦 → 最小化（macOS 默认行为）
        existingWindow.minimize();
      } else {
        // 已打开但未聚焦 → 聚焦
        wm.focus(existingWindow);
      }
      return;
    }

    // 没有窗口 → 调用应用注册的 open 方法
    const app = STATE.apps[appId];
    if (app && typeof app.open === "function") {
      app.open();
      setRunning(appId, true);
    }
  }

  /* ==========================================================
   *  公开 API
   * ========================================================== */

  /**
   * 注册应用到 Dock（按 order 排序）
   * @param {string} appId
   * @param {{ name: string, icon: string, order?: number }} config
   */
  function registerApp(appId, config) {
    // 避免重复注册
    if (_apps.find((a) => a.id === appId)) return;

    _apps.push({
      id: appId,
      name: config.name || appId,
      icon: config.icon || "finder",
      order: config.order != null ? config.order : 99,
    });

    // 按 order 排序
    _apps.sort((a, b) => a.order - b.order);

    render();
    bindHoverEffect();
  }

  /**
   * 设置应用运行状态
   * @param {string} appId
   * @param {boolean} running
   */
  function setRunning(appId, running) {
    if (running) {
      _running.add(appId);
    } else {
      _running.delete(appId);
    }

    // 更新 DOM 中的 running class
    if (DOM.dockInner) {
      const icon = DOM.dockInner.querySelector(`.dock-icon[data-app-id="${appId}"]`);
      if (icon) {
        if (running) {
          icon.classList.add("running");
        } else {
          // 仅当该应用没有其他窗口时移除 running
          const wm = macOS.windowManager;
          const anyWindow = wm && wm.getAll().some((w) => w.appId === appId);
          if (!anyWindow && appId !== "finder") {
            icon.classList.remove("running");
          }
        }
      }
    }
  }

  /**
   * 刷新所有运行指示器状态
   */
  function refreshRunning() {
    const wm = macOS.windowManager;
    if (!wm) return;

    _running.clear();
    const windows = wm.getAll();
    windows.forEach((w) => {
      if (w.appId && !w.minimized) {
        _running.add(w.appId);
      }
    });

    // Finder 永远显示为运行中
    _running.add("finder");

    if (DOM.dockInner) {
      DOM.dockInner.querySelectorAll(".dock-icon").forEach((icon) => {
        const appId = icon.dataset.appId;
        if (appId && _running.has(appId)) {
          icon.classList.add("running");
        } else if (appId !== "finder") {
          icon.classList.remove("running");
        }
      });
    }
  }

  /** 获取已注册应用列表（只读） */
  function getApps() {
    return [..._apps];
  }

  /* ==========================================================
   *  初始化
   * ========================================================== */

  function init() {
    if (!DOM.dock || !DOM.dockInner) {
      console.warn("Dock DOM not found, retrying...");
      return;
    }

    bindClickHandler();
    bindHoverEffect();

    console.log("Dock system initialized");
  }

  /* ==========================================================
   *  挂载到全局命名空间
   * ========================================================== */

  macOS.dock = {
    registerApp,
    setRunning,
    refreshRunning,
    getApps,
    render,
    init,
    handleIconClick,
    getIconSvg: getAppIconSvg,
  };

  // DOM ready 后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
