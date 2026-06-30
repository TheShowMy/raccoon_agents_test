/**
 * racingEngine.js — 纯逻辑游戏引擎（极简版）
 *
 * 职责范围（不依赖 three.js 或 DOM）：
 *   - 游戏状态机（MENU / PLAYING / GAMEOVER）
 *   - 玩家状态：当前车道、跳跃物理、生命值、得分
 *   - 实体管理：障碍物、对向车辆、加血道具的生成、移动、碰撞与计分
 *   - 难度曲线：道路速度提升、生成间隔缩短、加血概率降低
 *   - 事件机制：每帧产生的关键事件（hit / pickup / gameover / pass / lane / jump）
 *
 * 使用方式：由渲染层（RacingGame.svelte）每帧调用 update(dt)，
 * 并读取 getState() 将抽象状态同步到 3D 对象。
 */

/* ============================================================
 * 枚举常量
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

/* ============================================================
 * 默认配置
 * ============================================================ */

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
  startLane: 1, // 默认居中车道（0-indexed）

  // 道路速度（m/s）
  baseRoadSpeed: 12,
  maxRoadSpeed: 32,
  speedRampPerSecond: 0.45,

  // 实体生成节奏
  baseSpawnInterval: 1.1,
  minSpawnInterval: 0.45,
  spawnRampPerSecond: 0.018,
  initialSpawnProgress: 0.6, // 首帧已有 60% 生成进度

  // 加血道具概率（随时间衰减）
  basePickupChance: 0.18,
  minPickupChance: 0.04,
  pickupRampPerSecond: 0.0035,

  // 障碍物与车辆的比例（非道具时 obstacleWeight = 0.55 → 55% 障碍物）
  obstacleWeight: 0.55,

  // 跳跃物理
  jumpInitialVelocity: 9.5,
  gravity: 26,
  jumpClearHeight: 1.5, // 跳跃高度超过此值可跨越障碍物

  // 伤害 / 治疗 / 得分
  obstacleDamage: 1,
  vehicleDamage: 2,
  pickupHeal: 1,
  obstacleScore: 1,
  vehicleScore: 5,

  // 帧时间上限（防止切标签后 dt 过大导致穿透）
  maxFrameDt: 1 / 30,
});

/* ============================================================
 * 工具函数
 * ============================================================ */

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function safeDt(dt, max) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return 0;
  return dt > max ? max : dt;
}

let entityIdSeq = 1;
function nextEntityId() {
  return ++entityIdSeq;
}

/**
 * 计算指定车道在世界坐标 X 轴上的中心位置。
 * 车道从左到右编号 0, 1, ..., laneCount-1。
 */
export function getLaneX(lane, laneCount = 3, laneWidth = 2) {
  const count = Math.max(1, laneCount | 0);
  const w = Number.isFinite(laneWidth) ? laneWidth : 2;
  const idx = clamp(lane | 0, 0, count - 1);
  return (idx - (count - 1) / 2) * w;
}

/* ============================================================
 * 工厂：createRacingEngine
 * ============================================================ */

/**
 * 创建游戏引擎实例。
 *
 * @param {Partial<typeof DEFAULT_CONFIG>} [overrides] 覆盖默认参数
 * @param {() => number} [rng] 随机数函数（返回 [0,1)），默认 Math.random
 * @returns {object} 引擎实例
 */
