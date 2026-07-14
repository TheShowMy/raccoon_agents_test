<script>
  import { windows } from '../../stores/windows.js';
  import Window from './Window.svelte';
</script>

<div class="window-manager">
  {#each $windows as win (win.id)}
    <Window {win} />
  {/each}
</div>

<style>
  .window-manager {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: auto;
  }
</style>
