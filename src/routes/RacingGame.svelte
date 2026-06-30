<script>
  import BackNav from '../lib/components/BackNav.svelte';
  import PageHeader from '../lib/components/PageHeader.svelte';
  import Footer from '../lib/components/Footer.svelte';
  import RacingGameScene from '../lib/components/RacingGameScene.svelte';
</script>

<div class="racing-game-page">
  <BackNav href="#/" />

  <PageHeader
    title="3D 赛车"
    subtitle="驾驶越野车在无限盘山公路上飞驰"
  />

  <main class="game-container">
    <div class="game-scene-wrapper">
      <RacingGameScene />
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

  .game-scene-wrapper {
    width: 100%;
    max-width: 900px;
    height: 520px;
    border-radius: var(--radius, 10px);
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  }
</style>