export function createRacingEngine(overrides, rng) {
  const config = { ...DEFAULT_CONFIG, ...(overrides || {}) };
  const rand = typeof rng === 'function' ? rng : Math.random;

  let state = createInitialState();

  /* ----------------------------------------------------------
   * 内部：初始化
   * ---------------------------------------------------------- */

  function createInitialState() {
    return {
      status: RACING_STATUS.MENU,
      player: {
        lane: clamp(config.startLane | 0, 0, config.laneCount - 1),
        y: 0, // 跳跃高度
        vy: 0, // 竖直速度
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

  /* ----------------------------------------------------------
   * 公共 API
   * ---------------------------------------------------------- */

  function getState() {
    return state;
  }

  function getConfig() {
    return config;
  }

  /** 重置到 MENU 状态 */
  function reset() {
    state = createInitialState();
    return state;
  }

  /** 从 MENU 或 GAMEOVER 开始一局新游戏。PLAYING 状态下为无操作。 */
  function start() {
    if (state.status === RACING_STATUS.PLAYING) return state;
    state = createInitialState();
    state.status = RACING_STATUS.PLAYING;
    return state;
  }

  /**
   * 切换车道。
   * @param {number} delta 位移车道数（正数向右，负数向左），超出边界自动夹紧
   */
  function changeLane(delta) {
    if (state.status !== RACING_STATUS.PLAYING) return state;
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return state;

    const next = clamp(state.player.lane + Math.trunc(delta), 0, config.laneCount - 1);
    if (next === state.player.lane) {
      state.lastEvent = { type: 'lane_blocked', lane: next };
      return state;
    }
    state.player.lane = next;
    state.lastEvent = { type: 'lane', lane: next };
    return state;
  }

  /** 触发跳跃。已在空中则忽略。 */
  function jump() {
    if (state.status !== RACING_STATUS.PLAYING || state.player.jumping) return state;
    state.player.jumping = true;
    state.player.vy = config.jumpInitialVelocity;
    state.lastEvent = { type: 'jump' };
    return state;
  }

  /** 当前车道 → 世界坐标 X */
  function laneX(lane) {
    return getLaneX(lane, config.laneCount, config.laneWidth);
  }

  /* ----------------------------------------------------------
   * 内部：实体生成
   * ---------------------------------------------------------- */

  function spawnEntity() {
    const lane = Math.floor(rand() * config.laneCount);
    const r = rand();
    let kind;
    if (r < state.pickupChance) {
      kind = ENTITY_KIND.PICKUP;
    } else {
      kind = rand() < config.obstacleWeight ? ENTITY_KIND.OBSTACLE : ENTITY_KIND.VEHICLE;
    }
    state.entities.push({
      id: nextEntityId(),
      kind,
      lane,
      z: config.spawnZ,
      cleared: false,
      resolved: false,
    });
  }

  /* ----------------------------------------------------------
   * 内部：难度曲线
   * ---------------------------------------------------------- */

  function updateDifficulty() {
    state.roadSpeed = clamp(
      config.baseRoadSpeed + state.elapsed * config.speedRampPerSecond,
      config.baseRoadSpeed,
      config.maxRoadSpeed,
    );
    state.spawnInterval = clamp(
      config.baseSpawnInterval - state.elapsed * config.spawnRampPerSecond,
      config.minSpawnInterval,
      config.baseSpawnInterval,
    );
    state.pickupChance = clamp(
      config.basePickupChance - state.elapsed * config.pickupRampPerSecond,
      config.minPickupChance,
      config.basePickupChance,
    );
  }

  /* ----------------------------------------------------------
   * 内部：碰撞与计分
   * ---------------------------------------------------------- */

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

  function applyPickup(entity) {
    const healed = clamp(state.health + config.pickupHeal, 0, state.maxHealth);
    const actualHeal = healed - state.health;
    state.health = healed;

    if (actualHeal > 0) {
      state.stats.collectedPickups += 1;
      state.lastEvent = {
        type: 'pickup',
        heal: actualHeal,
        lane: entity.lane,
        z: entity.z,
      };
    }
  }

  function applyScore(kind, delta) {
    state.score += delta;
    state.lastEvent = { type: 'pass', kind, delta };

    if (kind === ENTITY_KIND.OBSTACLE) {
      state.stats.passedObstacles += 1;
      state.stats.obstacleScore += delta;
    } else if (kind === ENTITY_KIND.VEHICLE) {
      state.stats.passedVehicles += 1;
      state.stats.vehicleScore += delta;
    }
  }

  /**
   * 阶段 1 — 碰撞检测（同车道、z 在碰撞半径内）
   *   - PICKUP：立即拾取，移除实体
   *   - OBSTACLE：跳跃高度 >= jumpClearHeight 则跳过（cleared=true），否则扣血并移除
   *   - VEHICLE：直接扣血并移除（跳跃不能躲避）
   * 发生碰撞的实体本帧立即从 state.entities 移除。
   *
   * 阶段 2 — 得分判定（实体 z 越过 passRadius 且未碰撞）
   * 被跳过的障碍物仍计分。
   */
  function handleCollisionsAndScoring() {
    const { player } = state;

    // 阶段 1：碰撞（反向迭代，安全删除）
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      if (e.resolved || e.cleared) continue;
      if (e.lane !== player.lane) continue;

      const zDiff = e.z - config.playerZ;
      if (zDiff < -config.collisionRadius || zDiff > config.collisionRadius) continue;

      if (e.kind === ENTITY_KIND.PICKUP) {
        state.entities.splice(i, 1);
        applyPickup(e);
        continue;
      }

      if (e.kind === ENTITY_KIND.OBSTACLE) {
        // 跳跃高度足够则安全跨越
        if (player.jumping && player.y >= config.jumpClearHeight) {
          e.cleared = true;
          continue;
        }
        state.entities.splice(i, 1);
        applyHit(config.obstacleDamage, ENTITY_KIND.OBSTACLE, e);
        if (state.status === RACING_STATUS.GAMEOVER) return;
        continue;
      }

      // VEHICLE
      state.entities.splice(i, 1);
      applyHit(config.vehicleDamage, ENTITY_KIND.VEHICLE, e);
      if (state.status === RACING_STATUS.GAMEOVER) return;
    }

    // 阶段 2：得分判定
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
        // PICKUP 未被拾取越过玩家：静默移除
        e.resolved = true;
      }
    }
  }

  /* ----------------------------------------------------------
   * 核心：单帧步进
   * ---------------------------------------------------------- */

  function update(dt) {
    if (state.status !== RACING_STATUS.PLAYING) return state;

    const step = safeDt(dt, config.maxFrameDt);
    if (step === 0) return state;

    state.elapsed += step;
    updateDifficulty();

    // —— 玩家跳跃物理（半隐式欧拉） ——
    if (state.player.jumping) {
      state.player.vy -= config.gravity * step;
      state.player.y += state.player.vy * step;

      if (state.player.y <= 0) {
        state.player.y = 0;
        state.player.vy = 0;
        state.player.jumping = false;
      }
    }

    // —— 实体前进 ——
    const dz = state.roadSpeed * step;
    for (let i = 0; i < state.entities.length; i++) {
      state.entities[i].z += dz;
    }

    // —— 生成新实体 ——
    state.spawnTimer += step;
    while (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer -= state.spawnInterval;
      spawnEntity();
    }

    // —— 碰撞与计分 ——
    handleCollisionsAndScoring();

    // —— 移除超出 despawnZ 的实体 ——
    if (state.entities.length > 0) {
      state.entities = state.entities.filter((e) => e.z <= config.despawnZ);
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
