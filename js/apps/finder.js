/**
 * macOS Web Simulator — Finder 应用
 * ============================================================
 * 模拟 macOS Finder 文件管理器：
 * - 侧边栏（个人收藏 / iCloud / 位置 / 标签）
 * - 图标网格视图
 * - 点击选中、双击打开文件夹/文件
 * - 工具栏：后退/前进、路径面包屑、搜索
 * - 窗口状态栏
 * - Dock 图标点击打开/聚焦 Finder 窗口
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) return;

  const { STATE, DOM } = macOS;

  /* ==========================================================
   *  虚拟文件系统
   * ========================================================== */

  /** 返回一个文件节点 */
  function file(name, opts = {}) {
    return {
      name,
      type: "file",
      kind: opts.kind || "document", // folder | document | image | archive | app | other
      size: opts.size || "—",
      modified: opts.modified || "2025/6/20",
      content: opts.content || null,
      ...opts,
    };
  }

  /** 返回一个文件夹节点 */
  function folder(name, children = [], opts = {}) {
    return {
      name,
      type: "folder",
      children,
      ...opts,
    };
  }

  const VFS = folder("Macintosh HD", [
    folder("系统", [
      folder("资源库", [], { hidden: true }),
    ], { hidden: true }),
    folder("用户", [
      folder("theshow", [
        folder("桌面", [
          file("项目方案.md",      { kind: "document" }),
          file("会议纪要.txt",    { kind: "document" }),
          file("Safari 快捷方式", { kind: "app", icon: "safari-app" }),
          folder("截图", [
            file("截屏 2025-06-22.png", { kind: "image" }),
            file("截屏 2025-06-21.png", { kind: "image" }),
          ]),
        ]),
        folder("文稿", [
          folder("工作", [
            file("Q3 规划.key",    { kind: "document" }),
            file("预算表.numbers", { kind: "document" }),
            file("设计原型.fig",   { kind: "other" }),
          ]),
          folder("个人", [
            file("日记.txt",          { kind: "document" }),
            file("阅读清单.md",       { kind: "document" }),
          ]),
          file("简历.pdf",         { kind: "document" }),
          file("封面图片.png",     { kind: "image" }),
        ]),
        folder("下载", [
          file("macOS-Sonoma.jpg",     { kind: "image" }),
          file("app-debug.log",        { kind: "other" }),
          file("归档.zip",             { kind: "archive" }),
          file("安装包.dmg",           { kind: "archive" }),
        ]),
        folder("影片", [
          file("演示视频.mp4",         { kind: "other" }),
        ]),
        folder("音乐", [
          file("背景音乐.mp3",         { kind: "other" }),
        ]),
        folder("图片", [
          folder("壁纸", [
            file("Sonoma 壁纸 01.heic", { kind: "image" }),
            file("Sonoma 壁纸 02.heic", { kind: "image" }),
          ]),
          file("头像.png",             { kind: "image" }),
        ]),
        folder("公共", [], { hidden: false }),
      ]),
      folder("共享", [], { hidden: true }),
    ]),
    folder("应用程序", [
      file("Safari.app",          { kind: "app" }),
      file("终端.app",            { kind: "app" }),
      file("系统设置.app",        { kind: "app" }),
      file("Xcode.app",           { kind: "app" }),
      file("Pages.app",           { kind: "app" }),
      file("Numbers.app",         { kind: "app" }),
      file("Keynote.app",         { kind: "app" }),
    ]),
  ]);

  /* ==========================================================
   *  路径工具
   * ========================================================== */

  /**
   * 将路径数组解析为节点，自动跳过隐藏文件夹
   * @param {string[]} segments
   * @returns {{ node: object, path: string[] }|null}
   */
  function resolvePath(segments) {
    let node = VFS;
    const path = [];
    for (const seg of segments) {
      if (node.type !== "folder" || !node.children) return null;
      const child = node.children.find((c) => c.name === seg);
      if (!child || child.hidden) return null;
      path.push(child.name);
      node = child;
    }
    return { node, path };
  }

  /**
   * 生成面包屑路径段
   * @param {string[]} path
   * @returns {Array<{name: string, segments: string[]}>}
   */
  function buildCrumbs(path) {
    const crumbs = [];
    for (let i = 0; i <= path.length; i++) {
      crumbs.push({
        name: i === 0 ? "" : path[i - 1],
        segments: path.slice(0, i),
      });
    }
    return crumbs;
  }

  /* ==========================================================
   *  侧边栏配置
   * ========================================================== */

  const SIDEBAR_SECTIONS = [
    {
      title: "个人收藏",
      items: [
        { label: "最近使用",      icon: "clock",   path: [] },
        { label: "桌面",          icon: "desktop", path: ["用户", "theshow", "桌面"] },
        { label: "文稿",          icon: "doc",     path: ["用户", "theshow", "文稿"] },
        { label: "下载",          icon: "download",path: ["用户", "theshow", "下载"] },
        { label: "theshow",       icon: "home",    path: ["用户", "theshow"] },
      ],
    },
    {
      title: "iCloud",
      items: [
        { label: "iCloud 云盘",    icon: "icloud",  path: [] },
      ],
    },
    {
      title: "位置",
      items: [
        { label: "Macintosh HD",  icon: "hdd",     path: [] },
        { label: "应用程序",       icon: "apps",    path: ["应用程序"] },
      ],
    },
    {
      title: "标签",
      items: [
        { label: "红色",           icon: "tag-red",  path: [] },
        { label: "橙色",           icon: "tag-orange", path: [] },
        { label: "黄色",           icon: "tag-yellow", path: [] },
        { label: "绿色",           icon: "tag-green",  path: [] },
        { label: "蓝色",           icon: "tag-blue",   path: [] },
        { label: "紫色",           icon: "tag-purple", path: [] },
        { label: "灰色",           icon: "tag-gray",   path: [] },
      ],
    },
  ];

  /* ==========================================================
   *  SVG 图标工厂
   * ========================================================== */

  function iconSvg(name, size = 16) {
    const icons = {
      // ---- 工具栏 ----
      "chevron-left":  `<path d="M11 3 L5 8 L11 13" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      "chevron-right": `<path d="M5 3 L11 8 L5 13" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      search: `<circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,

      // ---- 侧边栏 ----
      clock:    `<circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="8" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
      desktop:  `<rect x="2" y="1" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="14" x2="12" y2="14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
      doc:      `<path d="M4 2 h8 l3 3 v10 a1 1 0 0 1 -1 1 h-10 a1 1 0 0 1 -1 -1 v-12 a1 1 0 0 1 1 -1 z" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="1.2"/><line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" stroke-width="0.8" opacity="0.5"/><line x1="5" y1="11" x2="11" y2="11" stroke="currentColor" stroke-width="0.8" opacity="0.5"/><line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>`,
      download: `<rect x="2" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><polyline points="5,9 8,12 11,9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      home:     `<path d="M3 7 l5 -5 l5 5 v8 a1 1 0 0 1 -1 1 h-8 a1 1 0 0 1 -1 -1 z" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="6" y="10" width="4" height="5" stroke="currentColor" stroke-width="1.2" fill="none"/>`,
      icloud:   `<circle cx="8" cy="6" r="3" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="11" cy="9" r="2.5" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="5" cy="9" r="2.5" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="7" y1="6.5" x2="5.5" y2="9" stroke="currentColor" stroke-width="0.8"/><line x1="9" y1="6.5" x2="10.5" y2="9" stroke="currentColor" stroke-width="0.8"/>`,
      hdd:      `<rect x="2" y="3" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="0.8"/><circle cx="10" cy="9.5" r="0.6" fill="currentColor"/>`,
      apps:     `<rect x="3" y="2" width="4" height="4" rx="0.8" stroke="currentColor" stroke-width="1" fill="none"/><rect x="9" y="2" width="4" height="4" rx="0.8" stroke="currentColor" stroke-width="1" fill="none"/><rect x="3" y="8" width="4" height="4" rx="0.8" stroke="currentColor" stroke-width="1" fill="none"/><rect x="9" y="8" width="4" height="4" rx="0.8" stroke="currentColor" stroke-width="1" fill="none"/>`,

      // ---- 标签 ----
      "tag-red":    `<circle cx="8" cy="8" r="6" fill="#ff3b30" opacity="0.85"/>`,
      "tag-orange": `<circle cx="8" cy="8" r="6" fill="#ff9500" opacity="0.85"/>`,
      "tag-yellow": `<circle cx="8" cy="8" r="6" fill="#ffcc00" opacity="0.85"/>`,
      "tag-green":  `<circle cx="8" cy="8" r="6" fill="#34c759" opacity="0.85"/>`,
      "tag-blue":   `<circle cx="8" cy="8" r="6" fill="#007aff" opacity="0.85"/>`,
      "tag-purple": `<circle cx="8" cy="8" r="6" fill="#af52de" opacity="0.85"/>`,
      "tag-gray":   `<circle cx="8" cy="8" r="6" fill="#8e8e93" opacity="0.85"/>`,

      // ---- 文件类型 ----
      "folder-blue": `<path d="M3 4 h6 l2 2 h5 a1 1 0 0 1 1 1 v7 a1 1 0 0 1 -1 1 h-13 a1 1 0 0 1 -1 -1 v-9 a1 1 0 0 1 1 -1 z" fill="#5ea4f8"/>`,
      "file-doc":    `<rect x="4" y="2" width="10" height="13" rx="1.5" fill="#fff" stroke="#d2d2d7" stroke-width="0.8"/><line x1="7" y1="8" x2="13" y2="8" stroke="#5ea4f8" stroke-width="0.8"/><line x1="7" y1="10" x2="13" y2="10" stroke="#5ea4f8" stroke-width="0.8"/><line x1="7" y1="12" x2="11" y2="12" stroke="#5ea4f8" stroke-width="0.8"/>`,
      "file-image":  `<rect x="4" y="2" width="10" height="13" rx="1.5" fill="#fff" stroke="#d2d2d7" stroke-width="0.8"/><polygon points="4,15 9,10 12,12 14,10 16,15" fill="#34c759" opacity="0.6"/><circle cx="11" cy="7" r="1.2" fill="#007aff"/>`,
      "file-zip":    `<rect x="4" y="2" width="10" height="13" rx="1.5" fill="#fff" stroke="#d2d2d7" stroke-width="0.8"/><rect x="6" y="5" width="2" height="2" rx="0.5" fill="#febc2e"/><rect x="6" y="8" width="2" height="2" rx="0.5" fill="#febc2e"/><rect x="10" y="5" width="2" height="2" rx="0.5" fill="#febc2e"/><rect x="10" y="8" width="2" height="2" rx="0.5" fill="#febc2e"/><rect x="6" y="11" width="2" height="2" rx="0.5" fill="#febc2e"/>`,
      "file-app":    `<rect x="3" y="2" width="11" height="12" rx="2.5" fill="#1fa2fc"/><rect x="6" y="6" width="5" height="1.5" rx="0.5" fill="#fff" opacity="0.6"/><rect x="6" y="9" width="3" height="1.5" rx="0.5" fill="#fff" opacity="0.4"/>`,
      "file-other":  `<rect x="4" y="2" width="10" height="13" rx="1.5" fill="#fff" stroke="#d2d2d7" stroke-width="0.8"/><text x="8" y="13" font-size="7" fill="#8e8e93" font-family="sans-serif" text-anchor="middle">?</text>`,
    };
    const body = icons[name] || icons["file-other"];
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  /** 大尺寸文件图标（52x52 用于网格视图） */
  function fileIconSvg(node) {
    if (node.type === "folder") return iconSvg("folder-blue", 52);
    if (node.kind === "image")   return iconSvg("file-image", 52);
    if (node.kind === "archive") return iconSvg("file-zip", 52);
    if (node.kind === "app")     return iconSvg("file-app", 52);
    if (node.kind === "document")return iconSvg("file-doc", 52);
    return iconSvg("file-other", 52);
  }

  /* ==========================================================
   *  FinderApp 类
   * ========================================================== */

  class FinderApp {
    constructor() {
      this._win = null;          // Window 实例
      this._currentPath = [];    // 当前浏览路径 [segment, ...]
      this._history = [];        // 导航历史 [{path}]
      this._historyIdx = -1;     // 当前位置
      this._selected = new Set();// 选中的文件名
      this._lastSelected = null; // 最后选中的文件名（Shift 连选用）

      // DOM 缓存（填充后有效）
      this._sidebarEl = null;
      this._contentEl = null;
      this._toolbarTitleEl = null;
      this._statusLeftEl = null;
      this._statusRightEl = null;
    }

    /* ========================================================
     *  打开 Finder 窗口
     * ======================================================== */

    open() {
      // 若已存在 → 聚焦
      if (this._win && !this._win._minimized) {
        macOS.windowManager.focus(this._win);
        return;
      }
      if (this._win && this._win._minimized) {
        this._win._restoreMinimized();
        macOS.windowManager.focus(this._win);
        return;
      }

      // 创建新窗口
      this._win = macOS.windowManager.create({
        title: "Finder",
        appId: "finder",
        x: 80, y: 60,
        width: 900, height: 580,
        content: this._buildHtml(),
      });

      // 获取 DOM 引用
      this._cacheDOMElements();

      // 导航到默认路径 (桌面)
      this.navigateTo(["用户", "theshow", "桌面"], false);

      // 绑定事件
      this._bind();
    }

    /* ========================================================
     *  构建 Finder 内部 HTML
     * ======================================================== */

    _buildHtml() {
      return `
        <div class="finder-window">
          <div class="finder-toolbar" id="finder-toolbar">
            <button class="finder-toolbar-btn" data-finder-action="back" disabled title="后退">
              <svg viewBox="0 0 16 16">${iconSvg("chevron-left")}</svg>
            </button>
            <button class="finder-toolbar-btn" data-finder-action="forward" disabled title="前进">
              <svg viewBox="0 0 16 16">${iconSvg("chevron-right")}</svg>
            </button>
            <div class="finder-toolbar-sep"></div>
            <div class="finder-toolbar-title" id="finder-toolbar-title">
              <!-- 面包屑动态填充 -->
            </div>
            <div class="finder-search" id="finder-search">
              <svg viewBox="0 0 16 16">${iconSvg("search")}</svg>
              <input type="text" placeholder="搜索" />
            </div>
          </div>
          <div class="finder-body">
            <div class="finder-sidebar" id="finder-sidebar">
              ${this._buildSidebarHtml()}
            </div>
            <div class="finder-sidebar-resizer" id="finder-sidebar-resizer"></div>
            <div class="finder-content" id="finder-content">
              <!-- 图标网格动态填充 -->
            </div>
          </div>
          <div class="finder-statusbar">
            <div class="finder-statusbar-left" id="finder-statusbar-left">
              <!-- 项数等 -->
            </div>
            <div class="finder-statusbar-right" id="finder-statusbar-right">
              <!-- 剩余空间等 -->
            </div>
          </div>
        </div>`;
    }

    _buildSidebarHtml() {
      let html = "";
      SIDEBAR_SECTIONS.forEach((section, si) => {
        if (si > 0) html += `<div class="finder-sidebar-sep"></div>`;
        html += `<div class="finder-sidebar-section-title">${section.title}</div>`;
        section.items.forEach((item) => {
          html += `
            <div class="finder-sidebar-item" data-sidebar-path="${item.path.join("/")}">
              <span class="finder-sidebar-icon">
                <svg viewBox="0 0 16 16">${iconSvg(item.icon)}</svg>
              </span>
              <span class="finder-sidebar-label">${item.label}</span>
            </div>`;
        });
      });
      return html;
    }

    _cacheDOMElements() {
      const el = this._win._el;
      this._sidebarEl     = el.querySelector("#finder-sidebar");
      this._contentEl     = el.querySelector("#finder-content");
      this._toolbarTitleEl= el.querySelector("#finder-toolbar-title");
      this._statusLeftEl  = el.querySelector("#finder-statusbar-left");
      this._statusRightEl = el.querySelector("#finder-statusbar-right");
    }

    /* ========================================================
     *  事件绑定
     * ======================================================== */

    _bind() {
      const el = this._win._el;

      // 工具栏按钮
      const toolbar = el.querySelector("#finder-toolbar");
      toolbar.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-finder-action]");
        if (!btn) return;
        this._focusSelf();
        switch (btn.dataset.finderAction) {
          case "back":    this._goBack();    break;
          case "forward": this._goForward(); break;
        }
      });

      // 侧边栏点击
      this._sidebarEl.addEventListener("click", (e) => {
        const item = e.target.closest("[data-sidebar-path]");
        if (!item) return;
        this._focusSelf();
        const raw = item.dataset.sidebarPath;
        const segs = raw ? raw.split("/") : [];
        const path = segs.filter(Boolean);
        this.navigateTo(path);
        this._highlightSidebarItem(item);
      });

      // 侧边栏分隔条拖拽
      const resizer = el.querySelector("#finder-sidebar-resizer");
      let resizing = false;
      let startX = 0;
      let startW = 0;
      resizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        resizing = true;
        startX = e.clientX;
        startW = this._sidebarEl.offsetWidth;
        document.body.style.cursor = "col-resize";
      });
      document.addEventListener("mousemove", (e) => {
        if (!resizing) return;
        const newW = Math.max(140, Math.min(320, startW + (e.clientX - startX)));
        this._sidebarEl.style.width = newW + "px";
      });
      document.addEventListener("mouseup", () => {
        if (resizing) {
          resizing = false;
          document.body.style.cursor = "";
        }
      });

      // 内容区点击（选中 / 打开）
      this._contentEl.addEventListener("click", (e) => {
        this._focusSelf();
        const item = e.target.closest("[data-file-name]");
        if (!item) {
          // 点击空白 → 取消选中
          this._clearSelection();
          return;
        }
        const name = item.dataset.fileName;
        if (e.shiftKey && this._lastSelected) {
          this._selectRange(name);
        } else if (e.metaKey || e.ctrlKey) {
          this._toggleSelect(name);
        } else {
          this._selectSingle(name);
        }
      });

      // 内容区双击 → 打开
      this._contentEl.addEventListener("dblclick", (e) => {
        this._focusSelf();
        const item = e.target.closest("[data-file-name]");
        if (!item) return;
        this._openItem(item.dataset.fileName);
      });

      // 键盘导航
      el.addEventListener("keydown", (e) => {
        // 只在当前窗口聚焦时处理
        if (!this._win._focused) return;
        if (e.key === "ArrowUp")    { this._moveSelection(-1); e.preventDefault(); }
        if (e.key === "ArrowDown")  { this._moveSelection(1);  e.preventDefault(); }
        if (e.key === "ArrowLeft")  { this._moveSelection(-1); e.preventDefault(); }
        if (e.key === "ArrowRight") { this._moveSelection(1);  e.preventDefault(); }
        if (e.key === "Enter" && this._lastSelected) {
          this._openItem(this._lastSelected);
          e.preventDefault();
        }
        if (e.key === "Backspace" || (e.key === "ArrowLeft" && e.metaKey)) {
          this._goBack();
          e.preventDefault();
        }
      });
    }

    /* ========================================================
     *  确保窗口聚焦（不触发窗口系统的重复聚焦）
     * ======================================================== */
    _focusSelf() {
      if (!this._win._focused) {
        macOS.windowManager.focus(this._win);
      }
    }

    /* ========================================================
     *  导航
     * ======================================================== */

    navigateTo(path, pushHistory = true) {
      const resolved = resolvePath(path);
      if (!resolved) return;
      const { node } = resolved;

      if (pushHistory) {
        // 截断前向历史
        if (this._historyIdx < this._history.length - 1) {
          this._history = this._history.slice(0, this._historyIdx + 1);
        }
        this._history.push({ path: [...path] });
        this._historyIdx = this._history.length - 1;
      }

      this._currentPath = [...path];
      this._clearSelection();
      this._renderContent(node);
      this._renderBreadcrumbs();
      this._updateToolbarButtons();
      this._updateStatusbar(node);
    }

    _goBack() {
      if (this._historyIdx <= 0) return;
      this._historyIdx--;
      const entry = this._history[this._historyIdx];
      this.navigateTo(entry.path, false);
    }

    _goForward() {
      if (this._historyIdx >= this._history.length - 1) return;
      this._historyIdx++;
      const entry = this._history[this._historyIdx];
      this.navigateTo(entry.path, false);
    }

    /* ========================================================
     *  渲染
     * ======================================================== */

    _renderBreadcrumbs() {
      if (!this._toolbarTitleEl) return;
      const crumbs = buildCrumbs(this._currentPath);
      const items = crumbs.map((c, i) => {
        const name = i === 0
          ? `<svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align:-2px;margin-right:2px;">${iconSvg("hdd")}</svg>`
          : c.name;
        const seg = c.segments.join("/");
        if (i === crumbs.length - 1) {
          return `<span class="path-segment" style="color:#1d1d1f;font-weight:600;">${name}</span>`;
        }
        return `<span class="path-segment" data-crumb-path="${seg}">${name}</span>`;
      });
      const html = items.join(`<span class="path-sep">›</span>`);
      this._toolbarTitleEl.innerHTML = html;

      // 面包屑点击
      this._toolbarTitleEl.querySelectorAll("[data-crumb-path]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this._focusSelf();
          const seg = el.dataset.crumbPath;
          const path = seg ? seg.split("/").filter(Boolean) : [];
          this.navigateTo(path);
        });
      });
    }

    _renderContent(folderNode) {
      if (!this._contentEl) return;
      const children = folderNode.children || [];
      if (children.length === 0) {
        this._contentEl.innerHTML = `<div style="width:100%;text-align:center;padding:60px;color:#8e8e93;font-size:13px;">此文件夹为空</div>`;
        this._contentEl.style.flexDirection = "column";
        return;
      }
      this._contentEl.style.flexDirection = "";

      // macOS 风格排序：文件夹在前，然后文件
      const sorted = [...children].sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-CN");
      });

      let html = "";
      sorted.forEach((child) => {
        const selClass = this._selected.has(child.name) ? " selected" : "";
        html += `
          <div class="finder-item${selClass}" data-file-name="${child.name}">
            <div class="finder-item-icon">
              ${fileIconSvg(child)}
            </div>
            <div class="finder-item-label">${this._esc(child.name)}</div>
          </div>`;
      });
      this._contentEl.innerHTML = html;
    }

    _updateToolbarButtons() {
      if (!this._win || !this._win._el) return;
      const backBtn = this._win._el.querySelector('[data-finder-action="back"]');
      const fwdBtn  = this._win._el.querySelector('[data-finder-action="forward"]');
      if (backBtn) backBtn.disabled = this._historyIdx <= 0;
      if (fwdBtn)  fwdBtn.disabled  = this._historyIdx >= this._history.length - 1;
    }

    _updateStatusbar(folderNode) {
      if (this._statusLeftEl) {
        const count = (folderNode.children || []).length;
        this._statusLeftEl.textContent = `${count} 个项目`;
      }
      if (this._statusRightEl) {
        this._statusRightEl.textContent = "";
      }
    }

    /* ========================================================
     *  选中逻辑
     * ======================================================== */

    _selectSingle(name) {
      this._selected.clear();
      this._selected.add(name);
      this._lastSelected = name;
      this._refreshSelection();
    }

    _toggleSelect(name) {
      if (this._selected.has(name)) {
        this._selected.delete(name);
      } else {
        this._selected.add(name);
      }
      this._lastSelected = name;
      this._refreshSelection();
    }

    _clearSelection() {
      this._selected.clear();
      this._lastSelected = null;
      this._refreshSelection();
    }

    /**
     * Shift 连选：从 lastSelected 到 name 之间全部选中
     */
    _selectRange(name) {
      if (!this._contentEl) return;
      const items = Array.from(this._contentEl.querySelectorAll("[data-file-name]"));
      const names = items.map((el) => el.dataset.fileName);
      const start = names.indexOf(this._lastSelected);
      const end   = names.indexOf(name);
      if (start < 0 || end < 0) return;

      // 清除后再连续选中
      this._selected.clear();
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let i = lo; i <= hi; i++) {
        this._selected.add(names[i]);
      }
      this._refreshSelection();
    }

    _moveSelection(delta) {
      if (!this._contentEl) return;
      const items = Array.from(this._contentEl.querySelectorAll("[data-file-name]"));
      if (items.length === 0) return;
      const names = items.map((el) => el.dataset.fileName);
      let idx = this._lastSelected ? names.indexOf(this._lastSelected) : -1;
      if (idx < 0) idx = 0;
      else idx = Math.max(0, Math.min(names.length - 1, idx + delta));
      this._selectSingle(names[idx]);
    }

    _refreshSelection() {
      if (!this._contentEl) return;
      this._contentEl.querySelectorAll(".finder-item").forEach((el) => {
        const name = el.dataset.fileName;
        if (this._selected.has(name)) {
          el.classList.add("selected");
        } else {
          el.classList.remove("selected");
        }
      });
      this._updateStatusForSelection();
    }

    _updateStatusForSelection() {
      if (this._statusLeftEl) {
        if (this._selected.size > 0) {
          this._statusLeftEl.textContent = `已选择 ${this._selected.size} 个项目`;
        }
      }
    }

    /* ========================================================
     *  打开项目
     * ======================================================== */

    _openItem(name) {
      const resolved = resolvePath(this._currentPath);
      if (!resolved || !resolved.node.children) return;
      const child = resolved.node.children.find((c) => c.name === name);
      if (!child) return;

      if (child.type === "folder") {
        this.navigateTo([...this._currentPath, child.name]);
      } else {
        // 文件：显示 QuickLook 弹窗
        this._showQuickLook(child);
      }
    }

    _showQuickLook(node) {
      // 简单的弹窗展示
      const overlay = document.createElement("div");
      overlay.className = "finder-quicklook-overlay active";
      overlay.innerHTML = `
        <div class="finder-quicklook-card">
          <div style="margin-bottom:16px;">
            ${fileIconSvg(node)}
          </div>
          <h3>${this._esc(node.name)}</h3>
          <p>类型: ${node.kind || "未知"} · 大小: ${node.size || "—"}</p>
          <p style="margin-top:8px;font-size:11px;">修改日期: ${node.modified || "—"}</p>
        </div>`;
      overlay.addEventListener("click", () => overlay.remove());

      const content = this._win._el.querySelector(".window-content");
      if (content) {
        // 移除旧的 overlay
        content.querySelectorAll(".finder-quicklook-overlay").forEach((o) => o.remove());
        content.appendChild(overlay);
      }
    }

    /* ========================================================
     *  侧边栏高亮
     * ======================================================== */

    _highlightSidebarItem(activeItem) {
      this._sidebarEl.querySelectorAll(".finder-sidebar-item").forEach((el) => {
        el.classList.remove("selected");
      });
      if (activeItem) activeItem.classList.add("selected");
    }

    /* ========================================================
     *  工具
     * ======================================================== */

    _esc(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    getWindow() {
      return this._win;
    }
  }

  /* ==========================================================
   *  注册到全局 & Dock 点击
   * ========================================================== */

  const finderApp = new FinderApp();

  // 注册应用
  STATE.apps["finder"] = {
    name: "Finder",
    icon: "finder",
    instance: finderApp,
    open() { finderApp.open(); },
  };

  // 打开初始 Finder 窗口
  // （初始即展示桌面内容）
  setTimeout(() => {
    finderApp.open();
  }, 100);

  // 接管 Dock finder 图标点击
  const dockBindTimer = setInterval(() => {
    const dockIcon = document.querySelector('.dock-icon[data-app-id="finder"]');
    if (dockIcon) {
      clearInterval(dockBindTimer);
      dockIcon.addEventListener("click", () => {
        finderApp.open();
      });
      // 标记为 running
      dockIcon.classList.add("running");
    }
  }, 100);

  console.log("Finder app initialized");
})();
