<script>
  import { APP_REGISTRY } from './appRegistry.js';
  import { focusedWindowId, focusWindow, closeWindow, toggleMinimize, toggleMaximize, moveWindow, resizeWindow } from '../stores/windows.js';

  /** @type {{ id: string, appId: string, title: string, x: number, y: number, width: number, height: number, zIndex: number, minimized: boolean, maximized: boolean }} */
  export let win;

  // --- Drag state ---
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let winStartX = 0;
  let winStartY = 0;

  // --- Resize state ---
  let isResizing = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let winStartW = 0;
  let winStartH = 0;

  // --- Refs ---
  let winEl;

  function handleMouseDown(e) {
    focusWindow(win.id);
  }

  // ----- Title bar drag -----
  function onDragStart(e) {
    if (e.target.closest('.window__tl')) return;
    if (win.minimized || win.maximized) return;

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    winStartX = win.x;
    winStartY = win.y;

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    const parent = winEl?.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();

    let newX = winStartX + dx;
    let newY = winStartY + dy;
    newX = Math.max(-200, Math.min(newX, parentRect.width - 120));
    newY = Math.max(0, Math.min(newY, parentRect.height - 24));

    moveWindow(win.id, newX, newY);
  }

  function onDragEnd() {
    isDragging = false;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }

  // ----- Resize handle -----
  function onResizeStart(e) {
    if (win.minimized || win.maximized) return;

    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    winStartW = win.width;
    winStartH = win.height;

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
    e.preventDefault();
    e.stopPropagation();
  }

  function onResizeMove(e) {
    if (!isResizing) return;
    const dx = e.clientX - resizeStartX;
    const dy = e.clientY - resizeStartY;
    resizeWindow(win.id, Math.max(280, winStartW + dx), Math.max(180, winStartH + dy));
  }

  function onResizeEnd() {
    isResizing = false;
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  }

  // Cleanup event listeners on destroy
  import { onDestroy } from 'svelte';

  onDestroy(() => {
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  });

  // --- Compute app component ---
  $: appDef = APP_REGISTRY[win.appId];
  $: AppComponent = appDef?.component || null;
  $: placeholderHtml = appDef && !appDef.component ? appDef.placeholder() : '';
</script>

<div
  bind:this={winEl}
  class="window"
  class:window--focused={win.id === $focusedWindowId}
  class:window--minimized={win.minimized}
  class:window--maximized={win.maximized}
  style="
    left: {win.maximized ? 0 : win.x}px;
    top: {win.maximized ? 0 : win.y}px;
    width: {win.maximized ? '100%' : win.width + 'px'};
    height: {win.maximized ? '100%' : win.height + 'px'};
    z-index: {win.zIndex};
  "
  on:mousedown={handleMouseDown}
