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
    laneFrameAt,
    ROAD_SEGMENT_COUNT,
    ROAD_SEGMENT_LENGTH,
    ROAD_HALF_WIDTH,
    LANE_CENTER_X,
    setRoadSeed,
  } from '../lib/utils/racingRoad.js';
  import {
    createPlayerCar,
    createObstacle,
    createOncomingVehicle,
    createHealthPickup,
  } from '../lib/utils/racingModels.js';
  import {
    createEffectsManager,
    handleEvent,
  } from '../lib/utils/racingEffects.js';

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

  // 效果管理器（粒子、震动、音效）
  /** @type {ReturnType<typeof createEffectsManager>|null} */
  let effectsManager = null;

  // 上一次处理的事件（用于检测新事件）
  /** @type {object|null} */
  let lastProcessedEvent = null;

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

  // 渲染层状态：是否已就绪
  let sceneReady = false;
  let sceneInitError = '';

  // UI 状态镜像（每帧由 syncUI 从引擎状态拉取，避免外部引用泄漏）
  let status = RACING_STATUS.MENU;
  let score = 0;
  let health = 5;
  let maxHealth = 5;
  /**
   * 结算界面展示的累计统计，由 syncUI 每帧从引擎 state.stats 拉取。
   * 形状见 src/lib/utils/racingEngine.js freshState() 中的 stats 字段。
   * @type {{passedObstacles:number, passedVehicles:number, collectedPickups:number, hits:number, obstacleScore:number, vehicleScore:number}|null}
   */
  let stats = null;
  /** @type {HTMLButtonElement|null} */
  let startBtn = null;
  /** @type {HTMLButtonElement|null} */
  let restartBtn = null;

  /**
   * 菜单 / 结算界面上"开始游戏"或"重新开始"统一入口：
   *   - MENU 或 GAMEOVER → 调 engine.start() 切到 PLAYING
   *   - PLAYING → no-op
   * 同时把视觉层的 roadProgress 归零，让赛道滚动从起点开始。
   */
  function startGame() {
    if (!engine) return;
    const cur = engine.getState();
    if (cur.status === RACING_STATUS.PLAYING) return;
    // 每局使用新的道路种子，确保道路形态不同
    setRoadSeed(Date.now() % 10000 + Math.random() * 1000);
    engine.start();
    roadProgress = 0;
  }

  /**
   * 把引擎当前状态投影到 UI 镜像变量，触发 Svelte 响应式更新。
   * 每帧由 animate 末尾调用，状态变化即时反映到 HUD 与菜单切换。
   */
  function syncUI() {
    if (!engine) return;
    const s = engine.getState();
    status = s.status;
    score = s.score;
    health = s.health;
    maxHealth = s.maxHealth;
    stats = s.stats;
  }

  /**
   * 键盘事件：桌面端 ←/→ 或 A/D 切车道，空格 / ↑ 跳跃。
   * 仅在 PLAYING 状态生效；菜单 / 结算状态由按钮或 Enter 触发开始/重新开始。
   */
  function onKeyDown(e) {
    if (!engine) return;
    // 若焦点在表单控件或可编辑元素上，不抢键（防止误触发跳跃 / 切道）
    const target = /** @type {HTMLElement|null} */ (e.target);
    if (target) {
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
    }
    const key = e.key;
    const cur = engine.getState();

    if (cur.status === RACING_STATUS.PLAYING) {
      // 游戏中拦截这些键避免页面滚动 / 浏览器快捷键
      if (
        key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === 'ArrowUp' ||
        key === ' '
      ) {
        e.preventDefault();
      }
      switch (key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          engine.changeLane(-1);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          engine.changeLane(1);
          break;
        case 'ArrowUp':
        case ' ':
          engine.jump();
          break;
        default:
          break;
      }
      return;
    }

    // 菜单 / 结算界面：Enter 也可以开始或重新开始（空格留给按钮原生激活）
    if (key === 'Enter') {
      e.preventDefault();
      startGame();
    }
  }

  // 状态切换时自动把焦点放到主按钮上，便于键盘用户继续操作
  // 依赖 status 与按钮引用，任一变化都会重跑；按钮未挂载时条件不成立
  $: if (status === RACING_STATUS.MENU && startBtn) startBtn.focus();
  $: if (status === RACING_STATUS.GAMEOVER && restartBtn) restartBtn.focus();

  onMount(() => {
    try {
      initThree();
      engine = createRacingEngine();
      // 初始化道路种子，让道路形态在菜单阶段可见
      setRoadSeed(Date.now() % 10000 + Math.random() * 1000);
      // 注意：不再自动 start()，保留 MENU 状态让开始菜单可见
      initPlayerMesh();
      initRoadSegments();
      initGroundPlane();
      // 初始化效果管理器
      effectsManager = createEffectsManager(scene);
      animationId = requestAnimationFrame(animate);

      resizeObserver = new ResizeObserver(() => {
        syncRendererSize();
      });
      if (sceneEl) resizeObserver.observe(sceneEl);

      document.addEventListener('keydown', onKeyDown);

      sceneReady = true;
      // 首次同步 UI 镜像，让开始菜单立即拿到正确的血量等数值
      syncUI();
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
    document.removeEventListener('keydown', onKeyDown);
    disposeScene();
    scene = null;
    camera = null;
    renderer = null;
    engine = null;
    effectsManager = null;
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

  /**
   * 同步玩家车辆：贴合道路高程，仅保留沿道路 heading 的偏航旋转。
   * 车辆车头朝向道路前进方向（-z + heading 偏转），俯仰与侧倾归零使车轮贴地。
   */
  function syncPlayerMesh() {
    if (!playerMesh || !engine) return;
    const state = engine.getState();
    const lane = state.player.lane;
    const jumpY = state.player.y;

    // 获取道路在玩家位置的框架：z 参数必须加上 roadProgress，
    // 把视觉 z 折算回当前 progress 下等价的曲线绝对 z，
    // 玩家车偏航与位置才会贴合当前滚动后的道路切线。
    const frame = laneFrameAt(lane, PLAYER_VISUAL_Z + roadProgress);

    // 玩家车辆贴合路面高度 + 跳跃高度
    const groundY = frame.y;
    playerMesh.position.set(frame.x, groundY + jumpY, PLAYER_VISUAL_Z);

    // 车辆朝向：rotation.y 与道路 heading 符号一致，使车头沿道路在世界坐标下的前进切线方向
    // 越野车模型默认朝 -z 方向，玩家前进方向也是 -z。道路段以 rotation.y = +heading 铺设
    // （使其 +Z 方向切线 = (heading, 0, 1)）。玩家沿 -Z 行驶，对应切线方向 = (-heading, 0, -1)；
    // 让 rotation.y = +heading 可使模型 -Z 经旋转后映射到 (-heading, 0, -1)，与切线一致。
    // 即 heading > 0 时车头朝左偏、heading < 0 时朝右偏，弯道时自然沿弯道切线行驶。
    // 显式归零俯仰与侧倾，仅保留偏航旋转，确保车轮贴地无倾斜
    playerMesh.rotation.y = frame.heading;
    playerMesh.rotation.x = 0;
    playerMesh.rotation.z = 0;
  }

  /**
   * 同步道路段：每段按高程和俯仰角摆放，使道路呈现起伏与蜿蜒。
   * 路段绕 y 轴旋转与道路 heading 对齐，绕 x 轴倾斜与道路 pitch 对齐。
   */
  function syncRoadSegments() {
    const segments = buildRoadSegments(roadProgress);
    for (let i = 0; i < ROAD_SEGMENT_COUNT; i++) {
      const seg = segments[i];
      const grp = roadSegmentGroups[i];
      if (!grp) continue;
      // 路段 x 位置、y 高度、z 位置
      grp.position.set(seg.centerOffsetX, seg.elevation, seg.zCenterWorld);
      // 绕 y 轴旋转与道路水平方向对齐
      grp.rotation.y = seg.heading;
    }
  }

  /**
   * 同步实体网格：障碍物、对向车辆、道具贴合道路高程，仅保留沿道路 heading 的偏航旋转。
   * 对向车辆朝向修正为面向玩家（朝 +z 方向），道具持续旋转，俯仰与侧倾归零确保贴地。
   */
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
      // z 参数加上 roadProgress，把视觉 z 折算回当前 progress 下等价的曲线绝对 z，
      // 障碍物、对向车辆、道具的朝向与位置才贴合道路切线。
      const frame = laneFrameAt(e.lane, visualZ + roadProgress);

      // 实体贴合道路高度
      mesh.position.set(frame.x, frame.y, visualZ);

      // 对向车辆朝向修正：面向玩家方向（默认模型朝 -z，需旋转 180° + 道路 heading）
      // 显式归零俯仰与侧倾，仅保留偏航旋转，确保车轮贴地无倾斜
      if (e.kind === ENTITY_KIND.VEHICLE) {
        mesh.rotation.y = Math.PI - frame.heading;
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;
      } else if (e.kind === ENTITY_KIND.OBSTACLE) {
        // 障碍物跟随道路朝向
        mesh.rotation.y = -frame.heading;
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;
      } else if (e.kind === ENTITY_KIND.PICKUP) {
        // 道具持续旋转 + 轻微上下浮动，贴合道路高度浮动
        mesh.rotation.y += 0.05;
        mesh.position.y = frame.y + 0.25 + Math.sin(performance.now() * 0.004) * 0.08;
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

    // 引擎仅在 PLAYING 状态推进；菜单 / 结算界面下场景冻结
    if (state.status === RACING_STATUS.PLAYING) {
      engine.update(dt);
      const nextState = engine.getState();
      roadProgress = advanceRoadProgress(roadProgress, dt, nextState.roadSpeed);
    }

    syncRoadSegments();
    syncPlayerMesh();
    syncEntityMeshes();

    // 检测并处理游戏事件（拾取、碰撞、游戏结束）
    if (effectsManager && engine) {
      const currentState = engine.getState();
      const currentEvent = currentState.lastEvent;
      // 只在有新事件且事件与上一次不同时处理
      if (currentEvent && currentEvent !== lastProcessedEvent) {
        lastProcessedEvent = currentEvent;
        // 碰撞/拾取/游戏结束事件都会携带被触发的实体 lane/z（由上一阶段引擎填入）。
        // 优先用实体位置算世界坐标，粒子效果就能精确出现在被撞实体处（不是玩家车处）。
        // 偶发事件（如 lane / jump / pass）没有 lane/z 字段，兜底用玩家位置。
        let fx;
        let fy;
        let fz;
        if (
          typeof currentEvent.lane === 'number' &&
          typeof currentEvent.z === 'number'
        ) {
          const visualZ = currentEvent.z + Z_VISUAL_OFFSET;
          // z 参数加上 roadProgress，让粒子位置贴合当前滚动后的道路切线
          const frame = laneFrameAt(currentEvent.lane, visualZ + roadProgress);
          fx = frame.x;
          fy = frame.y + 0.5; // 略抬高到实体中心高度，让粒子从实体身上炸开
          fz = visualZ;
        } else {
          fx = playerMesh ? playerMesh.position.x : 0;
          fy = playerMesh ? playerMesh.position.y : 0;
          fz = playerMesh ? playerMesh.position.z : PLAYER_VISUAL_Z;
        }
        handleEvent(effectsManager, currentEvent, fx, fy, fz);
      }
      // 更新效果系统（粒子动画、震动衰减）
      effectsManager.update(dt);
    }

    // 相机微随玩家 y 抖动 + 横向阻尼跟随：让切换车道时玩家始终居中在视野中
    if (camera && playerMesh) {
      const targetX = playerMesh.position.x;
      camera.position.x += (targetX - camera.position.x) * 0.15;
      if (state.player.jumping) {
        camera.position.y = 4.5 + state.player.y * 0.25;
      } else {
        camera.position.y += (4.5 - camera.position.y) * 0.15;
      }

      // 叠加屏幕震动效果
      if (effectsManager) {
        const shake = effectsManager.getShakeOffset();
        camera.position.x += shake.x;
        camera.position.y += shake.y;
      }

      camera.lookAt(camera.position.x, playerMesh.position.y, PLAYER_VISUAL_Z - 30);
    }

    renderer.render(scene, camera);

    // 渲染完成后把引擎状态投影到 UI 镜像变量，驱动菜单 / HUD / 结算界面响应式更新
    syncUI();
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

    // 清理效果管理器（已在 onDestroy 中调用，这里仅作防御）
    if (effectsManager) {
      effectsManager.dispose();
      effectsManager = null;
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

      {#if sceneReady && status === RACING_STATUS.MENU}
        <div
          class="overlay overlay--menu"
          role="dialog"
          aria-modal="false"
          aria-labelledby="racing-menu-title"
        >
          <div class="overlay__card">
            <h2 id="racing-menu-title" class="overlay__title">准备出发</h2>
            <p class="overlay__lede">桌面端键盘操控 · 无尽模式</p>
            <ul class="rules">
              <li>
                <span class="rules__key">← / →</span>
                <span class="rules__sep">或</span>
                <span class="rules__key">A / D</span>
                <span class="rules__desc">切换车道</span>
              </li>
              <li>
                <span class="rules__key">空格</span>
                <span class="rules__sep">或</span>
                <span class="rules__key">↑</span>
                <span class="rules__desc">跳跃越过障碍物</span>
              </li>
              <li>
                <span class="rules__desc">越过障碍物 <strong>+1</strong> 分 · 越过车辆 <strong>+5</strong> 分</span>
              </li>
              <li>
                <span class="rules__desc">撞击障碍物 <strong>−1</strong> 血 · 撞击车辆 <strong>−2</strong> 血</span>
              </li>
              <li>
                <span class="rules__desc">拾取加血道具 <strong>+1</strong> 血</span>
              </li>
              <li>
                <span class="rules__desc">血量归零即结束 · 难度随时间提升</span>
              </li>
            </ul>
            <button
              bind:this={startBtn}
              type="button"
              class="btn btn--primary"
              on:click={startGame}
            >
              开始游戏
            </button>
            <p class="overlay__hint">按 Enter 也可开始</p>
          </div>
        </div>
      {/if}

      {#if sceneReady && status === RACING_STATUS.PLAYING}
        <div class="overlay overlay--hud" aria-hidden="false">
          <div class="hud-health" aria-label={`生命值 ${health} / ${maxHealth}`}>
            <span class="hud-health__label" aria-hidden="true">生命</span>
            <span class="hud-health__hearts" aria-hidden="true">
              {#each Array(maxHealth) as _, i}
                <span
                  class="heart"
                  class:heart--lost={i >= health}
                  aria-hidden="true"
                >♥</span>
              {/each}
            </span>
            <span class="hud-health__count" aria-hidden="true">{health} / {maxHealth}</span>
          </div>
          <div class="hud-score" aria-label={`分数 ${score}`}>
            <span class="hud-score__label" aria-hidden="true">分数</span>
            <span class="hud-score__value" aria-hidden="true">{score}</span>
          </div>
        </div>
      {/if}

      {#if sceneReady && status === RACING_STATUS.GAMEOVER}
        <div
          class="overlay overlay--gameover"
          role="dialog"
          aria-modal="false"
          aria-labelledby="racing-gameover-title"
        >
          <div class="overlay__card">
            <h2 id="racing-gameover-title" class="overlay__title">游戏结束</h2>
            <div class="final-score">
              最终得分 <strong class="final-score__value">{score}</strong>
            </div>
            {#if stats}
              <ul class="gameover-stats">
                <li>
                  <span class="gameover-stats__label">越过障碍物</span>
                  <span class="gameover-stats__value">{stats.passedObstacles}</span>
                </li>
                <li>
                  <span class="gameover-stats__label">越过车辆</span>
                  <span class="gameover-stats__value">{stats.passedVehicles}</span>
                </li>
                <li>
                  <span class="gameover-stats__label">拾取加血</span>
                  <span class="gameover-stats__value">{stats.collectedPickups}</span>
                </li>
                <li>
                  <span class="gameover-stats__label">累计受击</span>
                  <span class="gameover-stats__value">{stats.hits}</span>
                </li>
              </ul>
            {/if}
            <button
              bind:this={restartBtn}
              type="button"
              class="btn btn--primary"
              on:click={startGame}
            >
              重新开始
            </button>
            <p class="overlay__hint">按 Enter 也可重新开始</p>
          </div>
        </div>
      {/if}
    </section>

    <p class="status-line" aria-live="polite">
      {#if sceneInitError}
        渲染层初始化失败，请刷新页面或更换浏览器
      {:else if !sceneReady}
        渲染层正在准备…
      {:else if status === RACING_STATUS.MENU}
        使用 ← / → 或 A / D 切换车道，空格 / ↑ 跳跃
      {:else if status === RACING_STATUS.PLAYING}
        越野车正在无尽狂奔 · 注意躲避对向车辆
      {:else}
        本局已结束 · 点击「重新开始」再来一局
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

  /* ===== 菜单 / 结算覆盖层 ===== */
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    pointer-events: auto;
    background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: overlayFadeIn 0.25s ease both;
  }

  .overlay--hud {
    /* HUD 不需要屏蔽点击，也不加背景雾化 */
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    pointer-events: none;
    padding: 0;
    align-items: flex-start;
    animation: none;
  }

  .overlay__card {
    width: min(420px, 100%);
    background: var(--bg-card);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius);
    padding: 1.5rem 1.4rem 1.4rem;
    box-shadow: var(--shadow-lg);
    text-align: center;
    color: var(--text-primary);
  }

  .overlay__title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
    font-family: var(--font-mono);
    letter-spacing: 0.02em;
    margin-bottom: 0.35rem;
  }

  .overlay__lede {
    font-size: 0.82rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
    font-family: var(--font-mono);
  }

  .overlay__hint {
    margin-top: 0.7rem;
    font-size: 0.72rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .rules {
    list-style: none;
    padding: 0;
    margin: 0 0 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    text-align: left;
  }

  .rules li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .rules__key {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--text-primary);
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    line-height: 1.3;
  }

  .rules__sep {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .rules__desc {
    flex-basis: 100%;
    color: var(--text-secondary);
  }

  .rules li:has(.rules__desc:only-child) .rules__desc {
    flex-basis: auto;
  }

  .rules strong {
    color: var(--accent);
    font-weight: 700;
  }

  /* ===== 主按钮 ===== */
  .btn {
    display: inline-block;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 0.95rem;
    padding: 0.7rem 1.6rem;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      transform var(--transition),
      box-shadow var(--transition),
      background var(--transition),
      color var(--transition);
  }

  .btn--primary {
    background: var(--accent);
    color: var(--bg-secondary);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 35%, transparent);
  }

  .btn--primary:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 50%, transparent);
  }

  .btn--primary:focus-visible {
    outline: 2px solid var(--accent-hover);
    outline-offset: 2px;
  }

  .btn--primary:active {
    transform: translateY(0);
  }

  /* ===== 游戏中 HUD ===== */
  .hud-health {
    position: absolute;
    top: 0.85rem;
    left: 0.95rem;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.85rem;
    background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    font-family: var(--font-mono);
    pointer-events: none;
    box-shadow: var(--shadow-lg);
  }

  .hud-health__label {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .hud-health__hearts {
    display: inline-flex;
    gap: 0.2rem;
    font-size: 1.05rem;
    line-height: 1;
  }

  .heart {
    color: #ff6b81;
    text-shadow: 0 0 6px color-mix(in srgb, #ff6b81 55%, transparent);
    transition: opacity var(--transition);
  }

  .heart--lost {
    color: var(--text-muted);
    text-shadow: none;
    opacity: 0.4;
  }

  .hud-health__count {
    font-size: 0.78rem;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  .hud-score {
    position: absolute;
    top: 0.85rem;
    right: 0.95rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.95rem;
    background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    font-family: var(--font-mono);
    pointer-events: none;
    box-shadow: var(--shadow-lg);
  }

  .hud-score__label {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .hud-score__value {
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }

  /* ===== 结算面板 ===== */
  .final-score {
    font-size: 0.95rem;
    color: var(--text-secondary);
    margin-bottom: 0.9rem;
    font-family: var(--font-mono);
  }

  .final-score__value {
    color: var(--accent);
    font-size: 1.6rem;
    font-weight: 800;
    margin-left: 0.4rem;
    font-variant-numeric: tabular-nums;
  }

  .gameover-stats {
    list-style: none;
    padding: 0.7rem 0.2rem;
    margin: 0 0 1.1rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 1rem;
    border-top: 1px solid var(--glass-border);
    border-bottom: 1px solid var(--glass-border);
  }

  .gameover-stats li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-family: var(--font-mono);
  }

  .gameover-stats__label {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .gameover-stats__value {
    font-size: 1rem;
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
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

  @keyframes overlayFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-loading__dot {
      animation: none;
    }

    .overlay {
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

    .overlay__card {
      padding: 1.15rem 1rem 1rem;
    }

    .overlay__title {
      font-size: 1.3rem;
    }

    .hud-health,
    .hud-score {
      padding: 0.4rem 0.65rem;
      font-size: 0.85rem;
    }

    .hud-health__hearts {
      font-size: 0.95rem;
    }

    .gameover-stats {
      grid-template-columns: 1fr;
    }
  }
</style>
