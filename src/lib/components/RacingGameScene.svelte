<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import * as THREE from 'three';
  import {
    LANE_COUNT, LANE_WIDTH, getLaneX, clampLane,
    MAX_HEALTH, OBSTACLE_DAMAGE, VEHICLE_DAMAGE, REPAIR_HEAL,
    SEGMENT_LENGTH,
    generateSegment, generateSegments, getRoadOffsetAt,
    OBJECT_TYPES,
    generateObjectsForSegment,
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

  let frameCount = 0;
  const COLLISION_CHECK_MOD = 4;

  // Objects with worldZ > this are recycled (behind the player)
  const RECYCLE_WORLD_Z = 5;

  /* ===================================================================
     Three.js — Scene Setup
     =================================================================== */
  function initScene() {
    const container = containerEl;
    const rect = container.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 80, 200);

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

    let data = { segment, surface: null, lines: [], shoulders: [] };

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
    });
    const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
    surface.position.set(0, ROAD_Y, 0);
    surface.receiveShadow = true;
    surface.castShadow = true;
    roadGroup.add(surface);
    data.surface = surface;

    // ---- Lane divider lines (2 dividers for 3 lanes) ----
    const lineMat = new THREE.MeshBasicMaterial({ color: LANE_LINE_COLOR });
    const lineHalfW = 0.075;

    for (let li = 0; li < LANE_COUNT - 1; li++) {
      const lineCenterX = (li - (LANE_COUNT - 2) / 2) * LANE_WIDTH;
      const linePositions = [];
      const lineIndices = [];

      for (let i = 0; i < rows; i++) {
        const z = zStart - i * step;
        const offset = getRoadOffsetAt(roadSegments, z);
        const cx = offset.curveOffset;
        const cy = offset.heightOffset;

        linePositions.push(cx + lineCenterX - lineHalfW, cy + 0.12, z);
        linePositions.push(cx + lineCenterX + lineHalfW, cy + 0.12, z);
      }

      for (let i = 0; i < ROAD_SUBDIVISIONS; i++) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        lineIndices.push(a, c, b, b, c, d);
      }

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      lineGeo.setIndex(lineIndices);
      lineGeo.computeVertexNormals();

      const lineMesh = new THREE.Mesh(lineGeo, lineMat);
      lineMesh.position.set(0, ROAD_Y, 0);
      roadGroup.add(lineMesh);
      data.lines.push(lineMesh);
    }

    // ---- Road shoulders ----
    const shoulderMat = new THREE.MeshBasicMaterial({
      color: ROAD_SHOULDER_COLOR,
      transparent: true,
      opacity: 0.5,
    });
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

      tree.position.set(
        offset.curveOffset + side * distFromCenter,
        ROAD_Y + offset.heightOffset,
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

    // -- Recycle old segments that are now behind the player --
    // A segment with worldZ = roadZ + scrollOffset > RECYCLE_WORLD_Z is behind.
    // Since roadZ is negative (ahead when scrollOffset=0), it scrolls toward +Z.
    while (roadTileData.length > 0) {
      const data = roadTileData[0];
      const seg = data.segment;
      const roadZ = seg.zStart - seg.length / 2;
      const worldZ = roadZ + scrollOffset;
      if (worldZ < RECYCLE_WORLD_Z) break;

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
        child.position.set(
          offset.curveOffset + side * Math.max(dist, ROAD_VISUAL_WIDTH / 2 + 2),
          ROAD_Y + offset.heightOffset,
          child.userData.roadZ + scrollOffset
        );
      }
    }
  }

  function removeTileVisuals(data) {
    const removeMesh = (mesh) => {
      if (!mesh) return;
      roadGroup.remove(mesh);
      if (mesh.isMesh || mesh.isPoints) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
    };

    if (data.surface) removeMesh(data.surface);
    for (const line of data.lines) removeMesh(line);
    for (const s of data.shoulders) removeMesh(s);
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
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshPhongMaterial({
          color: 0xdd3333,
          emissive: 0x661111,
          emissiveIntensity: 0.15,
          shininess: 30,
        });
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.5, 2.0),
          bodyMat
        );
        body.position.y = 0.4;
        body.castShadow = true;
        group.add(body);

        const cabinMat = new THREE.MeshPhongMaterial({
          color: 0xcc2222,
          transparent: true,
          opacity: 0.8,
        });
        const cabin = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 0.35, 1.2),
          cabinMat
        );
        cabin.position.set(0, 0.7, 0);
        group.add(cabin);

        const wheelMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 6);
        const wp = [[-0.5, 0.15, -0.7], [0.5, 0.15, -0.7], [-0.5, 0.15, 0.7], [0.5, 0.15, 0.7]];
        for (const p of wp) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.x = Math.PI / 2;
          w.position.set(p[0], p[1], p[2]);
          group.add(w);
        }

        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
        for (let hx = -0.35; hx <= 0.35; hx += 0.7) {
          const hl = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 6, 6),
            hlMat
          );
          hl.position.set(hx, 0.3, -1.05);
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
    for (const seg of roadSegments) {
      const roadZ = seg.zStart - seg.length / 2;
      const worldZ = roadZ + scrollOffset;

      // Only spawn if within visible range ahead
      if (worldZ < -120 || worldZ > -5) continue;

      // Check if segment already has objects
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
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => { try { m.dispose(); } catch {} });
        } else if (child.material) {
          try { child.material.dispose(); } catch {}
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

    // Road offset at player position (roadZ = 0 - scrollOffset... wait)
    // The player's road position is the cumulative scroll offset.
    // We want road offset at the world position z=0 (where player is).
    // In road space, the player is at -scrollOffset.
    // But getRoadOffsetAt expects road-space Z.
    const playerRoadZ = -scrollOffset;
    const offset = getRoadOffsetAt(roadSegments, playerRoadZ);

    const targetX = offset.curveOffset + laneVisualX;
    const targetY = ROAD_Y + offset.heightOffset + playerY;

    vehicle.position.x += (targetX - vehicle.position.x) * 0.15;
    vehicle.position.y += (targetY - vehicle.position.y) * 0.15;
    vehicle.position.z = 0;

    // Tilt during lane switch
    if (laneSwitchProgress < 1) {
      const laneDelta = targetLane - currentLane;
      vehicle.rotation.z = -laneDelta * 0.12 * (1 - Math.abs(laneSwitchProgress - 0.5) * 2);
    } else {
      vehicle.rotation.z *= 0.9;
    }

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

    const camX = vehicle.position.x * 0.6;
    const camY = vehicle.position.y + 6;
    camera.position.set(camX, camY, 12);

    const lookTarget = new THREE.Vector3(
      lookOffset.curveOffset,
      ROAD_Y + lookOffset.heightOffset + 1,
      -10
    );
    camera.lookAt(lookTarget);
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
