<script>
  import PageHeader from './PageHeader.svelte';
  import Footer from './Footer.svelte';
  import BackNav from './BackNav.svelte';

  /** Main layout wrapper with header, back nav, content area, and footer */
  export let showHeader = false;
  export let headerTitle = '';
  export let headerSubtitle = '';
  export let showFooter = false;
  export let showBackNav = false;
  export let footerText = '';
</script>

{#if showHeader}
  <PageHeader title={headerTitle} subtitle={headerSubtitle} />
{/if}

{#if showBackNav}
  <BackNav />
{/if}

<main class="main">
  <slot />
</main>

{#if showFooter}
  <Footer text={footerText} />
{/if}

<style>
  .main {
    flex: 1;
    padding: 2rem 1.5rem;
    max-width: var(--page-max-width);
    margin: 0 auto;
    width: 100%;
  }
</style>
