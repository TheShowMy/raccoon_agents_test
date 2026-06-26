<script>
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import BackNav from '../lib/components/BackNav.svelte';
  import PageHeader from '../lib/components/PageHeader.svelte';
  import Footer from '../lib/components/Footer.svelte';
  import {
    createRacingEngine,
    RACING_STATUS,
    ENTITY_KIND,
  } from '../lib/utils/racingEngine.js';
  import {
    buildRoadSegments,
    advanceRoadProgress,
    laneCenterXAt,
    ROAD_SEGMENT_COUNT,
    ROAD_SEGMENT_LENGTH,
    ROAD_HALF_WIDTH,
    LANE_CENTER_X,
  } from '../lib/utils/racingRoad.js';
  import {
    createPlayerCar,
    createObstacle,
    createOncomingVehicle,
    createHealthPickup,
  } from '../lib/utils/racingModels.js';

  /**
   * 渲染层职责：
   *   - 初始化 three.js 场景、相机、灯光、WebGLRenderer
   *   - 用 racingRoad 构建蜿蜒道路，按帧滚动 progress
   *   - 用 racingModels 构建玩家车、障碍物、对向车辆、加血道具
   *   - 用 racingEngine 驱动游戏状态，每帧把抽象状态同步到 3D 对象
   *
   * 视觉坐标约定：
   *   - 引擎的 entity.z / player.z 在 [-90, +10] 区间（playerZ=0，spawnZ=-90，despawnZ=+10）
   *   - 道路段在 ROAD_TOTAL_LENGTH=240 的循环中铺设
   *   - 渲染时把 engine_z 整体偏移 +Z_VISUAL_OFFSET=90，使玩家落在道路段中央，
   *     实体起点（engine_z=-90）落在道路段 z=0，端点（engine_z=+10）落在道路段 z=100。
   */

  /** @type {HTMLDivElement|undefined} */
  let sceneEl;

  // three.js 实例（onMount 后赋值）
  /** @type {THREE.Scene|null} */
  let scene = null;
  /** @type {THREE.PerspectiveCamera|null} */
  let camera = null;
  /** @type {THREE.WebGLRenderer|null} */
  let renderer = null;

  // 游戏引擎
  /** @type {ReturnType<typeof createRacingEngine>|null} */
  let engine = null;

  // 场景物件（持有引用以便每帧同步 + 卸载时 dispose）
  /** @type {THREE.Group|null} */
  let playerMesh = null;
  /** @type {THREE.Group[]} */
  let roadSegmentGroups = [];
  /** @type {Map<number, THREE.Group>} */
  const entityMeshes = new Map();

  // 道路与动画状态
  let roadProgress = 0;
  /** @type {number|null} */
  let lastFrameTime = null;
  /** @type {number|null} */
  let animationId = null;
  /** @type {ResizeObserver|null} */
  let resizeObserver = null;

  // 视觉常量
  const Z_VISUAL_OFFSET = 90;
  const PLAYER_VISUAL_Z = Z_VISUAL_OFFSET; // 引擎 playerZ=0 → 渲染 z=90
  const ROAD_EDGE_HALF_THICKNESS = 0.12;

  // 状态展示（仅渲染层状态：是否已就绪；HUD 由后续任务提供）
  let sceneReady = false;
  let sceneInitError = '';

  onMount(() => {
    try {
      initThree();
      engine = createRacingEngine();
      // 渲染层负责让场景活着：进入页面即开始游戏状态，便于验证
      engine.start();
      initPlayerMesh();
      initRoadSegments();
      initGroundPlane();
      animationId = requestAnimationFrame(animate);

      resizeObserver = new ResizeObserver(() => {
        syncRendererSize();
      });
      if (sceneEl) resizeObserver.observe(sceneEl);

      sceneReady = true;
    } catch (err) {
      sceneInitError = err && err.message ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[RacingGame] three.js 初始化失败', err);
    }
  });

  onDestroy(() => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    disposeScene();
    scene = null;
    camera = null;
    renderer = null;
    engine = null;
  });

  /* ============================================================
   * three.js 初始化
   * ============================================================ */

  function initThree() {
    if (!sceneEl) throw new Error('sceneEl 未挂载');

    const rect = sceneEl.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14151f);
    // 雾：从相机 30 单位开始淡入，140 单位完全淡入背景色，远处道路自然消失
    scene.fog = new THREE.Fog(0x14151f, 30, 140);

    camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 300);
    camera.position.set(0, 4.5, PLAYER_VISUAL_Z + 18);
    camera.lookAt(0, 0.8, PLAYER_VISUAL_Z - 30);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sceneEl.appendChild(renderer.domElement);

    // 灯光：环境光 + 月光主光 + 反向补光
    const ambient = new THREE.AmbientLight(0x8a90b0, 0.45);
    scene.add(ambient);

    const moonLight = new THREE.DirectionalLight(0xb4c0e8, 0.95);
    moonLight.position.set(20, 35, PLAYER_VISUAL_Z + 25);
    moonLight.target.position.set(0, 0, PLAYER_VISUAL_Z - 10);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 160;
    moonLight.shadow.camera.left = -24;
    moonLight.shadow.camera.right = 24;
    moonLight.shadow.camera.top = 30;
    moonLight.shadow.camera.bottom = -10;
    scene.add(moonLight);
    scene.add(moonLight.target);

    const fillLight = new THREE.DirectionalLight(0x4a5d8a, 0.32);
    fillLight.position.set(-18, 10, PLAYER_VISUAL_Z + 5);
    scene.add(fillLight);
  }

  function initPlayerMesh() {
    playerMesh = createPlayerCar();
    scene.add(playerMesh);
    syncPlayerMesh();
  }

  function initRoadSegments() {
    for (let i = 0; i < ROAD_SEGMENT_COUNT; i++) {
      const segGroup = buildRoadSegmentGroup(i);
      scene.add(segGroup);
      roadSegmentGroups.push(segGroup);
    }
  }

  function buildRoadSegmentGroup(index) {
    const group = new THREE.Group();
    group.name = `RoadSegment_${index}`;

    // 路面：宽 ROAD_HALF_WIDTH*2、长 ROAD_SEGMENT_LENGTH 的矩形（局部坐标）
    const surfaceGeo = new THREE.PlaneGeometry(
      ROAD_HALF_WIDTH * 2,
      ROAD_SEGMENT_LENGTH
    );
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x2a2c3a,
      roughness: 0.95,
      metalness: 0.05,
    });
    const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
    surface.rotation.x = -Math.PI / 2;
    surface.receiveShadow = true;
    group.add(surface);

    // 两条车道分隔线（黄色虚位感 → 实线，简化渲染）
    const dividerOffset = (LANE_CENTER_X[0] + LANE_CENTER_X[1]) / 2;
    addLaneMarking(group, dividerOffset, 0.18, 0xf7c948);
    addLaneMarking(group, -dividerOffset, 0.18, 0xf7c948);

    // 道路边缘（白色实线）
    addLaneMarking(group, ROAD_HALF_WIDTH - ROAD_EDGE_HALF_THICKNESS, 0.12, 0xe6e9f5);
    addLaneMarking(group, -ROAD_HALF_WIDTH + ROAD_EDGE_HALF_THICKNESS, 0.12, 0xe6e9f5);

    return group;
  }

  /**
   * 在路面段内添加一条车道标线（薄平面，铺在路面上方 0.01 防 z-fighting）。
   * @param {THREE.Group} parent 路段组
   * @param {number} localX 局部 x 坐标
   * @param {number} halfWidth 标线半宽
   * @param {number} color 颜色
   */
  function addLaneMarking(parent, localX, halfWidth, color) {
    const width = halfWidth * 2;
    const length = ROAD_SEGMENT_LENGTH;
    const geo = new THREE.PlaneGeometry(width, length);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.05,
      emissive: color,
      emissiveIntensity: 0.12,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(localX, 0.005, 0);
    parent.add(mesh);
  }

  /**
   * 在路面下方铺设一块大面积 ground plane，填补路段循环边界处可能出现的视觉缝隙
   * 并在远处与雾色融合。
   */
  function initGroundPlane() {
    const geo = new THREE.PlaneGeometry(600, 600);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x14151f,
      roughness: 1.0,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, PLAYER_VISUAL_Z - 30);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  /* ============================================================
   * 同步逻辑：每帧把引擎状态映射到 three.js 对象
   * ============================================================ */

  function syncPlayerMesh() {
    if (!playerMesh || !engine) return;
    const state = engine.getState();
    const lane = state.player.lane;
    const y = state.player.y;
    const x = laneCenterXAt(lane, PLAYER_VISUAL_Z);
    playerMesh.position.set(x, y, PLAYER_VISUAL_Z);
    // 越野车方向：默认车头朝 -Z，沿当前车道行驶时不必旋转；
    // 仅在跳跃时给一个轻微抬头俯冲。
    if (state.player.jumping) {
      playerMesh.rotation.x = Math.max(-0.25, -state.player.vy * 0.02);
    } else {
      playerMesh.rotation.x *= 0.85;
    }
  }

  function syncRoadSegments() {
    const segments = buildRoadSegments(roadProgress);
    for (let i = 0; i < ROAD_SEGMENT_COUNT; i++) {
      const seg = segments[i];
      const grp = roadSegmentGroups[i];
      if (!grp) continue;
      grp.position.set(seg.centerOffsetX, 0, seg.zCenterWorld);
      grp.rotation.y = seg.heading;
    }
  }

  function syncEntityMeshes() {
    if (!engine) return;
    const state = engine.getState();
    const aliveIds = new Set();

    for (const e of state.entities) {
      aliveIds.add(e.id);
      let mesh = entityMeshes.get(e.id);
      if (!mesh) {
        mesh = createEntityMesh(e.kind);
        if (!mesh) continue;
        scene.add(mesh);
        entityMeshes.set(e.id, mesh);
      }
      const visualZ = e.z + Z_VISUAL_OFFSET;
      const x = laneCenterXAt(e.lane, visualZ);
      mesh.position.set(x, 0, visualZ);
      // 道具持续旋转 + 轻微上下浮动，便于玩家发现
      if (e.kind === ENTITY_KIND.PICKUP) {
        mesh.rotation.y += 0.05;
        mesh.position.y = 0.25 + Math.sin(performance.now() * 0.004) * 0.08;
      }
    }

    // 回收已离开游戏状态的实体 mesh
    for (const [id, mesh] of entityMeshes) {
      if (!aliveIds.has(id)) {
        scene.remove(mesh);
        disposeObject(mesh);
        entityMeshes.delete(id);
      }
    }
  }

  function createEntityMesh(kind) {
    if (kind === ENTITY_KIND.OBSTACLE) return createObstacle();
    if (kind === ENTITY_KIND.VEHICLE) return createOncomingVehicle();
    if (kind === ENTITY_KIND.PICKUP) return createHealthPickup();
    return null;
  }

  /* ============================================================
   * 主循环 + 自适应尺寸
   * ============================================================ */

  function animate(timestamp) {
    animationId = requestAnimationFrame(animate);
    if (!scene || !renderer || !camera || !engine) return;

    const dt = computeFrameDt(timestamp);
    const state = engine.getState();

    // 引擎仅在 PLAYING 状态推进；其他状态保持场景冻结（任务边界：不实现菜单）
    if (state.status === RACING_STATUS.PLAYING) {
      engine.update(dt);
      const nextState = engine.getState();
      roadProgress = advanceRoadProgress(roadProgress, dt, nextState.roadSpeed);
    }

    syncRoadSegments();
    syncPlayerMesh();
    syncEntityMeshes();

    // 相机微随玩家 y 抖动，提升动感（跳跃时尤为明显）
    if (camera && state.player.jumping) {
      camera.position.y = 4.5 + state.player.y * 0.25;
    } else if (camera) {
      camera.position.y += (4.5 - camera.position.y) * 0.15;
    }

    renderer.render(scene, camera);
  }

  function computeFrameDt(timestamp) {
    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
      return 0;
    }
    const raw = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // 防止标签页切回时 dt 过大穿模；与 racingEngine.maxFrameDt 保持一致
    return Math.min(raw, 1 / 30);
  }

  function syncRendererSize() {
    if (!sceneEl || !camera || !renderer) return;
    const rect = sceneEl.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
  }

  /* ============================================================
   * 资源释放
   * ============================================================ */

  function disposeScene() {
    if (!scene) return;

    // 渲染层创建的所有 mesh / group 都在已知对象池里，逐项清理即可
    for (const [, mesh] of entityMeshes) {
      scene.remove(mesh);
      disposeObject(mesh);
    }
    entityMeshes.clear();

    for (const grp of roadSegmentGroups) {
      scene.remove(grp);
      disposeObject(grp);
    }
    roadSegmentGroups = [];

    if (playerMesh) {
      scene.remove(playerMesh);
      disposeObject(playerMesh);
      playerMesh = null;
    }

    if (renderer) {
      renderer.dispose();
      const el = renderer.domElement;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }

  /**
   * 递归释放 Group 及其所有子 mesh 的 geometry/material。
   * @param {THREE.Object3D} obj
   */
  function disposeObject(obj) {
    obj.traverse((child) => {
      if (child.isMesh || child.isPoints || child.isLine) {
        if (child.geometry) child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m && m.dispose && m.dispose());
        else if (mat && mat.dispose) mat.dispose();
      }
    });
  }
