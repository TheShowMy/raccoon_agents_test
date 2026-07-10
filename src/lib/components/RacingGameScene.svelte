<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import * as THREE from 'three';
  import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
  import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
  import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
  import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
  import { createEnvironment, createAsphaltTextures } from './racingGame/environment.js';
  import { createRoadSystem, updateRoad, cleanupRoadForRestart, disposeRoadMaterials } from './racingGame/road.js';
  import {
    createDecorations,
    updateDecorations,
    cleanupDecorationsForRestart,
    disposeDecorations,
  } from './racingGame/decorations.js';
  import { createPlayerVehicle, PLAYER_SPEED } from './racingGame/playerVehicle.js';
  import { createWorldObjects } from './racingGame/worldObjects.js';
  import {
    MAX_HEALTH,
    OBJECT_TYPES,
  } from '../utils/racingGame.js';
  import {
    createAudioController,
    updateAudioSpeed,
    stopEngineHumAudio,
    stopWindNoiseAudio,
    closeAudioContext,
    playSoundEffect,
  } from './racingGame/audio.js';
  import { createEffects, SHAKE_DURATION_COLLISION, SHAKE_INTENSITY_COLLISION } from './racingGame/effects.js';
  import { createInputController } from './racingGame/input.js';
  import { createHud } from './racingGame/hud.js';
  import { createGameLoop } from './racingGame/gameLoop.js';

  /* ===================================================================
     Container ref
     =================================================================== */
  /** @type {HTMLDivElement} */
  let containerEl;

  /* ===================================================================
     Three.js refs
     =================================================================== */
  /** @type {THREE.Scene|null} */
  let scene = null;
  /** @type {THREE.PerspectiveCamera|null} */
  let camera = null;
  /** @type {THREE.WebGLRenderer|null} */
  let renderer = null;
  /** @type {THREE.Group|null} */
  let staticGroup = null;
  /** @type {THREE.Group|null} */
  let grassGroup = null;
  /** @type {THREE.Group|null} */
  let roadGroup = null;
  /** @type {THREE.Group|null} */
  let objectsGroup = null;
  /** @type {EffectComposer|null} */
  let composer = null;
  /** @type {UnrealBloomPass|null} */
  let bloomPass = null;
  /** @type {number|null} */
  let animationId = null;

  /** Unified disposables list */
  const disposables = { geometries: [], materials: [], textures: [] };

  /** Shared asphalt textures — created once, reused across all restarts */
  let asphaltTextures = null;

  /** @type {ResizeObserver|null} */
  let resizeObserver = null;

  /* ===================================================================
     Game state reactive variables (written by gameLoop via callbacks)
     =================================================================== */
  let health = MAX_HEALTH;
  let distance = 0;
  let gameState = 'menu';
  let gameOverHandled = false;
  let showFlash = false;
  let flashColor = 'rgba(255,255,255,0)';
  let flashKey = 0;
  let loading = true;
  let webglError = false;

  // Reactive display values (updated each frame by hud module)
  let displayHealth = MAX_HEALTH;
  let displayDistance = 0;
  let displayScore = 0;
  let displaySpeed = 0; // km/h
  let showOncomingWarning = false;

  // Road/decorations data arrays (kept in sync by gameLoop callbacks)
  let roadSegments = [];
  let roadTileData = [];
  let treesData = [];
  let decoData = [];

  // Camera shake state (managed by gameLoop)
  let cameraShake = { duration: 0, intensity: 0 };

  // Scroll offset (managed by gameLoop)
  let scrollOffset = 0;
  let runningTime = 0;
  let frameCount = 0;

  /* ===================================================================
     Module APIs (populated during onMount)
     =================================================================== */
  /** @type {ReturnType<typeof createEffects>|null} */
  let effectsAPI = null;
  /** @type {ReturnType<typeof createPlayerVehicle>|null} */
  let vehicleAPI = null;
  /** @type {ReturnType<typeof createWorldObjects>|null} */
  let worldObjectsAPI = null;
  /** @type {ReturnType<typeof createInputController>|null} */
  let inputAPI = null;
  /** @type {ReturnType<typeof createHud>|null} */
  let hudAPI = null;
  /** @type {ReturnType<typeof createGameLoop>|null} */
  let gameLoopAPI = null;

  /** Environment dispose function (captured from env creation) */
  let envDispose = null;

  /* ===================================================================
     External refs helpers (passed to road / decorations modules)
     =================================================================== */
  const roadExternalRefs = {
    get roadGroup() { return roadGroup; },
    get roadSegments() { return roadSegments; },
    get roadTileData() { return roadTileData; },
    get scrollOffset() { return scrollOffset; },
    get renderer() { return renderer; },
    getRoadSegments: () => roadSegments,
    setRoadSegments: (s) => { roadSegments = s; },
    getScrollOffset: () => scrollOffset,
    setScrollOffset: (s) => { scrollOffset = s; },
  };

  const decoExternalRefs = {
    get roadGroup() { return roadGroup; },
    get roadSegments() { return roadSegments; },
    get scrollOffset() { return scrollOffset; },
    getRoadSegments: () => roadSegments,
    getScrollOffset: () => scrollOffset,
  };

  /* ===================================================================
     Lifecycle
     =================================================================== */
  onMount(async () => {
    await tick();
    if (!containerEl) return;

    // -- Set up keyboard listeners --
    inputAPI = createInputController({
      onLaneLeft: () => {
        if (gameState !== 'playing') return;
        const state = vehicleAPI ? vehicleAPI.getState() : {};
        if ((state.laneSwitchProgress ?? 1) >= 1 && vehicleAPI) {
          vehicleAPI.startLaneSwitch(-1);
        }
      },
      onLaneRight: () => {
        if (gameState !== 'playing') return;
        const state = vehicleAPI ? vehicleAPI.getState() : {};
        if ((state.laneSwitchProgress ?? 1) >= 1 && vehicleAPI) {
          vehicleAPI.startLaneSwitch(1);
        }
      },
      onJump: () => {
        if (gameState !== 'playing') return;
        const state = vehicleAPI ? vehicleAPI.getState() : {};
        if (!state.isJumping && vehicleAPI) {
          vehicleAPI.startJump();
        }
      },
      onEnter: () => {
        if (gameState === 'menu') {
          if (gameLoopAPI) gameLoopAPI.start();
        }
      },
    });

    window.addEventListener('keydown', inputAPI.onKeyDown);
    window.addEventListener('keyup', inputAPI.onKeyUp);

    // -- Set up ResizeObserver --
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(containerEl);

    // -- Initialise environment --
    const rect = containerEl.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;

    try {
      const env = await createEnvironment({ containerEl });
      if (!env.scene) {
        webglError = true;
        loading = false;
        return;
      }

      scene = env.scene;
      camera = env.camera;
      renderer = env.renderer;
      staticGroup = env.staticGroup;
      grassGroup = env.grassGroup;
      envDispose = env.dispose;

      // -- Road groups --
      roadGroup = new THREE.Group();
      scene.add(roadGroup);
      objectsGroup = new THREE.Group();
      scene.add(objectsGroup);

      // -- Asphalt textures (created once, reused across all restarts) --
      asphaltTextures = createAsphaltTextures();

      // -- Effects module (needs scene) --
      effectsAPI = createEffects({ scene });

      // -- Vehicle module (created early; createVehicle called after effects setup) --
      vehicleAPI = createPlayerVehicle({
        scene,
        createParticleBurst: null,
        createShockwaveRing: null,
        triggerShake: null,
        onCollisionEffect: null,
        onPickupEffect: null,
      });

      // -- World objects module --
      worldObjectsAPI = createWorldObjects({ scene, objectsGroup });

      // -- Road system --
      createRoadSystem({ scene, roadGroup, asphaltTextures, externalRefs: roadExternalRefs });

      // -- Decorations --
      createDecorations({ scene, roadGroup, externalRefs: decoExternalRefs });

      // -- Wire vehicle callbacks (needs effectsAPI) --
      vehicleAPI._setCallbacks({
        createParticleBurst: effectsAPI.createParticleBurst,
        createShockwaveRing: effectsAPI.createShockwave,
        triggerShake,
        onCollisionEffect: triggerCollisionEffect,
        onPickupEffect: triggerPickupEffect,
      });

      // -- Vehicle mesh (after effects callbacks are wired) --
      vehicleAPI.createVehicle();

      // -- Post-processing --
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.2, 0.1);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());

      // -- HUD module --
      hudAPI = createHud({
        setDisplayHealth: (v) => { displayHealth = v; },
        setDisplayDistance: (v) => { displayDistance = v; },
        setDisplayScore: (v) => { displayScore = v; },
        setDisplaySpeed: (v) => { displaySpeed = v; },
        setShowOncomingWarning: (v) => { showOncomingWarning = v; },
        setShowFlash: (v) => { showFlash = v; },
        setFlashColor: (v) => { flashColor = v; },
        setFlashKey: (v) => { flashKey = v; },
      });

      // -- Game loop (assembles all modules and drives the RAF loop) --
      gameLoopAPI = createGameLoop({
        containerEl,
        modules: {
          environment: { scene, camera, renderer, staticGroup, grassGroup },
          road: { createRoadSystem, updateRoad, cleanupRoadForRestart, disposeRoadMaterials },
          decorations: { createDecorations, updateDecorations, cleanupDecorationsForRestart, disposeDecorations },
          vehicle: vehicleAPI,
          worldObjects: worldObjectsAPI,
          effects: effectsAPI,
          input: inputAPI,
          hud: hudAPI,
          _roadGroup: roadGroup,
          _objectsGroup: objectsGroup,
          _composer: composer,
        },
        callbacks: {
          onGameStateChange: (s) => { gameState = s; },
          onGameOverHandled: () => { gameOverHandled = true; },
          onHealthChange: (h) => { health = h; },
          onDistanceChange: (d) => { distance = d; },
          onScrollOffsetChange: (s) => { scrollOffset = s; },
          onRunningTimeChange: (t) => { runningTime = t; },
          onCameraShakeChange: (cs) => { cameraShake = cs; },
          onRoadSegmentsChange: (segs) => { roadSegments = segs; },
          onRoadTileDataChange: (data) => { roadTileData = data; },
          onTreesDataChange: (d) => { treesData = d; },
          onDecoDataChange: (d) => { decoData = d; },
          onStaticGroupChange: (g) => { staticGroup = g; },
          onLoadingChange: (v) => { loading = v; },
          onWebglErrorChange: (v) => { webglError = v; },
          onFrameCountChange: (c) => { frameCount = c; },
        },
      });

      // Start the RAF animation loop
      gameLoopAPI.init();

    } catch (e) {
      console.warn('[RacingGame] Scene init error:', e);
      webglError = true;
      loading = false;
    }
  });

  onDestroy(() => {
    // Cancel animation frame
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // Remove keyboard listeners
    if (inputAPI) {
      window.removeEventListener('keydown', inputAPI.onKeyDown);
      window.removeEventListener('keyup', inputAPI.onKeyUp);
    }

    // Disconnect ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    // Stop audio
    stopEngineHumAudio(0.2);
    stopWindNoiseAudio(0.2);
    closeAudioContext();

    // Dispose input module
    if (inputAPI && inputAPI.dispose) inputAPI.dispose();

    // Dispose effects
    if (effectsAPI && effectsAPI.cleanup) effectsAPI.cleanup();

    // Dispose vehicle
    if (vehicleAPI && vehicleAPI.dispose) vehicleAPI.dispose();

    // Dispose environment resources (sky sphere, grass plane, shared textures)
    if (envDispose) {
      try { envDispose(); } catch {}
      envDispose = null;
    }

    // Dispose all Three.js resources from scene objects via traversal
    if (scene) {
      scene.traverse((obj) => {
        if (obj.isMesh || obj.isPoints) {
          try { obj.geometry.dispose(); } catch {}
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => { try { m.dispose(); } catch {} });
          } else if (obj.material) {
            try { obj.material.dispose(); } catch {}
          }
        }
      });
    }

    // Dispose shared road materials
    disposeRoadMaterials();

    // Dispose decorations
    disposeDecorations();

    // Dispose tracked geometries, materials, textures
    for (const geo of disposables.geometries) { try { geo.dispose(); } catch {} }
    disposables.geometries = [];
    for (const mat of disposables.materials) { try { mat.dispose(); } catch {} }
    disposables.materials = [];
    for (const tex of disposables.textures) { try { tex.dispose(); } catch {} }
    disposables.textures = [];

    // Dispose post-processing
    if (composer) {
      composer.dispose();
      if (bloomPass) { bloomPass.dispose(); bloomPass = null; }
      composer = null;
    }

    // Dispose renderer and remove its canvas from DOM
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer = null;
    }

    // Null out scene refs
    scene = null;
    camera = null;
    roadGroup = null;
    objectsGroup = null;
    staticGroup = null;
    grassGroup = null;

    // Clear data arrays
    roadSegments = [];
    roadTileData = [];
    treesData = [];
    decoData = [];
  });

  /* ===================================================================
     Event handlers
     =================================================================== */
  function onResize() {
    if (!containerEl || !camera || !renderer) return;
    const rect = containerEl.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (composer) composer.setSize(w, h);
  }

  function triggerShake(duration, intensity) {
    cameraShake = { duration, intensity };
  }

  function triggerCollisionEffect(position, desc) {
    if (desc && desc.type === OBJECT_TYPES.ONCOMING_VEHICLE) {
      if (effectsAPI) {
        effectsAPI.createParticleBurst(position, 0xcccccc, 10);
        effectsAPI.createParticleBurst(position, 0xffaa22, 8);
      }
    } else {
      if (effectsAPI) effectsAPI.createParticleBurst(position, 0xff5533, 16);
    }
    if (hudAPI) hudAPI.flashCollision();
    triggerShake(SHAKE_DURATION_COLLISION, SHAKE_INTENSITY_COLLISION);
  }

  function triggerPickupEffect(position) {
    if (effectsAPI) {
      effectsAPI.createParticleBurst(position, 0x44ff44, 16);
      effectsAPI.createSpiralParticles(position);
    }
    if (hudAPI) hudAPI.flashPickup();
  }

  function handleStart() {
    if (gameLoopAPI) gameLoopAPI.start();
  }

  function handleRestart() {
    if (gameLoopAPI) gameLoopAPI.restart();
  }
