<script>
  import BackNav from '../lib/components/BackNav.svelte';
  import PageHeader from '../lib/components/PageHeader.svelte';
  import Footer from '../lib/components/Footer.svelte';
</script>

<svelte:head>
  <title>3D 越野车竞速</title>
  <meta name="description" content="three.js 打造的 3D 越野车竞速页面占位 · 键盘操控 · 无尽模式" />
</svelte:head>

<div class="racing-game-page">
  <BackNav href="#/" />

  <PageHeader
    title="&lt;3D 越野车竞速 /&gt;"
    subtitle="three.js 打造的 3D 蜿蜒赛道 · 桌面端键盘操控"
  />

  <main class="main">
    <div class="hero" aria-hidden="true">
      <div class="hero__glow"></div>
    </div>

    <section class="placeholder" aria-labelledby="racing-placeholder-title">
      <div class="placeholder__icon" aria-hidden="true">🏎️</div>
      <h2 class="placeholder__title" id="racing-placeholder-title">游戏场景正在搭建中</h2>
      <p class="placeholder__desc">
        后续将依次接入：游戏状态引擎、蜿蜒道路与车道、three.js 模型工厂、3D 场景与渲染循环、键盘控制与 HUD。
      </p>
      <ul class="placeholder__hints" aria-label="即将支持的操作">
        <li>
          <span class="placeholder__keys" aria-label="方向键">
            <span class="placeholder__key">←</span>
            <span class="placeholder__key">→</span>
          </span>
          <span class="placeholder__sep">或</span>
          <span class="placeholder__keys" aria-label="WASD 键">
            <span class="placeholder__key">A</span>
            <span class="placeholder__key">D</span>
          </span>
          <span class="placeholder__hint-text">切换车道</span>
        </li>
        <li>
          <span class="placeholder__keys" aria-label="空格键">
            <span class="placeholder__key">空格</span>
          </span>
          <span class="placeholder__sep">或</span>
          <span class="placeholder__keys" aria-label="上方向键">
            <span class="placeholder__key">↑</span>
          </span>
          <span class="placeholder__hint-text">跳跃越过障碍</span>
        </li>
      </ul>
      <a class="placeholder__cta" href="#/">返回首页</a>
    </section>
  </main>

  <Footer text="3D 越野车竞速 · 无尽模式 · 桌面端键盘操作" />
</div>

<style>
  .racing-game-page {
    --page-max-width: 1480px;
    position: relative;
  }

  .main {
    position: relative;
    flex: 1;
    padding: 2rem 1.5rem;
    max-width: var(--page-max-width);
    margin: 0 auto;
    width: 100%;
  }

  .hero {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .hero__glow {
    position: absolute;
    top: -10%;
    left: 50%;
    width: 140%;
    height: 140%;
    transform: translateX(-50%);
    background: radial-gradient(
      circle at center,
      color-mix(in srgb, var(--accent) 22%, transparent) 0%,
      transparent 60%
    );
    opacity: 0.55;
  }

  .placeholder {
    position: relative;
    z-index: 1;
    margin: 1.5rem auto 0;
    max-width: 640px;
    padding: 2.5rem 2rem 2.25rem;
    text-align: center;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: var(--shadow-lg);
    animation: fadeIn 0.35s ease both;
  }

  .placeholder__icon {
    font-size: 3rem;
    margin-bottom: 0.75rem;
    filter: drop-shadow(0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent));
    animation: floaty 3.6s ease-in-out infinite;
  }

  .placeholder__title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 0.6rem;
    font-family: var(--font-mono);
    letter-spacing: 0.01em;
  }

  .placeholder__desc {
    font-size: 0.9rem;
    color: var(--text-secondary);
    line-height: 1.65;
    margin: 0 0 1.5rem;
  }

  .placeholder__hints {
    list-style: none;
    margin: 0;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    text-align: left;
  }

  .placeholder__hints li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
    flex-wrap: wrap;
  }

  .placeholder__keys {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .placeholder__key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.2rem;
    padding: 0.2rem 0.55rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-primary);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 1px 0 var(--border);
    transition: transform var(--transition), border-color var(--transition);
  }

  .placeholder__hints li:hover .placeholder__key {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
    transform: translateY(-1px);
  }

  .placeholder__sep {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .placeholder__hint-text {
    margin-left: auto;
    color: var(--text-secondary);
  }

  .placeholder__cta {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 1.5rem;
    padding: 0.55rem 1.1rem;
    font-size: 0.85rem;
    font-family: var(--font-sans);
    color: var(--accent);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    border-radius: var(--radius);
    text-decoration: none;
    transition:
      background-color var(--transition),
      border-color var(--transition),
      transform var(--transition);
  }

  .placeholder__cta::before {
    content: '‹';
    font-family: var(--font-mono);
    font-size: 1rem;
    line-height: 1;
  }

  .placeholder__cta:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: var(--accent);
    transform: translateX(-2px);
  }

  .placeholder__cta:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

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

  @keyframes floaty {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-4px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .placeholder,
    .placeholder__icon {
      animation: none;
    }

    .placeholder__cta,
    .placeholder__key {
      transition: none;
    }

    .placeholder__cta:hover,
    .placeholder__hints li:hover .placeholder__key {
      transform: none;
    }
  }

  @media (max-width: 600px) {
    .placeholder {
      padding: 1.75rem 1.25rem;
      margin-top: 1rem;
    }

    .placeholder__title {
      font-size: 1.1rem;
    }

    .placeholder__hint-text {
      margin-left: 0;
      width: 100%;
    }
  }
</style>