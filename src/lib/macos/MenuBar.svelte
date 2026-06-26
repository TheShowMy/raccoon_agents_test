<script>
  import { onMount, onDestroy } from 'svelte';
  import { activeAppId } from '../stores/windows.js';
  import { APP_REGISTRY } from './appRegistry.js';
  import { pendingMenuAction } from '../stores/menuActions.js';

  // --- Clock state ---
  let timeStr = '00:00';
  let clockTimer;

  function updateClock() {
    const now = new Date();
    timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  onMount(() => {
    updateClock();
    clockTimer = setInterval(() => {
      updateClock();
    }, 10000); // every 10s is enough precision
  });

  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
  });

  // --- Dropdown state ---
  let dropdownVisible = false;
  let dropdownItems = [];
  let dropdownLeft = 0;
  let activeMenuIndex = -1;

  // Get current app definition
  $: appDef = APP_REGISTRY[$activeAppId] || null;
  $: appName = appDef ? appDef.name : '访达';
  $: menus = appDef ? appDef.menus : [];
  // Some apps have first menu title same as app name; skip it in the display
  $: displayMenus = menus.filter((m, i) => !(i === 0 && m.title === appDef?.name));

  function openMenu(index) {
    // Map from displayMenus index back to original menus index
    let realIndex = index;
    if (menus.length > 0 && menus[0].title === appDef?.name) {
      realIndex = index + 1;
    }
    const menu = menus[realIndex];
    if (!menu) return;

    dropdownItems = menu.items;
    activeMenuIndex = index;
    dropdownVisible = true;
  }

  function closeMenu() {
    dropdownVisible = false;
    activeMenuIndex = -1;
  }

  function toggleMenu(index) {
    if (activeMenuIndex === index && dropdownVisible) {
      closeMenu();
    } else {
      openMenu(index);
    }
  }

  function onMenuItemClick(itemText) {
    closeMenu();
    handleMenuAction($activeAppId, itemText);
  }

  /** Dispatch menu item clicks to the active app via the pendingMenuAction store. */
  function handleMenuAction(appId, itemText) {
    pendingMenuAction.set({ appId, action: itemText });
  }

  // Close dropdown on outside click
  function onDocumentMouseDown(e) {
    if (!dropdownVisible) return;
    const dropdown = document.getElementById('menuDropdown');
    if (dropdown && dropdown.contains(e.target)) return;
    if (e.target.closest('.menu-bar__menu')) return;
    closeMenu();
  }

  // Close dropdown on Escape
  function onDocumentKeyDown(e) {
    if (e.key === 'Escape' && dropdownVisible) {
      closeMenu();
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener('mousedown', onDocumentMouseDown);
    document.removeEventListener('keydown', onDocumentKeyDown);
  });
</script>

<div class="menu-bar">
  <!-- Left: Apple + App name + Menus -->
  <div class="menu-bar__left">
    <span class="menu-bar__apple" title="Apple"></span>
    <div class="menu-bar__dynamic">
      <span class="menu-bar__menu menu-bar__menu--bold">{appName}</span>
      <div class="menu-bar__menus">
        {#each displayMenus as menu, i (menu.title)}
          <button
            type="button"
            class="menu-bar__menu"
            on:click|stopPropagation={() => toggleMenu(i)}
            on:mouseenter={() => { if (dropdownVisible) openMenu(i); }}
            on:keydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleMenu(i);
              }
            }}
          >
            {menu.title}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Right: Status icons + Time -->
  <div class="menu-bar__right">
    <span class="menu-bar__icon-wifi" title="Wi-Fi">
      <svg viewBox="0 0 16 16" fill="currentColor" opacity="0.9">
        <path d="M8 3C5.5 3 3.3 4.1 1.7 5.8L3.1 7.2C4.3 5.9 6.1 5 8 5s3.7.9 4.9 2.2l1.4-1.4C12.7 4.1 10.5 3 8 3z"/>
        <path d="M8 7C6.4 7 5 7.8 4 8.9l1.4 1.4C6 9.7 6.9 9.2 8 9.2s2 .5 2.6 1.1L12 8.9C11 7.8 9.6 7 8 7z"/>
        <circle cx="8" cy="12" r="1.5"/>
      </svg>
    </span>
    <span class="menu-bar__icon-battery" title="电池">
      <svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.9">
        <rect x="0.6" y="0.6" width="19" height="10.8" rx="2" stroke="currentColor" fill="none"/>
        <rect x="2" y="2" width="14" height="8" rx="1" fill="currentColor" opacity="0.8"/>
        <rect x="19.6" y="3.6" width="2.5" height="4.8" rx="1" fill="currentColor" opacity="0.6" stroke="none"/>
      </svg>
      <span class="menu-bar__battery-percent">85%</span>
    </span>
    <span class="menu-bar__time">{timeStr}</span>
  </div>
