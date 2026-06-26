<script>
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import Home from './routes/Home.svelte';
  import HelloWorld from './routes/HelloWorld.svelte';
  import MacOS from './routes/MacOS.svelte';
  import RacingGame from './routes/RacingGame.svelte';

  let currentRoute = 'home';

  function getRoute() {
    const hash = window.location.hash.slice(1) || '/';
    switch (hash) {
      case '/hello-world': return 'hello-world';
      case '/macos': return 'macos';
      case '/racing': return 'racing';
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
  <div in:fly={{ x: 20, duration: 300 }} out:fade={{ duration: 200 }}>
    <Home />
  </div>
{:else if currentRoute === 'hello-world'}
  <div in:fly={{ x: 20, duration: 300 }} out:fade={{ duration: 200 }}>
    <HelloWorld />
  </div>
{:else if currentRoute === 'macos'}
  <div in:fly={{ x: 20, duration: 300 }} out:fade={{ duration: 200 }}>
    <MacOS />
  </div>
{:else if currentRoute === 'racing'}
  <div in:fly={{ x: 20, duration: 300 }} out:fade={{ duration: 200 }}>
    <RacingGame />
  </div>
{/if}
