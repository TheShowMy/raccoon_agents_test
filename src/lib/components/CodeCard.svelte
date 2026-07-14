<script>
  import { highlightCode } from '../utils/highlight.js';

  /** 语言名称 */
  export let lang = '';
  /** 代码文本 */
  export let code = '';
  /** 列表中的索引，用于 stagger 入场动画 */
  export let index = 0;

  let copyState = 'idle'; // 'idle' | 'copied' | 'failed'
  let timer = null;

  $: highlighted = highlightCode(code, lang);

  $: copyBtnLabel = copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制';

  function handleCopy() {
    copyToClipboard(code)
      .then(() => {
        copyState = 'copied';
        clearTimeout(timer);
        timer = setTimeout(() => { copyState = 'idle'; }, 2000);
      })
      .catch(() => {
        copyState = 'failed';
        clearTimeout(timer);
        timer = setTimeout(() => { copyState = 'idle'; }, 2000);
      });
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      return new Promise((resolve, reject) => {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }
  }
</script>

<div class="card" style="--stagger-delay: {index * 0.03}s">
  <div class="card__header">
    <div class="card__header-left">
      <span class="card__dots">
        <span class="card__dot card__dot--red" />
        <span class="card__dot card__dot--yellow" />
        <span class="card__dot card__dot--green" />
      </span>
      <span class="card__lang">{lang}</span>
    </div>
    <button
      class="card__copy-btn"
      class:card__copy-btn--copied={copyState === 'copied'}
      class:card__copy-btn--failed={copyState === 'failed'}
      on:click={handleCopy}
      title="复制代码"
      aria-label={copyBtnLabel}
    >
      {#if copyState === 'idle'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {copyBtnLabel}
      {:else if copyState === 'copied'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {copyBtnLabel}
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        {copyBtnLabel}
      {/if}
    </button>
  </div>
  <div class="card__code">
    <pre><code>{@html highlighted}</code></pre>
  </div>
</div>

<style>
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition:
      transform var(--transition),
      box-shadow var(--transition),
      border-color var(--transition);
    animation: fadeIn 0.35s ease both;
    animation-delay: var(--stagger-delay, 0s);
  }

  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lg);
    border-color: var(--border-light);
  }

  /* ---- Card Header (editor tab bar) ---- */
  .card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 1rem;
    background: #1f2137;
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  .card__header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* Traffic light dots now use global styles from app.css */

  .card__lang {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    letter-spacing: 0.01em;
  }

  .card__copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    font-size: 0.78rem;
    font-family: var(--font-sans);
    font-weight: 500;
    color: var(--text-muted);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition);
  }

  .card__copy-btn:hover {
    color: var(--text-primary);
    background: var(--bg-input);
    border-color: var(--border);
  }

  .card__copy-btn:active {
    transform: scale(0.96);
  }

  .card__copy-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .card__copy-btn--copied {
    color: #9ece6a !important;
    border-color: #9ece6a !important;
    background: rgba(158, 206, 106, 0.12) !important;
    transform: scale(1.02);
  }

  .card__copy-btn--failed {
    color: #f7768e !important;
    border-color: #f7768e !important;
    background: rgba(247, 118, 142, 0.12) !important;
    animation: shake 0.35s ease;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-3px); }
    40% { transform: translateX(3px); }
    60% { transform: translateX(-2px); }
    80% { transform: translateX(2px); }
  }

  /* ---- Card Code Area ---- */
  .card__code {
    padding: 1.1rem 1rem;
    overflow-x: auto;
    background: #1a1b2e;
    position: relative;
  }

  /* Gutter accent line */
  .card__code::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, var(--accent), #bb9af7);
    opacity: 0.6;
    border-radius: 0 2px 2px 0;
  }

  .card__code pre {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    line-height: 1.7;
    color: var(--text-primary);
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    margin: 0;
    tab-size: 4;
    -moz-tab-size: 4;
  }

  .card__code code {
    font-family: inherit;
    font-size: inherit;
  }

  /* ---- Syntax Highlighting Tokens ---- */
  :global(.token.keyword) {
    color: var(--token-keyword);
    font-style: italic;
  }

  :global(.token.builtin) {
    color: var(--token-function);
  }

  :global(.token.type) {
    color: var(--token-number);
  }

  :global(.token.function) {
    color: var(--token-function);
  }

  :global(.token.string) {
    color: var(--token-string);
  }

  :global(.token.number) {
    color: var(--token-number);
  }

  :global(.token.comment) {
    color: var(--token-comment);
    font-style: italic;
  }

  :global(.token.operator) {
    color: var(--token-operator);
  }

  :global(.token.punctuation) {
    color: var(--token-punctuation);
  }

  :global(.token.boolean) {
    color: var(--token-number);
  }

  :global(.token.constant) {
    color: var(--token-number);
  }

  :global(.token.property) {
    color: var(--token-property);
  }

  :global(.token.regex) {
    color: var(--token-keyword);
  }
</style>
