/**
 * macOS Web Simulator — 窗口系统
 * ============================================================
 * 职责：WindowManager 与 MacWindow 类，负责窗口生命周期管理、
 * 拖拽移动、关闭/最小化/最大化、聚焦高亮与 z-index 层级管理。
 *
 * 依赖：main.js 已初始化 window.__macOS 全局命名空间。
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) {
    console.error("[window.js] 缺少 window.__macOS，请确保 main.js 已加载");
    return;
  }

  const { STATE, DOM, util } = macOS;

  /* ==========================================================
   *  MacWindow — 单个窗口实例
   * ========================================================== */

  class MacWindow {
    /**
     * @param {Object} options
     * @param {string}  [options.id]        窗口唯一 ID，不传则自动生成
     * @param {string}  [options.appId]     所属应用 ID
     * @param {string}  [options.title]     窗口标题
     * @param {number}  [options.x]         初始 left（px），默认居中
     * @param {number}  [options.y]         初始 top（px），默认居中
     * @param {number}  [options.width]     初始宽度，默认 800
     * @param {number}  [options.height]    初始高度，默认 500
     * @param {string}  [options.content]   内部 HTML
     * @param {boolean} [options.resizable] 是否可缩放（预留），默认 false
     */
    constructor(options = {}) {
      this.id = options.id || util.uid("win");
      this.appId = options.appId || "unknown";
      this.title = options.title || "Untitled";
      this.width = options.width || 800;
      this.height = options.height || 500;
      this.content = options.content || "";
      this.resizable = options.resizable || false;
      this.minimized = false;
      this.maximized = false;

      // 居中定位
      const menubarH = 28;
      const dockArea = 80;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.x = options.x ?? Math.max(0, (vw - this.width) / 2);
      this.y = options.y ?? Math.max(menubarH, (vh - this.height) / 2 - 20);

      // z-index 由 WindowManager 分配
      this.zIndex = macOS.nextZIndex();

      // 最大化的前状态记录
      this._preMaximize = null;

      // 拖拽相关临时变量
      this._dragging = false;
      this._dragStartX = 0;
      this._dragStartY = 0;
      this._dragOrigLeft = 0;
      this._dragOrigTop = 0;

      // 绑定的拖拽处理器（用于注销）
      this._onDragMove = this._handleDragMove.bind(this);
      this._onDragEnd = this._handleDragEnd.bind(this);

      this._buildDOM();
      this._bindEvents();
      this._attach();
      this.focus();
    }

    /* ---------- DOM 构建 ---------- */

    _buildDOM() {
      this.el = document.createElement("div");
      this.el.className = "mac-window focused";
      this.el.setAttribute("data-window-id", this.id);
      this.el.setAttribute("role", "dialog");
      this.el.setAttribute("aria-label", this.title);

      this.el.innerHTML =
        '<div class="window-titlebar" data-draggable>' +
          '<div class="window-traffic-lights">' +
            '<button class="traffic-light close" title="关闭" aria-label="关闭窗口"></button>' +
            '<button class="traffic-light minimize" title="最小化" aria-label="最小化窗口"></button>' +
            '<button class="traffic-light maximize" title="全屏" aria-label="全屏"></button>' +
          "</div>" +
          '<div class="window-title">' + this._escape(this.title) + "</div>" +
        "</div>" +
        '<div class="window-content">' + this.content + "</div>";

      // 缓存常用子元素
      this._titlebar = this.el.querySelector(".window-titlebar");
      this._btnClose = this.el.querySelector(".traffic-light.close");
      this._btnMinimize = this.el.querySelector(".traffic-light.minimize");
      this._btnMaximize = this.el.querySelector(".traffic-light.maximize");
      this._titleEl = this.el.querySelector(".window-title");
      this._content = this.el.querySelector(".window-content");
    }

    _escape(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    /* ---------- DOM 挂载与移除 ---------- */

    _attach() {
      this._applyPosition();
      DOM.windowLayer.appendChild(this.el);
    }

    _applyPosition() {
      this.el.style.left = this.x + "px";
      this.el.style.top = this.y + "px";
      this.el.style.width = this.width + "px";
      this.el.style.height = this.height + "px";
      this.el.style.zIndex = this.zIndex;
    }

    /* ---------- 事件绑定 ---------- */

    _bindEvents() {
      // 点击窗口任意位置 → 聚焦
      this.el.addEventListener("mousedown", () => {
        if (!this.minimized) this.focus();
      });

      // 交通灯按钮
      this._btnClose.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
      });

      this._btnMinimize.addEventListener("click", (e) => {
        e.stopPropagation();
        this.minimize();
      });

      this._btnMaximize.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMaximize();
      });

      // 双击标题栏 → 最大化/还原
      this._titlebar.addEventListener("dblclick", (e) => {
        if (e.target.closest(".window-traffic-lights")) return;
        this.toggleMaximize();
      });

      // 拖拽：只响应标题栏 mousedown（交通灯区域除外）
      this._titlebar.addEventListener("mousedown", (e) => {
        if (e.target.closest(".window-traffic-lights")) return;
        if (this.maximized) return;
        this._startDrag(e);
      });
    }

    /* ---------- 拖拽逻辑 ---------- */

    _startDrag(e) {
      this._dragging = true;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this._dragOrigLeft = this.el.offsetLeft;
      this._dragOrigTop = this.el.offsetTop;
      this.el.style.transition = "none";

      document.addEventListener("mousemove", this._onDragMove);
      document.addEventListener("mouseup", this._onDragEnd);
      e.preventDefault();
    }

    _handleDragMove(e) {
      if (!this._dragging) return;
      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;
      this.el.style.left = (this._dragOrigLeft + dx) + "px";
      this.el.style.top = (this._dragOrigTop + dy) + "px";
    }

    _handleDragEnd() {
      if (!this._dragging) return;
      this._dragging = false;
      this.el.style.transition = "";
      // 记录新位置
      this.x = this.el.offsetLeft;
      this.y = this.el.offsetTop;

      document.removeEventListener("mousemove", this._onDragMove);
      document.removeEventListener("mouseup", this._onDragEnd);
    }

    /* ---------- 窗口操作 ---------- */

    /**
     * 聚焦窗口：取消上一窗口聚焦，提升当前窗口 z-index，
     * 添加 focused 类以显示高亮边框与阴影。
     */
    focus() {
      if (STATE.focusedWindowId === this.id) return;

      // 取消旧聚焦窗口
      const prev = WindowManager.getById(STATE.focusedWindowId);
      if (prev) prev._unfocus();

      STATE.focusedWindowId = this.id;
      this.zIndex = macOS.nextZIndex();
      this.el.style.zIndex = this.zIndex;
      this.el.classList.add("focused");

      // 若之前最小化则自动恢复
      if (this.minimized) {
        this._restoreFromMinimize();
      }
    }

    _unfocus() {
      this.el.classList.remove("focused");
    }

    /**
     * 关闭窗口：播放缩小淡出动画后移除 DOM，
     * 若为当前聚焦窗口则清除聚焦状态。
     */
    close() {
      if (this._closing) return;
      this._closing = true;

      this.el.classList.add("closing");
      this.el.style.pointerEvents = "none";

      setTimeout(() => {
        this._cleanup();
      }, 160);
    }

    _cleanup() {
      document.removeEventListener("mousemove", this._onDragMove);
      document.removeEventListener("mouseup", this._onDragEnd);
      this.el.remove();
      WindowManager._remove(this.id);
    }

    /**
     * 最小化窗口：缩小并移出视线，解除聚焦。
     */
    minimize() {
      if (this.minimized) return;
      this.minimized = true;
      this.el.classList.add("minimized");

      if (STATE.focusedWindowId === this.id) {
        STATE.focusedWindowId = null;
        // 尝试将焦点交给下一个顶层窗口
        const next = WindowManager._findTopVisible();
        if (next) next.focus();
      }
    }

    _restoreFromMinimize() {
      this.minimized = false;
      this.el.classList.remove("minimized");
    }

    /**
     * 从 Dock 恢复已最小化窗口。
     */
    restore() {
      if (!this.minimized) return;
      this._restoreFromMinimize();
      this.focus();
    }

    /**
     * 切换最大化/还原。
     */
    toggleMaximize() {
      if (this.maximized) {
        this._restoreSize();
      } else {
        this._maximize();
      }
    }

    _maximize() {
      this._preMaximize = {
        x: this.el.offsetLeft,
        y: this.el.offsetTop,
        width: this.el.offsetWidth,
        height: this.el.offsetHeight,
      };
      this.maximized = true;
      this.el.classList.add("maximized");
      // 清除内联位置让 CSS 用 !important 规则接管
      this.el.style.left = "";
      this.el.style.top = "";
      this.el.style.width = "";
      this.el.style.height = "";
    }

    _restoreSize() {
      if (!this._preMaximize) return;
      this.maximized = false;
      this.el.classList.remove("maximized");
      this.el.style.left = this._preMaximize.x + "px";
      this.el.style.top = this._preMaximize.y + "px";
      this.el.style.width = this._preMaximize.width + "px";
      this.el.style.height = this._preMaximize.height + "px";
      this.x = this._preMaximize.x;
      this.y = this._preMaximize.y;
      this.width = this._preMaximize.width;
      this.height = this._preMaximize.height;
      this._preMaximize = null;
    }

    /**
     * 更新窗口标题。
     */
    setTitle(title) {
      this.title = title;
      if (this._titleEl) {
        this._titleEl.textContent = title;
      }
    }

    /**
     * 更新窗口内容 HTML。
     */
    setContent(html) {
      this.content = html;
      if (this._content) {
        this._content.innerHTML = html;
      }
    }
  }

  /* ==========================================================
   *  WindowManager — 全局窗口管理器
   * ========================================================== */

  const WindowManager = {
    _windows: [],

    /**
     * 创建一个新窗口并自动打开。
     * @param {Object} options — 同 MacWindow 构造函数参数
     * @returns {MacWindow}
     */
    create(options) {
      const win = new MacWindow(options);
      this._windows.push(win);
      return win;
    },

    /**
     * 根据 ID 获取窗口实例。
     * @param {string} id
     * @returns {MacWindow|null}
     */
    getById(id) {
      return this._windows.find((w) => w.id === id) || null;
    },

    /**
     * 根据 appId 获取该应用的所有窗口。
     * @param {string} appId
     * @returns {MacWindow[]}
     */
    getByAppId(appId) {
      return this._windows.filter((w) => w.appId === appId);
    },

    /**
     * 内部：从管理列表移除窗口并清理聚焦状态。
     */
    _remove(id) {
      const idx = this._windows.findIndex((w) => w.id === id);
      if (idx === -1) return;

      this._windows.splice(idx, 1);

      if (STATE.focusedWindowId === id) {
        STATE.focusedWindowId = null;
        // 将焦点移交给剩余窗口中最顶层者
        const top = this._findTopVisible();
        if (top) top.focus();
      }
    },

    /**
     * 找到当前最顶层的可见窗口。
     */
    _findTopVisible() {
      const visible = this._windows.filter((w) => !w.minimized);
      if (!visible.length) return null;
      // 按 z-index 降序
      return visible.sort((a, b) => b.zIndex - a.zIndex)[0];
    },

    /**
     * 恢复已最小化窗口（常用于 Dock 点击）。
     */
    restore(id) {
      const win = this.getById(id);
      if (win) win.restore();
    },

    /**
     * 关闭应用的所有窗口。
     */
    closeByAppId(appId) {
      // 拷贝数组避免迭代时修改
      this.getByAppId(appId).forEach((w) => w.close());
    },

    /**
     * 获取所有窗口（不包含已关闭的）。
     */
    getAll() {
      return [...this._windows];
    },

    /**
     * 获取所有可见（非最小化）窗口。
     */
    getVisible() {
      return this._windows.filter((w) => !w.minimized);
    },
  };

  /* ==========================================================
   *  导出到全局命名空间
   * ========================================================== */

  macOS.WindowManager = WindowManager;
  macOS.MacWindow = MacWindow;

  /* ==========================================================
   *  调试：默认创建 demo 窗口验证系统可用（后续任务替换）
   * ========================================================== */

  function ready() {
    if (macOS.STATE.ready) {
      WindowManager.create({
        title: "欢迎使用 macOS Web Simulator",
        width: 600,
        height: 380,
        content:
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;' +
          'font-family:var(--font-display);text-align:center;padding:40px;">' +
            '<div>' +
              '<div style="font-size:48px;margin-bottom:16px;">🍎</div>' +
              '<h2 style="font-weight:600;margin-bottom:8px;font-size:20px;">窗口系统已就绪</h2>' +
              '<p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;">' +
                '点击标题栏拖拽窗口 · 三色按钮可关闭/最小化/最大化<br>' +
                '双击标题栏切换全屏 · Dock 图标即将接入</p>' +
            "</div>" +
          "</div>",
      });
      console.log(
        "%c🪟 WindowManager %cready — %c" +
          WindowManager.getVisible().length +
          " window(s) active",
        "font-size:14px;",
        "font-size:13px;color:#888;",
        "font-weight:bold;"
      );
    } else {
      // main.js 尚未 ready，等待
      setTimeout(ready, 50);
    }
  }

  ready();
})();
