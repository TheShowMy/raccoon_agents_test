/**
 * 3D 越野车竞速 —— 纯逻辑游戏引擎
 *
 * 不依赖 three.js 或 DOM。本文件只负责：
 *   - 游戏状态机（menu / playing / gameover）
 *   - 玩家状态（当前车道、跳跃状态、生命值、得分）
 *   - 障碍物 / 对向车辆 / 加血道具三类实体的生成、移动与碰撞
 *   - 得分与生命值更新（含跳跃期间仍扣车辆碰撞血）
 *   - 难度曲线：道路速度提升 / 生成间隔缩短 / 加血道具概率降低
 *   - 游戏重置
 *
 * 由 routes/RacingGame.svelte（three.js 渲染层）按帧调用 update(dt)
 * 将抽象状态同步到 3D 对象；UI 层订阅 getState() 渲染 HUD 与菜单。
 */

/* ============================================================
 * 常量
 * ============================================================ */

/** 游戏状态枚举 */
export const RACING_STATUS = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  GAMEOVER: 'gameover',
});

/** 实体类型枚举 */
export const ENTITY_KIND = Object.freeze({
  OBSTACLE: 'obstacle',
  VEHICLE: 'vehicle',
  PICKUP: 'pickup',
});

/** 默认可调参数。所有数值均可被 createRacingEngine(overrides) 覆盖。 */
export const DEFAULT_CONFIG = Object.freeze({
  // 道路与车道
  laneCount: 3,
  laneWidth: 2,

  // Z 轴坐标：玩家位于 playerZ，实体从 spawnZ 向 despawnZ 移动
  playerZ: 0,
  spawnZ: -90,
  despawnZ: 10,
  collisionRadius: 1.6,
  passRadius: 2.0,

  // 玩家初始状态
  initialHealth: 5,
  startLane: 1, // 默认居中车道

  // 道路速度（m/s 模拟）
  baseRoadSpeed: 12,
  maxRoadSpeed: 32,
  speedRampPerSecond: 0.45,

  // 实体生成
  baseSpawnInterval: 1.1,
  minSpawnInterval: 0.45,
  spawnRampPerSecond: 0.018,
  initialSpawnProgress: 0.6, // 首帧已有 0.6 * spawnInterval 进度，让首实体尽早出现

  // 加血道具概率（随时间衰减）
  basePickupChance: 0.18,
  minPickupChance: 0.04,
  pickupRampPerSecond: 0.0035,

  // 障碍 / 车辆 / 道具 的相对比例（在非道具判定之后）
  obstacleWeight: 0.55,

  // 跳跃物理
  jumpInitialVelocity: 9.5,
  gravity: 26,
  jumpClearHeight: 1.5,

  // 伤害 / 治疗 / 得分
  obstacleDamage: 1,
  vehicleDamage: 2,
  pickupHeal: 1,
  obstacleScore: 1,
  vehicleScore: 5,

  // 帧时间上限（防止切换标签后 dt 过大导致穿透）
  maxFrameDt: 1 / 30,
});

/* ============================================================
 * 工具
 * ============================================================ */

/** 数值夹紧到 [lo, hi] */
function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** 安全的 dt：非正数 / 非数字 / NaN / 过大 都修正 */
function safeDt(dt, max) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return 0;
  if (dt > max) return max;
  return dt;
}

/** 实体 ID 序列（用于 React/Svelte key） */
let entityIdSeq = 1;
function nextEntityId() {
  entityIdSeq += 1;
  return entityIdSeq;
}

/** 计算指定车道在世界坐标 x 上的中心位置。纯函数，可独立复用。 */
export function getLaneX(lane, laneCount = DEFAULT_CONFIG.laneCount, laneWidth = DEFAULT_CONFIG.laneWidth) {
  const count = Math.max(1, laneCount | 0);
  const width = Number.isFinite(laneWidth) ? laneWidth : DEFAULT_CONFIG.laneWidth;
  const idx = clamp(lane | 0, 0, count - 1);
  return (idx - (count - 1) / 2) * width;
}

/* ============================================================
 * 工厂
 * ============================================================ */

/**
 * 创建一辆越野车的引擎实例。
 *
 * @param {Partial<typeof DEFAULT_CONFIG>} [overrides] 覆盖默认参数。
 * @param {() => number} [rng] 可注入的随机数函数（返回 [0, 1)），默认 Math.random。供测试注入以获得确定性。
 * @returns {RacingEngine}
 */