>
  <!-- Title Bar -->
  <div class="window__titlebar" on:mousedown={onDragStart}>
    <div class="window__traffic-lights">
      <button class="window__tl window__tl--close" title="关闭"
        on:mousedown={e => e.stopPropagation()}
        on:click={() => closeWindow(win.id)}>
        <svg width="7" height="7" viewBox="0 0 7 7">
          <line x1="0.5" y1="0.5" x2="6.5" y2="6.5" stroke="#4a0000" stroke-width="1.2"/>
          <line x1="6.5" y1="0.5" x2="0.5" y2="6.5" stroke="#4a0000" stroke-width="1.2"/>
        </svg>
      </button>
      <button class="window__tl window__tl--minimize" title="最小化"
        on:mousedown={e => e.stopPropagation()}
        on:click={() => toggleMinimize(win.id)}>
        <svg width="7" height="7" viewBox="0 0 7 7">
          <line x1="1" y1="3.5" x2="6" y2="3.5" stroke="#7a5500" stroke-width="1.2"/>
        </svg>
      </button>
      <button class="window__tl window__tl--maximize" title="最大化"
        on:mousedown={e => e.stopPropagation()}
        on:click={() => toggleMaximize(win.id)}>
        <svg width="7" height="7" viewBox="0 0 7 7">
          <polygon points="1,1 6,1 6,2.5 6,6 1,6 1,2.5" fill="none" stroke="#004d00" stroke-width="1"/>
        </svg>
      </button>
    </div>
    <span class="window__title">{win.title}</span>
  </div>

  <!-- Content Area -->
  <div class="window__content">
    {#if AppComponent}
      <svelte:component this={AppComponent} {win} />
    {:else if placeholderHtml}
      {@html placeholderHtml}
    {:else}
      <div class="window__placeholder-missing">未知应用</div>
    {/if}
  </div>

  <!-- Resize Handles -->
  <div class="window__resize-handle window__resize-handle--corner" on:mousedown={onResizeStart}></div>
  <div class="window__resize-handle window__resize-handle--bottom" on:mousedown={onResizeStart}></div>
  <div class="window__resize-handle window__resize-handle--right" on:mousedown={onResizeStart}></div>
</div>

<style>
  .window {
    position: absolute;
    background: rgba(30, 30, 30, 0.92);
    backdrop-filter: blur(30px) saturate(180%);
    -webkit-backdrop-filter: blur(30px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    box-shadow:
      0 10px 40px rgba(0, 0, 0, 0.35),
      0 0 0 1px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 280px;
    min-height: 180px;
    animation: window-open 0.2s ease-out;
  }

  @keyframes window-open {
    from {
      opacity: 0;
      transform: scale(0.85);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .window--focused {
    box-shadow:
      0 10px 40px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.18);
  }

  .window--minimized {
    height: auto !important;
    min-height: 0 !important;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .window--minimized .window__titlebar {
    background: rgba(45, 45, 45, 0.75);
    border-radius: 8px;
    height: 34px;
  }

  .window--minimized .window__content,
  .window--minimized .window__resize-handle {
    display: none;
  }

  .window--maximized {
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: 100% !important;
    border-radius: 0 !important;
  }

  .window--maximized .window__resize-handle {
    display: none;
  }

  /* ===== Title Bar ===== */
  .window__titlebar {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 12px;
    background: rgba(45, 45, 45, 0.5);
    cursor: default;
    flex-shrink: 0;
  }

  .window__traffic-lights {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 12px;
    flex-shrink: 0;
  }

  .window__tl {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: filter 0.15s ease;
    line-height: 0;
  }

  .window__tl:hover {
    filter: brightness(0.8);
  }

  .window__tl:active {
    filter: brightness(0.65);
  }

  .window__tl--close    { background: #ff5f57; }
  .window__tl--minimize { background: #febc2e; }
  .window__tl--maximize { background: #28c840; }

  .window__tl svg {
    opacity: 0.45;
    transition: opacity 0.12s ease;
  }

  .window__titlebar:hover .window__tl svg,
  .window__tl:hover svg {
    opacity: 0.95;
  }

  .window__title {
    flex: 1;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .window__content {
    flex: 1;
    overflow: auto;
    color: #e0e0e0;
    font-size: 14px;
    background: rgba(0, 0, 0, 0.15);
  }

  .window__placeholder-missing {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.3);
    font-size: 16px;
  }

  .window__resize-handle {
    position: absolute;
    z-index: 10;
  }

  .window__resize-handle--corner {
    bottom: 0;
    right: 0;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    background:
      linear-gradient(135deg, transparent 60%, rgba(255,255,255,0.12) 60%),
      linear-gradient(135deg, transparent 60%, rgba(255,255,255,0.08) 60%);
    background-size: 6px 6px, 10px 10px;
    background-position: bottom right;
    background-repeat: no-repeat;
  }

  .window__resize-handle--bottom {
    bottom: 0;
    left: 0;
    right: 18px;
    height: 6px;
    cursor: ns-resize;
  }

  .window__resize-handle--right {
    top: 40px;
    right: 0;
    bottom: 18px;
    width: 6px;
    cursor: ew-resize;
  }
</style>
