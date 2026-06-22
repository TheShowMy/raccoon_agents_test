/**
 * macOS Web Simulator — 窗口系统
 * ============================================================
 * Window 类：单个窗口实例
 * WindowManager 类：窗口生命周期、聚焦、层级管理
 *
 * 挂载于 window.__macOS
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) {
    console.error("macOS core not initialized, window system aborted");
    return;
  }

  const { STATE, DOM, util } = macOS;

  /* ==========================================================
   *  Window 类
   * ========================================================== */

  class Window {
    /**
     * @param {Object} options
     * @param {string}  options.id       - 唯一 ID，不传自动生成
     * @param {string}  options.title    - 标题栏文字
     * @param {string}  options.appId    - 所属应用 ID
     * @param {number}  options.x        - 初始 X
     * @param {number}  options.y        - 初始 Y
     * @param {number}  options.width    - 宽度
     * @param {number}  options.height   - 高度
     * @param {string}  options.content  - 内容 HTML 字符串
     * @param {number}  options.zIndex   - 初始 z-index
     */
    constructor(options = {}) {
      this._id = options.id || util.uid("win");
      this._title = options.title || "无标题";
      this._appId = options.appId || null;
      this._x = options.x != null ? options.x : 120;
      this._y = options.y != null ? options.y : 120;
      this._width = options.width || 720;
      this._height = options.height || 480;
      this._content = options.content || "";
      this._zIndex = options.zIndex || macOS.nextZIndex();

      this._el = null;
      this._focused = false;
      this._minimized = false;
      this._maximized = false;
      /** 最大化前的尺寸与位置缓存 */
      this._preMaximize = null;
      /** 拖拽状态 */
      this._drag = null;
      /** 缩放状态 */
      this._resize = null;

      this._build();
    }

    /* ---------- getter ---------- */
    get id()      { return this._id; }
    get title()   { return this._title; }
    get appId()   { return this._appId; }
    get focused() { return this._focused; }
    get minimized(){ return this._minimized; }
    get maximized(){ return this._maximized; }

    /* ========================================================
     *  构建 DOM
     * ======================================================== */

    _build() {
      const el = document.createElement("div");
      el.className = "macos-window";
      el.id = this._id;
      el.setAttribute("data-app-id", this._appId || "");
      el.style.cssText = [
        `left:${this._x}px`,
        `top:${this._y}px`,
        `width:${this._width}px`,
        `height:${this._height}px`,
        `z-index:${this._zIndex}`,
      ].join(";");

      el.innerHTML = `
        <div class="window-titlebar">
          <div class="window-traffic-lights">
            <button class="window-traffic-light close" data-win-action="close" title="关闭"></button>
            <button class="window-traffic-light minimize" data-win-action="minimize" title="最小化"></button>
            <button class="window-traffic-light maximize" data-win-action="maximize" title="全屏"></button>
          </div>
          <div class="window-title">${this._escapeHtml(this._title)}</div>
        </div>
        <div class="window-content">${this._content}</div>
        <div class="window-resize-handle nw" data-resize="nw"></div>
        <div class="window-resize-handle ne" data-resize="ne"></div>
        <div class="window-resize-handle sw" data-resize="sw"></div>
        <div class="window-resize-handle se" data-resize="se"></div>
        <div class="window-resize-handle n"  data-resize="n"></div>
        <div class="window-resize-handle s"  data-resize="s"></div>
        <div class="window-resize-handle e"  data-resize="e"></div>
        <div class="window-resize-handle w"  data-resize="w"></div>
      `;

      this._el = el;
      this._bind();
    }

    _escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    /* ========================================================
     *  事件绑定
     * ======================================================== */

    _bind() {
      const el = this._el;

      // ---- 点击窗口任意位置 → 聚焦 ----
      el.addEventListener("mousedown", () => {
        macOS.windowManager.focus(this);
      });

      // ---- 交通灯按钮 ----
      const lights = el.querySelector(".window-traffic-lights");
      if (lights) {
        lights.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-win-action]");
          if (!btn) return;
          e.stopPropagation();
          switch (btn.dataset.winAction) {
            case "close":    this.close();          break;
            case "minimize": this.minimize();       break;
            case "maximize": this.toggleMaximize(); break;
          }
        });
      }

      // ---- 标题栏拖拽 ----
      const titlebar = el.querySelector(".window-titlebar");
      if (titlebar) {
        titlebar.addEventListener("mousedown", (e) => {
          // 不拦截按钮点击
          if (e.target.closest("[data-win-action]")) return;
          if (e.target.closest("[data-resize]"))     return;
          this._startDrag(e);
        });

        // 双击标题栏切换最大化
        titlebar.addEventListener("dblclick", (e) => {
          if (e.target.closest("[data-win-action]")) return;
          if (e.target.closest("[data-resize]"))     return;
          this.toggleMaximize();
        });
      }

      // ---- 边缘缩放把手 ----
      el.querySelectorAll("[data-resize]").forEach((handle) => {
        handle.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._startResize(e, handle.dataset.resize);
        });
      });
    }

    /* ========================================================
     *  拖拽
     * ======================================================== */

    _startDrag(e) {
      if (this._maximized) return;
      e.preventDefault();

      this._drag = {
        sx: e.clientX,
        sy: e.clientY,
        wx: this._x,
        wy: this._y,
      };

      const onMove = (ev) => {
        if (!this._drag) return;
        this.setPosition(
          this._drag.wx + (ev.clientX - this._drag.sx),
          this._drag.wy + (ev.clientY - this._drag.sy),
        );
      };

      const onUp = () => {
        this._drag = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    /* ========================================================
     *  缩放
     * ======================================================== */

    _startResize(e, dir) {
      if (this._maximized) return;
      e.preventDefault();

      this._resize = {
        sx: e.clientX,
        sy: e.clientY,
        wx: this._x,
        wy: this._y,
        ww: this._width,
        wh: this._height,
        dir,
      };

      const onMove = (ev) => {
        if (!this._resize) return;
        const dx = ev.clientX - this._resize.sx;
        const dy = ev.clientY - this._resize.sy;
        const sw = this._resize.ww;
        const sh = this._resize.wh;
        const sx = this._resize.wx;
        const sy = this._resize.wy;
        const dir = this._resize.dir;
        const MIN_W = 360;
        const MIN_H = 200;

        let nw = sw, nh = sh, nx = sx, ny = sy;

        if (dir.includes("e")) nw = sw + dx;
        if (dir.includes("w")) { nw = sw - dx; nx = sx + dx; }
        if (dir.includes("s")) nh = sh + dy;
        if (dir.includes("n")) { nh = sh - dy; ny = sy + dy; }

        // 回钳到最小尺寸
        if (nw < MIN_W) {
          if (dir.includes("w")) nx -= (MIN_W - nw);
          nw = MIN_W;
        }
        if (nh < MIN_H) {
          if (dir.includes("n")) ny -= (MIN_H - nh);
          nh = MIN_H;
        }

        this.setPosition(nx, ny);
        this.setSize(nw, nh);
      };

      const onUp = () => {
        this._resize = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    /* ========================================================
     *  Public API — 位置 / 尺寸
     * ======================================================== */

    setPosition(x, y) {
      this._x = x;
      this._y = y;
      if (this._el) {
        this._el.style.left = x + "px";
        this._el.style.top  = y + "px";
      }
    }

    setSize(w, h) {
      this._width  = w;
      this._height = h;
      if (this._el) {
        this._el.style.width  = w + "px";
        this._el.style.height = h + "px";
      }
    }

    setZIndex(n) {
      this._zIndex = n;
      if (this._el) this._el.style.zIndex = n;
    }

    setTitle(text) {
      this._title = text;
      if (this._el) {
        const t = this._el.querySelector(".window-title");
        if (t) t.textContent = text;
      }
    }

    setContent(html) {
      this._content = html;
      if (this._el) {
        const c = this._el.querySelector(".window-content");
        if (c) c.innerHTML = html;
      }
    }

    getElement() {
      return this._el;
    }

    /* ========================================================
     *  Public API — 窗口操作
     * ======================================================== */

    /** 聚焦当前窗口（委托给 WindowManager） */
    focus() {
      macOS.windowManager.focus(this);
    }

    /** 关闭窗口 */
    close() {
      macOS.windowManager.close(this);
    }

    /** 切换最小化 */
    minimize() {
      if (this._minimized) {
        this._restoreMinimized();
      } else {
        this._minimized = true;
        if (this._el) this._el.classList.add("minimized");
        // 通知 WindowManager 处理焦点转移
        macOS.windowManager._onMinimize(this);
      }
    }

    _restoreMinimized() {
      this._minimized = false;
      if (this._el) this._el.classList.remove("minimized");
      // 恢复后自动聚焦
      this.focus();
    }

    /** 切换最大化 */
    toggleMaximize() {
      if (this._minimized) this._restoreMinimized();
      if (this._maximized) {
        this._restoreMaximize();
      } else {
        this._maximize();
      }
    }

    _maximize() {
      if (this._maximized) return;
      this._preMaximize = {
        x: this._x,
        y: this._y,
        w: this._width,
        h: this._height,
      };
      this._maximized = true;
      if (this._el) this._el.classList.add("maximized");

      // 填满窗口容器（已扣除 menubar 高度）
      const layer = DOM.windowLayer;
      if (layer) {
        const r = layer.getBoundingClientRect();
        this.setPosition(0, 0);
        this.setSize(r.width, r.height);
      }
    }

    _restoreMaximize() {
      if (!this._maximized || !this._preMaximize) return;
      this._maximized = false;
      if (this._el) this._el.classList.remove("maximized");
      this.setPosition(this._preMaximize.x, this._preMaximize.y);
      this.setSize(this._preMaximize.w, this._preMaximize.h);
      this._preMaximize = null;
    }
  }

  /* ==========================================================
   *  WindowManager 类
   * ========================================================== */

  class WindowManager {
    constructor() {
      /** @type {Map<string, Window>} */
      this._windows = new Map();
    }

    /**
     * 创建并挂载窗口
     * @param {Object} options — 参看 Window 构造函数
     * @returns {Window}
     */
    create(options = {}) {
      const win = new Window(options);

      // 挂载到 DOM
      const layer = DOM.windowLayer;
      if (!layer) {
        console.error("window-layer not found");
        return win;
      }
      layer.appendChild(win.getElement());

      // 登记
      this._windows.set(win.id, win);
      STATE.windows.push(win);

      // 自动聚焦
      this.focus(win);
      return win;
    }

    /**
     * 关闭窗口
     * @param {Window} win
     */
    close(win) {
      if (!win) return;

      this._windows.delete(win.id);
      const idx = STATE.windows.indexOf(win);
      if (idx >= 0) STATE.windows.splice(idx, 1);

      const el = win.getElement();
      if (el && el.parentNode) el.parentNode.removeChild(el);

      // 若关闭的是当前聚焦窗口 → 将焦点交给顶层可见窗口
      if (STATE.focusedWindowId === win.id) {
        STATE.focusedWindowId = null;
        const top = this._getTopVisible();
        if (top) this.focus(top);
      }
    }

    /**
     * 聚焦指定窗口：取消其他聚焦态、提升 z-index
     * @param {Window} win
     */
    focus(win) {
      if (!win) return;

      // 取消所有窗口的聚焦态
      this._windows.forEach((w) => {
        if (w._focused && w.id !== win.id) {
          w._focused = false;
          if (w._el) w._el.classList.remove("focused");
        }
      });

      // 若处于最小化：先恢复
      if (win._minimized) {
        win._restoreMinimized();
      }

      // 设置聚焦态 + 层级提升
      win._focused = true;
      if (win._el) win._el.classList.add("focused");
      win.setZIndex(macOS.nextZIndex());
      STATE.focusedWindowId = win.id;

      // 同步菜单栏应用名
      if (DOM.menubarAppName) {
        DOM.menubarAppName.textContent = win._title;
      }
    }

    /**
     * 窗口最小化后的善后处理（内部使用）
     */
    _onMinimize(win) {
      if (STATE.focusedWindowId === win.id) {
        STATE.focusedWindowId = null;
        const top = this._getTopVisible();
        if (top) {
          this.focus(top);
        } else {
          // 无可见窗口 → 恢复 Finder 菜单
          if (DOM.menubarAppName) DOM.menubarAppName.textContent = "Finder";
        }
      }
    }

    /**
     * 返回当前聚焦窗口
     * @returns {Window|null}
     */
    getFocused() {
      if (!STATE.focusedWindowId) return null;
      return this._windows.get(STATE.focusedWindowId) || null;
    }

    /**
     * 返回所有窗口（按创建顺序）
     * @returns {Window[]}
     */
    getAll() {
      return Array.from(this._windows.values());
    }

    /**
     * 按 appId 查找窗口
     * @param {string} appId
     * @returns {Window|undefined}
     */
    getByAppId(appId) {
      return this.getAll().find((w) => w.appId === appId);
    }

    /**
     * 返回 z-index 最高且未最小化的窗口
     * @returns {Window|null}
     */
    _getTopVisible() {
      let top = null;
      let maxZ = -1;
      this._windows.forEach((w) => {
        if (!w._minimized && w._zIndex > maxZ) {
          maxZ = w._zIndex;
          top = w;
        }
      });
      return top;
    }

    /**
     * 窗口数量
     * @returns {number}
     */
    get count() {
      return this._windows.size;
    }
  }

  /* ==========================================================
   *  挂载到全局命名空间
   * ========================================================== */

  const wm = new WindowManager();
  macOS.windowManager = wm;
  macOS.Window = Window;
  macOS.WindowManager = WindowManager;

  /* ==========================================================
   *  响应浏览器窗口 resize：更新所有最大化窗口尺寸
   * ========================================================== */

  window.addEventListener("resize", () => {
    if (!DOM.windowLayer) return;
    const r = DOM.windowLayer.getBoundingClientRect();
    wm.getAll().forEach((w) => {
      if (w._maximized) {
        w.setPosition(0, 0);
        w.setSize(r.width, r.height);
      }
    });
  });

  console.log("Window system initialized");
})();
