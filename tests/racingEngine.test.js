/**
 * racingEngine.js 单元测试
 *
 * 覆盖点：
 *   - 状态机（MENU / PLAYING / GAMEOVER）切换
 *   - 3 车道变道与跳跃物理
 *   - 碰撞后实体立即从 state.entities 移除
 *   - hit / pickup / gameover 事件携带 lane 与 z 元数据
 *   - 跳跃成功跨越障碍物（cleared）仍可计分
 *   - 非碰撞障碍物正常得分（pass 事件）
 *   - 难度曲线单调性（速度、生成间隔、加血概率）
 *   - 可注入确定性 rng
 *
 * 确定性 RNG 约定（与 spawnEntity 中 rand() 调用顺序一致）：
 *   第 1 次：lane = floor(rand() * laneCount)
 *   第 2 次：pickup 判定（r < pickupChance）
 *   第 3 次：obs/vehicle 判定（仅当非 pickup 时）
 *   以上 3 次构成一个 spawn 周期，循环重复。
 */

import { describe, it, expect } from 'vitest';
import {
  createRacingEngine,
  getLaneX,
  RACING_STATUS,
  ENTITY_KIND,
  DEFAULT_CONFIG,
} from '../src/lib/utils/racingEngine.js';

/* ---------------------------------------------------------------
 * 辅助：确定性 RNG 工厂
 *
 * 每 3 次调用为一组：（lane, pickup 门限, obs/vehicle 门限）
 * --------------------------------------------------------------- */

function makeRngFor({ lane = 1, kind = 'obstacle' }) {
  const targetLaneFrac = (lane + 0.5) / 3;
  let index = 0;
  return () => {
    const call = index++;
    if (call % 3 === 0) return targetLaneFrac; // lane
    if (call % 3 === 1) {
      // pickup 门限：低于 pickupChance 则为 pickup
      return kind === 'pickup' ? DEFAULT_CONFIG.basePickupChance * 0.5 : 1;
    }
    // obs/vehicle 门限：低于 obstacleWeight 则为 obstacle
    return kind === 'obstacle' ? DEFAULT_CONFIG.obstacleWeight * 0.5 : DEFAULT_CONFIG.obstacleWeight + 0.1;
  };
}

/** 让玩家切换到指定车道（通过逐次 changeLane 逼近） */
function setLane(engine, targetLane) {
  let safety = 8;
  while (engine.getState().player.lane !== targetLane && safety-- > 0) {
    const cur = engine.getState().player.lane;
    engine.changeLane(targetLane - cur);
  }
}

/**
 * 创建可分阶段切换的确定性 RNG。
 * 每个 phase 控制 spawn 时 lane/kind，通过 rng.nextPhase() 切换到下一阶段。
 */
function createPhaseRng(phases) {
  let callIndex = 0;
  let phaseIdx = 0;
  const fn = () => {
    const p = phases[phaseIdx];
    const mod = callIndex % 3;
    callIndex++;
    if (mod === 0) return (p.lane + 0.5) / 3; // lane
    if (mod === 1) return p.kind === 'pickup' ? DEFAULT_CONFIG.basePickupChance * 0.5 : 1; // pickup?
    return p.kind === 'obstacle' ? DEFAULT_CONFIG.obstacleWeight * 0.5 : DEFAULT_CONFIG.obstacleWeight + 0.1;
  };
  fn.nextPhase = () => { phaseIdx = Math.min(phaseIdx + 1, phases.length - 1); };
  return fn;
}

/* ---------------------------------------------------------------
 * 测试
 * --------------------------------------------------------------- */

