<script>
  import { onMount } from 'svelte';
  import { pendingMenuAction } from '../../stores/menuActions.js';
  import { ROOT_FOLDER, SIDEBAR_FAVORITES, SIDEBAR_TAGS, resolvePath } from '../../data/finderData.js';

  /** @type {{ id: string, appId: string }} */
  export let win;

  // --- Navigation state ---
  /** @type {string[][]} */
  let historyStack = [[]];
  let historyIndex = 0;

  /** @type {string[]} */
  let currentPath = [];

  /** @type {string} */
  let selectedItem = null;

  /** @type {boolean} */
  let sidebarVisible = true;

  /** @type {string} */
  let activeSidebar = 'Macintosh HD';

  // --- Derived: current items ---
  $: currentFolder = resolvePath(ROOT_FOLDER, currentPath);
  $: items = currentFolder?.children || [];

  $: canGoBack = historyIndex > 0;
  $: canGoForward = historyIndex < historyStack.length - 1;

  /** @type {string} */
  function getCurrentTitle() {
    if (currentPath.length === 0) return 'Macintosh HD';
    return currentPath[currentPath.length - 1];
  }

  /** @type {string} */
  function getFullPath() {
    if (currentPath.length === 0) return '/';
    return '/' + currentPath.join('/');
  }

  // --- Navigation ---

  /** @param {import('../../data/finderData.js').FinderEntry} item */
  function openItem(item) {
    if (!item.isFolder) return;
    setCurrentPath([...currentPath, item.name]);
  }

  /** @param {string[]} path */
  function setCurrentPath(path) {
    // Trim trailing items from history if we're not at the end
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push([...path]);
    historyIndex = historyStack.length - 1;
    currentPath = [...path];
    selectedItem = null;
  }

  function goBack() {
    if (!canGoBack) return;
    historyIndex--;
    currentPath = [...historyStack[historyIndex]];
    selectedItem = null;
  }

  function goForward() {
    if (!canGoForward) return;
    historyIndex++;
    currentPath = [...historyStack[historyIndex]];
    selectedItem = null;
  }

  // --- Sidebar navigation ---
  /** @param {{ label: string, path: string[] }} fav */
  function navigateToSidebar(fav) {
    activeSidebar = fav.label;
    setCurrentPath([...fav.path]);
  }

  // --- New folder ---
  let newFolderCount = 0;

  function createNewFolder() {
    newFolderCount++;
    const name = newFolderCount === 1 ? '未命名文件夹' : `未命名文件夹 ${newFolderCount}`;
    if (currentFolder && currentFolder.children) {
      currentFolder.children.push({ name, isFolder: true, children: [] });
      // Trigger reactivity by reassigning
      items = currentFolder.children;
    }
  }

  // --- Menu action handling ---
  function handleMenuAction(action) {
    switch (action) {
      case '新建文件夹':
        createNewFolder();
        break;
      case '打开':
        if (selectedItem) {
          const found = items.find(i => i.name === selectedItem);
          if (found && found.isFolder) {
            openItem(found);
          }
        }
        break;
      case '新 Finder 窗口':
        // No-op: single window
        break;
      default:
        break;
    }
  }

  // Subscribe to menu actions
  $: if ($pendingMenuAction && $pendingMenuAction.appId === win.appId) {
    handleMenuAction($pendingMenuAction.action);
    pendingMenuAction.set(null);
  }
</script>

