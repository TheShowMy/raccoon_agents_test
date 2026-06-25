<script>
  import WindowManager from './WindowManager.svelte';
</script>

<div class="desktop-wallpaper"></div>
<div class="desktop-main">
  <WindowManager />
</div>

<style>
  .desktop-wallpaper {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      160deg,
      #2b5876 0%,
      #4e4376 30%,
      #ad5389 65%,
      #3a1c71 100%
    );
    z-index: 0;
  }

  .desktop-wallpaper::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 50%, rgba(255, 255, 255, 0.04) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 50%);
  }

  .desktop-main {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow: hidden;
  }
</style>
