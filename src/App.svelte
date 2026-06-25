<script>
  import { onMount, onDestroy } from 'svelte';
  import Home from './routes/Home.svelte';
  import HelloWorld from './routes/HelloWorld.svelte';
  import MacOS from './routes/MacOS.svelte';

  let currentRoute = 'home';

  function getRoute() {
    const hash = window.location.hash.slice(1) || '/';
    switch (hash) {
      case '/hello-world': return 'hello-world';
      case '/macos': return 'macos';
      default: return 'home';
    }
  }

  function onHashChange() {
    currentRoute = getRoute();
  }

  onMount(() => {
    currentRoute = getRoute();
    window.addEventListener('hashchange', onHashChange);
  });

  onDestroy(() => {
    window.removeEventListener('hashchange', onHashChange);
  });
</script>

{#if currentRoute === 'home'}
  <Home />
{:else if currentRoute === 'hello-world'}
  <HelloWorld />
{:else if currentRoute === 'macos'}
  <MacOS />
{/if}