</script>

<!-- Template -->
<div class="racing-scene-container" bind:this={containerEl}>
  {#if loading}
    <div class="loading-overlay">
      <div class="loading-text">⏳ 游戏加载中…</div>
    </div>
  {:else if webglError}
    <div class="loading-overlay">
      <div class="loading-text error">⚠️ WebGL 不可用，无法启动 3D 赛车游戏</div>
    </div>
  {:else if gameState === 'menu'}
    <div class="menu-overlay">
      <div class="menu-content">
        <h1 class="menu-title">🏎️ 3D 赛车</h1>
        <p class="menu-subtitle">无限盘山公路 · 驾驶越野车飞驰</p>
        <div class="menu-instructions">
          <div class="instruction-row">
            <kbd>A</kbd><kbd>D</kbd>
            <span>或</span>
            <kbd>←</kbd><kbd>→</kbd>
            <span>切换车道</span>
          </div>
          <div class="instruction-row">
            <kbd>空格</kbd>
            <span>跳跃（越过障碍物）</span>
          </div>
          <div class="instruction-row hint">
            <span>碰撞障碍物 -❤️ · 撞车 -❤️❤️ · 拾取修理包 +❤️</span>
          </div>
        </div>
        <button class="start-btn" on:click={handleStart}>🚗 开始游戏</button>
        <p class="menu-prompt">或按 Enter 键开始</p>
      </div>
    </div>
  {:else}
    <div class="hud-minimal">
      <span class="hud-item">❤️ {displayHealth}/{MAX_HEALTH}</span>
      <span class="hud-item">📏 {displayDistance}m</span>
      <span class="hud-item">⭐ {displayScore}</span>
      <span class="hud-speed">
        <span class="speed-gauge">
          <span class="speed-needle" style="transform: rotate({Math.max(-135, Math.min(135, (displaySpeed / 120) * 270 - 135))}deg)"></span>
        </span>
        <span class="speed-value">{displaySpeed} km/h</span>
      </span>
      <span class="oncoming-warning" class:active={showOncomingWarning}>⚠ 前方来车</span>
      <span class="hud-controls">A/D 切换车道 · 空格跳跃</span>
    </div>
    {#key flashKey}
      {#if showFlash}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="flash-overlay"
          style="background: {flashColor};"
          on:animationend={() => (showFlash = false)}
        ></div>
      {/if}
    {/key}
    {#if gameState === 'gameover'}
      <div class="gameover-message">
        <div class="gameover-title">💥 游戏结束</div>
        <div class="gameover-stats">
          行驶 {displayDistance}m · 得分 {displayScore}
        </div>
        <button class="restart-btn" on:click={handleRestart}>🔄 重新开始</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .racing-scene-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 450px;
    overflow: hidden;
    background: #87CEEB;
    border-radius: var(--radius, 10px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
    user-select: none;
  }

  .hud-minimal {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 4px 14px;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border-radius: 16px;
    z-index: 5;
    font-size: 13px;
    color: #fff;
  }

  .hud-item {
    white-space: nowrap;
  }

  .hud-speed {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .speed-gauge {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 0 0 14px 14px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .speed-needle {
    display: block;
    width: 2px;
    height: 13px;
    background: linear-gradient(to top, #ff4444, #ffaa00);
    transform-origin: bottom center;
    border-radius: 1px;
    transition: transform 0.15s ease-out;
  }

  .speed-value {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.3px;
  }

  .oncoming-warning {
    font-size: 12px;
    color: rgba(255, 200, 60, 0.5);
    transition: color 0.2s ease;
  }

  .oncoming-warning.active {
    color: #ffcc3c;
    animation: blink 0.5s ease-in-out infinite alternate;
  }

  @keyframes blink {
    from { opacity: 0.6; }
    to { opacity: 1; }
  }

  .hud-controls {
    font-size: 11px;
    opacity: 0.6;
    padding-left: 6px;
    border-left: 1px solid rgba(255, 255, 255, 0.15);
  }

  .menu-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 10;
  }

  .menu-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 36px 44px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
    max-width: 420px;
    text-align: center;
  }

  .menu-title {
    font-size: 32px;
    font-weight: 800;
    color: #fff;
    margin: 0;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  }

  .menu-subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 8px;
  }

  .menu-instructions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 18px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.2);
    width: 100%;
  }

  .instruction-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
  }

  .instruction-row.hint {
    font-size: 11px;
    opacity: 0.65;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 24px;
    padding: 0 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.25);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
  }

  .start-btn {
    margin-top: 8px;
    padding: 10px 32px;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #3498db, #2ecc71);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.15s ease;
    font-family: inherit;
    letter-spacing: 0.5px;
  }

  .start-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(52, 152, 219, 0.45);
  }

  .start-btn:active {
    transform: translateY(0);
  }

  .menu-prompt {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
  }

  .flash-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 8;
    animation: flashFade 0.4s ease-out forwards;
  }

  @keyframes flashFade {
    0% { opacity: 0.6; }
    100% { opacity: 0; }
  }

  .gameover-message {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 10;
    gap: 12px;
  }

  .gameover-title {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
  }

  .gameover-stats {
    font-size: 16px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.7);
  }

  .restart-btn {
    margin-top: 8px;
    padding: 8px 24px;
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #3498db, #2ecc71);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    font-family: inherit;
  }

  .restart-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(52, 152, 219, 0.4);
  }

  .restart-btn:active {
    transform: translateY(0);
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 10;
  }

  .loading-text {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
  }

  .loading-text.error {
    color: #ff8888;
    font-size: 15px;
    text-align: center;
    max-width: 300px;
    line-height: 1.4;
  }
</style>
