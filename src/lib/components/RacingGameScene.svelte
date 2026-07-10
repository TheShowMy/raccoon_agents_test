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
    startEngineHum, stopEngineHum,
    playLaneSwitchSound, playJumpSound, playCollisionSound,
    playPickupSound, playGameOverSound,
    computeDifficulty,
    createWindNoise, stopWindNoise, updateWindNoiseFilter, updateWindNoiseGain,
  } from '../utils/racingGame.js';

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
  let vehicle = null;

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

  /* ===================================================================
     Player state
     =================================================================== */
  let currentLane = 0;
  let targetLane = 0;
  // Visual lane X position (smoothed during switch)
  let laneVisualX = 0;
  let laneSwitchProgress = 1; // 1 = done

  // Vehicle Z-axis tilt is the sum of two independently tracked
  // components. Tracking them separately (rather than accumulating
  // into `vehicle.rotation.z`) is required because each component
  // has a different lifecycle:
  //   * lane-switch tilt: snaps to the animation curve value while
  //     a lane switch is in progress, then exponentially decays to
  //     0 once the switch completes.
  //   * curve-bank tilt: lerps toward the curve direction so the
  //     vehicle leans into the road in a curve and eases back to
  //     flat on a straight.
  // Composing them each frame (instead of adding on top of last
  // frame's rotation.z) prevents either component from
  // accumulating across frames and producing a runaway tilt.
  let currentLaneSwitchTilt = 0;
  let currentCurveBank = 0;

  /** Wheel mesh references for dynamic rotation */
  let wheels = [];

  let playerY = 0; // jump height above road surface
  let isJumping = false;
  let jumpVelocity = 0;

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
     Input
     =================================================================== */

  /* ===================================================================
     Audio
     =================================================================== */
  let audioCtx = null;
  let engineHum = null;
  let windNoise = null;

  /* ===================================================================
     Timing
     =================================================================== */
  let prevTime = 0;
  let runningTime = 0;

  /* ===================================================================
     Particle effects system
     =================================================================== */
  const PARTICLE_COUNT_PER_BURST = 16;
  const PARTICLE_LIFETIME = 0.7;
  const PARTICLE_SPEED = 3.5;
  let particleBursts = [];
  let shockwaves = [];
  let spiralParticles = [];

  /* ===================================================================
     Constants
     =================================================================== */
  const PLAYER_SPEED = 22;
  const LANE_SWITCH_DURATION = 0.18;
  const JUMP_FORCE = 7.5;
  const GRAVITY = -22;
  // ROAD_Y imported from racingGame.js
  // ROAD_VISUAL_WIDTH imported from road.js

  // Vehicle transform smoothing factors.
  // Fast convergence is safe because the Perlin noise road centreline
  // is continuous and low-frequency (0.006 Hz, 2 octaves), and the
  // lateral amplitude is now amplified by MAX_CURVE_OFFSET = 5.0 so
  // curves produce visibly wider swings than before.
  const VEHICLE_SMOOTH_X = 0.35;
  const VEHICLE_SMOOTH_Y = 0.25;

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
  // camera leans into a curve; VEHICLE_BANK_FACTOR keeps the vehicle
  // tilt subtle so it doesn't fight the existing lane-switch tilt.
  // Both are computed from the *change* in curveOffset over a small
  // look-ahead window so straights (curveOffset flat across the look-
  // ahead) produce ~0 banking while curves (curveOffset changing
  // ahead of the player) produce a visible lean.
  const CAMERA_BANK_LOOK_AHEAD = 8;
  const VEHICLE_BANK_LOOK_AHEAD = 6;
  const CAMERA_BANK_FACTOR = 0.3;
  const VEHICLE_BANK_FACTOR = 0.04;
  // Smoothing factor for the vehicle curve-bank tilt. Each frame the
  // vehicle's curve-bank component lerps toward the new target by
  // this fraction. Equivalent exponential-decay rate is ~85%/frame
  // (≈96% converged in ~20 frames / 0.33 s) — fast enough to lean
  // visibly into curves but slow enough that the tilt does not
  // jitter on the noisy Perlin road. Crucially, using lerp toward
  // the target (not += delta) means the bank component converges
  // to its per-frame target and does not accumulate.
  const VEHICLE_BANK_SMOOTH = 0.15;

  let frameCount = 0;
  const COLLISION_CHECK_MOD = 4;

  // Shadow update interval (every N frames)
  const SHADOW_UPDATE_INTERVAL = 3;

  // Objects with worldZ > this are recycled (behind the player)
  const RECYCLE_WORLD_Z = 5;

  /** Camera shake state */
  let cameraShake = { duration: 0, intensity: 0 };
  /** Previous jump state for landing detection */
  let wasJumping = false;
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

        initRoadSystem();
        createVehicle();

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
     Vehicle Model
     =================================================================== */
  function createVehicle() {
    vehicle = new THREE.Group();

    // Main body — off-road SUV
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x3a9ad9,
      emissive: 0x1a5a8a,
      emissiveIntensity: 0.15,
      shininess: 40,
    });
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.6, 2.8);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    vehicle.add(body);

    // Cabin
    const cabinMat = new THREE.MeshPhongMaterial({
      color: 0x2a7ab9,
      emissive: 0x1a4a7a,
      emissiveIntensity: 0.1,
      shininess: 30,
      transparent: true,
      opacity: 0.85,
    });
    const cabinGeo = new THREE.BoxGeometry(1.3, 0.45, 1.6);
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.75, -0.2);
    cabin.castShadow = true;
    vehicle.add(cabin);

    // Windshield glow
    const glassMat = new THREE.MeshPhongMaterial({
      color: 0x88ccff,
      emissive: 0x4488cc,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.4,
    });
    const glassGeo = new THREE.BoxGeometry(1.1, 0.25, 0.08);
    const windshield = new THREE.Mesh(glassGeo, glassMat);
    windshield.position.set(0, 0.75, -1.0);
    vehicle.add(windshield);
    const rearGlass = new THREE.Mesh(glassGeo, glassMat);
    rearGlass.position.set(0, 0.75, 0.6);
    vehicle.add(rearGlass);

    // Bumpers
    const bumperMat = new THREE.MeshPhongMaterial({ color: 0x4a4a4a, shininess: 20 });
    const bumperGeo = new THREE.BoxGeometry(1.7, 0.15, 0.2);
    const frontBumper = new THREE.Mesh(bumperGeo, bumperMat);
    frontBumper.position.set(0, 0.15, -1.5);
    vehicle.add(frontBumper);
    const rearBumper = new THREE.Mesh(bumperGeo, bumperMat);
    rearBumper.position.set(0, 0.15, 1.5);
    vehicle.add(rearBumper);

    // Wheels (4)
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, shininess: 10 });
    const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8);
    const wheelPositions = [
      [-0.6, 0.15, -0.9],
      [0.6, 0.15, -0.9],
      [-0.6, 0.15, 0.9],
      [0.6, 0.15, 0.9],
    ];
    wheels = [];
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      vehicle.add(wheel);
      wheels.push(wheel);
    }

    // Roof lights
    const lightMat = new THREE.MeshPhongMaterial({
      color: 0xffcc44,
      emissive: 0xff8800,
      emissiveIntensity: 0.5,
    });
    for (let lx = -0.4; lx <= 0.4; lx += 0.8) {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        lightMat
      );
      light.position.set(lx, 0.98, -1.3);
      vehicle.add(light);
    }

    vehicle.position.set(0, ROAD_Y, 0);
    scene.add(vehicle);
  }

  /* ===================================================================
     Game Objects — Visuals
     =================================================================== */
  function createObjectVisual(desc) {
    const offset = getRoadOffsetAt(roadSegments, desc.z);
    const worldX = offset.curveOffset + desc.x;
    const worldY = ROAD_Y + offset.heightOffset;
    const worldZ = desc.z + scrollOffset;

    let mesh;

    switch (desc.type) {
      case OBJECT_TYPES.OBSTACLE: {
        const geo = new THREE.BoxGeometry(1.2, 0.8, 1.2);
        const mat = new THREE.MeshPhongMaterial({
          color: 0xff6633,
          emissive: 0x883311,
          emissiveIntensity: 0.2,
          flatShading: true,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(worldX, worldY + 0.4, worldZ);
        mesh.castShadow = true;
        break;
      }
      case OBJECT_TYPES.ONCOMING_VEHICLE: {
        // Look up the model config so the geometry / colour / wheel
        // count / roof / spoiler all match the descriptor's `modelId`.
        // When the descriptor has no `modelId` (defensive fallback for
        // descriptors created outside `generateObjectsForSegment`) we
        // use the first model from the table so the visual is still a
        // valid oncoming vehicle, not an empty / misaligned mesh.
        const model = getEnemyModelById(desc.modelId)
          || ENEMY_VEHICLE_MODEL_MAP[Object.keys(ENEMY_VEHICLE_MODEL_MAP)[0]];
        const bodyDims = model.body;
        const cabinDims = model.cabin;
        const bodyColor = model.color;
        // Darken the body for the emissive channel so the colour reads
        // strongly as primary body paint (not as glow).
        const emissiveColor = bodyColor & 0xfefefe;
        const wheelCount = model.wheelCount;
        const headlightCount = model.headlightCount;
        const hasRoof = model.hasRoof;
        const hasSpoiler = model.hasSpoiler;

        const group = new THREE.Group();
        const bodyMat = new THREE.MeshPhongMaterial({
          color: bodyColor,
          emissive: emissiveColor,
          emissiveIntensity: 0.15,
          shininess: 30,
        });
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(bodyDims.width, bodyDims.height, bodyDims.length),
          bodyMat
        );
        body.position.y = bodyDims.height / 2;
        body.castShadow = true;
        group.add(body);

        // Cabin: only rendered for models with an enclosed roof. The
        // truck model is open-top (hasRoof=false) so it shows just the
        // body. The cabin sits centred above the body with its base
        // at y = bodyDims.height so the top of the body and the bottom
        // of the cabin are flush.
        if (hasRoof) {
          const cabinMat = new THREE.MeshPhongMaterial({
            color: bodyColor,
            emissive: emissiveColor,
            emissiveIntensity: 0.1,
            transparent: true,
            opacity: 0.8,
          });
          const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(cabinDims.width, cabinDims.height, cabinDims.length),
            cabinMat
          );
          cabin.position.set(0, bodyDims.height + cabinDims.height / 2, 0);
          group.add(cabin);
        }

        // Spoiler: only the sports car carries one. Mounted at the
        // rear (positive Z in the vehicle's local space; remember the
        // group is rotated 180° at the end so the vehicle's "front"
        // is the player's facing direction).
        if (hasSpoiler) {
          const spoilerMat = new THREE.MeshPhongMaterial({ color: bodyColor });
          const spoilerWing = new THREE.Mesh(
            new THREE.BoxGeometry(bodyDims.width * 0.9, 0.05, 0.2),
            spoilerMat
          );
          // Sit the wing just above the body so it reads as a
          // rear-mounted spoiler rather than floating in space.
          spoilerWing.position.set(
            0,
            bodyDims.height + 0.18,
            bodyDims.length / 2 - 0.15,
          );
          // Two thin struts to support the wing.
          const strutGeo = new THREE.BoxGeometry(0.05, 0.18, 0.05);
          for (const sx of [-bodyDims.width * 0.3, bodyDims.width * 0.3]) {
            const strut = new THREE.Mesh(strutGeo, spoilerMat);
            strut.position.set(
              sx,
              bodyDims.height + 0.09,
              bodyDims.length / 2 - 0.15,
            );
            group.add(strut);
          }
          group.add(spoilerWing);
        }

        // Wheels: distribute `wheelCount` wheels evenly along the
        // body length. For 4 wheels the layout matches the original
        // (4 corners); 6 wheels (truck) adds a middle axle.
        const wheelMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 6);
        // 4 → 2 axles (front, back); 6 → 3 axles (front, mid, back).
        const axles = wheelCount / 2;
        const lengthSpan = bodyDims.length * 0.7;
        for (let a = 0; a < axles; a++) {
          // Distribute axles symmetrically around the body centre.
          const z = (a / Math.max(axles - 1, 1) - 0.5) * lengthSpan;
          for (const sx of [-bodyDims.width / 2 + 0.1, bodyDims.width / 2 - 0.1]) {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.rotation.x = Math.PI / 2;
            w.position.set(sx, 0.15, z);
            group.add(w);
          }
        }

        // Headlights: a row of small spheres mounted on the front
        // face of the body. The front of the vehicle is at
        // z = -bodyDims.length / 2 in the group's local space (the
        // group is rotated 180° below, so this becomes the player's
        // direction).
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
        const frontZ = -bodyDims.length / 2 - 0.05;
        for (let h = 0; h < headlightCount; h++) {
          // Centre the headlight row on the body and space them
          // across the available width.
          const t = headlightCount === 1
            ? 0
            : (h / (headlightCount - 1)) - 0.5;
          const hx = t * (bodyDims.width * 0.6);
          const hl = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 6, 6),
            hlMat,
          );
          hl.position.set(hx, 0.3, frontZ);
          group.add(hl);
        }

        group.position.set(worldX, worldY, worldZ);
        group.rotation.y = Math.PI;
        mesh = group;
        break;
      }
      case OBJECT_TYPES.REPAIR_KIT: {
        const group = new THREE.Group();

        const kitMat = new THREE.MeshPhongMaterial({
          color: 0x44dd44,
          emissive: 0x22aa22,
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: 0.9,
        });
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.6, 0.6),
          kitMat
        );
        box.position.y = 0.3;
        box.castShadow = true;
        group.add(box);

        const glowMat = new THREE.MeshBasicMaterial({
          color: 0x44ff44,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
        });
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 8, 8),
          glowMat
        );
        glow.position.y = 0.3;
        group.add(glow);

        group.position.set(worldX, worldY, worldZ);
        mesh = group;
        break;
      }
      default:
        return null;
    }

    if (mesh) {
      mesh.userData.descriptor = desc;
      objectsGroup.add(mesh);
    }
    return mesh;
  }

  function updateObjectVisuals() {
    // Remove visuals for recycled descriptors
    const validDescs = new Set(objectDescriptors);
    const toRemove = [];
    objectMeshMap.forEach((entry, desc) => {
      if (!validDescs.has(desc)) {
        toRemove.push(desc);
      }
    });
    for (const desc of toRemove) {
      const entry = objectMeshMap.get(desc);
      if (entry) {
        objectsGroup.remove(entry.mesh);
        disposeMeshTree(entry.mesh);
      }
      objectMeshMap.delete(desc);
    }

    // Create visuals for new descriptors
    for (const desc of objectDescriptors) {
      if (!objectMeshMap.has(desc)) {
        const visual = createObjectVisual(desc);
        if (visual) objectMeshMap.set(desc, { mesh: visual });
      }
    }

    // Reposition existing visuals based on current scrollOffset
    objectMeshMap.forEach((entry, desc) => {
      const offset = getRoadOffsetAt(roadSegments, desc.z);
      const worldX = offset.curveOffset + desc.x;
      const worldY = ROAD_Y + offset.heightOffset;
      const worldZ = desc.z + scrollOffset;

      entry.mesh.position.set(worldX, worldY, worldZ);

      // Bob repair kits
      if (desc.type === OBJECT_TYPES.REPAIR_KIT) {
        entry.mesh.children.forEach((child) => {
          if (child.isMesh && child.geometry && child.geometry.type === 'SphereGeometry') {
            child.material.opacity = 0.1 + 0.08 * Math.sin(runningTime * 3 + desc.z);
          }
        });
      }
    });
  }

  function disposeMeshTree(obj) {
    if (!obj) return;
    if (obj.isMesh || obj.isPoints) {
      try { obj.geometry.dispose(); } catch {}
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => { try { m.dispose(); } catch {} });
      } else if (obj.material) {
        try { obj.material.dispose(); } catch {}
      }
    }
    if (obj.children) {
      for (let i = obj.children.length - 1; i >= 0; i--) {
        disposeMeshTree(obj.children[i]);
      }
    }
  }

  /* ===================================================================
     Object Spawning & Recycling
     =================================================================== */
  let spawnCooldown = 0;

  // Dynamic-difficulty snapshot. Recomputed every frame inside
  // `updateGame` from the freshly-updated `distance` and
  // `runningTime` and consumed by `spawnObjects` (for the per-
  // segment spawn chance and the per-segment max object count)
  // and by `advanceOncomingVehicles` (for the enemy speed
  // multiplier). Stored at module scope so the spawn / advance
  // functions can read it without having to thread the same
  // snapshot object through every call site. Initialised to a
  // level-0 snapshot (distance=0, runningTime=0) so the very
  // first frame — which `updateGame` enters with a 0-deltaTime
  // `runningTime` advance but a still-0 `distance` — sees
  // baseline difficulty, matching the previous hard-coded
  // behaviour exactly.
  let currentDifficulty = computeDifficulty({ distance: 0, runningTime: 0 });

  function spawnObjects() {
    if (!roadSegments.length) return;

    // Pull the per-frame difficulty parameters out of the
    // snapshot so the rest of the function reads a single,
    // consistent set of values for this frame. Reading from the
    // module-level `currentDifficulty` rather than from
    // `distance` / `runningTime` directly keeps the contract
    // "difficulty is computed once per frame" honest: even if
    // some future refactor mutates `distance` during the spawn
    // loop, the snapshot is the source of truth.
    const spawnChance = currentDifficulty.spawnChance;
    const maxObjectsPerSegment = currentDifficulty.maxObjectsPerSegment;

    // Only spawn on segments that are approaching the player
    for (let i = 0; i < roadSegments.length; i++) {
      const seg = roadSegments[i];
      // roadSegments and roadTileData are kept in sync (same length,
      // shifted together during recycling), so we can look up the
      // per-segment `spawned` flag by the same index.
      const tileData = roadTileData[i];
      const roadZ = seg.zStart - seg.length / 2;
      const worldZ = roadZ + scrollOffset;

      // Only spawn if within visible range ahead
      if (worldZ < -120 || worldZ > -5) continue;

      // Each segment spawns objects at most once during its lifetime.
      // Oncoming vehicles move in road-space toward the player every
      // frame, so without this guard a spawned vehicle could leave the
      // segment it was placed in (the `hasObjects` check below would
      // then return false) and a fresh vehicle could spawn into the
      // same segment which is now very close to — or already past —
      // the player, causing an object to suddenly pop in front of or
      // behind them.
      if (tileData && tileData.spawned) continue;

      // Check if segment already has objects (defence in depth — covers
      // the brief window between `spawned` being set and the descriptors
      // being pushed, and any future refactor that might skip the flag).
      const segStart = seg.zStart;
      const segEnd = seg.zStart - seg.length;
      const hasObjects = objectDescriptors.some(
        (o) => o.z >= segEnd && o.z <= segStart
      );
      if (hasObjects) continue;

      // Per-segment spawn chance, ramped by the dynamic-difficulty
      // snapshot. At level 0 the chance equals the prior hard-coded
      // 0.3; at higher levels it climbs toward SPAWN_CHANCE_MAX.
      if (Math.random() > spawnChance) continue;

      const objects = generateObjectsForSegment(seg, maxObjectsPerSegment);
      objectDescriptors.push(...objects);
      if (tileData) tileData.spawned = true;
    }
  }

  function recycleWorldObjects() {
    // Recycle objects whose world Z has passed behind the player
    for (let i = objectDescriptors.length - 1; i >= 0; i--) {
      const obj = objectDescriptors[i];
      const worldZ = obj.z + scrollOffset;
      if (worldZ > RECYCLE_WORLD_Z) {
        const entry = objectMeshMap.get(obj);
        if (entry) {
          objectsGroup.remove(entry.mesh);
          disposeMeshTree(entry.mesh);
          objectMeshMap.delete(obj);
        }
        objectDescriptors.splice(i, 1);
      }
    }
  }

  /**
   * Advance every active oncoming vehicle in road-space toward the
   * player (+Z direction). Obstacles and repair kits stay anchored to
   * their road-space Z and are only moved visually by the world scroll,
   * so this function only touches objects whose type is
   * OBJECT_TYPES.ONCOMING_VEHICLE.
   *
   * Each vehicle advances at its OWN per-model `obj.speed` (set on
   * the descriptor by `generateObjectsForSegment` from the model
   * table) rather than the global `ONCOMING_VEHICLE_SPEED` constant.
   * This lets fast models close in faster than slow ones, so the
   * visual / audio / collision pacing actually varies per vehicle.
   * Vehicles whose descriptor carries no usable `speed` (e.g. a
   * descriptor built outside `generateObjectsForSegment`) fall back
   * to `ONCOMING_VEHICLE_SPEED`, preserving the prior behaviour for
   * any hand-crafted / legacy descriptor and keeping the per-frame
   * arithmetic a single `+=` per vehicle.
   *
   * The `speedMultiplier` parameter carries the per-frame dynamic-
   * difficulty multiplier (see {@link computeDifficulty} /
   * `currentDifficulty.enemySpeedMultiplier`). Applying the
   * multiplier at advance time — rather than at spawn time —
   * means every active vehicle in the scene feels the current
   * difficulty, so the curve is smooth even when no new vehicles
   * are spawning. A multiplier of `1` (the default) is a no-op,
   * preserving the previous behaviour for any caller that does
   * not pass an explicit multiplier.
   *
   * Mutating obj.z (rather than a separate "vehicle-local Z" field)
   * keeps the downstream world-Z calculation `obj.z + scrollOffset`
   * unchanged, so visual repositioning, recycling and collision
   * detection all keep working with their existing arithmetic — the
   * oncoming vehicle simply closes the gap faster than a stationary
   * prop would (at PLAYER_SPEED + obj.speed*speedMultiplier instead
   * of just PLAYER_SPEED), with `obj.speed` now varying per model
   * and `speedMultiplier` now varying per frame.
   */
  function advanceOncomingVehicles(dt, speedMultiplier = 1) {
    // Sanitise the multiplier the same way `computeDifficulty` does
    // on its output: non-finite, NaN, negative or non-number values
    // are clamped to 1 (no scaling). This keeps a buggy caller from
    // silently breaking the per-frame arithmetic the way a NaN
    // multiplier would taint every obj.z downstream.
    const safeMultiplier = typeof speedMultiplier === 'number'
      && Number.isFinite(speedMultiplier)
      && speedMultiplier > 0
      ? speedMultiplier
      : 1;
    for (let i = 0; i < objectDescriptors.length; i++) {
      const obj = objectDescriptors[i];
      if (!obj || obj.type !== OBJECT_TYPES.ONCOMING_VEHICLE) continue;
      // Per-model speed takes precedence; the global constant is the
      // defensive fallback for descriptors that lack a valid speed.
      // The validity check mirrors the contract on `createObject` /
      // the model table: must be a finite, strictly positive number.
      // Infinity / NaN / 0 / negative would all silently break the
      // per-frame `obj.z += speed * dt` (Infinity blows up the road
      // position; NaN taints the position and breaks collision /
      // recycling downstream).
      const speed = typeof obj.speed === 'number'
        && Number.isFinite(obj.speed)
        && obj.speed > 0
        ? obj.speed
        : ONCOMING_VEHICLE_SPEED;
      obj.z += speed * safeMultiplier * dt;
    }
  }

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

    // -- Oncoming warning --
    showOncomingWarning = objectDescriptors.some((obj) => {
      if (!obj || obj.type !== OBJECT_TYPES.ONCOMING_VEHICLE) return false;
      const worldZ = obj.z + scrollOffset;
      return worldZ >= -60 && worldZ <= 0;
    });

    // -- Dynamic difficulty --
    // Recompute the per-frame difficulty snapshot from the freshly-
    // updated distance + running time so every downstream consumer
    // (spawn cooldown reset, spawn chance, per-segment object cap,
    // enemy speed multiplier) reads a single, consistent set of
    // values for this frame. Updating the snapshot BEFORE the
    // spawn / advance calls below is what makes the difficulty
    // integration a single source of truth: a future refactor that
    // re-orders updateGame cannot accidentally feed the new spawn
    // loop the previous frame's snapshot.
    currentDifficulty = computeDifficulty({ distance, runningTime });

    // -- Lane switching --
    handleLaneSwitch(dt);

    // -- Jump --
    handleJump(dt);

    // -- Spawn & recycle objects --
    spawnCooldown -= dt;
    if (spawnCooldown <= 0) {
      spawnObjects();
      // The reset value is sourced from the dynamic-difficulty
      // snapshot rather than the previous hard-coded 0.25: at
      // higher difficulty the spawn loop ticks faster (down to
      // SPAWN_COOLDOWN_MIN), at level 0 it matches the legacy
      // 0.25 s cadence exactly.
      spawnCooldown = currentDifficulty.spawnCooldownSeconds;
    }
    // Oncoming vehicles actively drive toward the player in addition to
    // the world scroll. Mutate obj.z here (rather than later in the
    // updateObjectVisuals step) so the same value is consumed by
    // recycleWorldObjects, updateObjectVisuals and handleCollisions —
    // keeping a single source of truth for each object's road-space Z.
    // The current frame's enemy-speed multiplier comes from
    // `currentDifficulty.enemySpeedMultiplier` (≥ 1) so all active
    // vehicles feel the difficulty ramp in real time, not just the
    // vehicles spawned this frame.
    advanceOncomingVehicles(dt, currentDifficulty.enemySpeedMultiplier);
    recycleWorldObjects();

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

    // -- Update object visual positions --
    updateObjectVisuals();

    // -- Collision detection (every N frames, spread cost) --
    frameCount++;
    if (frameCount % COLLISION_CHECK_MOD === 0) {
      handleCollisions();
    }

    // -- Update vehicle --
    updateVehicleTransform(dt);

    // -- Update camera --
    updateCamera(forwardStep, dt);

    // -- Update particles --
    updateParticles(dt);

    // -- Update scenery parallax --
    if (sceneryGroup) {
      sceneryGroup.position.z = scrollOffset * 0.15;
    }
    // Apply parallax to staticGroup (mountains/hills InstancedMeshes)
    if (staticGroup) {
      staticGroup.position.z = scrollOffset * 0.15;
    }

    // -- Engine hum pitch modulation --
    if (engineHum && audioCtx) {
      try {
        // Map PLAYER_SPEED (22) to frequency range 80-400Hz using speedFactor
        const speedFactor = Math.abs(forwardStep) / Math.max(dt, 0.001);
        const freq = 80 + Math.min(speedFactor / PLAYER_SPEED, 1) * 320;
        engineHum.oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
      } catch (e) {
        console.warn('[RacingGame] engine hum modulation error:', e);
      }
    }

    // -- Wind noise filter modulation --
    if (windNoise && audioCtx) {
      try {
        updateWindNoiseFilter(windNoise, Math.abs(forwardStep) / Math.max(dt, 0.001));
        updateWindNoiseGain(windNoise, Math.abs(forwardStep) / Math.max(dt, 0.001));
      } catch (e) {
        console.warn('[RacingGame] wind noise modulation error:', e);
      }
    }

    // -- Game over check --
    if (health <= 0 && !gameOverHandled) {
      gameState = 'gameover';
      gameOverHandled = true;
      if (engineHum && audioCtx) {
        try {
          stopEngineHum(engineHum, 0.5);
        } catch (e) {
          console.warn('[RacingGame] stop engine hum error:', e);
        }
        engineHum = null;
      }
      if (audioCtx) {
        try { playGameOverSound(audioCtx); } catch (e) {
          console.warn('[RacingGame] play game over sound error:', e);
        }
      }
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
    frameCount = 0;
    spawnCooldown = 0;
    // Reset the dynamic-difficulty snapshot to a level-0 baseline
    // so the new run starts at the legacy "easy" pacing rather
    // than inheriting a level-N snapshot from the previous run.
    currentDifficulty = computeDifficulty({ distance: 0, runningTime: 0 });

    // Reset camera shake
    cameraShake = { duration: 0, intensity: 0 };
    wasJumping = false;

    // Reset player
    currentLane = 0;
    targetLane = 0;
    laneVisualX = 0;
    laneSwitchProgress = 1;
    currentLaneSwitchTilt = 0;
    currentCurveBank = 0;
    playerY = 0;
    isJumping = false;
    jumpVelocity = 0;

    // Clean up existing objects
    objectMeshMap.forEach((entry) => {
      if (entry && entry.mesh) {
        objectsGroup.remove(entry.mesh);
        disposeMeshTree(entry.mesh);
      }
    });
    objectMeshMap = new Map();
    objectDescriptors = [];

    // Clean up road using module
    cleanupRoadForRestart({
      roadGroup,
      roadTileData,
      setRoadSegments: (s) => { roadSegments = s; },
      setRoadTileData: (d) => { roadTileData = d; },
    });

    // Clean up particles
    cleanupParticles();

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

    vehicle.position.set(0, ROAD_Y, 0);
    vehicle.rotation.set(0, 0, 0);

    // Stop and restart wind noise
    if (windNoise) {
      try { stopWindNoise(windNoise, 0.1); } catch {}
      windNoise = null;
    }
    if (audioCtx) {
      try {
        windNoise = createWindNoise(audioCtx);
      } catch {}
    }

    // Restart engine hum
    if (engineHum && audioCtx) {
      try { stopEngineHum(engineHum, 0.1); } catch {}
      engineHum = null;
    }
    if (audioCtx) {
      try {
        engineHum = startEngineHum(audioCtx);
      } catch {}
    }
  }

  /* ===================================================================
     Start / Menu
     =================================================================== */
  function startGame() {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (audioCtx && !windNoise) {
      windNoise = createWindNoise(audioCtx);
    }
    gameState = 'playing';
  }

  function triggerCollisionEffect(position, desc) {
    if (desc && desc.type === OBJECT_TYPES.ONCOMING_VEHICLE) {
      // Oncoming vehicle: metal sparks + orange/yellow fire particles
      createParticleBurst(position, 0xcccccc, 10); // metallic grey debris
      createParticleBurst(position, 0xffaa22, 8);  // orange/yellow fire sparks
    } else {
      // Normal obstacle: red particles
      createParticleBurst(position, 0xff5533, PARTICLE_COUNT_PER_BURST);
    }
    showFlash = false;
    flashColor = 'rgba(255, 60, 40, 0.35)';
    flashKey++;
    showFlash = true;
    triggerShake(0.3, 0.15);
  }

  function triggerPickupEffect(position) {
    createParticleBurst(position, 0x44ff44, PARTICLE_COUNT_PER_BURST);
    createGreenSpiralParticles(position);
    showFlash = false;
    flashColor = 'rgba(50, 255, 70, 0.25)';
    flashKey++;
    showFlash = true;
  }

  /* ===================================================================
     Lane Switching
     =================================================================== */
  function handleLaneSwitch(dt) {
    if (laneSwitchProgress < 1) {
      laneSwitchProgress += dt / LANE_SWITCH_DURATION;
      if (laneSwitchProgress >= 1) {
        laneSwitchProgress = 1;
        currentLane = targetLane;
      }
      const t = laneSwitchProgress;
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      laneVisualX = laneSwitchStartX + (laneSwitchEndX - laneSwitchStartX) * eased;
    }
  }

  let laneSwitchStartX = 0;
  let laneSwitchEndX = 0;

  function startLaneSwitch(direction) {
    if (gameState === 'gameover') return;
    const newLane = clampLane(currentLane + direction);
    if (newLane === currentLane) return;

    targetLane = newLane;
    laneSwitchStartX = laneVisualX;
    laneSwitchEndX = getLaneX(targetLane);
    laneSwitchProgress = 0;

    if (audioCtx) playLaneSwitchSound(audioCtx);
    if (scene && vehicle) {
      createParticleBurst(vehicle.position.clone(), 0x88ccff, 8);
    }
  }

  /* ===================================================================
     Jump
     =================================================================== */
  function handleJump(dt) {
    if (isJumping) {
      jumpVelocity += GRAVITY * dt;
      playerY += jumpVelocity * dt;
      if (playerY <= 0) {
        playerY = 0;
        const justLanded = wasJumping;
        isJumping = false;
        jumpVelocity = 0;
        // Landing shockwave + camera shake
        if (justLanded && scene && vehicle) {
          const pos = vehicle.position.clone();
          pos.y = ROAD_Y;
          createShockwaveRing(pos);
          triggerShake(0.2, 0.12);
        }
      }
    }
    wasJumping = isJumping;
  }

  function startJump() {
    if (gameState === 'gameover') return;
    if (isJumping) return;
    isJumping = true;
    jumpVelocity = JUMP_FORCE;
    if (audioCtx) playJumpSound(audioCtx);
    if (scene && vehicle) {
      // Jump flame/exhaust particles (orange/yellow, upward burst)
      const pos = vehicle.position.clone();
      pos.y = ROAD_Y;
      createParticleBurst(pos, 0xff8800, 14, true); // orange/yellow flame
      createParticleBurst(pos, 0xffcc00, 6, true);  // yellow accent
    }
    triggerShake(0.15, 0.08);
  }

  /* ===================================================================
     Collision Detection
     =================================================================== */
  function handleCollisions() {
    if (gameState === 'gameover') return;

    for (let i = objectDescriptors.length - 1; i >= 0; i--) {
      const obj = objectDescriptors[i];
      if (!obj.active) continue;

      // Convert to world-space Z for collision check
      // Player is at world Z = 0, object is at world Z = obj.z + scrollOffset
      const objWorldZ = obj.z + scrollOffset;

      // checkCollision compares player.z to object.z
      // We pass player at world z=0 and object at its world Z
      const collisionPlayer = { lane: currentLane, z: 0, y: playerY };
      const collisionObj = { ...obj, z: objWorldZ };

      if (checkCollision(collisionPlayer, collisionObj)) {
        obj.active = false;
        const result = applyCollision(health, obj);

        if (result.healthDelta < 0) {
          if (audioCtx) playCollisionSound(audioCtx);
          if (vehicle) triggerCollisionEffect(vehicle.position.clone(), obj);
        } else if (result.healthDelta > 0) {
          if (audioCtx) playPickupSound(audioCtx);
          if (vehicle) triggerPickupEffect(vehicle.position.clone());
        }

        health = result.health;

        // Remove visual
        const entry = objectMeshMap.get(obj);
        if (entry) {
          objectsGroup.remove(entry.mesh);
          disposeMeshTree(entry.mesh);
          objectMeshMap.delete(obj);
        }

        objectDescriptors.splice(i, 1);

        if (health <= 0) break;
      }
    }
  }

  /* ===================================================================
     Vehicle Visual Transform
     =================================================================== */
  function updateVehicleTransform(dt) {
    if (!vehicle) return;

    // Road offset at the player's road-space Z position.
    // As scrollOffset increases (player moves forward), playerRoadZ
    // decreases, sampling the noise function at progressively more
    // negative Z — producing the illusion of forward travel along the
    // continuous Perlin noise road.
    const playerRoadZ = -scrollOffset;
    const offset = getRoadOffsetAt(roadSegments, playerRoadZ);

    const targetX = offset.curveOffset + laneVisualX;
    const targetY = ROAD_Y + offset.heightOffset + playerY;

    // Fast convergence on the smooth noise road centreline.
    // The Perlin noise is low-frequency (0.006 Hz, 2 octaves) and the
    // lateral amplitude is amplified by MAX_CURVE_OFFSET = 5.0, so
    // curveOffset changes gradually but produces visibly larger
    // swings than before — no jitter from direct tracking.
    vehicle.position.x += (targetX - vehicle.position.x) * VEHICLE_SMOOTH_X;
    vehicle.position.y += (targetY - vehicle.position.y) * VEHICLE_SMOOTH_Y;
    vehicle.position.z = 0;

    // -- Z-axis tilt: lane-switch component ----------------------------
    // While a lane switch is in progress, snap directly to the
    // animation curve value (matches the original behaviour of
    // assigning rotation.z to the computed tilt each frame).
    // After the switch completes, the previous tilt decays
    // exponentially toward 0 — this is exactly the original
    // `rotation.z *= 0.9` behaviour, just expressed on a separate
    // state variable so the curve-bank component below is not
    // pulled along with the decay.
    let targetLaneSwitchTilt = 0;
    if (laneSwitchProgress < 1) {
      const laneDelta = targetLane - currentLane;
      targetLaneSwitchTilt = -laneDelta * 0.12 * (1 - Math.abs(laneSwitchProgress - 0.5) * 2);
      currentLaneSwitchTilt = targetLaneSwitchTilt;
    } else {
      // Decay rate 0.1 ⇒ 90% retained per frame, matches the
      // original `*= 0.9` exponential decay toward 0.
      currentLaneSwitchTilt += (0 - currentLaneSwitchTilt) * 0.1;
    }

    // -- Z-axis tilt: curve-bank component -----------------------------
    // Sample the curveOffset change a few units ahead of the player
    // and lerp the smoothed bank tilt toward the target by
    // VEHICLE_BANK_SMOOTH each frame. Unlike the previous
    // implementation (`rotation.z += delta`), this lerp converges
    // to the current target without accumulating across frames: in
    // a sustained curve the bank eases toward `targetCurveBank` and
    // stays there; when the road straightens, `targetCurveBank`
    // approaches 0 and the smoothed bank eases back to flat. No
    // accumulation, no runaway tilt.
    const aheadRoadZ = playerRoadZ - VEHICLE_BANK_LOOK_AHEAD;
    const aheadOffset = getRoadOffsetAt(roadSegments, aheadRoadZ);
    const curveDelta = aheadOffset.curveOffset - offset.curveOffset;
    const targetCurveBank = -curveDelta * VEHICLE_BANK_FACTOR;
    currentCurveBank += (targetCurveBank - currentCurveBank) * VEHICLE_BANK_SMOOTH;

    // -- Z-axis tilt: compose ------------------------------------------
    // Set rotation.z fresh each frame as the sum of the two
    // independently-tracked components. No `+=`, no cross-frame
    // accumulation.
    vehicle.rotation.z = currentLaneSwitchTilt + currentCurveBank;

    // Tilt during jump
    if (isJumping) {
      vehicle.rotation.x = Math.max(-0.3, Math.min(0.3, jumpVelocity * 0.02));
    } else {
      vehicle.rotation.x *= 0.9;
    }

    // -- Wheel rotation (dynamic, based on speed) --
    const wheelRotationDelta = PLAYER_SPEED * dt * 4.0;
    for (const wheel of wheels) {
      wheel.rotation.z += wheelRotationDelta;
    }
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
     Particles — Burst Effects
     =================================================================== */
  function createParticleBurst(position, colorHex, count = PARTICLE_COUNT_PER_BURST, upwardFlame = false) {
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.3;
      if (upwardFlame) {
        // Upward burst with random horizontal spread for flame effect
        const angle = Math.random() * Math.PI * 2;
        const spread = 0.5 + Math.random() * 1.5;
        velocities.push({
          x: Math.cos(angle) * spread,
          y: 2 + Math.random() * 2.5,
          z: Math.sin(angle) * spread,
        });
      } else {
        velocities.push({
          x: (Math.random() - 0.5) * PARTICLE_SPEED,
          y: Math.random() * PARTICLE_SPEED * 0.6 + 0.3,
          z: (Math.random() - 0.5) * PARTICLE_SPEED,
        });
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.25,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    if (scene) scene.add(points);

    particleBursts.push({
      velocities,
      geometry,
      material,
      points,
      count,
      lifetime: 0,
      maxLifetime: PARTICLE_LIFETIME,
      upwardFlame,
    });

    return points;
  }

  function updateParticles(dt) {
    for (let i = particleBursts.length - 1; i >= 0; i--) {
      const burst = particleBursts[i];
      burst.lifetime += dt;
      const progress = burst.lifetime / burst.maxLifetime;

      if (progress >= 1) {
        if (scene) scene.remove(burst.points);
        burst.geometry.dispose();
        burst.material.dispose();
        particleBursts.splice(i, 1);
        continue;
      }

      const pos = burst.geometry.attributes.position.array;
      for (let j = 0; j < burst.count; j++) {
        pos[j * 3] += burst.velocities[j].x * dt;
        pos[j * 3 + 1] += burst.velocities[j].y * dt;
        pos[j * 3 + 2] += burst.velocities[j].z * dt;
        // Flame particles: decelerate upward velocity gently
        // Regular particles: apply gravity
        if (burst.upwardFlame) {
          burst.velocities[j].y -= 2 * dt;
        } else {
          burst.velocities[j].y += -8 * dt;
        }
      }
      burst.geometry.attributes.position.needsUpdate = true;

      burst.material.opacity = Math.max(0, 1 - progress);
      const scale = 1 + progress * 0.5;
      burst.points.scale.set(scale, scale, scale);
    }

    // Update shockwave rings
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.lifetime += dt;
      const progress = sw.lifetime / sw.maxLifetime;

      if (progress >= 1) {
        if (scene) scene.remove(sw.points);
        sw.geometry.dispose();
        sw.material.dispose();
        shockwaves.splice(i, 1);
        continue;
      }

      const pos = sw.geometry.attributes.position.array;
      for (let j = 0; j < sw.count; j++) {
        pos[j * 3] += sw.velocities[j].x * dt;
        pos[j * 3 + 1] += sw.velocities[j].y * dt;
        pos[j * 3 + 2] += sw.velocities[j].z * dt;
      }
      sw.geometry.attributes.position.needsUpdate = true;

      sw.material.opacity = Math.max(0, 1 - progress);
      const scale = 1 + progress * 3;
      sw.points.scale.set(scale, 1, scale);
    }

    // Update spiral particles (repair kit pickup)
    for (let i = spiralParticles.length - 1; i >= 0; i--) {
      const sp = spiralParticles[i];
      sp.lifetime += dt;
      const progress = sp.lifetime / sp.maxLifetime;

      if (progress >= 1) {
        if (scene) scene.remove(sp.points);
        sp.geometry.dispose();
        sp.material.dispose();
        spiralParticles.splice(i, 1);
        continue;
      }

      const pos = sp.geometry.attributes.position.array;
      for (let j = 0; j < sp.count; j++) {
        const v = sp.velocities[j];
        v.angle += v.angularSpeed * dt;
        pos[j * 3] += Math.cos(v.angle) * v.radius * dt * 0.5;
        pos[j * 3 + 1] += v.riseSpeed * dt;
        pos[j * 3 + 2] += Math.sin(v.angle) * v.radius * dt * 0.5;
      }
      sp.geometry.attributes.position.needsUpdate = true;

      sp.material.opacity = Math.max(0, 1 - progress);
    }
  }

  function cleanupParticles() {
    for (const burst of particleBursts) {
      if (scene) scene.remove(burst.points);
      burst.geometry.dispose();
      burst.material.dispose();
    }
    particleBursts = [];
    for (const sw of shockwaves) {
      if (scene) scene.remove(sw.points);
      sw.geometry.dispose();
      sw.material.dispose();
    }
    shockwaves = [];
    for (const sp of spiralParticles) {
      if (scene) scene.remove(sp.points);
      sp.geometry.dispose();
      sp.material.dispose();
    }
    spiralParticles = [];
  }

  /**
   * Shockwave ring: particles arranged in a circle, expanding outward and fading.
   */
  function createShockwaveRing(position) {
    const count = 24;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const initialRadius = 0.15;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions[i * 3] = position.x + Math.cos(angle) * initialRadius;
      positions[i * 3 + 1] = position.y + 0.05;
      positions[i * 3 + 2] = position.z + Math.sin(angle) * initialRadius;
      const expandSpeed = 2.5;
      velocities.push({
        x: Math.cos(angle) * expandSpeed,
        y: 0.1,
        z: Math.sin(angle) * expandSpeed,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffcc88,
      size: 0.18,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    if (scene) scene.add(points);

    shockwaves.push({ velocities, geometry, material, points, count, lifetime: 0, maxLifetime: 0.6 });
    return points;
  }

  /**
   * Green spiral particles for repair kit pickup: particles rotating upward around Y axis.
   */
  function createGreenSpiralParticles(position) {
    const count = 16;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 0.2 + Math.random() * 0.1;
      positions[i * 3] = position.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = position.y + 0.3;
      positions[i * 3 + 2] = position.z + Math.sin(angle) * radius;
      // Spiral upward with angular velocity
      velocities.push({
        angle,
        radius,
        angularSpeed: 4 + Math.random() * 2,
        riseSpeed: 1.5 + Math.random() * 1.0,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x44ff44,
      size: 0.2,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    if (scene) scene.add(points);

    spiralParticles.push({ velocities, geometry, material, points, count, lifetime: 0, maxLifetime: 0.7 });
    return points;
  }

  /* ===================================================================
     Audio Init
     =================================================================== */
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      engineHum = startEngineHum(audioCtx);
      windNoise = createWindNoise(audioCtx);
    } catch (e) {
      console.warn('[RacingGame] audio init error:', e);
    }
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
    initAudio();

    // Lane switching (only when current switch is complete)
    if (laneSwitchProgress >= 1) {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        startLaneSwitch(-1);
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        startLaneSwitch(1);
      }
    }

    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isJumping) startJump();
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

    // Stop engine hum
    if (engineHum && audioCtx) {
      try { stopEngineHum(engineHum, 0.2); } catch (e) {
        console.warn('[RacingGame] stop engine hum on destroy error:', e);
      }
      engineHum = null;
    }
    if (windNoise) {
      try { stopWindNoise(windNoise, 0.2); } catch (e) {
        console.warn('[RacingGame] stop wind noise on destroy error:', e);
      }
      windNoise = null;
    }

    // Close audio context
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {
        console.warn('[RacingGame] close audio context error:', e);
      }
      audioCtx = null;
    }

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

    // Clean up particles
    cleanupParticles();

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
