<script>
  import { onMount } from 'svelte';
  import MenuBar from '../lib/macos/MenuBar.svelte';
  import Desktop from '../lib/macos/Desktop.svelte';
  import Dock from '../lib/macos/Dock.svelte';

  let showMobileHint = false;

  onMount(() => {
    const query = window.matchMedia('(max-width: 768px)');
    showMobileHint = query.matches;
    const handler = (e) => {
      showMobileHint = e.matches;
    };
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  });

  function dismissHint() {
    showMobileHint = false;
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dismissHint();
    }
  }
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />
</svelte:head>

<div class="macos-desktop">
  <MenuBar />
  <Desktop />
  <Dock />

  {#if showMobileHint}
    <div class="mobile-hint-overlay" role="dialog" aria-modal="true" aria-label="移动端提示">
      <div class="mobile-hint-card">
        <p class="mobile-hint-title">🖥️ 桌面端体验更佳</p>
        <p class="mobile-hint-body">
          macOS 模拟器包含精细的窗口、Dock 与菜单交互，建议在桌面端访问以获得最佳效果。
        </p>
        <button
          class="mobile-hint-close"
          type="button"
          aria-label="关闭提示"
          on:click={dismissHint}
        >
          继续浏览
        </button>
        <button
          class="mobile-hint-back"
          type="button"
          aria-label="返回首页"
          on:click={() => { window.location.hash = '/'; }}
        >
          返回首页
        </button>
      </div>
      <div
        class="mobile-hint-backdrop"
        role="button"
        tabindex="0"
        aria-label="关闭提示"
        on:click={dismissHint}
        on:keydown={handleKeyDown}
      />
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
  }

  .macos-desktop {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    user-select: none;
    -webkit-user-select: none;
  }

  .mobile-hint-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .mobile-hint-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
  }

  .mobile-hint-card {
    position: relative;
    width: min(100%, 360px);
    padding: 1.5rem;
    border-radius: var(--radius);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-lg);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    text-align: center;
    animation: fadeIn 0.25s ease;
  }

  .mobile-hint-title {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--window-text);
  }

  .mobile-hint-body {
    margin: 0 0 1.25rem;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .mobile-hint-close,
  .mobile-hint-back {
    display: block;
    width: 100%;
    padding: 0.625rem 1rem;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }

  .mobile-hint-close {
    margin-bottom: 0.5rem;
    background: var(--accent);
    color: var(--bg-secondary);
  }

  .mobile-hint-close:hover {
    background: var(--accent-hover);
  }

  .mobile-hint-close:focus-visible {
    outline: 2px solid var(--accent-hover);
    outline-offset: 2px;
  }

  .mobile-hint-back {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .mobile-hint-back:hover {
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .mobile-hint-back:focus-visible {
    outline: 2px solid var(--border-light);
    outline-offset: 2px;
  }
</style>
