/**
 * racingEngine.js 单元测试
 *
 * 覆盖：
 *   - 碰撞后实体立即从 state.entities 移除（不再继续前移穿过赛车）
 *   - hit / pickup 事件携带 entity.lane 与 entity.z
 *   - 跳跃成功跨越的障碍物仍走 pass 计分
 *   - 越过障碍物 / 对向车辆 / 加血道具的得分、扣血、加血、游戏结束逻辑未受影响
 *   - 难度曲线（速度提升、spawn 间隔缩窄、pickup 概率下降）保持
 *
 * 通过注入确定性 rng 让 spawn 顺序与实体类型可预测，避免 flake。
 *
 * 注意：updateDifficulty 会把 baseSpawnInterval 夹紧到 [minSpawnInterval, baseSpawnInterval]，
 * 因此 baseSpawnInterval 必须 >= DEFAULT_CONFIG.minSpawnInterval (0.45) 才能生效。
 * 这里都按 >= 0.45 设置，便于节奏稳定。
 */

import { describe, it, expect } from 'vitest';
import {
  createRacingEngine,
  RACING_STATUS,
  ENTITY_KIND,
  DEFAULT_CONFIG,
} from '../src/lib/utils/racingEngine.js';

/**
 * 永远产出固定值的确定性 rng；由 spawnEntity 决定 lane/kind：
 *   - 第 1 次调用：lane = floor(value * laneCount)
 *   - 第 2 次调用：r = value（与 basePickupChance 比较决定 PICKUP）
 *   - 第 3 次调用：kind 抉择（仅当非 PICKUP 时调用，与 obstacleWeight 比较）
 */
function makeRngFor({
  lane = 1,
  kind = 'obstacle',
  basePickupChance = DEFAULT_CONFIG.basePickupChance,
  obstacleWeight = DEFAULT_CONFIG.obstacleWeight,
}) {
  const targetLaneFrac = (lane + 0.5) / 3; // lane 1 → 0.5
  let index = 0;
  return () => {
    const call = index++;
    if (call % 3 === 0) return targetLaneFrac; // 决定 lane
    if (call % 3 === 1) {
      // 决定是否为 PICKUP
      if (kind === 'pickup') return basePickupChance * 0.5; // < basePickupChance
      return 1; // 不为 PICKUP
    }
    // 决定 OBSTACLE / VEHICLE
    if (kind === 'obstacle') return obstacleWeight * 0.5; // < obstacleWeight
    return obstacleWeight + 0.1; // 不为 OBSTACLE → VEHICLE
  };
}

/** 让玩家跳到指定车道（强行 sweep，使 helper 安全）。 */
function setLane(engine, targetLane) {
  let lastLane = engine.getState().player.lane;
  let safety = 8;
  while (engine.getState().player.lane !== targetLane && safety-- > 0) {
    const delta = targetLane - lastLane;
    engine.changeLane(delta);
    lastLane = engine.getState().player.lane;
  }
}