export function createRacingEngine(overrides, rng) {
  const config = { ...DEFAULT_CONFIG, ...(overrides || {}) };
  const random = typeof rng === 'function' ? rng : Math.random;

  // 工厂内部维护的运行时状态
  let state = freshState();

  /** 重置为初始状态（MENU 状态） */
  function freshState() {
    return {
      status: RACING_STATUS.MENU,
      player: {
        lane: clamp(config.startLane | 0, 0, config.laneCount - 1),
        y: 0,
        vy: 0,
        jumping: false,
      },
      health: config.initialHealth,
      maxHealth: config.initialHealth,
      score: 0,
      elapsed: 0,
      roadSpeed: config.baseRoadSpeed,
      spawnInterval: config.baseSpawnInterval,
      spawnTimer: config.baseSpawnInterval * config.initialSpawnProgress,
      pickupChance: config.basePickupChance,
      entities: [],
      stats: {
        passedObstacles: 0,
        passedVehicles: 0,
        collectedPickups: 0,
        hits: 0,
        obstacleScore: 0,
        vehicleScore: 0,
      },
      lastEvent: null,
    };
  }

  /** 返回当前状态（实时引用，UI 渲染层按需读取） */
  function getState() {
    return state;
  }

  /** 返回当前生效的配置快照 */
  function getConfig() {
    return config;
  }

  /** 回到初始状态（MENU） */
  function reset() {
    state = freshState();
    return state;
  }

  /** 从 MENU 或 GAMEOVER 启动一局新游戏。PLAYING 状态下为幂等空操作。 */
  function start() {
    if (state.status === RACING_STATUS.PLAYING) return state;
    state = freshState();
    state.status = RACING_STATUS.PLAYING;
    return state;
  }

  /**
   * 切换车道。
   * @param {number} delta 位移量（车道数）：正数向右，负数向左；超过边界会被夹紧。
   *                  0 或非法值视为 no-op。
   * @returns {object} 当前 state
   */
  function changeLane(delta) {
    if (state.status !== RACING_STATUS.PLAYING) return state;
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return state;
    const next = clamp(state.player.lane + Math.trunc(delta), 0, config.laneCount - 1);
    if (next === state.player.lane) {
      // 已到边界，记录无变化的事件
      state.lastEvent = { type: 'lane_blocked', lane: next };
      return state;
    }
    state.player.lane = next;
    state.lastEvent = { type: 'lane', lane: next };
    return state;
  }

  /** 触发跳跃。已在空中则忽略。 */
  function jump() {
    if (state.status !== RACING_STATUS.PLAYING) return state;
    if (state.player.jumping) return state;
    state.player.jumping = true;
    state.player.vy = config.jumpInitialVelocity;
    state.lastEvent = { type: 'jump' };
    return state;
  }

  /** 实例便捷方法：当前车道 → 世界坐标 x。 */
  function laneX(lane) {
    return getLaneX(lane, config.laneCount, config.laneWidth);
  }

  /* --------------------------------------------------------
   * 内部：生成、移动、碰撞、得分
   * -------------------------------------------------------- */

  function spawnEntity() {
    const lane = Math.floor(random() * config.laneCount);
    const r = random();
    let kind;
    if (r < state.pickupChance) {
      kind = ENTITY_KIND.PICKUP;
    } else {
      kind = random() < config.obstacleWeight ? ENTITY_KIND.OBSTACLE : ENTITY_KIND.VEHICLE;
    }
    state.entities.push({
      id: nextEntityId(),
      kind,
      lane,
      z: config.spawnZ,
      // 障碍物被跳跃成功跨越后置 cleared=true（仍会在越过时得分）；
      // resolved=true 表示该实体已越过 passRadius 并完成计分（或是非得分实体已
      // 自然过线），等待 despawn 移除。撞到玩家的实体不再使用此字段——
      // 它们会在同一帧被直接从 state.entities 中移除（详见 handleCollisionsAndScoring）。
      cleared: false,
      resolved: false,
    });
  }

  function updateDifficulty() {
    state.roadSpeed = clamp(
      config.baseRoadSpeed + state.elapsed * config.speedRampPerSecond,
      config.baseRoadSpeed,
      config.maxRoadSpeed
    );
    state.spawnInterval = clamp(
      config.baseSpawnInterval - state.elapsed * config.spawnRampPerSecond,
      config.minSpawnInterval,
      config.baseSpawnInterval
    );
    state.pickupChance = clamp(
      config.basePickupChance - state.elapsed * config.pickupRampPerSecond,
      config.minPickupChance,
      config.basePickupChance
    );
  }

  function applyHit(damage, kind, entity) {
    state.health = Math.max(0, state.health - damage);
    state.stats.hits += 1;
    state.lastEvent = {
      type: 'hit',
      kind,
      damage,
      lane: entity.lane,
      z: entity.z,
    };
    if (state.health <= 0) {
      state.status = RACING_STATUS.GAMEOVER;
      state.lastEvent = {
        type: 'gameover',
        reason: kind,
        lane: entity.lane,
        z: entity.z,
      };
    }
  }

  function applyPickup(heal, entity) {
    const before = state.health;
    state.health = clamp(state.health + heal, 0, state.maxHealth);
    if (state.health > before) {
      state.stats.collectedPickups += 1;
      state.lastEvent = {
        type: 'pickup',
        heal: state.health - before,
        lane: entity.lane,
        z: entity.z,
      };
    }
  }

  function applyScore(kind, delta) {
    state.score += delta;
    if (kind === ENTITY_KIND.OBSTACLE) {
      state.stats.passedObstacles += 1;
      state.stats.obstacleScore += delta;
      state.lastEvent = { type: 'pass', kind, delta };
    } else if (kind === ENTITY_KIND.VEHICLE) {
      state.stats.passedVehicles += 1;
      state.stats.vehicleScore += delta;
      state.lastEvent = { type: 'pass', kind, delta };
    }
  }

  /** 单帧碰撞 + 得分逻辑 */
  function handleCollisionsAndScoring() {
    const { player } = state;

    // 阶段 1：碰撞检测（仅实体当前 z 在玩家碰撞半径内）
    // 发生碰撞的实体在本帧立即从 state.entities 中移除，
    // 让渲染层 next syncEntityMeshes 直接销毁对应 mesh，
    // 同时把 lane / z 写入 lastEvent 供渲染层在正确位置播放特效。
    // 跳跃成功跨越的障碍物（cleared）不在此移除，仍走阶段 2 计分。
    // 用反向迭代以便 splice 安全。
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      if (e.resolved || e.cleared) continue;
      if (e.lane !== player.lane) continue;
      const zDiff = e.z - config.playerZ;
      if (zDiff < -config.collisionRadius || zDiff > config.collisionRadius) continue;

      if (e.kind === ENTITY_KIND.PICKUP) {
        // 立即移除——拾取后道具不应继续前移穿过赛车。
        state.entities.splice(i, 1);
        applyPickup(config.pickupHeal, e);
        continue;
      }
      if (e.kind === ENTITY_KIND.OBSTACLE) {
        // 跳跃高度足够即视为安全跨越：标记 cleared，后续帧不再触发碰撞，
        // 待实体越过 passRadius 时仍正常得分（阶段 2）。
        if (player.jumping && player.y >= config.jumpClearHeight) {
          e.cleared = true;
          continue;
        }
        // 未能跳跃躲避——立即移除并扣血。
        state.entities.splice(i, 1);
        applyHit(config.obstacleDamage, ENTITY_KIND.OBSTACLE, e);
        if (state.status === RACING_STATUS.GAMEOVER) return;
        continue;
      }
      // VEHICLE：跳跃不能躲避，必定扣血，立即移除。
      state.entities.splice(i, 1);
      applyHit(config.vehicleDamage, ENTITY_KIND.VEHICLE, e);
      if (state.status === RACING_STATUS.GAMEOVER) return;
    }

    // 阶段 2：得分判定（实体 z 已越过 passRadius 且未被碰撞处理过）
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (e.resolved) continue;
      if (e.z <= config.playerZ + config.passRadius) continue;
      if (e.kind === ENTITY_KIND.OBSTACLE) {
        e.resolved = true;
        applyScore(ENTITY_KIND.OBSTACLE, config.obstacleScore);
      } else if (e.kind === ENTITY_KIND.VEHICLE) {
        e.resolved = true;
        applyScore(ENTITY_KIND.VEHICLE, config.vehicleScore);
      } else {
        // PICKUP 未被拾取就被越过：静默移除，不计分。
        e.resolved = true;
      }
    }
  }

  /** 单帧步进：仅在 PLAYING 状态下推进模拟。 */
  function update(dt) {
    if (state.status !== RACING_STATUS.PLAYING) return state;
    const step = safeDt(dt, config.maxFrameDt);
    if (step === 0) return state;

    state.elapsed += step;
    updateDifficulty();

    // 玩家跳跃物理（半隐式欧拉）
    if (state.player.jumping) {
      state.player.vy -= config.gravity * step;
      state.player.y += state.player.vy * step;
      if (state.player.y <= 0) {
        state.player.y = 0;
        state.player.vy = 0;
        state.player.jumping = false;
      }
    }

    // 实体前进（向 +z 移动）
    const dz = state.roadSpeed * step;
    for (let i = 0; i < state.entities.length; i++) {
      state.entities[i].z += dz;
    }

    // 生成节奏
    state.spawnTimer += step;
    while (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer -= state.spawnInterval;
      spawnEntity();
    }

    // 碰撞 + 得分
    handleCollisionsAndScoring();

    // 移除已远离玩家的实体
    if (state.entities.length) {
      const filtered = [];
      for (let i = 0; i < state.entities.length; i++) {
        if (state.entities[i].z <= config.despawnZ) filtered.push(state.entities[i]);
      }
      state.entities = filtered;
    }

    return state;
  }

  return {
    getState,
    getConfig,
    reset,
    start,
    changeLane,
    jump,
    update,
    laneX,
  };
}
