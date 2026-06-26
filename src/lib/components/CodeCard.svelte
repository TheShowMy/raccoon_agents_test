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
    background: var(--bg-card, #24253a);
    border: 1px solid var(--border, #3b3d54);
    border-radius: var(--radius, 10px);
    overflow: hidden;
    transition:
      transform var(--transition, 0.2s ease),
      box-shadow var(--transition, 0.2s ease),
      border-color var(--transition, 0.2s ease);
    animation: fadeIn 0.35s ease both;
    animation-delay: var(--stagger-delay, 0s);
  }

  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.45));
    border-color: var(--border-light, #454766);
  }

  /* ---- Card Header (editor tab bar) ---- */
  .card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 1rem;
    background: #1f2137;
    border-bottom: 1px solid var(--border, #3b3d54);
    user-select: none;
  }

  .card__header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* macOS-style traffic light dots */
  .card__dots {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .card__dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    transition: opacity var(--transition, 0.2s ease);
  }

  .card__dot--red {
    background: #ff5f57;
  }

  .card__dot--yellow {
    background: #febc2e;
  }

  .card__dot--green {
    background: #28c840;
  }

  .card:hover .card__dot {
    opacity: 0.85;
  }

  .card__lang {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary, #9aa5ce);
    font-family: var(--font-mono, 'Cascadia Code', 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Consolas', 'Menlo', 'Monaco', monospace);
    letter-spacing: 0.01em;
  }

  .card__copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    font-size: 0.78rem;
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif);
    font-weight: 500;
    color: var(--text-muted, #565f89);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    transition: all var(--transition, 0.2s ease);
  }

  .card__copy-btn:hover {
    color: var(--text-primary, #c0caf5);
    background: var(--bg-input, #2a2b3d);
    border-color: var(--border, #3b3d54);
  }

  .card__copy-btn:active {
    transform: scale(0.96);
  }

  .card__copy-btn:focus-visible {
    outline: 2px solid var(--accent, #7aa2f7);
    outline-offset: 2px;
  }

  .card__copy-btn--copied {
    color: #9ece6a !important;
    border-color: #9ece6a !important;
    background: rgba(158, 206, 106, 0.1) !important;
  }

  .card__copy-btn--failed {
    color: #f7768e !important;
    border-color: #f7768e !important;
    background: rgba(247, 118, 142, 0.1) !important;
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
    background: linear-gradient(180deg, var(--accent, #7aa2f7), #bb9af7);
    opacity: 0.6;
    border-radius: 0 2px 2px 0;
  }

  .card__code pre {
    font-family: var(--font-mono, 'Cascadia Code', 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Consolas', 'Menlo', 'Monaco', monospace);
    font-size: 0.85rem;
    line-height: 1.7;
    color: var(--text-primary, #c0caf5);
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
    color: var(--token-keyword, #bb9af7);
    font-style: italic;
  }

  :global(.token.builtin) {
    color: var(--token-function, #7aa2f7);
  }

  :global(.token.type) {
    color: var(--token-number, #ff9e64);
  }

  :global(.token.function) {
    color: var(--token-function, #7aa2f7);
  }

  :global(.token.string) {
    color: var(--token-string, #9ece6a);
  }

  :global(.token.number) {
    color: var(--token-number, #ff9e64);
  }

  :global(.token.comment) {
    color: var(--token-comment, #565f89);
    font-style: italic;
  }

  :global(.token.operator) {
    color: var(--token-operator, #89ddff);
  }

  :global(.token.punctuation) {
    color: var(--token-punctuation, #a9b1d6);
  }

  :global(.token.boolean) {
    color: var(--token-number, #ff9e64);
  }

  :global(.token.constant) {
    color: var(--token-number, #ff9e64);
  }

  :global(.token.property) {
    color: var(--token-property, #c0caf5);
  }

  :global(.token.regex) {
    color: var(--token-keyword, #bb9af7);
  }

  /* ---- Animations ---- */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
