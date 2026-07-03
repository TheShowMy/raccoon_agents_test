<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import * as THREE from 'three';
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

  /** @type {THREE.BufferGeometry|null} */
  let grassGeometry = null;

  /** @type {THREE.Material|null} */
  let grassMaterial = null;

  /**
   * Shared road-shoulder material. All shoulder meshes (left and
   * right side, across every road segment) reference this single
   * instance so they pick up identical lighting and fog response.
   * Keeping it at module scope also lets `onDestroy` release the GPU
   * resource exactly once, even though the material is referenced
   * by many meshes.
   *
   * @type {THREE.Material|null} */
  let shoulderMaterial = null;

  /** @type {ResizeObserver|null} */
  let resizeObserver = null;

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

  let playerY = 0; // jump height above road surface
  let isJumping = false;
  let jumpVelocity = 0;

  // Cumulative forward scroll. As player moves forward, scrollOffset increases.
  // Road tiles at roadZ have world Z = roadZ + scrollOffset.
  // Camera and player stay at world Z ≈ 0.
  let scrollOffset = 0;

  /* ===================================================================
     Road state
     =================================================================== */
  const SEGMENTS_AHEAD = 40;
  let roadSegments = []; // sorted: [0] = closest, [last] = farthest ahead

  // Track meshes created for road tiles so we can reposition them
  let roadTileData = []; // { segment, surface, lines[], shoulders[] }

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

  /* ===================================================================
     Constants
     =================================================================== */
  const PLAYER_SPEED = 22;
  const LANE_SWITCH_DURATION = 0.18;
  const JUMP_FORCE = 7.5;
  const GRAVITY = -22;
  // ROAD_Y imported from racingGame.js

  const ROAD_VISUAL_WIDTH = LANE_COUNT * LANE_WIDTH * 1.6;
  const ROAD_TILE_HEIGHT = 0.2;
  /** Subdivisions per road segment for continuous noise-sampled geometry. */
  const ROAD_SUBDIVISIONS = 6;
  const ROAD_COLOR = 0x8a9a8a;
  const ROAD_SHOULDER_COLOR = 0x6a7a6a;
  const LANE_LINE_COLOR = 0xd8e8d8;

  // Grass / ground plane that covers the area below and around the road,
  // giving roadside trees a visible surface to stand on instead of floating
  // at road-surface height. The road surface itself can dip by up to
  // MAX_HEIGHT_DELTA below ROAD_Y, so GRASS_Y is anchored to
  // ROAD_Y - MAX_HEIGHT_DELTA - 0.2 to guarantee the grass plane stays
  // strictly below the deepest possible road surface — preventing the
  // grass from clipping through the road in dips. The small 0.2 unit
  // buffer keeps the surfaces visually distinct while trees stay
  // anchored to a stable, non-jittery ground plane.
  const GRASS_Y = ROAD_Y - MAX_HEIGHT_DELTA - 0.2;
  const GRASS_COLOR = 0x4a7a3a;
  // Grass plane width must comfortably exceed the camera's horizontal
  // field of view at the fog far plane, otherwise the plane's edge
  // is visible as a hard colour boundary inside the fog band. With
  // the camera at z=12 and the fog far plane at z≈-238 (250 units
  // away in the -Z direction), the visible horizontal half-width at
  // the far plane is ≈ 250·tan(45.5°) ≈ 255 units (assuming a 16:9
  // aspect and ~91° horizontal FOV). GRASS_WIDTH=600 (±300) gives a
  // generous margin so the plane edge always sits well outside the
  // visible frustum, and therefore never produces a visible band.
  const GRASS_WIDTH = 600;
  const GRASS_LENGTH = 4000;

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

  // Objects with worldZ > this are recycled (behind the player)
  const RECYCLE_WORLD_Z = 5;

  // Road segments are kept until their far end has scrolled past the
  // camera (camera Z = 12, looking toward -Z). Recycling on segment
  // "center" caused the road under the player to disappear while its far
  // portion was still in view; checking the far end ensures each segment
  // only disappears after it is entirely behind the camera.
  const CAMERA_RECYCLE_Z = 12;

  /* ===================================================================
     Three.js — Scene Setup
     =================================================================== */
  function initScene() {
    const container = containerEl;
    const rect = container.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;

    scene = new THREE.Scene();
    // Background and fog use the SAME colour so the horizon line
    // dissolves smoothly: at the fog far plane every fog-responsive
    // material converges to exactly the background colour, leaving
    // no visible band where the world meets the sky.
    scene.background = new THREE.Color(0x87CEEB);
    // Fog range is intentionally wider than the original (80, 200) so
    // the transition from "no fog" to "fully fog colour" happens over
    // a longer Z span. The near edge (60) starts fading just past the
    // close-to-player road tiles; the far edge (250) sits a little
    // inside the camera's 300-unit far plane so the road and grass
    // are guaranteed to be fully fog colour (and therefore equal to
    // the sky) before the far plane clips them. This kills the hard
    // "sky / ground" colour band the user reported.
    scene.fog = new THREE.Fog(0x87CEEB, 60, 250);

    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 300);
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, -10);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      console.warn('[RacingGame] WebGL not supported:', e);
      webglError = true;
      loading = false;
      return;
    }
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    setupLighting();
    createBackgroundScenery();
    createGrassPlane();
    createRoadSystem();
    createVehicle();

    loading = false;
    animate(0);
  }

  function setupLighting() {
    const ambient = new THREE.AmbientLight(0x8899bb, 0.5);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3a5a3a, 0.6);
    scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.0);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    const d = 30;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 60;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xaaaaee, 0.3);
    fillLight.position.set(-15, 10, -20);
    scene.add(fillLight);
  }

  /* ===================================================================
     Background Scenery (mountains, hills)
     =================================================================== */
  function createBackgroundScenery() {
    sceneryGroup = new THREE.Group();
    scene.add(sceneryGroup);

    const mountainMat = new THREE.MeshPhongMaterial({
      color: 0x6a8a6a,
      flatShading: true,
      transparent: true,
      opacity: 0.4,
    });

    for (let i = 0; i < 12; i++) {
      const height = 8 + Math.random() * 16;
      const radius = 5 + Math.random() * 10;
      const geo = new THREE.ConeGeometry(radius, height, 6 + Math.floor(Math.random() * 4));
      const mesh = new THREE.Mesh(geo, mountainMat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 40;
      mesh.position.set(
        Math.cos(angle) * dist,
        -2,
        -30 - Math.random() * 50
      );
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.scale.x = 0.8 + Math.random() * 0.6;
      sceneryGroup.add(mesh);
    }

    const hillMat = new THREE.MeshPhongMaterial({
      color: 0x7a9a7a,
      flatShading: true,
      transparent: true,
      opacity: 0.3,
    });

    for (let i = 0; i < 8; i++) {
      const radius = 15 + Math.random() * 20;
      const geo = new THREE.SphereGeometry(radius, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const mesh = new THREE.Mesh(geo, hillMat);
      const side = Math.random() > 0.5 ? -1 : 1;
      mesh.position.set(
        (40 + Math.random() * 30) * side,
        -radius * 0.3,
        -20 - Math.random() * 40
      );
      sceneryGroup.add(mesh);
    }
  }

  /* ===================================================================
     Grass / Ground Plane
     =================================================================== */
  function createGrassPlane() {
    // A wide, flat green plane covering the area below and around the road.
    // It exists purely as scenery — a stable surface that roadside trees
    // can sit on at a constant Y instead of inheriting the road's noise-
    // driven heightOffset (which would make them float in dips and sink on
    // hilltops). The plane is added to its own group so it doesn't get
    // recycled by the road tile system. The grass plane is anchored at
    // world Z=0 (under the player position) and does NOT scroll with
    // scrollOffset; its length (GRASS_LENGTH=4000) is sufficient to
    // cover from the player position to well past the fog far plane
    // (≈200 units ahead) regardless of how far the player has travelled.
    grassGroup = new THREE.Group();
    grassGroup.position.z = 0;
    scene.add(grassGroup);

    // Capture the geometry and material at module level so onDestroy can
    // explicitly dispose them. The scene.traverse() in onDestroy already
    // disposes every mesh, but retaining direct references guarantees the
    // GPU resources are freed even if the grass group is ever detached
    // from the scene graph during a future refactor.
    grassMaterial = new THREE.MeshPhongMaterial({
      color: GRASS_COLOR,
      flatShading: true,
      // Explicitly enable fog response. MeshPhongMaterial defaults to
      // fog:true in Three.js, but stating it makes the contract
      // auditable and protects the material from accidentally being
      // switched off by a future refactor that flattens the options
      // object. With fog enabled, the grass colour is interpolated
      // toward the sky colour (0x87CEEB) as the grass recedes into
      // the distance, so the grass-to-sky transition is smooth
      // rather than a hard line at the fog far plane.
      fog: true,
    });
    grassGeometry = new THREE.PlaneGeometry(GRASS_WIDTH, GRASS_LENGTH);
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = GRASS_Y;
    grass.receiveShadow = true;
    grassGroup.add(grass);
  }

  /* ===================================================================
     Road System
     =================================================================== */
  function createRoadSystem() {
    roadGroup = new THREE.Group();
    scene.add(roadGroup);

    objectsGroup = new THREE.Group();
    scene.add(objectsGroup);

    // Generate initial road segments (ahead of player, in road-space)
    roadSegments = generateSegments(0, SEGMENTS_AHEAD);

    // Create visuals for each segment
    roadSegments.forEach((seg) => {
      createContinuousRoadSegment(seg);
    });

    // Roadside decoration trees
    createRoadsideTrees();
  }

  /**
   * Create continuous smooth road geometry for a single road segment.
   * Uses a custom BufferGeometry with vertices sampled from the Perlin noise
   * centre‑line at multiple Z positions, ensuring seamless connection with
   * adjacent segments (vertices at shared Z boundaries match exactly).
   *
   * Lane divider lines and road shoulders are also created as continuous
   * strips using the same noise sampling.
   */
  function createContinuousRoadSegment(segment) {
    const zStart = segment.zStart;
    const step = segment.length / ROAD_SUBDIVISIONS;
    const rows = ROAD_SUBDIVISIONS + 1;
    const halfW = ROAD_VISUAL_WIDTH / 2;

    // `spawned` records whether objects have already been generated for
    // this segment during its lifetime. It stays false until spawnObjects
    // produces objects in this segment, then is flipped to true so the
    // segment never spawns again. This prevents an oncoming vehicle from
    // leaving its parent segment (its desc.z is advanced toward the
    // player every frame) and a fresh vehicle being spawned into the
    // same segment which is now very close to — or already past — the
    // player, causing an object to suddenly pop in front of or behind
    // them.
    let data = { segment, surface: null, lines: [], shoulders: [], spawned: false };

    // ---- Road surface ----
    const surfacePositions = [];
    const surfaceIndices = [];

    for (let i = 0; i < rows; i++) {
      const z = zStart - i * step;
      const offset = getRoadOffsetAt(roadSegments, z);
      surfacePositions.push(offset.curveOffset - halfW, offset.heightOffset, z);
      surfacePositions.push(offset.curveOffset + halfW, offset.heightOffset, z);
    }

    for (let i = 0; i < ROAD_SUBDIVISIONS; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      surfaceIndices.push(a, c, b, b, c, d);
    }

    const surfaceGeo = new THREE.BufferGeometry();
    surfaceGeo.setAttribute('position', new THREE.Float32BufferAttribute(surfacePositions, 3));
    surfaceGeo.setIndex(surfaceIndices);
    surfaceGeo.computeVertexNormals();

    const surfaceMat = new THREE.MeshPhongMaterial({
      color: ROAD_COLOR,
      flatShading: true,
      side: THREE.DoubleSide,
      // Explicitly enable fog so the road surface blends into the
      // sky colour (0x87CEEB) at the far end of the visible range,
      // matching the grass and shoulders. This is what removes the
      // hard "road meets sky" colour band the user reported.
      fog: true,
    });
    const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
    surface.position.set(0, ROAD_Y, 0);
    surface.receiveShadow = true;
    surface.castShadow = true;
    roadGroup.add(surface);
    data.surface = surface;

    // ---- Lane divider lines (2 dividers for 3 lanes, drawn as dashes) ----
    // Each divider is split into short mesh strips separated by gaps, so the
    // three lane boundaries read as intermittent dashed lines rather than a
    // continuous band. Road width, lane count and surface geometry are
    // unchanged.
    const lineMat = new THREE.MeshBasicMaterial({ color: LANE_LINE_COLOR, fog: true });
    const lineHalfW = 0.075;
    // Dash pattern based on subdivision indices: every DASH_PATTERN_SUBDIVS
    // subdivisions we draw DASH_LENGTH_SUBDIVS rows of stripe then leave the
    // rest as a gap.  ROAD_SUBDIVISIONS (6) is a multiple of 3, so each
    // segment cleanly contains two full dashes and segments tile seamlessly.
    const DASH_PATTERN_SUBDIVS = 3;
    const DASH_LENGTH_SUBDIVS = 2;

    for (let li = 0; li < LANE_COUNT - 1; li++) {
      const lineCenterX = (li - (LANE_COUNT - 2) / 2) * LANE_WIDTH;
      let dashPositions = [];
      let dashIndices = [];

      const flushDash = () => {
        // Skip building a mesh when the buffered strip has no triangles.
        // This happens at the trailing edge of every segment because
        // rows = ROAD_SUBDIVISIONS + 1 = 7 leaves the final dash row with
        // no following row to pair into a quad within the same segment.
        // Without this guard we'd allocate a degenerate 2-vertex / 0-index
        // mesh for every lane of every segment.
        if (dashIndices.length === 0) {
          dashPositions = [];
          dashIndices = [];
          return;
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(dashPositions, 3),
        );
        lineGeo.setIndex(dashIndices);
        lineGeo.computeVertexNormals();

        const lineMesh = new THREE.Mesh(lineGeo, lineMat);
        lineMesh.position.set(0, ROAD_Y, 0);
        roadGroup.add(lineMesh);
        data.lines.push(lineMesh);
        dashPositions = [];
        dashIndices = [];
      };

      for (let i = 0; i < rows; i++) {
        const z = zStart - i * step;
        const offset = getRoadOffsetAt(roadSegments, z);
        const cx = offset.curveOffset;
        const cy = offset.heightOffset;
        const inDash = (i % DASH_PATTERN_SUBDIVS) < DASH_LENGTH_SUBDIVS;

        if (inDash) {
          const v0 = dashPositions.length / 3;
          dashPositions.push(cx + lineCenterX - lineHalfW, cy + 0.12, z);
          dashPositions.push(cx + lineCenterX + lineHalfW, cy + 0.12, z);
          // Only emit quad indices once we have a previous row to pair with.
          if (v0 >= 2) {
            const a = v0 - 2;
            const b = v0 - 1;
            const c = v0;
            const d = v0 + 1;
            dashIndices.push(a, c, b, b, c, d);
          }
        } else {
          flushDash();
        }
      }

      // Flush any trailing dash that reaches the end of the segment.
      flushDash();
    }

    // ---- Road shoulders ----
    // The shoulder material is built ONCE and shared by every
    // shoulder mesh (both sides of every road segment). The previous
    // implementation created a fresh `MeshBasicMaterial` inside this
    // function for each segment, so each tile had its own material
    // instance, and that material was a flat, unlit, semi-transparent
    // colour — meaning:
    //   * the shoulder never reacted to the scene lights, so it read
    //     as a uniformly coloured band sitting on top of the
    //     (correctly lit) grass, creating a visible "shoulder-vs-
    //     grass" style gap on both sides of the road;
    //   * the `transparent: true, opacity: 0.5` made the shoulder
    //     blend with whatever was behind it, which broke the fog
    //     transition at the far end of the road and made the two
    //     sides look different depending on the noise-driven road
    //     curve.
    // The shared `MeshLambertMaterial` below fixes both issues:
    //   * it responds to the same ambient / hemisphere / directional
    //     lights as the grass, so the shoulder and the grass on
    //     either side receive identical illumination at the same
    //     world position — the left and right shoulders therefore
    //     pick up the same shading pattern as their neighbouring
    //     grass, and the two sides look identical to each other;
    //   * it is opaque (no `transparent` flag), so the fog
    //     interpolates its colour directly toward the sky colour at
    //     the far plane, matching the road surface and grass for a
    //     smooth horizon transition.
    // Both sides of every segment reference the same `shoulderMaterial`
    // instance (set up in `createRoadSystem()`), so a state change on
    // the material — colour, fog flag, etc. — automatically applies
    // uniformly to every shoulder mesh in the scene.
    if (!shoulderMaterial) {
      shoulderMaterial = new THREE.MeshLambertMaterial({
        color: ROAD_SHOULDER_COLOR,
        fog: true,
      });
    }
    const shoulderMat = shoulderMaterial;
    const shoulderHalfW = 0.3;

    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? -1 : 1;
      const shoulderPositions = [];
      const shoulderIndices = [];

      for (let i = 0; i < rows; i++) {
        const z = zStart - i * step;
        const offset = getRoadOffsetAt(roadSegments, z);
        const cx = offset.curveOffset;
        const cy = offset.heightOffset;

        const innerEdge = side * halfW - side * shoulderHalfW;
        const outerEdge = side * halfW + side * shoulderHalfW;
        shoulderPositions.push(cx + innerEdge, cy + 0.12, z);
        shoulderPositions.push(cx + outerEdge, cy + 0.12, z);
      }

      for (let i = 0; i < ROAD_SUBDIVISIONS; i++) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        shoulderIndices.push(a, c, b, b, c, d);
      }

      const shoulderGeo = new THREE.BufferGeometry();
      shoulderGeo.setAttribute('position', new THREE.Float32BufferAttribute(shoulderPositions, 3));
      shoulderGeo.setIndex(shoulderIndices);
      shoulderGeo.computeVertexNormals();

      const shoulderMesh = new THREE.Mesh(shoulderGeo, shoulderMat);
      shoulderMesh.position.set(0, ROAD_Y, 0);
      roadGroup.add(shoulderMesh);
      data.shoulders.push(shoulderMesh);
    }

    roadTileData.push(data);
  }

  /**
   * Reposition all road tile visuals based on current scrollOffset.
   * With continuous noise‑sampled geometry, vertex positions already encode
   * the correct lateral and height offsets.  We only need to scroll the
   * meshes along the Z axis.
   */
  function repositionRoadTiles() {
    for (const data of roadTileData) {
      // With continuous noise‑based geometry, vertex positions are already at
      // the correct local‑space curve/height offsets. Only scroll Z.
      if (data.surface) {
        data.surface.position.z = scrollOffset;
      }
      for (const line of data.lines) {
        line.position.z = scrollOffset;
      }
      for (const s of data.shoulders) {
        s.position.z = scrollOffset;
      }
    }

    // Anchor the grass plane at world Z=0 so it always covers the
    // player position. The grass plane is not scrolled with the world —
    // it is fixed at Z=0 regardless of scrollOffset; its length
    // (GRASS_LENGTH=4000) is sufficient to cover the visible range.
    if (grassGroup) {
      grassGroup.position.z = 0;
    }
  }

  /** Simple cone-shaped trees along the road. */
  function createRoadsideTrees() {
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x6a4a2a });
    const foliageMat = new THREE.MeshPhongMaterial({
      color: 0x5a9a5a,
      flatShading: true,
    });

    for (let i = 0; i < 60; i++) {
      const roadZ = -5 - Math.random() * 200;
      const side = Math.random() > 0.5 ? -1 : 1;
      const distFromCenter = ROAD_VISUAL_WIDTH / 2 + 2 + Math.random() * 5;
      const offset = getRoadOffsetAt(roadSegments, roadZ);

      const tree = new THREE.Group();

      // Trunk
      const trunkH = 0.5 + Math.random() * 0.5;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, trunkH, 4),
        trunkMat
      );
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      tree.add(trunk);

      // Foliage
      const foliageCount = 1 + Math.floor(Math.random() * 2);
      for (let f = 0; f < foliageCount; f++) {
        const fHeight = 0.8 + Math.random() * 0.6;
        const fRadius = 0.5 + Math.random() * 0.4;
        const foliage = new THREE.Mesh(
          new THREE.ConeGeometry(fRadius, fHeight, 5),
          foliageMat
        );
        foliage.position.y = trunkH + f * fHeight * 0.5;
        foliage.castShadow = true;
        tree.add(foliage);
      }

      // Anchor the tree at GRASS_Y instead of the noise-driven road
      // height so the trunk bottom sits on the grass plane (a stable,
      // constant Y) rather than floating in road dips or sinking on
      // hilltops. The X position still follows the road curve so trees
      // track the direction of the road.
      tree.position.set(
        offset.curveOffset + side * distFromCenter,
        GRASS_Y,
        roadZ
      );
      tree.userData.roadZ = roadZ;
      tree.userData.isTree = true;
      roadGroup.add(tree);
    }
  }

  /**
   * Update road: recycle old segments, extend new ones ahead,
   * reposition all road tile visuals.
   */
  function updateRoad() {
    if (!roadGroup) return;

    // -- Recycle old segments that are fully past the camera --
    // Each segment extends in road-space from seg.zStart (near end, +Z
    // side when viewed in front of the player) to seg.zStart - seg.length
    // (far end, -Z side). We recycle only when this far end has scrolled
    // past the camera, guaranteeing the segment is no longer visible.
    while (roadTileData.length > 0) {
      const data = roadTileData[0];
      const seg = data.segment;
      const roadFarZ = seg.zStart - seg.length;
      const worldZ = roadFarZ + scrollOffset;
      if (worldZ < CAMERA_RECYCLE_Z) break;

      // Remove from roadSegments (index 0 = closest segment)
      roadSegments.shift();

      // Remove meshes
      removeTileVisuals(data);
      roadTileData.shift();
    }

    // -- Extend new segments at the front (ahead) --
    let needNew = true;
    while (needNew) {
      const lastSeg = roadSegments.length > 0 ? roadSegments[roadSegments.length - 1] : null;
      const newRoadZ = lastSeg ? lastSeg.zStart - SEGMENT_LENGTH : -SEGMENT_LENGTH;
      const newWorldZ = newRoadZ + scrollOffset;
      // Only generate if the new segment's far end is within draw distance
      if (newWorldZ < -200) {
        needNew = false;
        break;
      }

      const newSeg = generateSegment(newRoadZ);
      roadSegments.push(newSeg);
      createContinuousRoadSegment(newSeg);
    }

    // -- Reposition all road tiles --
    repositionRoadTiles();

    // -- Reposition trees --
    for (const child of roadGroup.children) {
      if (child.userData && child.userData.isTree) {
        const roadZ = child.userData.roadZ;
        const worldZ = roadZ + scrollOffset;
        if (worldZ > RECYCLE_WORLD_Z + 20) {
          // Recycle tree (reuse by placing it far ahead)
          const lastSeg = roadSegments[roadSegments.length - 1];
          child.userData.roadZ = lastSeg ? lastSeg.zStart - Math.random() * 200 : -200;
        }
        const offset = getRoadOffsetAt(roadSegments, child.userData.roadZ);
        const side = child.position.x > 0 ? 1 : -1;
        const dist = Math.abs(child.position.x - offset.curveOffset);
        // Anchor trees to GRASS_Y so the trunk bottom rests on the grass
        // plane at a constant Y, instead of inheriting the road's
        // heightOffset (which would lift them off the ground in dips and
        // push them into the terrain on hilltops).
        child.position.set(
          offset.curveOffset + side * Math.max(dist, ROAD_VISUAL_WIDTH / 2 + 2),
          GRASS_Y,
          child.userData.roadZ + scrollOffset
        );
      }
    }
  }

  function removeTileVisuals(data) {
    // `skipMaterialDispose` is true for shoulder meshes because the
    // shoulder material is shared across every segment (and both
    // sides) of the road — disposing it on the first segment recycle
    // would leave every other shoulder mesh with a dangling GPU
    // reference. The shared material is released exactly once in
    // `onDestroy`, matching the lifecycle of `grassMaterial`.
    const removeMesh = (mesh, skipMaterialDispose = false) => {
      if (!mesh) return;
      roadGroup.remove(mesh);
      if (mesh.isMesh || mesh.isPoints) {
        mesh.geometry.dispose();
        if (!skipMaterialDispose) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      }
    };

    if (data.surface) removeMesh(data.surface);
    for (const line of data.lines) removeMesh(line);
    for (const s of data.shoulders) removeMesh(s, true);
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
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      vehicle.add(wheel);
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

  function spawnObjects() {
    if (!roadSegments.length) return;

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

      // Random spawn chance
      if (Math.random() > 0.3) continue;

      const objects = generateObjectsForSegment(seg, 1);
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
   * Mutating obj.z (rather than a separate "vehicle-local Z" field)
   * keeps the downstream world-Z calculation `obj.z + scrollOffset`
   * unchanged, so visual repositioning, recycling and collision
   * detection all keep working with their existing arithmetic — the
   * oncoming vehicle simply closes the gap faster than a stationary
   * prop would (at PLAYER_SPEED + obj.speed instead of just
   * PLAYER_SPEED), with `obj.speed` now varying per model.
   */
  function advanceOncomingVehicles(dt) {
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
      obj.z += speed * dt;
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

    // -- Lane switching --
    handleLaneSwitch(dt);

    // -- Jump --
    handleJump(dt);

    // -- Spawn & recycle objects --
    spawnCooldown -= dt;
    if (spawnCooldown <= 0) {
      spawnObjects();
      spawnCooldown = 0.25;
    }
    // Oncoming vehicles actively drive toward the player in addition to
    // the world scroll. Mutate obj.z here (rather than later in the
    // updateObjectVisuals step) so the same value is consumed by
    // recycleWorldObjects, updateObjectVisuals and handleCollisions —
    // keeping a single source of truth for each object's road-space Z.
    advanceOncomingVehicles(dt);
    recycleWorldObjects();

    // -- Update road --
    updateRoad();

    // -- Update object visual positions --
    updateObjectVisuals();

    // -- Collision detection (every N frames, spread cost) --
    frameCount++;
    if (frameCount % COLLISION_CHECK_MOD === 0) {
      handleCollisions();
    }

    // -- Update vehicle --
    updateVehicleTransform();

    // -- Update camera --
    updateCamera();

    // -- Update particles --
    updateParticles(dt);

    // -- Update scenery parallax --
    if (sceneryGroup) {
      sceneryGroup.position.z = scrollOffset * 0.15;
    }

    // -- Engine hum pitch modulation --
    if (engineHum && audioCtx) {
      try {
        engineHum.oscillator.frequency.setValueAtTime(
          80 + Math.abs(forwardStep) * 3,
          audioCtx.currentTime
        );
      } catch (e) {
        console.warn('[RacingGame] engine hum modulation error:', e);
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
    gameState = 'playing';
    gameOverHandled = false;
    scrollOffset = 0;
    runningTime = 0;
    frameCount = 0;
    spawnCooldown = 0;

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

    // Clean up existing road
    while (roadGroup.children.length > 0) {
      const child = roadGroup.children[0];
      if (child.isMesh) {
        try { child.geometry.dispose(); } catch {}
        // The shoulder material is shared across every shoulder mesh,
        // so we must NOT dispose it here — that would leave the
        // about-to-be-created shoulders on the new road referencing a
        // disposed GPU resource. The shared material is kept alive
        // across restarts; it is only released in `onDestroy`. The
        // surface and line materials are per-segment instances and
        // are safe to dispose normally.
        const isSharedShoulder = shoulderMaterial
          && (child.material === shoulderMaterial
            || (Array.isArray(child.material)
              && child.material.indexOf(shoulderMaterial) !== -1));
        if (!isSharedShoulder) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => { try { m.dispose(); } catch {} });
          } else if (child.material) {
            try { child.material.dispose(); } catch {}
          }
        }
      }
      roadGroup.remove(child);
    }
    roadTileData = [];

    // Clean up particles
    cleanupParticles();

    // Re-initialise road and vehicle position
    roadSegments = generateSegments(0, SEGMENTS_AHEAD);
    roadSegments.forEach((seg) => {
      createContinuousRoadSegment(seg);
    });
    createRoadsideTrees();

    vehicle.position.set(0, ROAD_Y, 0);
    vehicle.rotation.set(0, 0, 0);

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
    gameState = 'playing';
  }

  function triggerCollisionEffect(position) {
    createParticleBurst(position, 0xff5533, PARTICLE_COUNT_PER_BURST);
    showFlash = false;
    flashColor = 'rgba(255, 60, 40, 0.35)';
    flashKey++;
    showFlash = true;
  }

  function triggerPickupEffect(position) {
    createParticleBurst(position, 0x44ff44, PARTICLE_COUNT_PER_BURST);
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
        isJumping = false;
        jumpVelocity = 0;
      }
    }
  }

  function startJump() {
    if (gameState === 'gameover') return;
    if (isJumping) return;
    isJumping = true;
    jumpVelocity = JUMP_FORCE;
    if (audioCtx) playJumpSound(audioCtx);
    if (scene && vehicle) {
      const pos = vehicle.position.clone();
      pos.y = ROAD_Y;
      createParticleBurst(pos, 0xccccff, 8);
    }
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
          if (vehicle) triggerCollisionEffect(vehicle.position.clone());
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
  function updateVehicleTransform() {
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
  }

  /* ===================================================================
     Camera
     =================================================================== */
  function updateCamera() {
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

  /* ===================================================================
     Particles — Burst Effects
     =================================================================== */
  function createParticleBurst(position, colorHex, count = PARTICLE_COUNT_PER_BURST) {
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.3;
      velocities.push({
        x: (Math.random() - 0.5) * PARTICLE_SPEED,
        y: Math.random() * PARTICLE_SPEED * 0.6 + 0.3,
        z: (Math.random() - 0.5) * PARTICLE_SPEED,
      });
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
        burst.velocities[j].y += -8 * dt;
      }
      burst.geometry.attributes.position.needsUpdate = true;

      burst.material.opacity = Math.max(0, 1 - progress);
      const scale = 1 + progress * 0.5;
      burst.points.scale.set(scale, scale, scale);
    }
  }

  function cleanupParticles() {
    for (const burst of particleBursts) {
      if (scene) scene.remove(burst.points);
      burst.geometry.dispose();
      burst.material.dispose();
    }
    particleBursts = [];
  }

  /* ===================================================================
     Audio Init
     =================================================================== */
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      engineHum = startEngineHum(audioCtx);
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
      renderer.render(scene, camera);
    }
  }

  /* ===================================================================
     Lifecycle
     =================================================================== */
  onMount(async () => {
    await tick();
    if (containerEl) {
      initScene();
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(containerEl);
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

    // Close audio context
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {
        console.warn('[RacingGame] close audio context error:', e);
      }
      audioCtx = null;
    }

    // Dispose all Three.js resources
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

    // Explicitly dispose grass GPU resources. The scene.traverse() loop
    // above already covers them, but releasing the cached references up
    // front prevents accidental retention if grassGroup is later detached
    // from the scene (and makes the cleanup contract explicit).
    if (grassGeometry) {
      try { grassGeometry.dispose(); } catch {}
      grassGeometry = null;
    }
    if (grassMaterial) {
      try { grassMaterial.dispose(); } catch {}
      grassMaterial = null;
    }
    // Dispose the shared shoulder material exactly once. The
    // per-segment recycle path (`removeTileVisuals`) deliberately
    // skips material disposal for shoulder meshes because every
    // shoulder mesh shares this single instance — releasing it here
    // (in step with `grassMaterial`) keeps the lifecycle balanced.
    if (shoulderMaterial) {
      try { shoulderMaterial.dispose(); } catch {}
      shoulderMaterial = null;
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
    grassGeometry = null;
    grassMaterial = null;
    shoulderMaterial = null;
    roadSegments = [];
    roadTileData = [];
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