</script>

<svelte:head>
  <title>3D 越野车竞速</title>
  <meta name="description" content="three.js 打造的 3D 越野车竞速 · 蜿蜒赛道 · 无尽模式" />
</svelte:head>

<div class="racing-game-page">
  <BackNav href="#/" />

  <PageHeader
    title="&lt;3D 越野车竞速 /&gt;"
    subtitle="three.js 打造的 3D 蜿蜒赛道 · 桌面端键盘操控"
  />

  <main class="main">
    <section
      class="scene-stage"
      bind:this={sceneEl}
      aria-label="3D 越野车竞速场景"
    >
      {#if sceneInitError}
        <div class="scene-error" role="alert">
          <div class="scene-error__title">3D 场景加载失败</div>
          <div class="scene-error__msg">{sceneInitError}</div>
        </div>
      {:else if !sceneReady}
        <div class="scene-loading" role="status">
          <div class="scene-loading__dot" aria-hidden="true"></div>
          <div class="scene-loading__text">3D 场景初始化中…</div>
        </div>
      {/if}
    </section>

    <p class="status-line" aria-live="polite">
      {#if sceneReady}
        ✓ 渲染层与游戏引擎已接入 · 键盘控制与 HUD 待后续任务接入
      {:else if sceneInitError}
        渲染层初始化失败，请刷新页面或更换浏览器
      {:else}
        渲染层正在准备…
      {/if}
    </p>
  </main>

  <Footer text="3D 越野车竞速 · 无尽模式 · 桌面端键盘操作" />
</div>

<style>
  .racing-game-page {
    --page-max-width: 1480px;
    position: relative;
  }

  .main {
    position: relative;
    flex: 1;
    padding: 1.5rem 1.5rem 2rem;
    max-width: var(--page-max-width);
    margin: 0 auto;
    width: 100%;
  }

  /* ===== 3D 场景舞台 ===== */
  .scene-stage {
    position: relative;
    width: 100%;
    height: clamp(380px, 62vh, 720px);
    border-radius: var(--radius);
    overflow: hidden;
    background: #14151f;
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-lg);
  }

  .scene-stage :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .scene-loading,
  .scene-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    text-align: center;
    padding: 1rem;
    pointer-events: none;
  }

  .scene-loading__dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 80%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .scene-loading__text {
    font-size: 0.85rem;
    letter-spacing: 0.02em;
  }

  .scene-error__title {
    color: #ff8a8a;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .scene-error__msg {
    font-size: 0.8rem;
    color: var(--text-muted);
    max-width: 480px;
  }

  /* ===== 状态提示行 ===== */
  .status-line {
    margin: 0.85rem auto 0;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--text-muted);
    letter-spacing: 0.01em;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(0.85);
      opacity: 0.55;
    }
    50% {
      transform: scale(1.15);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-loading__dot {
      animation: none;
    }
  }

  @media (max-width: 600px) {
    .main {
      padding: 1rem;
    }

    .scene-stage {
      height: clamp(320px, 56vh, 560px);
      border-radius: calc(var(--radius) - 2px);
    }
  }
</style>
