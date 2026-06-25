<script>
  import { onMount } from 'svelte';
  import { pendingMenuAction } from '../../stores/menuActions.js';

  /** @type {{ id: string, appId: string }} */
  export let win;

  // --- Calculator state ---
  /** @type {string} */
  let display = '0';

  /** @type {number|null} */
  let previousValue = null;

  /** @type {string|null} */
  let pendingOperator = null;

  /** @type {boolean} */
  let freshInput = true;

  /** @type {string} */
  let mode = 'basic'; // 'basic' | 'scientific' | 'programmer' | 'statistics'

  /** @type {number} */
  let base = 10; // 10 | 16

  /** @type {boolean} */
  let errorState = false;

  // --- Display formatting ---
  $: displayFormatted = formatDisplay(display);

  function formatDisplay(val) {
    if (errorState) return '错误';
    if (base === 16) {
      const num = parseInt(val, 10);
      if (isNaN(num)) return '0';
      return '0x' + num.toString(16).toUpperCase();
    }
    // Format large numbers with limited precision
    const num = parseFloat(val);
    if (!isFinite(num)) return val;
    if (Number.isInteger(num) && Math.abs(num) < 1e15) {
      return num.toLocaleString('en-US');
    }
    // For floats, limit to reasonable precision
    return String(parseFloat(num.toPrecision(12)));
  }

  // --- Button definitions ---
  const BASIC_BUTTONS = [
    ['AC', '±', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['0', '.', '⌫', '='],
  ];

  // --- Input handling ---

  function handleButton(btn) {
    if (errorState && btn !== 'AC' && btn !== 'C') return;

    switch (btn) {
      case 'AC':
      case 'C':
        allClear();
        break;
      case '⌫':
        backspace();
        break;
      case '±':
        toggleSign();
        break;
      case '%':
        percent();
        break;
      case '=':
        calculate();
        break;
      case '+':
      case '−':
      case '×':
      case '÷':
        setPendingOperator(btn);
        break;
      case '.':
        addDecimal();
        break;
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        addDigit(btn);
        break;
    }
  }

  function allClear() {
    display = '0';
    previousValue = null;
    pendingOperator = null;
    freshInput = true;
    errorState = false;
  }

  function backspace() {
    if (freshInput || errorState) return;
    const newVal = display.length > 1 ? display.slice(0, -1) : '0';
    display = newVal === '-' ? '0' : newVal;
    if (display === '0') freshInput = true;
  }

  function toggleSign() {
    if (display === '0') return;
    display = display.startsWith('-') ? display.slice(1) : '-' + display;
  }

  function percent() {
    const num = parseFloat(display);
    if (isNaN(num)) return;
    display = String(num / 100);
    freshInput = false;
  }

  function addDecimal() {
    if (freshInput) {
      display = '0.';
      freshInput = false;
      return;
    }
    if (display.includes('.')) return;
    display = display + '.';
  }

  function addDigit(digit) {
    if (errorState) return;
    if (freshInput) {
      display = digit;
      freshInput = false;
      return;
    }
    // Limit input length to prevent overflow
    if (display.replace('-', '').replace('.', '').length >= 15) return;
    display = display + digit;
  }

  function setPendingOperator(op) {
    const current = parseFloat(display);
    if (isNaN(current)) return;

    if (pendingOperator !== null && !freshInput) {
      // Chain calculation
      const result = evaluate(previousValue, current, pendingOperator);
      display = String(result);
      previousValue = result;
    } else {
      previousValue = current;
    }

    pendingOperator = op;
    freshInput = true;
  }

  function calculate() {
    if (pendingOperator === null || freshInput) return;
    const current = parseFloat(display);
    if (isNaN(current)) return;

    const result = evaluate(previousValue, current, pendingOperator);
    display = String(result);
    previousValue = result;
    pendingOperator = null;
    freshInput = true;
  }

  function evaluate(a, b, op) {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷':
        if (b === 0) {
          errorState = true;
          return 0;
        }
        return a / b;
      default:
        return b;
    }
  }

  // --- Keyboard support ---
  function handleKeydown(e) {
    const keyMap = {
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
      '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
      '.': '.', 'Enter': '=', 'Return': '=',
      'Backspace': '⌫', 'Delete': 'AC', 'Escape': 'AC',
      '+': '+', '-': '−', '*': '×', '/': '÷',
      '%': '%',
    };
    const mapped = keyMap[e.key];
    if (mapped) {
      e.preventDefault();
      handleButton(mapped);
    }
  }

  // --- Menu action handling ---

  function handleMenuAction(action) {
    switch (action) {
      case '基本':
        mode = 'basic';
        break;
      case '科学':
        mode = 'scientific';
        break;
      case '程序员':
        mode = 'programmer';
        break;
      case '统计':
        mode = 'statistics';
        break;
      case '十进制':
        base = 10;
        // Re-parse display as decimal
        if (display.startsWith('0x')) {
          const hex = parseInt(display.slice(2), 16);
          display = isNaN(hex) ? '0' : String(hex);
        }
        break;
      case '十六进制':
        base = 16;
        // Convert current display to hex
        const num = parseInt(display, 10);
        if (!isNaN(num)) {
          display = String(num);
        }
        break;
      case '隐藏':
        // No-op, handled by window manager
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

  // Focus handling
  function onMountFocus() {
    // Calculator doesn't need focus, but we should handle keyboard
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  import { onDestroy } from 'svelte';
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="calculator" on:keydown={handleKeydown}>
  <!-- Display -->
  <div class="calculator__display">
    <div class="calculator__display-mode">{mode === 'basic' ? '' : mode}</div>
    <div class="calculator__display-value" title={display}>{displayFormatted}</div>
    {#if base === 16}
      <div class="calculator__display-base">HEX</div>
    {/if}
  </div>

  <!-- Buttons -->
  <div class="calculator__buttons">
    {#each BASIC_BUTTONS as row}
      <div class="calculator__row">
        {#each row as btn}
          {@const isDigit = /^[0-9.]$/.test(btn)}
          {@const isOp = /^[+\-−×÷=]$/.test(btn)}
          {@const isTop = ['AC', 'C', '±', '%'].includes(btn)}
          {@const isZero = btn === '0'}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <button
            class="calculator__btn"
            class:calculator__btn--digit={isDigit}
            class:calculator__btn--op={isOp}
            class:calculator__btn--top={isTop}
            class:calculator__btn--zero={isZero}
            class:calculator__btn--danger={btn === 'AC' || btn === 'C'}
            on:click={() => handleButton(btn)}
          >
            {btn}
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .calculator {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: rgba(30, 30, 32, 0.92);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
    user-select: none;
    overflow: hidden;
  }

  /* ===== Display ===== */
  .calculator__display {
    padding: 20px 18px 14px;
    text-align: right;
    min-height: 90px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .calculator__display-mode {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    min-height: 14px;
  }

  .calculator__display-value {
    font-size: 38px;
    font-weight: 300;
    color: #fff;
    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
    line-height: 1.1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calculator__display-base {
    font-size: 11px;
    color: #ff9500;
    margin-top: 2px;
    font-weight: 600;
  }

  /* ===== Buttons ===== */
  .calculator__buttons {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 6px;
    gap: 6px;
  }

  .calculator__row {
    display: flex;
    gap: 6px;
    flex: 1;
  }

  .calculator__btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    font-size: 20px;
    font-weight: 400;
    font-family: inherit;
    cursor: pointer;
    color: #fff;
    background: rgba(100, 100, 100, 0.25);
    transition: background 0.1s ease, transform 0.08s ease;
    min-width: 0;
    padding: 0;
  }

  .calculator__btn:hover {
    background: rgba(100, 100, 100, 0.4);
  }

  .calculator__btn:active {
    transform: scale(0.96);
    background: rgba(100, 100, 100, 0.5);
  }

  /* Top row: AC, ±, % */
  .calculator__btn--top {
    background: rgba(80, 80, 80, 0.35);
    color: #e0e0e0;
  }

  .calculator__btn--top:hover {
    background: rgba(80, 80, 80, 0.5);
  }

  .calculator__btn--top:active {
    background: rgba(80, 80, 80, 0.6);
  }

  .calculator__btn--danger {
    color: #ff6b6b;
  }

  /* Digits */
  .calculator__btn--digit {
    background: rgba(60, 60, 65, 0.3);
  }

  .calculator__btn--digit:hover {
    background: rgba(60, 60, 65, 0.5);
  }

  .calculator__btn--digit:active {
    background: rgba(60, 60, 65, 0.6);
  }

  /* Operators: +, -, ×, ÷, = */
  .calculator__btn--op {
    background: #ff9500;
    color: #fff;
    font-size: 24px;
  }

  .calculator__btn--op:hover {
    background: #ffaa22;
  }

  .calculator__btn--op:active {
    background: #e08600;
  }

  /* Zero button */
  .calculator__btn--zero {
    flex: 2;
  }

  /* Remove default button focus outlines */
  .calculator__btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }
</style>
