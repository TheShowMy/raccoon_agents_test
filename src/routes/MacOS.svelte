<script>
  import MenuBar from '../lib/macos/MenuBar.svelte';
  import Desktop from '../lib/macos/Desktop.svelte';
  import Dock from '../lib/macos/Dock.svelte';
</script>

<div class="macos-desktop">
  <MenuBar />
  <Desktop />
  <Dock />
</div>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
  }

  .macos-desktop {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    user-select: none;
    -webkit-user-select: none;
  }
</style>