<div class="finder">
  <!-- Sidebar -->
  {#if sidebarVisible}
    <aside class="finder__sidebar">
      <div class="finder__sidebar-section">
        <div class="finder__sidebar-header">个人收藏</div>
        {#each SIDEBAR_FAVORITES as fav}
          <button
            class="finder__sidebar-item"
            class:finder__sidebar-item--active={activeSidebar === fav.label}
            on:click={() => navigateToSidebar(fav)}
          >
            <span class="finder__sidebar-icon finder__sidebar-folder-icon">
              <svg viewBox="0 0 16 14" width="14" height="14" fill="currentColor">
                <path d="M1 2.5C1 1.67 1.67 1 2.5 1h3.59c.4 0 .78.16 1.06.44l.91.91c.28.28.66.44 1.06.44H13.5c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 011 11.5V2.5z"/>
              </svg>
            </span>
            <span class="finder__sidebar-label">{fav.label}</span>
          </button>
        {/each}
      </div>
      <div class="finder__sidebar-divider"></div>
      <div class="finder__sidebar-section">
        <div class="finder__sidebar-header">标签</div>
        {#each SIDEBAR_TAGS as tag}
          <span class="finder__sidebar-item finder__sidebar-tag">
            <span class="finder__tag-dot" style="background: {tag.color};"></span>
            <span class="finder__sidebar-label">{tag.label}</span>
          </span>
        {/each}
      </div>
    </aside>
  {/if}

  <!-- Main Content -->
  <div class="finder__main">
    <!-- Toolbar -->
    <div class="finder__toolbar">
      <div class="finder__toolbar-nav">
        <button
          class="finder__toolbar-btn"
          class:finder__toolbar-btn--disabled={!canGoBack}
          on:click={goBack}
          title="返回"
          disabled={!canGoBack}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M12 16l-6-6 6-6" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
        <button
          class="finder__toolbar-btn"
          class:finder__toolbar-btn--disabled={!canGoForward}
          on:click={goForward}
          title="前进"
          disabled={!canGoForward}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M8 4l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
      </div>
      <div class="finder__toolbar-path">
        <button class="finder__toolbar-title-btn" on:click={() => setCurrentPath([])}>
          {getCurrentTitle()}
        </button>
      </div>
      <div class="finder__toolbar-view-options">
        <button
          class="finder__toolbar-btn"
          on:click={createNewFolder}
          title="新建文件夹"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M1 4.5C1 3.67 1.67 3 2.5 3h4.09c.4 0 .78.16 1.06.44l.91.91c.28.28.66.44 1.06.44H17.5c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5h-15A1.5 1.5 0 011 13.5V4.5z"/>
            <path d="M9 9v-2h2v2h2v2h-2v2H9v-2H7V9h2z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Path bar -->
    <div class="finder__path-bar">{getFullPath()}</div>

    <!-- File grid -->
    <div class="finder__files">
      {#if items.length === 0}
        <div class="finder__empty">
          <span class="finder__empty-icon">
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25">
              <rect x="4" y="10" width="32" height="24" rx="3"/>
              <path d="M4 16h32"/>
            </svg>
          </span>
          <span class="finder__empty-text">空文件夹</span>
        </div>
      {:else}
        {#each items as item}
          <button
            class="finder__file-item"
            class:finder__file-item--selected={selectedItem === item.name}
            on:dblclick={() => openItem(item)}
            on:click={() => { selectedItem = item.name; }}
          >
            {#if item.isFolder}
              <span class="finder__file-icon">
                <svg viewBox="0 0 20 17" width="36" height="32" fill="#4a9eff">
                  <path d="M1 3.5C1 2.67 1.67 2 2.5 2h4.59c.4 0 .78.16 1.06.44l.91.91c.28.28.66.44 1.06.44H17.5c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5h-15A1.5 1.5 0 011 12.5V3.5z"/>
                </svg>
              </span>
            {:else}
              <span class="finder__file-icon">
                <svg viewBox="0 0 20 23" width="30" height="32" fill="none" stroke="#8e8e93" stroke-width="1.5">
                  <path d="M3 1h8l6 6v14a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z"/>
                  <path d="M11 1v6h6" stroke="#8e8e93" stroke-width="1.5" fill="none"/>
                </svg>
              </span>
            {/if}
            <span class="finder__file-name">{item.name}</span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .finder {
    display: flex;
    height: 100%;
    background: rgba(35, 35, 38, 0.85);
    color: #e0e0e0;
    font-size: 12px;
    user-select: none;
    overflow: hidden;
  }

  /* ===== Sidebar ===== */
  .finder__sidebar {
    width: 150px;
    min-width: 150px;
    background: rgba(0, 0, 0, 0.15);
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    padding: 8px 0;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .finder__sidebar::-webkit-scrollbar {
    width: 4px;
  }

  .finder__sidebar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .finder__sidebar-section {
    padding: 0 8px;
  }

  .finder__sidebar-header {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px 6px;
  }

  .finder__sidebar-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border-radius: 5px;
    cursor: default;
    background: none;
    border: none;
    color: inherit;
    font-size: 12px;
    text-align: left;
    transition: background 0.1s ease;
  }

  .finder__sidebar-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .finder__sidebar-item--active {
    background: rgba(74, 158, 255, 0.25);
    color: #fff;
  }

  .finder__sidebar-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .finder__sidebar-folder-icon {
    color: #4a9eff;
    opacity: 0.85;
  }

  .finder__sidebar-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .finder__sidebar-divider {
    height: 1px;
    margin: 6px 16px;
    background: rgba(255, 255, 255, 0.08);
  }

  .finder__sidebar-tag {
    cursor: default;
    pointer-events: none;
  }

  .finder__tag-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ===== Main Content ===== */
  .finder__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  /* ===== Toolbar ===== */
  .finder__toolbar {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 10px;
    gap: 8px;
    background: rgba(0, 0, 0, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .finder__toolbar-nav {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .finder__toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 5px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
    flex-shrink: 0;
  }

  .finder__toolbar-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .finder__toolbar-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .finder__toolbar-btn--disabled {
    opacity: 0.3;
    cursor: default;
    pointer-events: none;
  }

  .finder__toolbar-path {
    flex: 1;
    text-align: center;
    min-width: 0;
  }

  .finder__toolbar-title-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 10px;
    border-radius: 4px;
    transition: background 0.1s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .finder__toolbar-title-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .finder__toolbar-view-options {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  /* ===== Path Bar ===== */
  .finder__path-bar {
    height: 22px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    background: rgba(0, 0, 0, 0.04);
    flex-shrink: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== File Grid ===== */
  .finder__files {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 8px;
    align-content: start;
  }

  .finder__files::-webkit-scrollbar {
    width: 6px;
  }

  .finder__files::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .finder__file-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: center;
    transition: background 0.1s ease;
    min-width: 0;
  }

  .finder__file-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .finder__file-item--selected {
    background: rgba(74, 158, 255, 0.2);
  }

  .finder__file-item--selected:hover {
    background: rgba(74, 158, 255, 0.25);
  }

  .finder__file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 40px;
    flex-shrink: 0;
    pointer-events: none;
  }

  .finder__file-name {
    font-size: 11px;
    line-height: 1.2;
    word-break: break-all;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    max-width: 100%;
    pointer-events: none;
  }

  /* ===== Empty State ===== */
  .finder__empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px 0;
    color: rgba(255, 255, 255, 0.3);
  }

  .finder__empty-icon {
    opacity: 0.4;
  }

  .finder__empty-text {
    font-size: 13px;
    font-weight: 500;
  }
</style>