</div>

<!-- Dropdown Menu Panel -->
<div
  id="menuDropdown"
  class="menu-dropdown"
  class:menu-dropdown--visible={dropdownVisible}
>
  <div class="menu-dropdown__items">
    {#each dropdownItems as item, i}
      {#if item === '---'}
        <div class="menu-dropdown__item menu-dropdown__item--separator"></div>
      {:else}
        <button
          type="button"
          class="menu-dropdown__item"
          on:click|stopPropagation={() => onMenuItemClick(item)}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onMenuItemClick(item);
            }
          }}
        >
          <span class="menu-dropdown__item-label">{item}</span>
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .menu-bar {
    position: relative;
    z-index: 100;
    height: var(--menu-bar-height, 28px);
    background: var(--menu-bar-bg, var(--dock-bg));
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    flex-shrink: 0;
    color: var(--menu-bar-text, var(--window-text));
    font-size: 13px;
    line-height: 1;
    border-bottom: 1px solid var(--glass-border);
  }

  .menu-bar__left {
    display: flex;
    align-items: center;
    gap: 0;
    height: 100%;
  }

  .menu-bar__apple {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    height: 100%;
    font-size: 13px;
    color: var(--menu-bar-text, var(--window-text));
    cursor: default;
    opacity: 0.9;
  }

  .menu-bar__apple:hover {
    opacity: 1;
  }

  .menu-bar__menu {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 10px;
    height: 100%;
    color: var(--menu-bar-text, var(--window-text));
    cursor: default;
    font-weight: 500;
    opacity: 0.85;
    border-radius: 5px;
    transition: background 0.15s ease, opacity 0.15s ease;
    background: transparent;
    border: none;
    margin: 0;
    font: inherit;
  }

  .menu-bar__menu:hover {
    background: var(--glass-border);
    opacity: 1;
  }

  .menu-bar__menu:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .menu-bar__menu--bold {
    font-weight: 600;
  }

  .menu-bar__dynamic {
    display: flex;
    align-items: center;
    height: 100%;
    flex: 1;
    overflow: hidden;
  }

  .menu-bar__menus {
    display: flex;
    align-items: center;
    height: 100%;
    overflow: hidden;
  }

  .menu-bar__right {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 100%;
  }

  .menu-bar__icon-wifi {
    display: flex;
    align-items: center;
  }

  .menu-bar__icon-wifi svg {
    width: 16px;
    height: 16px;
  }

  .menu-bar__icon-battery {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .menu-bar__icon-battery svg {
    width: 22px;
    height: 12px;
  }

  .menu-bar__battery-percent {
    font-size: 11px;
    color: var(--menu-bar-text, var(--window-text));
  }

  .menu-bar__time {
    font-size: 13px;
    font-weight: 500;
    color: var(--menu-bar-text, var(--window-text));
    white-space: nowrap;
    min-width: 60px;
    text-align: right;
  }

  /* ===== Dropdown Menu Panel ===== */
  .menu-dropdown {
    position: absolute;
    top: var(--menu-bar-height, 28px);
    left: 0;
    z-index: 200;
    min-width: 240px;
    max-width: 320px;
    background: var(--glass-bg);
    backdrop-filter: blur(30px) saturate(180%);
    -webkit-backdrop-filter: blur(30px) saturate(180%);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    box-shadow:
      var(--shadow-lg),
      0 2px 8px rgba(0, 0, 0, 0.25);
    padding: 5px 0;
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    font-size: 13px;
    color: var(--window-text);
  }

  .menu-dropdown--visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .menu-dropdown__items {
    display: flex;
    flex-direction: column;
  }

  .menu-dropdown__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 18px;
    cursor: default;
    white-space: nowrap;
    line-height: 1.4;
    transition: background 0.1s ease;
    background: transparent;
    border: none;
    margin: 0;
    width: 100%;
    text-align: left;
    font: inherit;
    color: inherit;
  }

  .menu-dropdown__item:hover {
    background: var(--glass-border);
  }

  .menu-dropdown__item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .menu-dropdown__item--separator {
    height: 1px;
    margin: 4px 14px;
    background: var(--glass-border);
    padding: 0;
    pointer-events: none;
  }

  /* ===== Narrow-screen responsive handling ===== */
  @media (max-width: 768px) {
    .menu-bar {
      padding: 0 8px;
    }

    .menu-bar__battery-percent {
      display: none;
    }

    .menu-bar__menus .menu-bar__menu:nth-child(n+4) {
      display: none;
    }

    .menu-bar__menu--bold {
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  @media (max-width: 480px) {
    .menu-bar__menus .menu-bar__menu:nth-child(n+3) {
      display: none;
    }

    .menu-bar__menu--bold {
      max-width: 60px;
    }

    .menu-bar__time {
      min-width: auto;
    }
  }
</style>
