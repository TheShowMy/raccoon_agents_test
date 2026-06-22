/**
 * macOS Web Simulator — 系统设置应用
 * ============================================================
 * 模拟 macOS 系统设置面板：左侧分类侧边栏、右侧设置卡片、
 * toggle 开关、select 下拉、滑块、分段按钮等。
 * 通过 macOS.dock / macOS.menu 系统集成。
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) return;

  const { STATE } = macOS;

  /* ==========================================================
   *  状态
   * ========================================================== */

  let settingsWindow = null;
  let activeCategory = "general";
  let settingsState = {
    appearance: "auto",
    accentColor: "blue",
    showScrollBars: "auto",
    clickWallpaper: false,
    stageManager: false,
    dockMagnification: true,
    dockPosition: "bottom",
    autoHideDock: false,
    resolution: "default",
    nightShift: false,
    trueTone: true,
    outputVolume: 75,
    alertVolume: 50,
    wifiEnabled: true,
    bluetoothEnabled: true,
    airdropEnabled: true,
    lowPowerMode: false,
    batteryPercentage: true,
    deviceName: "theshow 的 MacBook Pro",
    osVersion: "macOS Sequoia 15.0",
    chip: "Apple M3 Pro",
    memory: "36 GB",
    serialNumber: "C02Z1234ABCDE",
  };

  /* ==========================================================
   *  分类定义
   * ========================================================== */

  const CATEGORIES = [
    { id: "general",    name: "通用",        icon: "⚙️" },
    { id: "appearance", name: "外观",        icon: "🎨" },
    { id: "dock",       name: "桌面与程序坞", icon: "🖥" },
    { id: "display",    name: "显示器",      icon: "🖥" },
    { id: "sound",      name: "声音",        icon: "🔊" },
    { id: "network",    name: "网络",        icon: "🌐" },
    { id: "battery",    name: "电池",        icon: "🔋" },
    { id: "about",      name: "关于本机",    icon: "ℹ️" },
  ];

  /* ==========================================================
   *  构建 HTML
   * ========================================================== */

  function buildHtml() {
    return `
<div class="settings-window">
  <div class="settings-sidebar" id="settings-sidebar">
    <div class="settings-search">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="#8e8e93" stroke-width="1.5"/>
        <line x1="11" y1="11" x2="15" y2="15" stroke="#8e8e93" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input type="text" placeholder="搜索" id="settings-search-input" autocomplete="off" />
    </div>
    <div class="settings-categories" id="settings-categories">
      ${CATEGORIES.map((cat, i) => `
        <div class="settings-category-item${i === 0 ? ' active' : ''}" data-category="${cat.id}">
          <span class="settings-category-icon">${cat.icon}</span>
          <span class="settings-category-label">${cat.name}</span>
        </div>
      `).join("")}
    </div>
  </div>
  <div class="settings-content" id="settings-content">
    <!-- 动态填充 -->
  </div>
</div>`;
  }

  /* ==========================================================
   *  渲染各分类内容
   * ========================================================== */

  function renderCategory(catId) {
    const content = document.getElementById("settings-content");
    if (!content) return;
    content.innerHTML = RENDERERS[catId] ? RENDERERS[catId]() : "<p>设置分类未找到</p>";
    bindControlEvents();
  }

  function groupCard(title, items) {
    const itemHtml = items.map((item) => {
      if (item.type === "toggle") {
        return `
          <div class="settings-row" data-setting="${item.key}">
            <div class="settings-row-left">
              <span class="settings-row-label">${item.label}</span>
              ${item.desc ? `<span class="settings-row-desc">${item.desc}</span>` : ""}
            </div>
            <div class="settings-row-right">
              <label class="settings-toggle">
                <input type="checkbox" ${settingsState[item.key] ? "checked" : ""} data-setting-key="${item.key}" />
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
          </div>`;
      }
      if (item.type === "select") {
        const opts = item.options.map(o =>
          `<option value="${o.value}" ${settingsState[item.key] === o.value ? "selected" : ""}>${o.label}</option>`
        ).join("");
        return `
          <div class="settings-row" data-setting="${item.key}">
            <div class="settings-row-left">
              <span class="settings-row-label">${item.label}</span>
            </div>
            <div class="settings-row-right">
              <select class="settings-select" data-setting-key="${item.key}">${opts}</select>
            </div>
          </div>`;
      }
      if (item.type === "slider") {
        return `
          <div class="settings-row" data-setting="${item.key}">
            <div class="settings-row-left">
              <span class="settings-row-label">${item.label}</span>
            </div>
            <div class="settings-row-right">
              <input type="range" class="settings-slider" min="${item.min || 0}" max="${item.max || 100}" value="${settingsState[item.key]}" data-setting-key="${item.key}" />
              <span class="settings-slider-value">${settingsState[item.key]}</span>
            </div>
          </div>`;
      }
      if (item.type === "info") {
        return `
          <div class="settings-row">
            <div class="settings-row-left">
              <span class="settings-row-label">${item.label}</span>
            </div>
            <div class="settings-row-right">
              <span class="settings-row-value">${item.value || settingsState[item.key] || ""}</span>
            </div>
          </div>`;
      }
      if (item.type === "mode") {
        return `
          <div class="settings-row" data-setting="${item.key}">
            <div class="settings-row-left">
              <span class="settings-row-label">${item.label}</span>
            </div>
            <div class="settings-row-right">
              <div class="settings-mode-group">
                ${item.options.map(o => `
                  <button class="settings-mode-btn${settingsState[item.key] === o.value ? ' active' : ''}" data-setting-key="${item.key}" data-value="${o.value}">${o.label}</button>
                `).join("")}
              </div>
            </div>
          </div>`;
      }
      if (item.type === "color") {
        return `
          <div class="settings-row" data-setting="${item.key}">
            <div class="settings-row-left">
              <span class="settings-row-label">${item.label}</span>
            </div>
            <div class="settings-row-right">
              <div class="settings-color-group">
                ${item.options.map(o => `
                  <button class="settings-color-dot${settingsState[item.key] === o.value ? ' active' : ''}" style="background:${o.color}" data-setting-key="${item.key}" data-value="${o.value}" title="${o.label}"></button>
                `).join("")}
              </div>
            </div>
          </div>`;
      }
      return "";
    }).join("");

    return `
      <div class="settings-group">
        <div class="settings-group-title">${title}</div>
        <div class="settings-group-body">${itemHtml}</div>
      </div>`;
  }

  const RENDERERS = {
    general() {
      return `
        <div class="settings-page-header">通用</div>
        ${groupCard("外观", [
          { type: "mode", key: "appearance", label: "外观", options: [
            { label: "浅色", value: "light" }, { label: "深色", value: "dark" }, { label: "自动", value: "auto" },
          ]},
          { type: "color", key: "accentColor", label: "强调色", options: [
            { label: "蓝色", value: "blue", color: "#007aff" },
            { label: "紫色", value: "purple", color: "#af52de" },
            { label: "粉色", value: "pink", color: "#ff2d55" },
            { label: "红色", value: "red", color: "#ff3b30" },
            { label: "橙色", value: "orange", color: "#ff9500" },
            { label: "绿色", value: "green", color: "#34c759" },
          ]},
          { type: "select", key: "showScrollBars", label: "显示滚动条", options: [
            { label: "自动", value: "auto" }, { label: "始终", value: "always" }, { label: "滚动时", value: "scroll" },
          ]},
        ])}
      `;
    },

    appearance() {
      return `
        <div class="settings-page-header">外观</div>
        ${groupCard("外观", [
          { type: "mode", key: "appearance", label: "外观模式", options: [
            { label: "浅色", value: "light" }, { label: "深色", value: "dark" }, { label: "自动", value: "auto" },
          ]},
          { type: "color", key: "accentColor", label: "强调色", options: [
            { label: "蓝色", value: "blue", color: "#007aff" },
            { label: "紫色", value: "purple", color: "#af52de" },
            { label: "绿色", value: "green", color: "#34c759" },
          ]},
        ])}
      `;
    },

    dock() {
      return `
        <div class="settings-page-header">桌面与程序坞</div>
        ${groupCard("程序坞", [
          { type: "toggle", key: "dockMagnification", label: "放大", desc: "将指针移到图标上时将其放大" },
          { type: "select", key: "dockPosition", label: "置于屏幕上的位置", options: [
            { label: "底部", value: "bottom" }, { label: "左边", value: "left" }, { label: "右边", value: "right" },
          ]},
          { type: "toggle", key: "autoHideDock", label: "自动隐藏和显示程序坞" },
        ])}
        ${groupCard("桌面与台前调度", [
          { type: "toggle", key: "clickWallpaper", label: "点按墙纸以显示桌面", desc: "仅在台前调度中" },
          { type: "toggle", key: "stageManager", label: "台前调度", desc: "自动整理 App 和窗口" },
        ])}
      `;
    },

    display() {
      return `
        <div class="settings-page-header">显示器</div>
        ${groupCard("内建显示器", [
          { type: "toggle", key: "trueTone", label: "原彩显示", desc: "根据环境光线自动调节颜色" },
          { type: "toggle", key: "nightShift", label: "夜览", desc: "将颜色调至色谱偏暖的一端" },
          { type: "select", key: "resolution", label: "分辨率", options: [
            { label: "默认", value: "default" }, { label: "更大文本", value: "larger" }, { label: "更多空间", value: "more" },
          ]},
        ])}
      `;
    },

    sound() {
      return `
        <div class="settings-page-header">声音</div>
        ${groupCard("输出", [
          { type: "slider", key: "outputVolume", label: "输出音量", min: 0, max: 100 },
          { type: "slider", key: "alertVolume", label: "提示声音量", min: 0, max: 100 },
        ])}
        ${groupCard("声音效果", [
          { type: "info", label: "所选声音设备", value: "MacBook Pro 扬声器" },
        ])}
      `;
    },

    network() {
      return `
        <div class="settings-page-header">网络</div>
        ${groupCard("连接", [
          { type: "toggle", key: "wifiEnabled", label: "Wi-Fi", desc: "已连接至 'Home-5G'" },
          { type: "toggle", key: "bluetoothEnabled", label: "蓝牙", desc: "已开启" },
          { type: "toggle", key: "airdropEnabled", label: "隔空投送", desc: "所有人" },
        ])}
        ${groupCard("状态", [
          { type: "info", label: "IP 地址", value: "192.168.1.100" },
          { type: "info", label: "路由器", value: "192.168.1.1" },
        ])}
      `;
    },

    battery() {
      return `
        <div class="settings-page-header">电池</div>
        ${groupCard("电池", [
          { type: "toggle", key: "lowPowerMode", label: "低电量模式", desc: "降低能耗以延长电池续航" },
          { type: "toggle", key: "batteryPercentage", label: "显示电池百分比", desc: "在菜单栏中显示" },
        ])}
        ${groupCard("电池健康", [
          { type: "info", label: "电池状态", value: "正常" },
          { type: "info", label: "最大容量", value: "94%" },
        ])}
      `;
    },

    about() {
      return `
        <div class="settings-page-header">关于本机</div>
        ${groupCard("设备信息", [
          { type: "info", label: "名称", value: settingsState.deviceName },
          { type: "info", label: "芯片", value: settingsState.chip },
          { type: "info", label: "内存", value: settingsState.memory },
          { type: "info", label: "序列号", value: settingsState.serialNumber },
          { type: "info", label: "系统版本", value: settingsState.osVersion },
        ])}
        ${groupCard("支持", [
          { type: "info", label: "覆盖范围", value: "有限保修 · 有效期至 2026/1/15" },
        ])}
      `;
    },
  };

  /* ==========================================================
   *  绑定控制事件
   * ========================================================== */

  function bindControlEvents() {
    const content = document.getElementById("settings-content");
    if (!content) return;

    // Toggle 开关
    content.querySelectorAll('input[type="checkbox"][data-setting-key]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const key = cb.dataset.settingKey;
        settingsState[key] = cb.checked;
      });
    });

    // Select 下拉
    content.querySelectorAll('select[data-setting-key]').forEach((sel) => {
      sel.addEventListener("change", () => {
        const key = sel.dataset.settingKey;
        settingsState[key] = sel.value;
      });
    });

    // Slider 滑块
    content.querySelectorAll('input[type="range"][data-setting-key]').forEach((rng) => {
      const update = () => {
        const key = rng.dataset.settingKey;
        settingsState[key] = parseInt(rng.value, 10);
        const valSpan = rng.parentElement.querySelector(".settings-slider-value");
        if (valSpan) valSpan.textContent = rng.value;
      };
      rng.addEventListener("input", update);
    });

    // 模式按钮
    content.querySelectorAll('.settings-mode-btn[data-setting-key]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.settingKey;
        const value = btn.dataset.value;
        settingsState[key] = value;
        // 刷新当前分类
        renderCategory(activeCategory);
      });
    });

    // 颜色圆点
    content.querySelectorAll('.settings-color-dot[data-setting-key]').forEach((dot) => {
      dot.addEventListener("click", () => {
        const key = dot.dataset.settingKey;
        const value = dot.dataset.value;
        settingsState[key] = value;
        renderCategory(activeCategory);
      });
    });
  }

  /* ==========================================================
   *  打开 / 聚焦 系统设置
   * ========================================================== */

  function openSettings() {
    if (settingsWindow) {
      const wm = macOS.windowManager;
      const existing = wm.getByAppId("settings");
      if (existing) {
        if (existing.minimized) existing._restoreMinimized();
        wm.focus(existing);
        return;
      }
      settingsWindow = null;
    }

    const wm = macOS.windowManager;

    settingsWindow = wm.create({
      title: "系统设置",
      appId: "settings",
      width: 780,
      height: 580,
      x: 200,
      y: 80,
      content: buildHtml(),
    });

    requestAnimationFrame(() => {
      renderCategory(activeCategory);
      bindSidebar();
      bindSearch();
    });
  }

  function bindSidebar() {
    if (!settingsWindow) return;
    const sidebar = settingsWindow._el.querySelector("#settings-sidebar");
    if (!sidebar) return;

    sidebar.addEventListener("click", (e) => {
      const item = e.target.closest(".settings-category-item");
      if (!item) return;

      activeCategory = item.dataset.category;
      sidebar.querySelectorAll(".settings-category-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");
      renderCategory(activeCategory);
    });
  }

  function bindSearch() {
    if (!settingsWindow) return;
    const input = settingsWindow._el.querySelector("#settings-search-input");
    if (!input) return;

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const categories = settingsWindow._el.querySelectorAll(".settings-category-item");
      categories.forEach((cat) => {
        const name = cat.querySelector(".settings-category-label")?.textContent?.toLowerCase() || "";
        cat.style.display = !q || name.includes(q) ? "" : "none";
      });
    });
  }

  /* ==========================================================
   *  注册应用
   * ========================================================== */

  function registerApp() {
    STATE.apps["settings"] = {
      name: "系统设置",
      icon: "settings",
      open: openSettings,
    };
  }

  /* ==========================================================
   *  暴露 API
   * ========================================================== */

  macOS.settingsApp = {
    open: openSettings,
    showAll() {
      activeCategory = "general";
      if (settingsWindow) {
        const sidebar = settingsWindow._el.querySelector("#settings-sidebar");
        if (sidebar) {
          sidebar.querySelectorAll(".settings-category-item").forEach(el => {
            el.classList.toggle("active", el.dataset.category === "general");
          });
        }
        renderCategory("general");
      }
    },
    getState: () => settingsState,
  };

  /* ==========================================================
   *  初始化
   * ========================================================== */

  function init() {
    registerApp();
    console.log("Settings app registered");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
