<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import * as THREE from 'three';
  import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
  import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
  import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
  import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
  import { createEnvironment, createAsphaltTextures, GRASS_Y } from './racingGame/environment.js';
  import { createRoadSystem, updateRoad, cleanupRoadForRestart, getShoulderMaterial, getSurfaceMaterial, disposeRoadMaterials, ROAD_VISUAL_WIDTH } from './racingGame/road.js';
  import { createDecorations, updateDecorations, cleanupDecorationsForRestart, disposeDecorations } from './racingGame/decorations.js';
  import { createPlayerVehicle, PLAYER_SPEED } from './racingGame/playerVehicle.js';
  import { createWorldObjects } from './racingGame/worldObjects.js';
  import {
    LANE_COUNT, LANE_WIDTH, getLaneX, clampLane,
    MAX_HEALTH, OBSTACLE_DAMAGE, VEHICLE_DAMAGE, REPAIR_HEAL,
    SEGMENT_LENGTH,
    MAX_HEIGHT_DELTA,
    generateSegment, generateSegments, getRoadOffsetAt,
    OBJECT_TYPES,
    generateObjectsForSegment,
    ONCOMING_VEHICLE_SPEED,
    ENEMY_VEHICLE_MODEL_MAP, getEnemyModelById,
    ROAD_Y, JUMP_IMMUNITY_HEIGHT, checkCollision, applyCollision,
    calculateScore,
    computeDifficulty,
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

  /** @type {number|null} */
  let animationId = null;

  /** @type {THREE.Group|null} */
  let roadGroup = null;

  /** @type {THREE.Group|null} */
  let objectsGroup = null;

  /** @type {THREE.Group|null} */
  let sceneryGroup = null;

  /** @type {THREE.Group|null} */
  let grassGroup = null;

  /** @type {THREE.Group|null} */
  let staticGroup = null;

  /** Unified disposables list for performance optimization */
  const disposables = { geometries: [], materials: [], textures: [] };

  /**
   * Shared asphalt textures - created once in createRoadSystem() and reused
   * across all road segments and restarts. Lifecycle: createRoadSystem ->
   * createAsphaltTextures (once) -> surfaceMaterial.map/normalMap/roughnessMap.
   * Disposed once in onDestroy. NOT recreated in restart to avoid texture leaks.
   */
  let asphaltTextures = null;

  let disposeEnvironment = null;

  /** @type {ResizeObserver|null} */
  let resizeObserver = null;

  /** Post-processing composer for bloom/glow effects */
  let composer = null;
  /** Bloom pass reference for proper disposal */
  let bloomPass = null;

  /* ===================================================================
     Game state
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

  // Reactive display values (updated each frame)
  let displayHealth = MAX_HEALTH;
  let displayDistance = 0;
  let displayScore = 0;
  let displaySpeed = 0; // km/h, updated each frame
  let showOncomingWarning = false;

  // Cumulative forward scroll. As player moves forward, scrollOffset increases.
  // Road tiles at roadZ have world Z = roadZ + scrollOffset.
  // Camera and player stay at world Z ≈ 0.
  let scrollOffset = 0;

  /* ===================================================================
     Road state (managed by road.js module)
     =================================================================== */
  let roadSegments = []; // sorted: [0] = closest, [last] = farthest ahead
  let roadTileData = []; // { segment, surface, lines[], shoulders[] }

  // Setters for road module state
  function setRoadSegments(segments) { roadSegments = segments; }
  function setRoadTileData(data) { roadTileData = data; }
  function getScrollOffset() { return scrollOffset; }

  // External refs for road module
  const roadExternalRefs = {
    get roadGroup() { return roadGroup; },
    get roadSegments() { return roadSegments; },
    get roadTileData() { return roadTileData; },
    get scrollOffset() { return scrollOffset; },
    get shoulderMaterial() { return getShoulderMaterial(); },
    get surfaceMaterial() { return getSurfaceMaterial(); },
    get renderer() { return renderer; },
    getRoadSegments: () => roadSegments,
    setRoadSegments: (s) => { roadSegments = s; },
    getScrollOffset: () => scrollOffset,
    setScrollOffset: (s) => { scrollOffset = s; },
  };

  // Tree and decoration data arrays (managed by decorations.js module)
  let treesData = [];
  let decoData = [];
  function setTreesData(d) { treesData = d; }
  function setDecoData(d) { decoData = d; }

  const decoExternalRefs = {
    get roadGroup() { return roadGroup; },
    get roadSegments() { return roadSegments; },
    get scrollOffset() { return scrollOffset; },
    getRoadSegments: () => roadSegments,
    getScrollOffset: () => scrollOffset,
  };

  /* ===================================================================
     Game objects
     =================================================================== */
  let objectDescriptors = [];
  let objectMeshMap = new Map();

  /* ===================================================================
     Audio (delegated to audio.js module)
     =================================================================== */
  /** @type {AudioContext|null} */
  let audioCtx = null;
  /** @type {{ oscillator: OscillatorNode, gain: GainNode }|null} */
  let engineHum = null;
  /** @type {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }|null} */
  let windNoise = null;

  /* ===================================================================
     Timing
     =================================================================== */
  let prevTime = 0;
  let runningTime = 0;

  /* ===================================================================
     Camera shake state
     =================================================================== */
  let cameraShake = { duration: 0, intensity: 0 };

  /* ===================================================================
     Effects system (delegated to effects.js module)
     =================================================================== */
  let effectsAPI = null;

  /* ===================================================================
     Constants (vehicle constants imported from playerVehicle module)
     =================================================================== */

  // Camera following interpolation factor — gentle enough to glide
  // smoothly into curves, fast enough to avoid perceptible lag.
  const CAMERA_SMOOTH = 0.15;
  // Fraction of the lane offset visible in the camera target position.
  // Bumped from 0.4 to 0.7 so the camera visibly swings with the road
  // when the player changes lane inside a curve, reinforcing the
  // sense that curves are wider than straights.
  const CAMERA_LANE_FACTOR = 0.7;

  // Curve-banking factors: when the road curves ahead, the camera and
  // vehicle roll a small amount around the Z axis. The factor converts
  // the lateral curveOffset delta ahead of the player into a roll
  // angle. The CAMERA_BANK_FACTOR controls how dramatically the
  // camera leans into a curve.
  const CAMERA_BANK_LOOK_AHEAD = 8;
  const CAMERA_BANK_FACTOR = 0.3;

  // Shadow update interval (every N frames)
  const SHADOW_UPDATE_INTERVAL = 3;

  /** Frame counter for shadow map updates */
  let frameCount = 0;

  /* ===================================================================
     Module APIs
     =================================================================== */
  let vehicleAPI = null;
  let worldObjectsAPI = null;

  /* ===================================================================
     Lane visual X (vehicle lateral offset for camera)
     =================================================================== */
  let laneVisualX = 0;

  /* ===================================================================
     Three.js — Scene Setup (delegated to environment.js)
     =================================================================== */
  function initScene() {
    const rect = containerEl.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;

    createEnvironment({ containerEl })
      .then((env) => {
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
        disposeEnvironment = env.dispose;

        // Initialize effects module (needs scene)
        effectsAPI = createEffects({ scene });

        initRoadSystem();

        // Initialize player vehicle module (needs scene + effects callbacks)
        vehicleAPI = createPlayerVehicle({
          scene,
          createParticleBurst: effectsAPI.createParticleBurst,
          createShockwaveRing: effectsAPI.createShockwave,
          triggerShake,
          onCollisionEffect: triggerCollisionEffect,
          onPickupEffect: triggerPickupEffect,
        });
        vehicleAPI.createVehicle();

        // Initialize world objects module
        worldObjectsAPI = createWorldObjects({ scene, objectsGroup });

        // Post-processing: bloom / glow
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(
          new THREE.Vector2(w, h),
          0.3,
          0.2,
          0.1
        );
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());

        loading = false;
        animate(0);
      })
      .catch((e) => {
        console.warn('[RacingGame] Scene init error:', e);
        webglError = true;
        loading = false;
      });
  }

  /* ===================================================================
     Road System (delegated to road.js and decorations.js modules)
     =================================================================== */
  function initRoadSystem() {
    roadGroup = new THREE.Group();
    scene.add(roadGroup);

    objectsGroup = new THREE.Group();
    scene.add(objectsGroup);

    // Create procedural asphalt textures (created once, reused across all segments)
    asphaltTextures = createAsphaltTextures();

    // Create road system using module
    createRoadSystem({
      scene,
      roadGroup,
      asphaltTextures,
      externalRefs: roadExternalRefs,
    });

    // Create roadside decorations using module
    createDecorations({
      scene,
      roadGroup,
      externalRefs: decoExternalRefs,
    });
  }

  /* ===================================================================
     Game Objects — managed by worldObjects module
     =================================================================== */

  /* ===================================================================
     Game Loop Update
     =================================================================== */
  function updateGame(deltaTime) {
    if (gameState === 'gameover') return;

    const dt = Math.min(deltaTime, 0.05);
    runningTime += dt;

    // -- Forward progress --
    const forwardStep = PLAYER_SPEED * dt;
    distance += forwardStep;
    scrollOffset += forwardStep; // world scrolls backward

    // -- Update display --
    displayDistance = Math.floor(distance);
    displayHealth = health;
    displayScore = calculateScore(distance, 1);

    // -- Speed --
    const speedMps = forwardStep / Math.max(dt, 0.001);
    displaySpeed = Math.round(Math.min(speedMps * 3.6, 180));

    // -- Dynamic difficulty --
    const currentDifficulty = computeDifficulty({ distance, runningTime });

    // -- Get current state from modules --
    const vehicleState = vehicleAPI ? vehicleAPI.getState() : {};
    laneVisualX = vehicleState.laneVisualX ?? 0;
    const objectDescriptors = worldObjectsAPI ? worldObjectsAPI.getObjectDescriptors() : [];
    const objectMeshMap = worldObjectsAPI ? worldObjectsAPI.getObjectMeshMap() : new Map();

    // -- Oncoming warning --
    showOncomingWarning = objectDescriptors.some((obj) => {
      if (!obj || obj.type !== OBJECT_TYPES.ONCOMING_VEHICLE) return false;
      const worldZ = obj.z + scrollOffset;
      return worldZ >= -60 && worldZ <= 0;
    });

    // -- Update vehicle (handles collisions) --
    let collectedDescriptors = [];
    if (vehicleAPI) {
      const updatedState = vehicleAPI.updateVehicle(
        dt,
        scrollOffset,
        roadSegments,
        objectDescriptors,
        objectMeshMap,
        objectsGroup,
        health,
        runningTime
      );
      health = updatedState.health;
      collectedDescriptors = updatedState.collectedDescriptors || [];
    }

    // -- Update world objects (spawn, recycle, advance, visuals) --
    if (worldObjectsAPI) {
      worldObjectsAPI.update(dt, scrollOffset, roadSegments, roadTileData, currentDifficulty, collectedDescriptors);
    }

    // -- Update road (tiles and decorations) --
    updateRoad({
      roadSegments,
      roadTileData,
      scrollOffset,
      asphaltTextures,
      roadGroup,
      grassGroup,
      renderer,
      setRoadSegments: (s) => { roadSegments = s; },
      setScrollOffset: (s) => { scrollOffset = s; },
      setRoadTileData: (d) => { roadTileData = d; },
    });
    updateDecorations({
      renderer,
      setTreesData,
      setDecoData,
    });

    // -- Update camera --
    updateCamera(forwardStep, dt);

    // -- Update effects --
    if (effectsAPI) effectsAPI.update(dt);

    // -- Update scenery parallax --
    if (sceneryGroup) {
      sceneryGroup.position.z = scrollOffset * 0.15;
    }
    // Apply parallax to staticGroup (mountains/hills InstancedMeshes)
    if (staticGroup) {
      staticGroup.position.z = scrollOffset * 0.15;
    }

    // -- Update audio (engine pitch + wind noise) --
    updateAudioSpeed(Math.abs(speedMps));

    // -- Game over check --
    if (health <= 0 && !gameOverHandled) {
      gameState = 'gameover';
      gameOverHandled = true;
      stopEngineHumAudio(0.5);
      playSoundEffect('gameOver');
    }
  }

  /* ===================================================================
     Restart
     =================================================================== */
  function restartGame() {
    // Reset game state
    health = MAX_HEALTH;
    distance = 0;
    displayHealth = MAX_HEALTH;
    displayDistance = 0;
    displayScore = 0;
    displaySpeed = 0;
    showOncomingWarning = false;
    gameState = 'playing';
    gameOverHandled = false;
    scrollOffset = 0;
    runningTime = 0;

    // Reset camera shake
    cameraShake = { duration: 0, intensity: 0 };

    // Reset modules
    if (vehicleAPI) vehicleAPI.reset();
    if (worldObjectsAPI) worldObjectsAPI.reset();

    // Clean up road using module
    cleanupRoadForRestart({
      roadGroup,
      roadTileData,
      setRoadSegments: (s) => { roadSegments = s; },
      setRoadTileData: (d) => { roadTileData = d; },
    });

    // Clean up effects
    if (effectsAPI) effectsAPI.cleanup();

    // Clean up decorations using module
    cleanupDecorationsForRestart({
      roadGroup,
      setTreesData,
      setDecoData,
    });

    // Re-initialise road and decorations using modules
    createRoadSystem({
      scene,
      roadGroup,
      asphaltTextures,
      externalRefs: roadExternalRefs,
    });
    createDecorations({
      scene,
      roadGroup,
      externalRefs: decoExternalRefs,
    });

    // Recreate vehicle
    if (vehicleAPI) vehicleAPI.createVehicle();

    // Stop and restart audio
    stopWindNoiseAudio(0.1);
    stopEngineHumAudio(0.1);
    const handles = createAudioController();
    audioCtx  = handles.audioCtx;
    engineHum = handles.engineHum;
    windNoise = handles.windNoise;
  }

  /* ===================================================================
     Start / Menu
     =================================================================== */
  function startGame() {
    const handles = createAudioController();
    audioCtx  = handles.audioCtx;
    engineHum = handles.engineHum;
    windNoise = handles.windNoise;
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    gameState = 'playing';
  }

  function triggerCollisionEffect(position, desc) {
    if (desc && desc.type === OBJECT_TYPES.ONCOMING_VEHICLE) {
      // Oncoming vehicle: metal sparks + orange/yellow fire particles
      if (effectsAPI) {
        effectsAPI.createParticleBurst(position, 0xcccccc, 10); // metallic grey debris
        effectsAPI.createParticleBurst(position, 0xffaa22, 8);  // orange/yellow fire sparks
      }
    } else {
      // Normal obstacle: red particles
      if (effectsAPI) {
        effectsAPI.createParticleBurst(position, 0xff5533, 16);
      }
    }
    showFlash = false;
    flashColor = 'rgba(255, 60, 40, 0.35)';
    flashKey++;
    showFlash = true;
    triggerShake(SHAKE_DURATION_COLLISION, SHAKE_INTENSITY_COLLISION);
  }

  function triggerPickupEffect(position) {
    if (effectsAPI) {
      effectsAPI.createParticleBurst(position, 0x44ff44, 16);
      effectsAPI.createSpiralParticles(position);
    }
    showFlash = false;
    flashColor = 'rgba(50, 255, 70, 0.25)';
    flashKey++;
    showFlash = true;
  }

  /* ===================================================================
     Camera
     =================================================================== */
  function updateCamera(forwardStep, dt) {
    if (!camera) return;

    // Look-ahead point: about 15 world units ahead on the road
    const lookRoadZ = -scrollOffset - 15;
    const lookOffset = getRoadOffsetAt(roadSegments, lookRoadZ);

    // Smoothly interpolate the camera toward the road-following position,
    // rather than snapping instantaneously.  CAMERA_SMOOTH = 0.15 gives
    // a ~0.3 s convergence — fast enough to avoid perceptible lag, slow
    // enough to glide gently into curves.
    const targetCamX = lookOffset.curveOffset + laneVisualX * CAMERA_LANE_FACTOR;
    const targetCamY = ROAD_Y + lookOffset.heightOffset + 6;

    camera.position.x += (targetCamX - camera.position.x) * CAMERA_SMOOTH;
    camera.position.y += (targetCamY - camera.position.y) * CAMERA_SMOOTH;
    camera.position.z = 12;

    const lookTarget = new THREE.Vector3(
      lookOffset.curveOffset,
      ROAD_Y + lookOffset.heightOffset + 1,
      -10
    );
    camera.lookAt(lookTarget);

    // -- Dynamic FOV based on speed --
    const speedFactor = forwardStep / Math.max(dt, 0.001);
    const targetFov = 60 + Math.min(Math.abs(speedFactor) / PLAYER_SPEED, 1) * 12;
    camera.fov += (targetFov - camera.fov) * 0.08;
    camera.updateProjectionMatrix();

    // -- Camera shake --
    if (cameraShake.duration > 0) {
      cameraShake.duration -= dt;
      const shakeX = (Math.random() - 0.5) * 2 * cameraShake.intensity;
      const shakeY = (Math.random() - 0.5) * 2 * cameraShake.intensity;
      camera.position.x += shakeX;
      camera.position.y += shakeY;
      cameraShake.intensity *= 0.92;
      if (cameraShake.duration <= 0) {
        cameraShake.intensity = 0;
      }
    }

    // Curve banking: tilt the camera around its forward axis based on
    // the lateral curveOffset change a short distance ahead of the
    // player. When the road ahead bends to the right (curveOffset
    // increasing as Z goes more negative), curveDelta is positive and
    // we rotate the camera so its top tilts to the right, giving the
    // player a visual cue that they are entering / continuing a
    // curve. On straight sections curveDelta is ≈ 0 so the camera
    // stays level, making the contrast between straights and curves
    // obvious. The CAMERA_BANK_FACTOR keeps the roll moderate — a
    // large enough swing to be felt, small enough that it does not
    // disorient the player.
    const playerRoadZ = -scrollOffset;
    const aheadRoadZ = playerRoadZ - CAMERA_BANK_LOOK_AHEAD;
    const playerOffset = getRoadOffsetAt(roadSegments, playerRoadZ);
    const aheadOffset = getRoadOffsetAt(roadSegments, aheadRoadZ);
    const curveDelta = aheadOffset.curveOffset - playerOffset.curveOffset;
    // Negative factor: rotateZ(bankAngle) with negative angle tilts
    // the camera's up vector to the right (camera-local Z = back
    // axis, so a negative rotation around it leans the top right).
    camera.rotateZ(-curveDelta * CAMERA_BANK_FACTOR);
  }

  // Expose trigger functions for external use
  function triggerShake(duration, intensity) {
    cameraShake.duration = duration;
    cameraShake.intensity = intensity;
  }

  /* ===================================================================
     Input
     =================================================================== */
  function onKeyDown(e) {
    if (gameState === 'gameover') return;

    if (gameState === 'menu') {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        startGame();
      }
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }

    // Init audio on first interaction
    if (!audioCtx) {
      const handles = createAudioController();
      audioCtx  = handles.audioCtx;
      engineHum = handles.engineHum;
      windNoise = handles.windNoise;
    }

    // Get vehicle state
    const vehicleState = vehicleAPI ? vehicleAPI.getState() : {};
    const laneSwitchProgress = vehicleState.laneSwitchProgress ?? 1;
    const isJumping = vehicleState.isJumping ?? false;

    // Lane switching (only when current switch is complete)
    if (laneSwitchProgress >= 1) {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        if (vehicleAPI) vehicleAPI.startLaneSwitch(-1);
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        if (vehicleAPI) vehicleAPI.startLaneSwitch(1);
      }
    }

    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isJumping && vehicleAPI) vehicleAPI.startJump();
    }
  }

  function onKeyUp(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }
  }

  /* ===================================================================
     Resize
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
    if (composer) {
      composer.setSize(w, h);
    }
  }

  /* ===================================================================
     Animation Loop
     =================================================================== */
  function animate(time) {
    animationId = requestAnimationFrame(animate);

    if (!prevTime) {
      prevTime = time;
      return;
    }

    const deltaTime = (time - prevTime) / 1000;
    prevTime = time;
    frameCount++;

    if (gameState === 'playing') {
      updateGame(deltaTime);
    }

    if (renderer && scene && camera) {
      // Update shadow map only every N frames for performance
      if (frameCount % SHADOW_UPDATE_INTERVAL === 0) {
        renderer.shadowMap.needsUpdate = true;
      }
      // Use post-processing composer for bloom/glow
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    }
  }

  /* ===================================================================
     Lifecycle
     =================================================================== */
  onMount(async () => {
    await tick();
    if (containerEl) {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(containerEl);

      initScene();
    }
  });

  onDestroy(() => {
    // Cancel animation frame
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // Remove event listeners
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);

    // Disconnect resize observer
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    // Stop audio
    stopEngineHumAudio(0.2);
    stopWindNoiseAudio(0.2);
    closeAudioContext();

    // Dispose environment resources (sky sphere, grass plane, shared textures)
    // This is called first so environment-owned resources are released
    // before the scene traversal below handles road/object resources.
    if (disposeEnvironment) {
      try { disposeEnvironment(); } catch (e) {
        console.warn('[RacingGame] disposeEnvironment error:', e);
      }
      disposeEnvironment = null;
    }

    // Dispose all Three.js resources from scene objects (road, vehicles, objects, etc.)
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

    // Dispose shared road materials using module.
    disposeRoadMaterials();

    // Dispose decorations using module.
    disposeDecorations();

    // Dispose all tracked geometries and materials from disposables list
    for (const geo of disposables.geometries) {
      try { geo.dispose(); } catch {}
    }
    disposables.geometries = [];

    for (const mat of disposables.materials) {
      try { mat.dispose(); } catch {}
    }
    disposables.materials = [];

    // Dispose tracked textures
    for (const tex of disposables.textures) {
      try { tex.dispose(); } catch {}
    }
    disposables.textures = [];

    if (composer) {
      composer.dispose();
      if (bloomPass) {
        bloomPass.dispose();
        bloomPass = null;
      }
      composer = null;
    }

    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }

    // Clean up effects
    if (effectsAPI) effectsAPI.cleanup();

    // Null out refs
    scene = null;
    camera = null;
    renderer = null;
    vehicle = null;
    roadGroup = null;
    objectsGroup = null;
    sceneryGroup = null;
    grassGroup = null;
    staticGroup = null;
    // shoulderMaterial and surfaceMaterial disposed via disposeRoadMaterials()
    roadSegments = [];
    roadTileData = [];
    treesData = [];
    decoData = [];
    objectDescriptors = [];
    objectMeshMap = new Map();
  });
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
        <button class="start-btn" on:click={startGame}>🚗 开始游戏</button>
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
        <button class="restart-btn" on:click={restartGame}>🔄 重新开始</button>
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
