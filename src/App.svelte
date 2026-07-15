<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { GameRenderer } from './lib/game/renderer.js';
  import { GameLoop } from './lib/game/gameLoop.js';

  let container;
  let renderer;
  let gameLoop;
  let state = { score: 0, health: 3, alive: true, gameOver: false };
  let showStart = true;
  let pollTimer;

  /** 始终渲染 canvas 容器（初始隐藏），避免 start 时 DOM 未就绪 */
  function startGame() {
    showStart = false;

    // 等待 DOM 更新，确保 game-canvas 容器已渲染
    tick().then(() => {
      if (!renderer) {
        renderer = new GameRenderer(container);
      }
      gameLoop = new GameLoop(renderer);
      gameLoop.start();
      state = gameLoop.getState();

      // 周期性轮询游戏状态，驱动 HUD 和游戏结束界面更新
      pollTimer = setInterval(() => {
        if (gameLoop) {
          state = gameLoop.getState();
        }
      }, 100);
    });
  }

  function handleRestart() {
    if (gameLoop) {
      gameLoop.restart();
      state = gameLoop.getState();
    }
  }

  onMount(() => {
    // 容器尺寸自适应由 renderer 内部处理
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (gameLoop) gameLoop.destroy();
    if (renderer) renderer.destroy();
  });
</script>

<div class="game-wrapper">
  {#if showStart}
    <div class="start-screen">
      <h1 class="title">3D 打飞机</h1>
      <p class="subtitle">第三人称尾随视角 · Three.js</p>
      <div class="controls-info">
        <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</p>
        <p><kbd>Shift</kbd> 下降 · <kbd>Space</kbd> 上升/开火</p>
      </div>
      <button class="start-btn" on:click={startGame}>开始游戏</button>
    </div>
  {:else}
    <div class="hud">
      <div class="hud-score">得分: {state.score}</div>
      <div class="hud-health">
        生命:
        {#each Array(state.health) as _}
          <span class="heart">♥</span>
        {/each}
      </div>
    </div>

    <div class="game-canvas" bind:this={container}></div>

    {#if state.gameOver}
      <div class="game-over">
        <h2>游戏结束</h2>
        <p>最终得分: {state.score}</p>
        <button class="restart-btn" on:click={handleRestart}>再来一局</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #0a0a1a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #c0caf5;
  }

  .game-wrapper {
    width: 100vw;
    height: 100vh;
    position: relative;
  }

  .game-canvas {
    width: 100%;
    height: 100%;
  }

  .start-screen {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at center, #0f0f2a, #050510);
    z-index: 10;
    gap: 16px;
  }

  .title {
    font-size: 3rem;
    font-weight: 800;
    background: linear-gradient(135deg, #7aa2f7, #bb9af7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: none;
    letter-spacing: 2px;
  }

  .subtitle {
    font-size: 1rem;
    color: #565f89;
    letter-spacing: 4px;
  }

  .controls-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    color: #9aa5ce;
    margin-top: 8px;
  }

  .controls-info kbd {
    display: inline-block;
    padding: 2px 8px;
    background: #24253a;
    border: 1px solid #3b3d54;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.85rem;
    color: #7aa2f7;
    margin: 0 2px;
  }

  .start-btn, .restart-btn {
    margin-top: 20px;
    padding: 12px 40px;
    font-size: 1.1rem;
    font-weight: 600;
    background: linear-gradient(135deg, #7aa2f7, #5a8ae7);
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    letter-spacing: 1px;
  }

  .start-btn:hover, .restart-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(122, 162, 247, 0.4);
  }

  .hud {
    position: absolute;
    top: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: space-between;
    z-index: 5;
    font-size: 1rem;
    font-weight: 600;
    pointer-events: none;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8);
  }

  .hud-score {
    color: #7aa2f7;
  }

  .hud-health {
    color: #ff5f57;
  }

  .heart {
    margin-left: 4px;
  }

  .game-over {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.7);
    z-index: 10;
    gap: 12px;
  }

  .game-over h2 {
    font-size: 2rem;
    color: #ff5f57;
  }

  .game-over p {
    font-size: 1.2rem;
    color: #c0caf5;
  }
</style>