describe('racingEngine', () => {
  // -----------------------------------------------------------------
  // 状态机
  // -----------------------------------------------------------------

  it('初始状态为 MENU', () => {
    const engine = createRacingEngine();
    expect(engine.getState().status).toBe(RACING_STATUS.MENU);
  });

  it('start() 将状态切换为 PLAYING', () => {
    const engine = createRacingEngine();
    engine.start();
    expect(engine.getState().status).toBe(RACING_STATUS.PLAYING);
  });

  it('start() 在 PLAYING 状态下为幂等', () => {
    const engine = createRacingEngine();
    engine.start();
    const s1 = engine.getState();
    engine.start();
    expect(engine.getState()).toBe(s1); // 同一引用
  });

  it('reset() 回到 MENU 并重置所有状态', () => {
    const engine = createRacingEngine();
    engine.start();
    engine.update(1);
    engine.changeLane(1);
    engine.reset();
    const s = engine.getState();
    expect(s.status).toBe(RACING_STATUS.MENU);
    expect(s.player.lane).toBe(1);
    expect(s.score).toBe(0);
    expect(s.health).toBe(DEFAULT_CONFIG.initialHealth);
  });

  // -----------------------------------------------------------------
  // 车道切换
  // -----------------------------------------------------------------

  it('changeLane 在 PLAYING 状态下生效', () => {
    const engine = createRacingEngine();
    engine.start();
    engine.changeLane(1);
    expect(engine.getState().player.lane).toBe(2);
    expect(engine.getState().lastEvent).toEqual({ type: 'lane', lane: 2 });
  });

  it('changeLane 在非 PLAYING 状态下无操作', () => {
    const engine = createRacingEngine();
    engine.changeLane(1);
    expect(engine.getState().player.lane).toBe(1);
    expect(engine.getState().lastEvent).toBeNull();
  });

  it('changeLane 在边界时触发 lane_blocked 事件', () => {
    const engine = createRacingEngine();
    engine.start();
    // 从车道 1 向左两次：车道 0 后再左即被阻挡
    engine.changeLane(-1);
    engine.changeLane(-1);
    expect(engine.getState().lastEvent).toEqual({ type: 'lane_blocked', lane: 0 });
  });

  it('changeLane 接受 0 或非法值时为无操作', () => {
    const engine = createRacingEngine();
    engine.start();
    engine.changeLane(0);
    expect(engine.getState().lastEvent).toBeNull();
  });

  // -----------------------------------------------------------------
  // 跳跃物理
  // -----------------------------------------------------------------

  it('jump() 触发跳跃，修改 y/vy 并触发 jump 事件', () => {
    const engine = createRacingEngine();
    engine.start();
    engine.jump();
    const s = engine.getState();
    expect(s.player.jumping).toBe(true);
    expect(s.player.vy).toBe(DEFAULT_CONFIG.jumpInitialVelocity);
    expect(s.lastEvent).toEqual({ type: 'jump' });
  });

  it('跳跃后在重力作用下落地', () => {
    const engine = createRacingEngine();
    engine.start();
    engine.jump();
    // 模拟多帧直到落地
    for (let i = 0; i < 120; i++) {
      engine.update(1 / 60);
    }
    const s = engine.getState();
    expect(s.player.jumping).toBe(false);
    expect(s.player.y).toBe(0);
    expect(s.player.vy).toBe(0);
  });

  it('跳跃中再次调用 jump() 被忽略', () => {
    const engine = createRacingEngine();
    engine.start();
    engine.jump();
    const s1 = engine.getState();
    engine.jump();
    expect(engine.getState().player.vy).toBe(s1.player.vy);
  });

  // -----------------------------------------------------------------
  // 碰撞与计分
  // -----------------------------------------------------------------

  it('pickup 碰撞后实体消失，health 恢复，事件携带 lane/z', () => {
    // 先用 obstacle 撞一次让血量低于上限，再 spawn pickup 验证加血
    const rng = createPhaseRng([
      { lane: 1, kind: 'obstacle' },
      { lane: 1, kind: 'pickup' },
    ]);
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 1.0,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 4,
      },
      rng,
    );
    engine.start();
    setLane(engine, 1);

    let hitSeen = false;
    let pickupEvent = null;
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      engine.update(dt);
      const ev = engine.getState().lastEvent;

      if (!hitSeen && ev && ev.type === 'hit' && ev.kind === ENTITY_KIND.OBSTACLE) {
        hitSeen = true;
        rng.nextPhase(); // 切换到 pickup 阶段
        continue;
      }

      if (hitSeen && ev && ev.type === 'pickup') {
        pickupEvent = ev;
        break;
      }
    }

    expect(hitSeen).toBe(true);
    expect(pickupEvent).not.toBeNull();
    expect(pickupEvent.type).toBe('pickup');
    expect(pickupEvent.lane).toBe(1);
    expect(typeof pickupEvent.z).toBe('number');
    expect(pickupEvent.heal).toBeGreaterThan(0);

    // pickup 实体已从 entities 移除
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.PICKUP)).toBeUndefined();
    // 血量恢复（5 - 1 + 1 = 5）
    expect(engine.getState().health).toBe(DEFAULT_CONFIG.initialHealth);
  });

  it('obstacle 碰撞（非跳跃）后实体消失，hit 事件携带 lane/z，扣血', () => {
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 1.0,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 4,
        obstacleWeight: 1,
      },
      makeRngFor({ lane: 1, kind: 'obstacle' }),
    );
    engine.start();
    const healthBefore = engine.getState().health;
    setLane(engine, 1);

    let hitEvent = null;
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      engine.update(dt);
      const ev = engine.getState().lastEvent;
      if (ev && ev.type === 'hit' && ev.kind === ENTITY_KIND.OBSTACLE) {
        hitEvent = ev;
        break;
      }
    }

    expect(hitEvent).not.toBeNull();
    expect(hitEvent.lane).toBe(1);
    expect(typeof hitEvent.z).toBe('number');
    expect(hitEvent.damage).toBe(DEFAULT_CONFIG.obstacleDamage);
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.OBSTACLE)).toBeUndefined();
    expect(engine.getState().health).toBe(healthBefore - DEFAULT_CONFIG.obstacleDamage);
    expect(engine.getState().stats.hits).toBe(1);
  });

  it('vehicle 碰撞后实体消失，hit 事件携带 lane/z，扣 vehicleDamage', () => {
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 1.0,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 4,
        obstacleWeight: 0,
      },
      makeRngFor({ lane: 1, kind: 'vehicle' }),
    );
    engine.start();
    const healthBefore = engine.getState().health;
    setLane(engine, 1);

    let hitEvent = null;
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      engine.update(dt);
      const ev = engine.getState().lastEvent;
      if (ev && ev.type === 'hit' && ev.kind === ENTITY_KIND.VEHICLE) {
        hitEvent = ev;
        break;
      }
    }

    expect(hitEvent).not.toBeNull();
    expect(hitEvent.kind).toBe(ENTITY_KIND.VEHICLE);
    expect(hitEvent.lane).toBe(1);
    expect(typeof hitEvent.z).toBe('number');
    expect(hitEvent.damage).toBe(DEFAULT_CONFIG.vehicleDamage);
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.VEHICLE)).toBeUndefined();
    expect(engine.getState().health).toBe(healthBefore - DEFAULT_CONFIG.vehicleDamage);
  });

  it('跳跃成功跨越 obstacle：实体 cleared，仍留在 entities 中，越过时计分', () => {
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
      makeRngFor({ lane: 1, kind: 'obstacle' }),
    );
    engine.start();
    setLane(engine, 1);

    let jumped = false;
    let sawCleared = false;
    let sawPass = false;
    const scoreBefore = engine.getState().score;

    for (let i = 0; i < 800; i++) {
      engine.update(1 / 60);
      const s = engine.getState();

      if (!jumped) {
        const target = s.entities.find((e) => e.kind === ENTITY_KIND.OBSTACLE && e.lane === 1);
        if (target && target.z > -3.0 && target.z < -1.5) {
          engine.jump();
          jumped = true;
        }
      }

      if (s.entities.find((e) => e.cleared === true)) sawCleared = true;
      if (s.lastEvent && s.lastEvent.type === 'pass' && s.lastEvent.kind === ENTITY_KIND.OBSTACLE) {
        sawPass = true;
        break;
      }
      if (s.status === RACING_STATUS.GAMEOVER) break;
    }

    expect(sawCleared).toBe(true);
    expect(sawPass).toBe(true);
    expect(engine.getState().score).toBeGreaterThanOrEqual(scoreBefore + DEFAULT_CONFIG.obstacleScore);
  });

  it('未碰撞的 obstacle 正常得分（pass 事件），最终被 despawn 移除', () => {
    const engine = createRacingEngine(
      {
        spawnZ: -8,
        despawnZ: 1,
        baseSpawnInterval: 5.0,
        initialSpawnProgress: 1.0,
        baseRoadSpeed: 6,
        obstacleWeight: 1,
        collisionRadius: 0.5,
        passRadius: 1.0,
      },
      makeRngFor({ lane: 2, kind: 'obstacle' }),
    );
    engine.start();
    setLane(engine, 1); // 玩家在 lane 1，实体在 lane 2 → 不碰撞

    let sawPass = false;
    for (let i = 0; i < 200; i++) {
      engine.update(1 / 60);
      const ev = engine.getState().lastEvent;
      if (ev && ev.type === 'pass' && ev.kind === ENTITY_KIND.OBSTACLE && !sawPass) {
        sawPass = true;
      }
    }

    expect(sawPass).toBe(true);
    expect(engine.getState().score).toBeGreaterThanOrEqual(DEFAULT_CONFIG.obstacleScore);
    expect(engine.getState().entities.find((e) => e.kind === ENTITY_KIND.OBSTACLE)).toBeUndefined();
  });

  it('连续 vehicle 碰撞直到血量归零触发 gameover，事件携带 lane/z', () => {
    const engine = createRacingEngine(
      {
        spawnZ: -3,
        despawnZ: 5,
        baseSpawnInterval: 0.5,
        initialSpawnProgress: 3,
        baseRoadSpeed: 4,
        obstacleWeight: 0,
        initialHealth: 3,
        vehicleDamage: 2,
      },
      makeRngFor({ lane: 1, kind: 'vehicle' }),
    );
    engine.start();
    setLane(engine, 1);

    let gameoverEvent = null;
    for (let i = 0; i < 600; i++) {
      engine.update(1 / 60);
      const ev = engine.getState().lastEvent;
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

  // -----------------------------------------------------------------
  // 难度曲线
  // -----------------------------------------------------------------

  it('难度曲线：roadSpeed 单调上升，spawnInterval 单调下降，pickupChance 单调下降', () => {
    const engine = createRacingEngine(undefined, () => 0.99);
    engine.start();

    let prev = null;
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
      const s = engine.getState();
      if (prev) {
        expect(s.roadSpeed).toBeGreaterThanOrEqual(prev.roadSpeed);
        expect(s.spawnInterval).toBeLessThanOrEqual(prev.spawnInterval);
        expect(s.pickupChance).toBeLessThanOrEqual(prev.pickupChance);
      }
      prev = { roadSpeed: s.roadSpeed, spawnInterval: s.spawnInterval, pickupChance: s.pickupChance };
    }
  });

  // -----------------------------------------------------------------
  // 工具函数
  // -----------------------------------------------------------------

  it('getLaneX 正确计算车道 X 坐标', () => {
    // 3 车道，间距 2：lane 0→-2, lane 1→0, lane 2→2
    expect(getLaneX(0, 3, 2)).toBe(-2);
    expect(getLaneX(1, 3, 2)).toBe(0);
    expect(getLaneX(2, 3, 2)).toBe(2);
    // 默认参数
    expect(getLaneX(1)).toBe(0);
  });
});
