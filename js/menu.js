/**
 * macOS Web Simulator — 菜单系统
 * ============================================================
 * 集中管理顶部状态栏所有下拉菜单：
 * - Apple 菜单（关于本机 / 系统设置 / App Store / 关机等）
 * - 当前应用菜单（随聚焦窗口切换）
 * - 菜单项悬停高亮、分隔线、键盘快捷键显示
 * - 点击菜单外部自动关闭
 * - 菜单项动作回调
 *
 * 挂载于 window.__macOS.menu
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) {
    console.error("macOS core not initialized, menu system aborted");
    return;
  }

  const { STATE, DOM } = macOS;

  /* ==========================================================
   *  内部状态
   * ========================================================== */

  /** 每个应用注册的菜单定义 { appId: { menuName: { items: [...], ... } } } */
  const _appMenus = {};

  /** 当前显示的菜单浮层类型与数据 */
  let _activeDropdown = null; // { type: "apple"|"app", menuName, anchorEl, dismissFn }

  /** 当前活跃的应用 ID（用于决定显示哪个应用的菜单） */
  let _activeAppId = "finder";

  /* ==========================================================
   *  Apple 菜单定义
   * ========================================================== */

  const APPLE_MENU_ITEMS = [
    { label: "关于本机",       action: "about-mac" },
    { type: "separator" },
    { label: "系统设置...",    action: "open-settings", shortcut: "⌘," },
    { label: "App Store...",   action: "app-store" },
    { type: "separator" },
    { label: "最近项目",       disabled: true },
    { type: "separator" },
    { label: "强制退出...",    action: "force-quit", shortcut: "⌥⌘⎋" },
    { type: "separator" },
    { label: "睡眠",           action: "sleep" },
    { label: "重新启动...",    action: "restart" },
    { label: "关机...",        action: "shutdown" },
    { type: "separator" },
    { label: "锁定屏幕",       action: "lock", shortcut: "⌃⌘Q" },
    { label: "注销 theshow...", action: "logout", shortcut: "⇧⌘Q" },
  ];

  /* ==========================================================
   *  各应用菜单定义
   * ========================================================== */

  const DEFAULT_MENUS = {
    finder: {
      "文件": {
        items: [
          { label: "新建 Finder 窗口", action: "new-finder-window", shortcut: "⌘N" },
          { label: "新建文件夹",       action: "new-folder",         shortcut: "⇧⌘N" },
          { type: "separator" },
          { label: "打开",             action: "open",               shortcut: "⌘O" },
          { label: "打开方式...",      action: "open-with" },
          { type: "separator" },
          { label: "显示简介",         action: "get-info",           shortcut: "⌘I" },
          { label: "重新命名",         action: "rename",             shortcut: "⏎" },
          { label: "压缩",             action: "compress" },
          { type: "separator" },
          { label: "移到废纸篓",       action: "move-to-trash",      shortcut: "⌘⌫" },
          { label: "推出",             action: "eject",              shortcut: "⌘E" },
          { type: "separator" },
          { label: "查找",             action: "find",               shortcut: "⌘F" },
          { label: "关闭窗口",         action: "close-window",       shortcut: "⌘W" },
        ],
      },
      "编辑": {
        items: [
          { label: "撤销",             action: "undo",               shortcut: "⌘Z" },
          { label: "重做",             action: "redo",               shortcut: "⇧⌘Z" },
          { type: "separator" },
          { label: "剪切",             action: "cut",                shortcut: "⌘X" },
          { label: "拷贝",             action: "copy",               shortcut: "⌘C" },
          { label: "粘贴",             action: "paste",              shortcut: "⌘V" },
          { label: "全选",             action: "select-all",         shortcut: "⌘A" },
          { type: "separator" },
          { label: "显示拼写和语法",   action: "spelling" },
        ],
      },
      "显示": {
        items: [
          { label: "为图标",           action: "view-icons",         shortcut: "⌘1" },
          { label: "为列表",           action: "view-list",          shortcut: "⌘2" },
          { label: "为分栏",           action: "view-columns",       shortcut: "⌘3" },
          { label: "为画廊",           action: "view-gallery",       shortcut: "⌘4" },
          { type: "separator" },
          { label: "显示标签页栏",     action: "show-tab-bar",       shortcut: "⇧⌘T" },
          { label: "显示路径栏",       action: "show-path-bar",      shortcut: "⌥⌘P" },
          { label: "显示状态栏",       action: "show-status-bar",    shortcut: "⌘/" },
          { type: "separator" },
          { label: "查看显示选项",     action: "view-options",       shortcut: "⌘J" },
        ],
      },
      "前往": {
        items: [
          { label: "返回",             action: "go-back",            shortcut: "⌘[" },
          { label: "前进",             action: "go-forward",         shortcut: "⌘]" },
          { label: "上层文件夹",       action: "go-enclosing",       shortcut: "⌘↑" },
          { type: "separator" },
          { label: "最近使用",         action: "go-recent",          shortcut: "⇧⌘F" },
          { label: "文稿",             action: "go-documents",       shortcut: "⇧⌘O" },
          { label: "桌面",             action: "go-desktop",         shortcut: "⇧⌘D" },
          { label: "下载",             action: "go-downloads",       shortcut: "⌥⌘L" },
          { label: "个人",             action: "go-home",            shortcut: "⇧⌘H" },
          { label: "电脑",             action: "go-computer",        shortcut: "⇧⌘C" },
          { type: "separator" },
          { label: "连接到服务器...",  action: "go-connect",         shortcut: "⌘K" },
        ],
      },
      "窗口": {
        items: [
          { label: "最小化",           action: "minimize",           shortcut: "⌘M" },
          { label: "缩放",             action: "zoom" },
          { type: "separator" },
          { label: "前置全部窗口",     action: "bring-all-to-front" },
          { type: "separator" },
          { label: "进入全屏幕",       action: "toggle-fullscreen",  shortcut: "⌃⌘F" },
        ],
      },
      "帮助": {
        items: [
          { label: "macOS 帮助",       action: "macos-help",         shortcut: "⌘?" },
          { label: "新功能",           action: "whats-new" },
        ],
      },
    },

    safari: {
      "Safari": {
        items: [
          { label: "关于 Safari",      action: "about-safari" },
          { label: "Safari 扩展...",   action: "safari-extensions" },
          { type: "separator" },
          { label: "设置...",          action: "safari-preferences", shortcut: "⌘," },
          { type: "separator" },
          { label: "隐私报告...",      action: "privacy-report" },
          { type: "separator" },
          { label: "退出 Safari",      action: "quit-safari",        shortcut: "⌘Q" },
        ],
      },
      "文件": {
        items: [
          { label: "新建窗口",         action: "new-window",         shortcut: "⌘N" },
          { label: "新建标签页",       action: "new-tab",            shortcut: "⌘T" },
          { label: "打开文件...",      action: "open-file",          shortcut: "⌘O" },
          { type: "separator" },
          { label: "关闭标签页",       action: "close-tab",          shortcut: "⌘W" },
          { label: "关闭窗口",         action: "close-window",       shortcut: "⇧⌘W" },
          { type: "separator" },
          { label: "存储为...",        action: "save-as",            shortcut: "⇧⌘S" },
          { label: "共享...",          action: "share" },
          { type: "separator" },
          { label: "打印...",          action: "print",              shortcut: "⌘P" },
        ],
      },
      "编辑": {
        items: [
          { label: "撤销",             action: "undo",               shortcut: "⌘Z" },
          { label: "重做",             action: "redo",               shortcut: "⇧⌘Z" },
          { type: "separator" },
          { label: "剪切",             action: "cut",                shortcut: "⌘X" },
          { label: "拷贝",             action: "copy",               shortcut: "⌘C" },
          { label: "粘贴",             action: "paste",              shortcut: "⌘V" },
          { type: "separator" },
          { label: "全选",             action: "select-all",         shortcut: "⌘A" },
          { type: "separator" },
          { label: "查找",             action: "find",               shortcut: "⌘F" },
          { label: "查找下一个",       action: "find-next",          shortcut: "⌘G" },
        ],
      },
      "显示": {
        items: [
          { label: "显示/隐藏标签页栏", action: "toggle-tab-bar",    shortcut: "⇧⌘T" },
          { label: "显示/隐藏个人收藏栏", action: "toggle-favorites" },
          { label: "显示/隐藏状态栏",  action: "toggle-status-bar",  shortcut: "⌘/" },
          { type: "separator" },
          { label: "实际大小",         action: "actual-size",        shortcut: "⌘0" },
          { label: "放大",             action: "zoom-in",            shortcut: "⌘+" },
          { label: "缩小",             action: "zoom-out",           shortcut: "⌘-" },
          { type: "separator" },
          { label: "进入全屏幕",       action: "toggle-fullscreen",  shortcut: "⌃⌘F" },
          { label: "显示阅读器",       action: "show-reader",        shortcut: "⇧⌘R" },
          { label: "显示源代码",       action: "view-source",        shortcut: "⌥⌘U" },
        ],
      },
      "历史记录": {
        items: [
          { label: "返回",             action: "history-back",       shortcut: "⌘[" },
          { label: "前进",             action: "history-forward",    shortcut: "⌘]" },
          { label: "主页",             action: "home",               shortcut: "⇧⌘H" },
          { type: "separator" },
          { label: "显示全部历史记录", action: "show-all-history",   shortcut: "⌘Y" },
          { type: "separator" },
          { label: "清除历史记录...",  action: "clear-history" },
        ],
      },
      "书签": {
        items: [
          { label: "添加书签...",       action: "add-bookmark",      shortcut: "⌘D" },
          { label: "添加阅读列表...",   action: "add-reading-list",  shortcut: "⇧⌘D" },
          { type: "separator" },
          { label: "编辑书签",         action: "edit-bookmarks",     shortcut: "⌥⌘B" },
          { type: "separator" },
          { label: "个人收藏",         disabled: true, children: true },
        ],
      },
      "窗口": {
        items: [
          { label: "最小化",           action: "minimize",           shortcut: "⌘M" },
          { label: "缩放",             action: "zoom" },
          { type: "separator" },
          { label: "显示上一标签页",   action: "prev-tab",           shortcut: "⌃⇧⇥" },
          { label: "显示下一标签页",   action: "next-tab",           shortcut: "⌃⇥" },
        ],
      },
      "帮助": {
        items: [
          { label: "Safari 帮助",      action: "safari-help",        shortcut: "⌘?" },
          { label: "Safari 新功能",    action: "safari-whats-new" },
        ],
      },
    },

    terminal: {
      "终端": {
        items: [
          { label: "关于终端",         action: "about-terminal" },
          { type: "separator" },
          { label: "设置...",          action: "terminal-preferences", shortcut: "⌘," },
          { type: "separator" },
          { label: "退出终端",         action: "quit-terminal",     shortcut: "⌘Q" },
        ],
      },
      "Shell": {
        items: [
          { label: "新建窗口",         action: "new-window",         shortcut: "⌘N" },
          { label: "新建标签页",       action: "new-tab",            shortcut: "⌘T" },
          { type: "separator" },
          { label: "关闭窗口",         action: "close-window",       shortcut: "⇧⌘W" },
        ],
      },
      "编辑": {
        items: [
          { label: "拷贝",             action: "copy",               shortcut: "⌘C" },
          { label: "粘贴",             action: "paste",              shortcut: "⌘V" },
          { type: "separator" },
          { label: "全选",             action: "select-all",         shortcut: "⌘A" },
          { label: "查找",             action: "find",               shortcut: "⌘F" },
          { type: "separator" },
          { label: "清除屏幕",         action: "clear-screen",       shortcut: "⌘K" },
        ],
      },
      "显示": {
        items: [
          { label: "放大",             action: "zoom-in",            shortcut: "⌘+" },
          { label: "缩小",             action: "zoom-out",           shortcut: "⌘-" },
        ],
      },
      "窗口": {
        items: [
          { label: "最小化",           action: "minimize",           shortcut: "⌘M" },
          { label: "缩放",             action: "zoom" },
        ],
      },
      "帮助": {
        items: [
          { label: "终端帮助",         action: "terminal-help",      shortcut: "⌘?" },
        ],
      },
    },

    settings: {
      "系统设置": {
        items: [
          { label: "关于系统设置",     action: "about-settings" },
          { type: "separator" },
          { label: "退出系统设置",     action: "quit-settings",      shortcut: "⌘Q" },
        ],
      },
      "文件": {
        items: [
          { label: "关闭窗口",         action: "close-window",       shortcut: "⌘W" },
        ],
      },
      "编辑": {
        items: [
          { label: "撤销",             action: "undo",               shortcut: "⌘Z" },
          { label: "重做",             action: "redo",               shortcut: "⇧⌘Z" },
          { type: "separator" },
          { label: "剪切",             action: "cut",                shortcut: "⌘X" },
          { label: "拷贝",             action: "copy",               shortcut: "⌘C" },
          { label: "粘贴",             action: "paste",              shortcut: "⌘V" },
          { type: "separator" },
          { label: "全选",             action: "select-all",         shortcut: "⌘A" },
        ],
      },
      "显示": {
        items: [
          { label: "显示所有设置",     action: "show-all" },
          { label: "搜索",             action: "search-settings",    shortcut: "⌘F" },
        ],
      },
      "窗口": {
        items: [
          { label: "最小化",           action: "minimize",           shortcut: "⌘M" },
          { label: "缩放",             action: "zoom" },
          { type: "separator" },
          { label: "进入全屏幕",       action: "toggle-fullscreen",  shortcut: "⌃⌘F" },
        ],
      },
      "帮助": {
        items: [
          { label: "macOS 帮助",       action: "macos-help",         shortcut: "⌘?" },
        ],
      },
    },
  };

  /* ==========================================================
   *  菜单栏渲染
   * ========================================================== */

  /**
   * 构建当前应用的菜单栏项目
   */
  function buildMenuBar(appId) {
    if (!DOM.menubarMenus) return;

    const menus = _appMenus[appId] || DEFAULT_MENUS[appId] || DEFAULT_MENUS["finder"];
    if (!menus) return;

    const menuNames = Object.keys(menus);
    DOM.menubarMenus.innerHTML = menuNames
      .map((name) => `<span class="menubar-menu-item" data-menu-name="${name}">${name}</span>`)
      .join("");

    // 绑定菜单项点击
    DOM.menubarMenus.querySelectorAll(".menubar-menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const menuName = item.dataset.menuName;
        if (!menuName) return;
        showAppMenu(menuName, item);
      });
    });
  }

  /* ==========================================================
   *  显示 Apple 菜单
   * ========================================================== */

  function showAppleMenu() {
    if (_activeDropdown && _activeDropdown.type === "apple") {
      dismissAll();
      return;
    }
    dismissAll();

    const anchor = DOM.appleMenuBtn;
    if (!anchor) return;

    // 高亮 Apple 按钮
    anchor.classList.add("active");

    const menu = document.getElementById("context-menu");
    if (!menu) return;

    menu.innerHTML = renderMenuItems(APPLE_MENU_ITEMS);
    menu.classList.remove("hidden");

    positionDropdown(menu, anchor);

    // 绑定菜单项点击
    bindMenuActions(menu, APPLE_MENU_ITEMS, "apple");

    _activeDropdown = {
      type: "apple",
      anchorEl: anchor,
      dismissFn: () => {
        anchor.classList.remove("active");
      },
    };
  }

  /* ==========================================================
   *  显示应用菜单
   * ========================================================== */

  function showAppMenu(menuName, anchorEl) {
    // 清除其他活跃菜单项
    if (DOM.menubarMenus) {
      DOM.menubarMenus.querySelectorAll(".menubar-menu-item.active").forEach((el) => {
        el.classList.remove("active");
      });
    }

    if (_activeDropdown && _activeDropdown.type === "app" && _activeDropdown.anchorEl === anchorEl) {
      dismissAll();
      return;
    }
    dismissAll();

    anchorEl.classList.add("active");

    const menus = _appMenus[_activeAppId] || DEFAULT_MENUS[_activeAppId] || DEFAULT_MENUS["finder"];
    if (!menus || !menus[menuName]) {
      dismissAll();
      return;
    }

    const menuData = menus[menuName];
    const menu = document.getElementById("context-menu");
    if (!menu) return;

    menu.innerHTML = renderMenuItems(menuData.items);
    menu.classList.remove("hidden");

    positionDropdown(menu, anchorEl);

    bindMenuActions(menu, menuData.items, "app");

    _activeDropdown = {
      type: "app",
      menuName,
      anchorEl,
      dismissFn: () => {
        anchorEl.classList.remove("active");
      },
    };
  }

  /* ==========================================================
   *  菜单项渲染
   * ========================================================== */

  function renderMenuItems(items) {
    if (!items) return "";

    return items
      .map((item) => {
        if (item.type === "separator") {
          return '<div class="context-menu-separator"></div>';
        }

        const disabledClass = item.disabled ? " disabled" : "";
        const shortcutHtml = item.shortcut
          ? `<span class="context-menu-shortcut">${item.shortcut}</span>`
          : "";
        const arrowHtml = item.children
          ? `<span class="context-menu-arrow">▸</span>`
          : "";

        return `
          <div class="context-menu-item${disabledClass}" data-action="${item.action || ""}">
            <span class="context-menu-label">${item.label}</span>
            ${shortcutHtml}${arrowHtml}
          </div>`;
      })
      .join("");
  }

  /* ==========================================================
   *  定位下拉菜单
   * ========================================================== */

  function positionDropdown(menu, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    menu.style.top = rect.bottom + 4 + "px";
    menu.style.left = Math.max(4, rect.left) + "px";
    menu.style.minWidth = "220px";
  }

  /* ==========================================================
   *  绑定菜单项动作
   * ========================================================== */

  function bindMenuActions(menuEl, items, menuType) {
    if (!menuEl) return;

    menuEl.addEventListener("click", (e) => {
      const itemEl = e.target.closest(".context-menu-item");
      if (!itemEl) return;
      if (itemEl.classList.contains("disabled")) return;

      const action = itemEl.dataset.action;
      if (!action) return;

      // 特殊动作处理
      if (action === "open-settings") {
        const app = STATE.apps["settings"];
        if (app && app.open) app.open();
      } else if (action === "close-window") {
        const wm = macOS.windowManager;
        const focused = wm && wm.getFocused();
        if (focused) wm.close(focused);
      } else if (action === "minimize") {
        const wm = macOS.windowManager;
        const focused = wm && wm.getFocused();
        if (focused) focused.minimize();
      } else if (action === "zoom") {
        const wm = macOS.windowManager;
        const focused = wm && wm.getFocused();
        if (focused) focused.toggleMaximize();
      } else if (action === "new-finder-window") {
        const app = STATE.apps["finder"];
        if (app && app.open) app.open();
      } else if (action === "new-tab") {
        if (macOS.safariApp && macOS.safariApp.addTab) {
          macOS.safariApp.addTab("start");
        }
      } else if (action === "close-tab") {
        if (macOS.safariApp && macOS.safariApp.closeActiveTab) {
          macOS.safariApp.closeActiveTab();
        }
      } else if (action === "history-back") {
        if (macOS.safariApp && macOS.safariApp.goBack) {
          macOS.safariApp.goBack();
        }
      } else if (action === "history-forward") {
        if (macOS.safariApp && macOS.safariApp.goForward) {
          macOS.safariApp.goForward();
        }
      } else if (action === "clear-screen") {
        if (macOS.terminalApp && macOS.terminalApp.clear) {
          macOS.terminalApp.clear();
        }
      } else if (action === "show-all") {
        if (macOS.settingsApp && macOS.settingsApp.showAll) {
          macOS.settingsApp.showAll();
        }
      } else if (action === "new-window") {
        // 根据当前活跃应用打开新窗口
        const app = STATE.apps[_activeAppId];
        if (app && app.open) app.open();
      }

      // 关闭菜单
      dismissAll();
    });
  }

  /* ==========================================================
   *  关闭所有菜单
   * ========================================================== */

  function dismissAll() {
    if (_activeDropdown && _activeDropdown.dismissFn) {
      _activeDropdown.dismissFn();
    }

    // 清除所有菜单项高亮
    if (DOM.menubarMenus) {
      DOM.menubarMenus.querySelectorAll(".menubar-menu-item.active").forEach((el) => {
        el.classList.remove("active");
      });
    }
    if (DOM.appleMenuBtn) {
      DOM.appleMenuBtn.classList.remove("active");
    }

    const menu = document.getElementById("context-menu");
    if (menu) {
      menu.classList.add("hidden");
      menu.innerHTML = "";
    }

    _activeDropdown = null;
  }

  /* ==========================================================
   *  切换活跃应用（当窗口聚焦变化时调用）
   * ========================================================== */

  function setActiveApp(appId) {
    if (!appId) return;
    _activeAppId = appId;

    // 同步菜单栏应用名
    if (DOM.menubarAppName) {
      const app = STATE.apps[appId];
      DOM.menubarAppName.textContent = app ? app.name : "Finder";
    }

    // 重建菜单栏菜单
    buildMenuBar(appId);
  }

  /**
   * 恢复默认（Finder 菜单）
   */
  function resetToFinder() {
    _activeAppId = "finder";
    if (DOM.menubarAppName) {
      DOM.menubarAppName.textContent = "Finder";
    }
    buildMenuBar("finder");
  }

  /* ==========================================================
   *  注册应用菜单
   * ========================================================== */

  /**
   * 注册应用的菜单定义（可选，不注册则使用 DEFAULT_MENUS）
   * @param {string} appId
   * @param {Object} menus  — { "文件": { items: [...] }, ... }
   */
  function registerAppMenus(appId, menus) {
    _appMenus[appId] = menus;
  }

  /* ==========================================================
   *  初始化
   * ========================================================== */

  function init() {
    buildMenuBar("finder");

    // Apple 菜单点击
    if (DOM.appleMenuBtn) {
      DOM.appleMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showAppleMenu();
      });
    }

    // 点击空白处关闭所有菜单
    document.addEventListener("click", (e) => {
      // 检查点击是否在菜单浮层或菜单栏按钮内
      const menu = document.getElementById("context-menu");
      const clickedInMenu = menu && menu.contains(e.target);
      const clickedInMenubar = DOM.menubar && DOM.menubar.contains(e.target);

      if (!clickedInMenu && !clickedInMenubar) {
        dismissAll();
      }
    });

    // ESC 关闭菜单
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && _activeDropdown) {
        dismissAll();
      }
    });

    console.log("Menu system initialized");
  }

  /* ==========================================================
   *  挂载到全局命名空间
   * ========================================================== */

  macOS.menu = {
    init,
    showAppleMenu,
    showAppMenu,
    dismissAll,
    setActiveApp,
    resetToFinder,
    registerAppMenus,
    getActiveApp: () => _activeAppId,
    getDefaultMenus: () => DEFAULT_MENUS,
  };

  // DOM ready 后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
