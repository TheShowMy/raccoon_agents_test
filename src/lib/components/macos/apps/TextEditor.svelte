<script>
  import { onMount, tick } from 'svelte';
  import { pendingMenuAction } from '../../../stores/menuActions.js';

  /** @type {{ id: string, appId: string }} */
  export let win;

  /** @type {string} */
  let text = '';

  /** @type {HTMLTextAreaElement} */
  let textareaEl;

  /** @type {HTMLDivElement} */
  let lineNumbersEl;

  /** @type {boolean} */
  let wordWrap = true;

  // --- Derived line numbers ---
  $: lines = text === '' ? [1] : text.split('\n');
  $: lineCount = lines.length;

  // --- Menu action handling ---

  function handleMenuAction(action) {
    switch (action) {
      case '撤销':
        document.execCommand('undo');
        break;
      case '重做':
        document.execCommand('redo');
        break;
      case '剪切':
        document.execCommand('cut');
        break;
      case '拷贝':
        document.execCommand('copy');
        break;
      case '粘贴':
        document.execCommand('paste');
        break;
      case '全选':
        if (textareaEl) {
          textareaEl.focus();
          textareaEl.select();
        }
        break;
      case '自动换行':
        wordWrap = !wordWrap;
        break;
      case '清除':
      case '清空':
        text = '';
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

  // Focus textarea on mount
  onMount(() => {
    if (textareaEl) textareaEl.focus();
  });

  // Scroll line numbers in sync with textarea
  function syncScroll() {
    if (textareaEl && lineNumbersEl) {
      lineNumbersEl.scrollTop = textareaEl.scrollTop;
    }
  }

  // Handle keyboard shortcuts
  function handleKeydown(e) {
    // Cmd/Ctrl + A — select all (native browser handling already works)
    // Cmd/Ctrl + Z — undo (native)
    // Cmd/Ctrl + Shift + Z — redo (native)
    // We don't need to interfere with native handling
  }
</script>

<div class="text-editor">
  <div class="text-editor__status">
    <span class="text-editor__status-item">纯文本</span>
    <span class="text-editor__status-item">行 {lineCount}</span>
    <span class="text-editor__status-item">字符 {text.length}</span>
    {#if !wordWrap}
      <span class="text-editor__status-item">不自动换行</span>
    {/if}
    <div class="text-editor__status-right">
      <button class="text-editor__clear-btn" on:click={() => { text = ''; }} title="清空">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
          <path d="M1 1l12 12M13 1L1 13"/>
        </svg>
        清空
      </button>
    </div>
  </div>
  <div class="text-editor__body">
    <div class="text-editor__gutter" bind:this={lineNumbersEl}>
      {#each Array(lineCount) as _, i}
        <div class="text-editor__line-num" class:text-editor__line-num--active={i === lines.length - 1 && text.endsWith('\n')}>
          {i + 1}
        </div>
      {/each}
    </div>
    <textarea
      bind:this={textareaEl}
      bind:value={text}
      class="text-editor__textarea"
      class:text-editor__textarea--nowrap={!wordWrap}
      spellcheck="false"
      on:scroll={syncScroll}
      on:keydown={handleKeydown}
      placeholder="在此输入文本…"
    ></textarea>
  </div>
</div>

<style>
  .text-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: rgba(30, 30, 32, 0.9);
    color: #e0e0e0;
    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    overflow: hidden;
  }

  /* ===== Status Bar ===== */
  .text-editor__status {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 28px;
    padding: 0 12px;
    background: rgba(0, 0, 0, 0.15);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .text-editor__status-item {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    white-space: nowrap;
  }

  .text-editor__status-right {
    margin-left: auto;
  }

  .text-editor__clear-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    font-family: inherit;
    padding: 2px 8px;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .text-editor__clear-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.8);
  }

  /* ===== Editor Body ===== */
  .text-editor__body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ===== Gutter (Line Numbers) ===== */
  .text-editor__gutter {
    width: 48px;
    min-width: 48px;
    padding: 10px 0;
    background: rgba(0, 0, 0, 0.12);
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
    flex-shrink: 0;
    user-select: none;
    text-align: right;
  }

  .text-editor__line-num {
    padding: 0 10px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.25);
    line-height: 1.6;
    min-height: 1.6em;
  }

  .text-editor__line-num--active {
    color: rgba(255, 255, 255, 0.45);
  }

  /* ===== Textarea ===== */
  .text-editor__textarea {
    flex: 1;
    padding: 10px 14px;
    background: transparent;
    border: none;
    outline: none;
    color: #e0e0e0;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    resize: none;
    white-space: pre;
    overflow-wrap: normal;
    overflow: auto;
    tab-size: 4;
    min-width: 0;
  }

  .text-editor__textarea--nowrap {
    white-space: pre !important;
    overflow-x: auto;
  }

  .text-editor__textarea::placeholder {
    color: rgba(255, 255, 255, 0.2);
  }

  .text-editor__textarea::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .text-editor__textarea::-webkit-scrollbar-track {
    background: transparent;
  }

  .text-editor__textarea::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .text-editor__textarea::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.18);
  }
</style>
