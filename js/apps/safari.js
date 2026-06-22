/**
 * macOS Web Simulator — Safari 应用
 * ============================================================
 * 模拟 Safari 浏览器：标签栏、地址栏、前进/后退/刷新、
 * 起始页收藏夹、演示页面浏览。
 *
 * 挂载于 window.__macOS.safariApp
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) {
    console.error("macOS core not initialized, Safari app aborted");
    return;
  }

  const { STATE, DOM, util } = macOS;

  /* ==========================================================
   *  内部状态
   * ========================================================== */

  /** Safari 唯一窗口引用 */
  let safariWindow = null;

  /** 标签页列表 */
  let tabs = [];

  /** 当前活动标签页索引 */
  let activeTabIndex = 0;

  /* ==========================================================
   *  演示页面数据
   * ========================================================== */

  const DEMO_PAGES = {
    "start": {
      title: "起始页",
      favicon: "🏠",
      render: renderStartPage,
    },
    "about": {
      title: "关于 Safari",
      favicon: "🦊",
      render: renderAboutPage,
    },
    "apple": {
      title: "Apple",
      favicon: "🍎",
      render: renderApplePage,
    },
    "macos": {
      title: "macOS Sequoia",
      favicon: "🖥",
      render: renderMacOSPage,
    },
  };

  /* ==========================================================
   *  起始页（Safari 风格收藏夹）
   * ========================================================== */

  function renderStartPage() {
    const timeOfDay = new Date().getHours();
    const greeting = timeOfDay < 12 ? "上午好" : timeOfDay < 18 ? "下午好" : "晚上好";

    return `
<div class="safari-start-page">
  <div class="safari-start-header">
    <h2>${greeting}</h2>
  </div>

  <div class="safari-start-search" id="safari-start-search-input-wrapper">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="#8e8e93" stroke-width="1.8"/>
      <line x1="11" y1="11" x2="15" y2="15" stroke="#8e8e93" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <input type="text" placeholder="搜索或输入网站名称" id="safari-start-search-input" autocomplete="off" />
  </div>

  <div class="safari-favorites-section">
    <div class="section-label">个人收藏</div>
    <div class="safari-favorites-grid">
      ${buildFavItem("about", "🦊", "#007aff", "关于 Safari")}
      ${buildFavItem("apple", "🍎", "#1d1d1f", "Apple")}
      ${buildFavItem("macos", "🖥", "#5856d6", "macOS Sequoia")}
      ${buildFavItem("", "🌐", "#ff6b35", "WebKit.org")}
      ${buildFavItem("", "📖", "#34c759", "开发者文档")}
      ${buildFavItem("", "🎨", "#ff2d55", "设计资源")}
      ${buildFavItem("", "🔒", "#007aff", "隐私报告")}
      ${buildFavItem("", "⚙️", "#8e8e93", "Safari 扩展")}
    </div>
  </div>

  <div class="safari-privacy-section">
    <div class="section-label">隐私报告</div>
    <div class="safari-privacy-card">
      <div class="safari-privacy-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1C5.5 1 3 2.5 2 5c0 3 1.5 7.5 6 10 4.5-2.5 6-7 6-10-1-2.5-3.5-4-6-4z"/>
          <path d="M6.5 7.5l1.5 1.5 3-3" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="safari-privacy-text">
        <div class="privacy-title">在上次浏览中，Safari 阻止了 0 个跟踪器对你进行画像。</div>
        <div class="privacy-subtitle">智能防跟踪 · 每周报告</div>
      </div>
    </div>
  </div>
</div>`;
  }

  function buildFavItem(pageId, emoji, bgColor, name) {
    if (pageId && DEMO_PAGES[pageId]) {
      return `
<div class="safari-fav-item" data-safari-page="${pageId}" title="${name}">
  <div class="safari-fav-icon" style="background: ${bgColor}; font-size:20px;">${emoji}</div>
  <div class="safari-fav-name">${name}</div>
</div>`;
    }
    return `
<div class="safari-fav-item" title="${name}">
  <div class="safari-fav-icon" style="background: ${bgColor}; font-size:20px;">${emoji}</div>
  <div class="safari-fav-name">${name}</div>
</div>`;
  }

  /* ==========================================================
   *  关于 Safari 页面
   * ========================================================== */

  function renderAboutPage() {
    return `
<div class="safari-about">
  <div class="about-icon">
    <svg width="40" height="40" viewBox="0 0 44 44">
      <circle cx="20" cy="22" r="16" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="20" cy="22" r="7" fill="none" stroke="#fff" stroke-width="2"/>
      <line x1="35" y1="10" x2="28" y2="16" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="20" y1="2" x2="20" y2="8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  </div>
  <h1>Safari</h1>
  <p class="version">版本 18.0 (20619.1.26.11)</p>
  <div style="margin: 24px 0;">
    <p style="font-size:14px;color:#3a3a3c;line-height:1.7;">
      Safari 是 Apple 开发的网页浏览器，是 macOS、iOS、iPadOS 和 visionOS 上的默认浏览器。
      它基于 WebKit 引擎，提供快速、高效且节能的浏览体验。
    </p>
  </div>
  <dl class="specs">
    <dt>WebKit 引擎</dt>
    <dd>619.1.26.11</dd>
    <dt>JavaScript 引擎</dt>
    <dd>JavaScriptCore</dd>
    <dt>用户代理</dt>
    <dd style="font-size:10px;word-break:break-all;">Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15</dd>
    <dt>W3C 标准</dt>
    <dd>HTML5 · CSS3 · ES2024</dd>
  </dl>
</div>`;
  }

  /* ==========================================================
   *  Apple 风格页面
   * ========================================================== */

  function renderApplePage() {
    return `
<div class="safari-page">
  <h1>🍎 Apple</h1>
  <p>欢迎访问 Apple 演示页面。Apple 致力于创造卓越的产品，丰富用户的生活。</p>

  <div class="demo-grid">
    <div class="demo-card">
      <h3>Mac</h3>
      <p>搭载 Apple 芯片的 Mac 笔记本电脑和台式机，性能强劲，续航持久。</p>
    </div>
    <div class="demo-card">
      <h3>iPhone</h3>
      <p>iPhone 16 Pro，全新相机控制系统，A18 Pro 芯片。</p>
    </div>
    <div class="demo-card">
      <h3>iPad</h3>
      <p>iPad Pro 配备 M4 芯片和 Ultra Retina XDR 显示屏。</p>
    </div>
    <div class="demo-card">
      <h3>Vision Pro</h3>
      <p>Apple Vision Pro 将数字内容无缝融入真实世界。</p>
    </div>
  </div>
  <p style="margin-top:16px; font-size:13px;color:#8e8e93;">此页面为本地演示内容，非 Apple 官方网站。</p>
</div>`;
  }

  /* ==========================================================
   *  macOS Sequoia 页面
   * ========================================================== */

  function renderMacOSPage() {
    return `
<div class="safari-page">
  <h1>🖥 macOS Sequoia</h1>
  <p>macOS Sequoia 带来全新的连续互通功能、更智能的 Safari 浏览器，以及令人沉浸的游戏体验。</p>

  <h2>亮点功能</h2>
  <div class="demo-card">
    <h3>iPhone 镜像</h3>
    <p>直接在 Mac 上完全访问和控制你的 iPhone，无需解锁 iPhone。</p>
  </div>
  <div class="demo-card">
    <h3>Safari 浏览器</h3>
    <p>Highlights 功能让你快速发现网页中的有用信息；阅读器经过重新设计，提供更沉浸的阅读体验。</p>
  </div>
  <div class="demo-card">
    <h3>密码 App</h3>
    <p>全新密码应用，集中管理你的密码、通行密钥、验证码和 Wi-Fi 密码。</p>
  </div>
  <div class="demo-card">
    <h3>窗口平铺</h3>
    <p>将窗口拖到屏幕边缘，自动调整大小并填充可用空间，多任务处理更高效。</p>
  </div>

  <h2>兼容性</h2>
  <p style="font-size:13px;color:#636366;">
    macOS Sequoia 兼容以下 Mac 机型：
    iMac (2019 年及后续机型)、Mac Pro (2019 年及后续机型)、
    iMac Pro (2017 年机型)、Mac Studio (2022 年及后续机型)、
    MacBook Air (2020 年及后续机型)、Mac mini (2018 年及后续机型)、
    MacBook Pro (2018 年及后续机型)。
  </p>
</div>`;
  }

  /* ==========================================================
   *  Safari 浏览器内部 HTML 模板
   * ========================================================== */

  function buildSafariContent() {
    return `
<div class="safari-container">
  <div class="safari-loading-bar" id="safari-loading-bar" style="width:0;"></div>
  <div class="safari-tab-bar">
    <div class="safari-tabs" id="safari-tabs"></div>
    <button class="safari-new-tab-btn" id="safari-new-tab-btn" title="新建标签页">+</button>
    <button class="safari-tab-overflow" id="safari-tab-overflow-btn" title="标签页概览">☰</button>
  </div>
  <div class="safari-toolbar">
    <div class="safari-nav-buttons">
      <button class="safari-nav-btn disabled" id="safari-back-btn" title="后退">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 3L5.5 8l5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="safari-nav-btn disabled" id="safari-forward-btn" title="前进">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3l5 5-5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="safari-nav-btn" id="safari-refresh-btn" title="刷新页面">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a6 6 0 0111.5-2M14 8a6 6 0 01-11.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline points="13,2 14,4 12,4" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="safari-address-bar">
      <span class="safari-url-icon">
        <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" stroke="#8e8e93" stroke-width="1.4" fill="none"/><path d="M2 8h12M8 2c1.5 2 2.5 4 2.5 6S9.5 14 8 14c-1.5 0-2.5-4-2.5-6S6.5 2 8 2z" stroke="#8e8e93" stroke-width="1" fill="none"/></svg>
      </span>
      <input type="text" id="safari-address-input" placeholder="搜索或输入网站名称" autocomplete="off" spellcheck="false" />
    </div>
    <button class="safari-share-btn" id="safari-share-btn" title="分享">
      <svg viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="3" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M10 6l4-3-4-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
  <div class="safari-webview" id="safari-webview"></div>
  <div class="safari-status-bar" id="safari-status-bar">
    <span id="safari-status-text"></span>
    <span id="safari-status-loading"></span>
  </div>
</div>`;
  }

  /* ==========================================================
   *  标签页管理
   * ========================================================== */

  function createTab(pageId, url) {
    const pageInfo = DEMO_PAGES[pageId] || null;
    return {
      id: util.uid("tab"),
      pageId: pageId || "start",
      url: url || "",
      title: pageInfo ? pageInfo.title : (url || "无标题"),
      favicon: pageInfo ? pageInfo.favicon : "🌐",
      history: [],
      historyIndex: -1,
    };
  }

  function addTab(pageId, url, switchTo) {
    const tab = createTab(pageId, url);
    tabs.push(tab);
    const idx = tabs.length - 1;
    if (switchTo !== false) {
      switchTab(idx);
    }
    renderTabs();
    return tab;
  }

  function closeTab(index) {
    if (tabs.length <= 1) return;
    const wasActive = index === activeTabIndex;
    tabs.splice(index, 1);
    if (wasActive) {
      if (index >= tabs.length) activeTabIndex = tabs.length - 1;
      else activeTabIndex = index;
    } else if (index < activeTabIndex) {
      activeTabIndex--;
    }
    renderTabs();
    renderCurrentTab();
  }

  function switchTab(index) {
    if (index < 0 || index >= tabs.length) return;
    activeTabIndex = index;
    renderTabs();
    renderCurrentTab();
  }

  function renderTabs() {
    const container = safariEl("#safari-tabs");
    if (!container) return;

    container.innerHTML = tabs
      .map((tab, i) => {
        const cls = i === activeTabIndex ? " active" : "";
        return `
<div class="safari-tab${cls}" data-tab-index="${i}">
  <span class="tab-favicon">${tab.favicon}</span>
  <span class="tab-title">${htmlEscape(tab.title)}</span>
  ${tabs.length > 1 ? '<button class="tab-close" data-tab-close="' + i + '">✕</button>' : ''}
</div>`;
      })
      .join("");

    container.querySelectorAll(".safari-tab").forEach((tabEl) => {
      tabEl.addEventListener("click", (e) => {
        if (e.target.closest("[data-tab-close]")) return;
        const idx = parseInt(tabEl.dataset.tabIndex);
        switchTab(idx);
      });
    });

    container.querySelectorAll("[data-tab-close]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.tabClose);
        closeTab(idx);
      });
    });

    updateNavButtons();
  }

  /* ==========================================================
   *  当前标签页渲染
   * ========================================================== */

  function renderCurrentTab() {
    const tab = tabs[activeTabIndex];
    if (!tab) return;

    const webview = safariEl("#safari-webview");
    if (!webview) return;

    simulateLoading();

    const pageInfo = DEMO_PAGES[tab.pageId];
    if (pageInfo && pageInfo.render) {
      webview.innerHTML = pageInfo.render();
    } else {
      webview.innerHTML = `<div class="safari-page"><h1>🌐 ${htmlEscape(tab.title)}</h1><p>${htmlEscape(tab.url || '欢迎访问此页面。')}</p></div>`;
    }

    if (safariWindow) {
      const title = tab.pageId === "start" ? "Safari" : (pageInfo ? pageInfo.title + " — Safari" : tab.title + " — Safari");
      safariWindow.setTitle(title);
    }

    const addrInput = safariEl("#safari-address-input");
    if (addrInput) {
      if (tab.pageId === "start") {
        addrInput.value = "";
        addrInput.placeholder = "搜索或输入网站名称";
      } else {
        addrInput.value = tab.url || tab.pageId;
      }
    }

    const statusText = safariEl("#safari-status-text");
    if (statusText) {
      if (tab.url) {
        statusText.textContent = tab.url;
      } else if (tab.pageId && tab.pageId !== "start") {
        statusText.textContent = "safari-demo://" + tab.pageId;
      } else {
        statusText.textContent = "";
      }
    }

    bindPageEvents();
    updateNavButtons();
  }

  /** 模拟加载进度条动画 */
  function simulateLoading() {
    const bar = safariEl("#safari-loading-bar");
    if (!bar) return;
    bar.style.transition = "none";
    bar.style.width = "0";
    requestAnimationFrame(() => {
      bar.style.transition = "width 0.6s ease-out";
      bar.style.width = "35%";
      setTimeout(() => {
        bar.style.transition = "width 0.4s ease-out";
        bar.style.width = "70%";
      }, 200);
      setTimeout(() => {
        bar.style.transition = "width 0.3s ease-out";
        bar.style.width = "100%";
      }, 500);
      setTimeout(() => {
        bar.style.transition = "none";
        bar.style.width = "0";
      }, 700);
    });
  }

  function updateNavButtons() {
    const tab = tabs[activeTabIndex];
    const backBtn = safariEl("#safari-back-btn");
    const fwdBtn = safariEl("#safari-forward-btn");

    if (backBtn) {
      backBtn.classList.toggle("disabled", !tab || tab.historyIndex <= 0);
    }
    if (fwdBtn) {
      fwdBtn.classList.toggle("disabled", !tab || tab.historyIndex >= tab.history.length - 1);
    }
  }

  /* ==========================================================
   *  页面内事件绑定
   * ========================================================== */

  function bindPageEvents() {
    // 收藏夹点击导航
    document.querySelectorAll(".safari-fav-item[data-safari-page]").forEach((item) => {
      item.addEventListener("click", () => {
        const pageId = item.dataset.safariPage;
        if (pageId && DEMO_PAGES[pageId]) {
          navigateTo(pageId, pageId);
        }
      });
    });

    // 起始页搜索框 Enter 导航
    const startSearchInput = safariEl("#safari-start-search-input");
    if (startSearchInput) {
      startSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const val = startSearchInput.value.trim();
          if (val) navigateTo("", val, val);
        }
      });
    }

    // 搜索框包装器点击聚焦
    const startSearchWrapper = safariEl("#safari-start-search-input-wrapper");
    if (startSearchWrapper) {
      startSearchWrapper.addEventListener("click", () => {
        const inp = safariEl("#safari-start-search-input");
        if (inp) inp.focus();
      });
    }
  }

  /* ==========================================================
   *  导航（含历史记录）
   * ========================================================== */

  function navigateTo(pageId, url, title) {
    const tab = tabs[activeTabIndex];
    if (!tab) return;

    // 保存当前到历史
    if (tab.pageId || tab.url) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push({ pageId: tab.pageId, url: tab.url, title: tab.title });
      tab.historyIndex = tab.history.length - 1;
    }

    tab.pageId = pageId || "";
    tab.url = url || "";
    tab.title = title || (DEMO_PAGES[pageId] && DEMO_PAGES[pageId].title) || url || "无标题";
    tab.favicon = (DEMO_PAGES[pageId] && DEMO_PAGES[pageId].favicon) || "🌐";

    renderTabs();
    renderCurrentTab();
  }

  function goBack() {
    const tab = tabs[activeTabIndex];
    if (!tab || tab.historyIndex <= 0) return;

    tab.history[tab.historyIndex] = { pageId: tab.pageId, url: tab.url, title: tab.title };
    tab.historyIndex--;
    const hist = tab.history[tab.historyIndex];
    tab.pageId = hist.pageId;
    tab.url = hist.url;
    tab.title = hist.title;
    tab.favicon = (DEMO_PAGES[hist.pageId] && DEMO_PAGES[hist.pageId].favicon) || "🌐";

    renderTabs();
    renderCurrentTab();
  }

  function goForward() {
    const tab = tabs[activeTabIndex];
    if (!tab || tab.historyIndex >= tab.history.length - 1) return;

    tab.history[tab.historyIndex] = { pageId: tab.pageId, url: tab.url, title: tab.title };
    tab.historyIndex++;
    const hist = tab.history[tab.historyIndex];
    tab.pageId = hist.pageId;
    tab.url = hist.url;
    tab.title = hist.title;
    tab.favicon = (DEMO_PAGES[hist.pageId] && DEMO_PAGES[hist.pageId].favicon) || "🌐";

    renderTabs();
    renderCurrentTab();
  }

  /* ==========================================================
   *  工具栏事件绑定
   * ========================================================== */

  function bindToolbarEvents() {
    // 新建标签页
    const newTabBtn = safariEl("#safari-new-tab-btn");
    if (newTabBtn) newTabBtn.addEventListener("click", () => addTab("start"));

    // 标签页概览按钮（循环切换）
    const overflowBtn = safariEl("#safari-tab-overflow-btn");
    if (overflowBtn) {
      overflowBtn.addEventListener("click", () => {
        if (tabs.length > 1) {
          const idx = activeTabIndex === tabs.length - 1 ? 0 : tabs.length - 1;
          switchTab(idx);
        }
      });
    }

    // 后退 / 前进 / 刷新
    const backBtn = safariEl("#safari-back-btn");
    if (backBtn) backBtn.addEventListener("click", () => goBack());

    const fwdBtn = safariEl("#safari-forward-btn");
    if (fwdBtn) fwdBtn.addEventListener("click", () => goForward());

    const refreshBtn = safariEl("#safari-refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => renderCurrentTab());

    // 地址栏回车导航
    const addrInput = safariEl("#safari-address-input");
    if (addrInput) {
      addrInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const val = addrInput.value.trim();
          if (!val) return;
          if (DEMO_PAGES[val]) {
            navigateTo(val, val);
          } else {
            navigateTo("", val, val);
          }
        }
      });
      addrInput.addEventListener("click", () => addrInput.select());
    }

    // 分享按钮
    const shareBtn = safariEl("#safari-share-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", () => {
        const tab = tabs[activeTabIndex];
        const pageName = tab ? (tab.title || tab.url || "当前页面") : "当前页面";
        const statusText = safariEl("#safari-status-text");
        if (statusText) {
          const original = statusText.textContent;
          statusText.textContent = `已复制「${pageName}」的链接`;
          setTimeout(() => { statusText.textContent = original; }, 2000);
        }
      });
    }

    // Cmd+T / Cmd+W 快捷键
    document.addEventListener("keydown", (e) => {
      if (!safariWindow || !safariWindow.focused) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        addTab("start");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (tabs.length > 1) closeTab(activeTabIndex);
      }
    });
  }

  /* ==========================================================
   *  帮助函数
   * ========================================================== */

  function safariEl(selector) {
    if (!safariWindow) return null;
    const winEl = safariWindow.getElement();
    if (!winEl) return null;
    return winEl.querySelector(selector);
  }

  function htmlEscape(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ==========================================================
   *  打开 / 聚焦 Safari 窗口
   * ========================================================== */

  function openSafari() {
    // 已有窗口——聚焦或恢复
    if (safariWindow) {
      const wm = macOS.windowManager;
      const existing = wm.getByAppId("safari");
      if (existing) {
        if (existing.minimized) existing._restoreMinimized();
        wm.focus(existing);
        return;
      }
      // 窗口已被外部关闭，重置状态
      safariWindow = null;
      tabs = [];
      activeTabIndex = 0;
    }

    const wm = macOS.windowManager;

    tabs = [];
    activeTabIndex = 0;
    tabs.push(createTab("start"));

    const win = wm.create({
      title: "Safari",
      appId: "safari",
      width: 860,
      height: 580,
      x: 160,
      y: 80,
      content: buildSafariContent(),
    });

    safariWindow = win;

    // 等待 DOM 挂载后初始化交互
    requestAnimationFrame(() => {
      renderTabs();
      renderCurrentTab();
      bindToolbarEvents();

      setTimeout(() => {
        const addrInput = safariEl("#safari-address-input");
        if (addrInput) addrInput.focus();
      }, 100);
    });
  }

  /* ==========================================================
   *  Dock 图标点击
   * ========================================================== */

  function initDockHandler() {
    if (!DOM.dockInner) return;

    DOM.dockInner.addEventListener("click", (e) => {
      const icon = e.target.closest(".dock-icon");
      if (!icon) return;
      if (icon.dataset.appId === "safari") {
        openSafari();
      }
    });
  }

  /* ==========================================================
   *  注册应用
   * ========================================================== */

  function registerApp() {
    STATE.apps.safari = {
      name: "Safari",
      icon: "safari",
      open: openSafari,
    };
  }

  /* ==========================================================
   *  暴露 API
   * ========================================================== */

  macOS.safariApp = {
    open: openSafari,
    getTabs: () => tabs,
    getActiveTab: () => tabs[activeTabIndex] || null,
  };

  /* ==========================================================
   *  初始化
   * ========================================================== */

  function init() {
    registerApp();
    initDockHandler();
    console.log("Safari app registered");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
