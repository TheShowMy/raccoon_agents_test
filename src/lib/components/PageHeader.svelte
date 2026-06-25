<script>
  /** Page header with title and optional subtitle */
  export let title = '';
  export let subtitle = '';
</script>

<header class="header">
  <h1 class="header__title">{title}</h1>
  {#if subtitle}
    <p class="header__subtitle">{subtitle}</p>
  {/if}
</header>

<style>
  .header {
    padding: 2.5rem 1.5rem 2rem;
    text-align: center;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    position: relative;
    overflow: hidden;
  }

  .header::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
  }

  .header__title {
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: -0.02em;
    font-family: var(--font-mono);
  }

  .header__subtitle {
    margin-top: 0.5rem;
    font-size: 0.95rem;
    color: var(--text-secondary);
  }

  @media (max-width: 600px) {
    .header {
      padding: 1.8rem 1rem 1.5rem;
    }

    .header__title {
      font-size: 1.5rem;
    }
  }
</style>
