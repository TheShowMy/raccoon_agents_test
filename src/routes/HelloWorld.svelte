<script>
  import BackNav from '../lib/components/BackNav.svelte';
  import PageHeader from '../lib/components/PageHeader.svelte';
  import Footer from '../lib/components/Footer.svelte';
  import CodeCard from '../lib/components/CodeCard.svelte';
  import { languages } from '../lib/data/languages.js';

  let searchQuery = '';

  $: filtered = searchQuery.trim() === ''
    ? languages
    : languages.filter(item =>
        item.lang.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );
</script>

<div class="hello-world-page">
  <BackNav href="#/" />

  <PageHeader
    title="&lt;Hello World /&gt;"
    subtitle="浏览 20+ 种编程语言的经典问候"
  />

  <section class="search-section" aria-label="搜索语言">
    <input
      type="text"
      class="search-input"
      placeholder="搜索语言名称，例如 JavaScript、Python…"
      autocomplete="off"
      bind:value={searchQuery}
    />
  </section>

  <p class="results-counter" aria-live="polite">
    {#if filtered.length > 0}
      共 {filtered.length} 种语言
    {/if}
  </p>

  <main class="main">
    <div class="grid">
      {#each filtered as item (item.lang)}
        <CodeCard lang={item.lang} code={item.code} />
      {/each}
    </div>

    {#if filtered.length === 0}
      <div class="empty-state">
        <div class="empty-state__icon">🔍</div>
        <p class="empty-state__text">没有找到匹配的语言，试试其他关键词</p>
      </div>
    {/if}
  </main>

  <Footer text="Hello World Collection · 所有代码示例均可自由使用" />
</div>

<style>
  .hello-world-page {
    --page-max-width: 1480px;
  }

  /* ===== Search ===== */
  .search-section {
    padding: 1.5rem 1.5rem 0;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
  }

  .search-input {
    width: 100%;
    padding: 0.8rem 1.2rem 0.8rem 2.85rem;
    font-size: 0.95rem;
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif);
    color: var(--text-primary, #c0caf5);
    background:
      var(--bg-input, #2a2b3d)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%239aa5ce' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E")
      0.9rem center no-repeat;
    border: 1.5px solid var(--border, #3b3d54);
    border-radius: var(--radius, 10px);
    outline: none;
    transition:
      border-color var(--transition, 0.2s ease),
      box-shadow var(--transition, 0.2s ease),
      background-color var(--transition, 0.2s ease);
  }

  .search-input::placeholder {
    color: var(--text-muted, #565f89);
  }

  .search-input:focus {
    border-color: var(--accent, #7aa2f7);
    background-color: #1a1b26;
    box-shadow: 0 0 0 3px rgba(122, 162, 247, 0.18);
  }

  /* ===== Results Counter ===== */
  .results-counter {
    max-width: 720px;
    margin: 0.6rem auto 0;
    padding: 0 1.5rem;
    font-size: 0.8rem;
    color: var(--text-muted, #565f89);
    letter-spacing: 0.02em;
  }

  /* ===== Main & Grid ===== */
  .main {
    flex: 1;
    padding: 1.5rem;
    max-width: var(--page-max-width);
    margin: 0 auto;
    width: 100%;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.25rem;
    align-items: start;
  }

  /* ===== Empty State ===== */
  .empty-state {
    text-align: center;
    padding: 4rem 1rem 3rem;
    color: var(--text-muted, #565f89);
    animation: fadeIn 0.3s ease;
  }

  .empty-state__icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.4;
  }

  .empty-state__text {
    font-size: 1.05rem;
    color: var(--text-secondary, #9aa5ce);
  }

  /* Stagger card entrance */
  .grid > :nth-child(1)  { animation-delay: 0.02s; }
  .grid > :nth-child(2)  { animation-delay: 0.04s; }
  .grid > :nth-child(3)  { animation-delay: 0.06s; }
  .grid > :nth-child(4)  { animation-delay: 0.08s; }
  .grid > :nth-child(5)  { animation-delay: 0.10s; }
  .grid > :nth-child(6)  { animation-delay: 0.12s; }
  .grid > :nth-child(7)  { animation-delay: 0.14s; }
  .grid > :nth-child(8)  { animation-delay: 0.16s; }
  .grid > :nth-child(9)  { animation-delay: 0.18s; }
  .grid > :nth-child(10) { animation-delay: 0.20s; }

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

  /* ===== Responsive ===== */
  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .search-input {
      font-size: 0.9rem;
      padding: 0.7rem 1rem 0.7rem 2.6rem;
    }
  }
</style>
