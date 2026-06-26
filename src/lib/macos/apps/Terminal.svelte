<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { pendingMenuAction } from '../../stores/menuActions.js';

  /** @type {{ id: string, appId: string }} */
  export let win;

  /** @type {string[]} */
  let output = [];

  /** @type {string} */
  let inputValue = '';

  /** @type {string[]} */
  let history = [];

  /** @type {number} */
  let historyIndex = -1;

  /** @type {HTMLDivElement} */
  let outputEl;

  /** @type {HTMLInputElement} */
  let inputEl;

  /** Current working directory display */
  let cwd = '~';

  // --- Built-in commands ---

  const COMMANDS = {
    help() {
      return [
        '可用命令:',
        '  help     — 显示此帮助信息',
        '  echo     — 回显文本 (例: echo Hello World)',
        '  date     — 显示当前日期和时间',
        '  whoami   — 显示当前用户名',
        '  clear    — 清屏',
        '  ls       — 列出文件',
        '  pwd      — 显示当前工作目录',
        '  whoami   — 显示当前用户',
        '  uname    — 显示系统信息',
      ];
    },
    echo(args) {
      return [args.join(' ') || ''];
    },
    date() {
      const d = new Date();
      return [d.toLocaleString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric',
        weekday: 'long',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })];
    },
    whoami() {
      return ['visitor'];
    },
    clear() {
      output = [];
      return [];
    },
    ls() {
      return [
        'Applications/',
        'Desktop/',
        'Documents/',
        'Downloads/',
        'Pictures/',
        'Music/',
        'Movies/',
      ];
    },
    pwd() {
      return [`/Users/visitor${cwd === '~' ? '' : cwd.slice(1)}`];
    },
    uname() {
      return ['Darwin raccoon-mac 24.0.0 Darwin Kernel Version 24.0.0'];
    },
  };

  function processCommand(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Add to history
    history = [...history, trimmed];
    historyIndex = history.length;

    // Add to output with prompt
    output = [...output, `\n${cwd} % ${trimmed}`];

    // Parse command
    const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));

    // Execute
    const handler = COMMANDS[cmd];
    if (!handler) {
      output = [...output, `zsh: command not found: ${cmd}`];
      return;
    }

    const result = handler(args);
    if (result.length > 0) {
      output = [...output, ...result];
    }
  }

  function handleInput() {
    processCommand(inputValue);
    inputValue = '';
    // Scroll to bottom after render
    tick().then(() => {
      if (outputEl) {
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      handleInput();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        historyIndex = Math.max(0, historyIndex - 1);
        inputValue = history[historyIndex];
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        inputValue = history[historyIndex];
      } else {
        historyIndex = history.length;
        inputValue = '';
      }
      return;
    }
  }

  // --- Menu action handling ---

  function handleMenuAction(action) {
    switch (action) {
      case '终端帮助':
        output = [...output, '', ...COMMANDS.help()];
        break;
      case '关于终端':
        output = [...output, `\n${cwd} % 终端 v1.0 — Svelte 重构版`];
        break;
      case '新建窗口':
        output = [...output, `\n${cwd} % 已请求新建窗口（未实现多窗口）`];
        break;
      default:
        // Echo unknown menu actions as commands (e.g. "echo Hello" is for echo but not a menu action)
        break;
    }
    tick().then(() => {
      if (outputEl) {
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    });
  }

  // Subscribe to menu actions
  $: if ($pendingMenuAction && $pendingMenuAction.appId === win.appId) {
    handleMenuAction($pendingMenuAction.action);
    pendingMenuAction.set(null);
  }

  // Focus input when component mounts
  onMount(() => {
    if (inputEl) inputEl.focus();
  });

  function onContentClick() {
    if (inputEl) inputEl.focus();
  }

  function onContentKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onContentClick();
    }
  }
</script>

<div
  class="terminal"
  role="button"
  tabindex="0"
  aria-label="点击或按 Enter 聚焦终端输入"
  on:click={onContentClick}
  on:keydown={onContentKeyDown}
>
  <div class="terminal__output" bind:this={outputEl}>
    {#each output as line, i}
      <div class="terminal__line">{line}</div>
    {/each}
  </div>
  <div class="terminal__input-line">
    <span class="terminal__prompt">{cwd} %</span>
    <input
      bind:this={inputEl}
      bind:value={inputValue}
      class="terminal__input"
      type="text"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      on:keydown={handleKeydown}
    />
  </div>
</div>

<style>
  .terminal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    color: #33ff33;
    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    cursor: text;
    overflow: hidden;
  }

  .terminal:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .terminal__output {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    white-space: pre;
  }

  .terminal__output::-webkit-scrollbar {
    width: 6px;
  }

  .terminal__output::-webkit-scrollbar-track {
    background: transparent;
  }

  .terminal__output::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  .terminal__output::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .terminal__line {
    min-height: 1.5em;
    word-break: break-all;
  }

  .terminal__input-line {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.3);
    flex-shrink: 0;
  }

  .terminal__prompt {
    color: #33ff33;
    margin-right: 8px;
    white-space: nowrap;
    font-weight: 600;
    opacity: 0.9;
  }

  .terminal__input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #33ff33;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    caret-color: #33ff33;
    padding: 0;
  }
</style>
