<script>
  import BackNav from '../lib/components/BackNav.svelte';
  import PageHeader from '../lib/components/PageHeader.svelte';
  import Footer from '../lib/components/Footer.svelte';
</script>

<div class="racing-game-page">
  <BackNav href="#/" />

  <PageHeader
    title="3D 赛车"
    subtitle="驾驶越野车在无限盘山公路上飞驰"
  />

  <main class="game-container">
    <!-- RacingGameScene 组件将在后续任务中实现 -->
    <div class="game-placeholder">
      <div class="placeholder-icon">🏎️</div>
      <p class="placeholder-text">3D 赛车游戏加载中…</p>
    </div>
  </main>

  <Footer text="3D 赛车 · A/D 或方向键切换车道，空格键跳跃" />
</div>

<style>
  .racing-game-page {
    --page-max-width: 1480px;
  }

  .game-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.5rem;
    max-width: var(--page-max-width);
    margin: 0 auto;
    width: 100%;
    min-height: 400px;
  }

  .game-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem;
    background: var(--glass-bg, rgba(42, 43, 61, 0.6));
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius, 10px);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    width: 100%;
    max-width: 600px;
    text-align: center;
  }

  .placeholder-icon {
    font-size: 3.5rem;
    opacity: 0.6;
    animation: pulse 2s ease-in-out infinite;
  }

  .placeholder-text {
    font-size: 1rem;
    color: var(--text-secondary, #9aa5ce);
    margin: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.08); }
  }
</style>
