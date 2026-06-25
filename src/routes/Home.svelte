<script>
  import Layout from '../lib/components/Layout.svelte';
</script>

<Layout
  showHeader={true}
  headerTitle="子页面列表"
  headerSubtitle="浏览所有示例页面"
  showFooter={true}
  footerText="子页面列表 · 点击卡片进入对应页面"
>
  <div class="list">
    <a href="#/hello-world" class="list-card">
      <div class="list-card__header">
        <div class="list-card__header-left">
          <span class="card__dots">
            <span class="card__dot card__dot--red"></span>
            <span class="card__dot card__dot--yellow"></span>
            <span class="card__dot card__dot--green"></span>
          </span>
          <span class="list-card__title">Hello World</span>
        </div>
        <span class="list-card__arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
      </div>
      <div class="list-card__body">
        <p class="list-card__desc">浏览 20+ 种编程语言的经典问候</p>
      </div>
    </a>

    <a href="#/macos" class="list-card">
      <div class="list-card__header">
        <div class="list-card__header-left">
          <span class="card__dots">
            <span class="card__dot card__dot--red"></span>
            <span class="card__dot card__dot--yellow"></span>
            <span class="card__dot card__dot--green"></span>
          </span>
          <span class="list-card__title">macOS</span>
        </div>
        <span class="list-card__arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
      </div>
      <div class="list-card__body">
        <p class="list-card__desc">一个模拟 macOS 的页面</p>
      </div>
    </a>
  </div>
</Layout>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .list-card {
    display: block;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition:
      transform var(--transition),
      box-shadow var(--transition),
      border-color var(--transition);
    animation: fadeIn 0.35s ease both;
  }

  .list-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lg);
    border-color: var(--accent);
  }

  .list-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.1rem;
    background: #1f2137;
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  .list-card__header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .card__dots {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .card__dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    transition: opacity var(--transition);
  }

  .card__dot--red    { background: #ff5f57; }
  .card__dot--yellow { background: #febc2e; }
  .card__dot--green  { background: #28c840; }

  .list-card:hover .card__dot {
    opacity: 0.85;
  }

  .list-card__title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-mono);
    letter-spacing: 0.01em;
  }

  .list-card__arrow {
    color: var(--text-muted);
    transition:
      transform var(--transition),
      color var(--transition);
  }

  .list-card:hover .list-card__arrow {
    color: var(--accent);
    transform: translateX(3px);
  }

  .list-card__body {
    padding: 1rem 1.1rem;
  }

  .list-card__desc {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin: 0;
  }

  @media (max-width: 600px) {
    .list-card__header {
      padding: 0.7rem 0.9rem;
    }

    .list-card__body {
      padding: 0.85rem 0.9rem;
    }
  }
</style>
