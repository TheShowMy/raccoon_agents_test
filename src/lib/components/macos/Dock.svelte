<script>
  import { windows, openWindow, focusWindow } from '../../stores/windows.js';
  import { APP_REGISTRY, DOCK_APPS } from './appRegistry.js';

  /** Check if an app already has an open window; if so, return its id, else null */
  function findAppWindow(appId) {
    for (const win of $windows) {
      if (win.appId === appId) return win.id;
    }
    return null;
  }

  function handleDockClick(appId) {
    const existingId = findAppWindow(appId);
    if (existingId) {
      focusWindow(existingId);
    } else {
      const app = APP_REGISTRY[appId];
      if (app) {
        openWindow(appId, app.name);
      }
    }
  }
</script>

<footer class="dock-area">
  <nav class="dock">
    {#each DOCK_APPS as appId (appId)}
      {@const app = APP_REGISTRY[appId]}
      {#if app}
        {@const isOpen = findAppWindow(appId) !== null}
        <button
          type="button"
          class="dock__item"
          class:dock__item--open={isOpen}
          aria-label={app.name}
          on:click={() => handleDockClick(appId)}
        >
          <span class="dock__item-icon">
            {@html app.icon}
          </span>
          <span class="dock__item-tooltip">{app.name}</span>
          {#if isOpen}
            <span class="dock__item-indicator" aria-hidden="true"></span>
          {/if}
        </button>
      {/if}
    {/each}
  </nav>
</footer>

<style>
  .dock-area {
    position: relative;
    z-index: 100;
    height: var(--dock-height, 80px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 8px;
    flex-shrink: 0;
  }

  .dock {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 6px 12px;
    background: var(--dock-bg);
    backdrop-filter: blur(30px) saturate(200%);
    -webkit-backdrop-filter: blur(30px) saturate(200%);
    border: 1px solid var(--glass-border);
    border-radius: 20px;
  }

  .dock__item {
    position: relative;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    transform-origin: bottom center;
    flex-shrink: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
  }

  .dock__item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .dock__item:hover {
    transform: scale(1.55);
  }

  .dock__item:active {
    transform: scale(1.25);
  }

  .dock__item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .dock__item-icon :global(svg) {
    width: 50px;
    height: 50px;
  }

  .dock__item-tooltip {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--glass-bg);
    color: #fff;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .dock__item:hover .dock__item-tooltip {
    opacity: 1;
  }

  .dock__item-indicator {
    position: absolute;
    bottom: -6px;
    left: 50%;
    width: 4px;
    height: 4px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: var(--text-primary);
    pointer-events: none;
  }
</style>