describe('racingEngine.js — 碰撞实体立即销毁与事件元数据', () => {
  it('pickup 碰撞后该实体在下一帧已从 state.entities 消失，pickup 事件携带 lane/z', () => {
    // 用一个分阶段 rng：先 spawn OBSTACLE（撞 1 次扣血 1），再 spawn PICKUP（这时 health < max，
    // pickup 加血会真触发 lastEvent）。
    const phases = [
      { lane: 1, kind: 'obstacle' },
      { lane: 1, kind: 'pickup' },
    ];
    let callIndex = 0;
    let spawnIndex = 0;
    const phasedRng = () => {
      const phase = phases[Math.min(spawnIndex, phases.length - 1)];
      const callMod = callIndex % 3;
      callIndex += 1;
      if (callMod === 0) {
        // lane 决策
        // 也可能命中 player 不会 spawn 时被 extra 调用；保持稳定 targetLaneFrac
        return (phase.lane + 0.5) / 3;
      }
      if (callMod === 1) {
        // pickupChance 决策
        if (phase.kind === 'pickup') return DEFAULT_CONFIG.basePickupChance * 0.5;
        return 1; // 不是 PICKUP
      }
      // OBSTACLE/VEHICLE 决策：obstacleWeight=1 → 全 OBSTACLE；=0 → 全 VEHICLE
      if (phase.kind === 'obstacle') return DEFAULT_CONFIG.obstacleWeight * 0.5;
      if (phase.kind === 'vehicle') return DEFAULT_CONFIG.obstacleWeight + 0.1;
      return 0.99;
    };
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 0.5,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 4,
      },
      phasedRng
    );
    engine.start();
    setLane(engine, 1);

    const dt = 1 / 60;
    let obstacleHitSeen = false;
    let pickupEvent = null;
    let obstacleEntityZ = null;
    for (let i = 0; i < 600; i++) {
      // 通过找下一个目标实体 z 来切换 phase：在 spawn 调用第 3 次 rng 后即认定下一次 spawn 用下一 phase。
      // 简单方案：等 obstacle 撞完后切到 pickup phase。
      const entBefore = engine.getState().entities.find((e) => e.kind === ENTITY_KIND.PICKUP);
      engine.update(dt);
      const s = engine.getState();
      const ev = s.lastEvent;
      if (!obstacleHitSeen && ev && ev.type === 'hit' && ev.kind === ENTITY_KIND.OBSTACLE) {
        obstacleHitSeen = true;
        spawnIndex = 1; // 切换到 pickup phase
        obstacleEntityZ = ev.z;
      } else if (obstacleHitSeen && ev && ev.type === 'pickup') {
        pickupEvent = ev;
        break;
      }
      // 帮助避免元素 stays 之后 pickup 永远不会 spawn：在 obstacle 撞完后等到一个 spawn 窗口
      if (obstacleHitSeen && !entBefore && i > 30) {
        // 还没有 pickup spawn，尝试再等几帧
      }
    }
    expect(obstacleHitSeen).toBe(true);
    expect(pickupEvent).not.toBeNull();
    expect(pickupEvent.type).toBe('pickup');
    expect(pickupEvent.lane).toBe(1);
    expect(typeof pickupEvent.z).toBe('number');
    // 碰撞帧后该 pickup 实体已消失
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.PICKUP)).toBeUndefined();
    // 加血后 health >= maxHealth
    expect(engine.getState().health).toBeGreaterThan(obstacleHitSeen ? engine.getState().maxHealth - DEFAULT_CONFIG.pickupHeal : 0);
    expect(engine.getState().health).toBe(DEFAULT_CONFIG.initialHealth - DEFAULT_CONFIG.obstacleDamage + DEFAULT_CONFIG.pickupHeal);
  });

  it('obstacle 碰撞（非跳跃）后该实体立即从 state.entities 消失，且 hit 事件携带 lane/z', () => {
    const rng = makeRngFor({ lane: 1, kind: 'obstacle' });
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 1.0,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 4,
        obstacleWeight: 1,
      },
      rng
    );
    engine.start();
    const healthBefore = engine.getState().health;
    setLane(engine, 1);

    let hitEvent = null;
    let collidedEntityZ = null;
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      const entBefore = engine.getState().entities.find((e) => e.kind === ENTITY_KIND.OBSTACLE && e.lane === 1);
      engine.update(dt);
      const s = engine.getState();
      const ev = s.lastEvent;
      if (ev && ev.type === 'hit' && ev.kind === ENTITY_KIND.OBSTACLE) {
        hitEvent = ev;
        collidedEntityZ = entBefore ? entBefore.z : null;
        break;
      }
    }
    expect(hitEvent).not.toBeNull();
    expect(hitEvent.lane).toBe(1);
    expect(typeof hitEvent.z).toBe('number');
    // 事件携带的 z 应等于被碰撞实体该帧的 z
    expect(collidedEntityZ).not.toBeNull();
    expect(hitEvent.z).toBeCloseTo(collidedEntityZ, 5);
    // 该帧后实体已消失
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.OBSTACLE)).toBeUndefined();
    // 扣血 1
    expect(engine.getState().health).toBe(healthBefore - DEFAULT_CONFIG.obstacleDamage);
    expect(engine.getState().stats.hits).toBe(1);
  });

  it('vehicle 碰撞后该实体立即从 state.entities 消失，并扣 vehicleDamage', () => {
    const rng = makeRngFor({ lane: 1, kind: 'vehicle' });
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 1.0,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 4,
        obstacleWeight: 0,
      },
      rng
    );
    engine.start();
    const healthBefore = engine.getState().health;
    setLane(engine, 1);

    let hitEvent = null;
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      engine.update(dt);
      const s = engine.getState();
      const ev = s.lastEvent;
      if (ev && ev.type === 'hit' && ev.kind === ENTITY_KIND.VEHICLE) {
        hitEvent = ev;
        break;
      }
    }
    expect(hitEvent).not.toBeNull();
    expect(hitEvent.kind).toBe(ENTITY_KIND.VEHICLE);
    expect(hitEvent.lane).toBe(1);
    expect(typeof hitEvent.z).toBe('number');
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.VEHICLE)).toBeUndefined();
    expect(engine.getState().health).toBe(healthBefore - DEFAULT_CONFIG.vehicleDamage);
  });

  it('跳跃成功跨越 obstacle 后实体仍在 entities 中（cleared），并仍能在越过 passRadius 时得分', () => {
    const rng = makeRngFor({ lane: 1, kind: 'obstacle' });
    const engine = createRacingEngine(
      {
        spawnZ: -8,
        despawnZ: 30,
        baseSpawnInterval: 1.0,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 4,
        obstacleWeight: 1,
        passRadius: 1.0,
        collisionRadius: 1.0,
      },
      rng
    );
    engine.start();
    setLane(engine, 1);

    let jumped = false;
    let sawCleared = false;
    let sawPass = false;
    const dt = 1 / 60;
    const scoreBefore = engine.getState().score;
    for (let i = 0; i < 800; i++) {
      engine.update(dt);
      const s = engine.getState();
      // 当首个实体进入 z ∈ [-3, -2] 区间时立刻跳跃（让 y 在碰撞半径时已 ≥ jumpClearHeight）
      if (!jumped) {
        const target = s.entities.find((e) => e.kind === ENTITY_KIND.OBSTACLE && e.lane === 1);
        if (target && target.z > -3.0 && target.z < -1.5) {
          engine.jump();
          jumped = true;
        }
      }
      const ev = s.lastEvent;
      if (!jumped) continue;
      // 验证：cleared 实体仍存在于 entities 数组
      const clearedOne = s.entities.find((e) => e.cleared === true);
      if (clearedOne) sawCleared = true;
      if (ev && ev.type === 'pass' && ev.kind === ENTITY_KIND.OBSTACLE) {
        sawPass = true;
        break;
      }
      if (s.status === RACING_STATUS.GAMEOVER) break;
    }
    expect(sawCleared).toBe(true);
    expect(sawPass).toBe(true);
    expect(engine.getState().score).toBeGreaterThanOrEqual(scoreBefore + DEFAULT_CONFIG.obstacleScore);
  });

  it('越过未碰撞的 obstacle 仍正常得分（lastEvent=pass），且实体最终被 despawn 移除', () => {
    // 实体全部生成在 lane 2、玩家在 lane 1，collisionRadius 极小确保不命中。
    const rng = makeRngFor({ lane: 2, kind: 'obstacle' });
    const engine = createRacingEngine(
      {
        spawnZ: -8,
        despawnZ: 1, // 让 score+despawn 容易在同一段验证
        baseSpawnInterval: 5.0, // 拉长 spawn 间隔，确保推进 200 帧后无新实体入场
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 6,
        obstacleWeight: 1,
        collisionRadius: 0.5,
        passRadius: 1.0,
      },
      rng
    );
    engine.start();
    setLane(engine, 1);

    let sawPass = false;
    let scoreOnPass = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 200; i++) {
      engine.update(dt);
      const s = engine.getState();
      const ev = s.lastEvent;
      if (ev && ev.type === 'pass' && ev.kind === ENTITY_KIND.OBSTACLE) {
        if (!sawPass) {
          sawPass = true;
          scoreOnPass = s.score;
        }
      }
    }
    expect(sawPass).toBe(true);
    expect(scoreOnPass).toBeGreaterThanOrEqual(DEFAULT_CONFIG.obstacleScore);
    // 单个 OBSTACLE 已被 despawn（z > despawnZ=1 → 滤掉）
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.OBSTACLE)).toBeUndefined();
  });

  it('连击 vehicle 碰撞直到血量归零：触发 gameover 事件，最后一次事件携带 lane/z', () => {
    const rng = makeRngFor({ lane: 1, kind: 'vehicle' });
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 0.5,
        initialSpawnProgress: 3, // 第 1 帧栈 3 个 vehicle
        baseRoadSpeed: 4,
        obstacleWeight: 0,
        initialHealth: 3,
        vehicleDamage: 2,
      },
      rng
    );
    engine.start();
    setLane(engine, 1);

    const dt = 1 / 60;
    let gameoverEvent = null;
    for (let i = 0; i < 600; i++) {
      engine.update(dt);
      const s = engine.getState();
      const ev = s.lastEvent;
      if (ev && ev.type === 'gameover') {
        gameoverEvent = ev;
        break;
      }
    }
    expect(gameoverEvent).not.toBeNull();
    expect(gameoverEvent.reason).toBe(ENTITY_KIND.VEHICLE);
    expect(typeof gameoverEvent.lane).toBe('number');
    expect(typeof gameoverEvent.z).toBe('number');
    expect(engine.getState().status).toBe(RACING_STATUS.GAMEOVER);
  });

  it('难度曲线：roadSpeed 随 elapsed 单调上升、spawnInterval 单调下降、pickupChance 单调下降', () => {
    const rng = () => 0.99; // 不影响难度
    const engine = createRacingEngine(undefined, rng);
    engine.start();
    const dt = 1 / 60;
    let prev = null;
    for (let i = 0; i < 60; i++) {
      engine.update(dt);
      const s = engine.getState();
      if (prev) {
        expect(s.roadSpeed).toBeGreaterThanOrEqual(prev.roadSpeed);
        expect(s.spawnInterval).toBeLessThanOrEqual(prev.spawnInterval);
        expect(s.pickupChance).toBeLessThanOrEqual(prev.pickupChance);
      }
      prev = {
        roadSpeed: s.roadSpeed,
        spawnInterval: s.spawnInterval,
        pickupChance: s.pickupChance,
      };
    }
  });
});
