<script>
  /** Navigation link back to the home page */
  export let href = '#/';
</script>

<nav class="back-nav">
  <a class="back-nav__link" {href}>
    <svg
      class="back-nav__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
    <span>返回首页</span>
  </a>
</nav>

<style>
  .back-nav {
    padding: 1rem 1.5rem 0;
    max-width: var(--page-max-width);
    margin: 0 auto;
    width: 100%;
  }

  .back-nav__link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
    text-decoration: none;
    transition: color var(--transition);
    font-family: var(--font-sans);
  }

  .back-nav__link:hover {
    color: var(--accent);
  }

  .back-nav__icon {
    transition: transform var(--transition);
  }

  .back-nav__link:hover .back-nav__icon {
    transform: translateX(-3px);
  }
</style>
