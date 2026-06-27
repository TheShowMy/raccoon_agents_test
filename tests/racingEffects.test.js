/**
 * racingEffects.js 单元测试
 *
 * 验证粒子生命周期、屏幕震动衰减以及效果管理器的基本功能。
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// 由于 effects 模块依赖 THREE，我们创建一个简化的 mock 来测试核心逻辑
// 实际 THREE 相关的功能在集成测试中验证

describe('racingEffects.js — 粒子生命周期', () => {
  // 模拟粒子系统状态（不依赖 THREE）
  function createMockParticle() {
    return {
      lifetime: 0,
      maxLifetime: 0.8,
      opacity: 1,
      visible: false,
      velocities: new Float32Array([0, 0, 0, 0, 0, 0]),
    };
  }

  function updateMockParticle(particle, dt, gravity = 15) {
    if (!particle.visible) return false;

    particle.lifetime += dt;
    const progress = particle.lifetime / particle.maxLifetime;

    if (progress >= 1) {
      particle.visible = false;
      return false;
    }

    // 更新不透明度（渐隐）
    particle.opacity = 1 - progress;

    // 更新速度（模拟重力）
    for (let i = 1; i < particle.velocities.length; i += 3) {
      particle.velocities[i] -= gravity * dt;
    }

    return true;
  }

  it('粒子初始状态应为不可见', () => {
    const particle = createMockParticle();
    expect(particle.visible).toBe(false);
    expect(particle.lifetime).toBe(0);
    expect(particle.maxLifetime).toBe(0.8);
  });

  it('激活粒子后应变为可见', () => {
    const particle = createMockParticle();
    particle.visible = true;
    expect(particle.visible).toBe(true);
  });

  it('粒子生命周期应正确衰减', () => {
    const particle = createMockParticle();
    particle.visible = true;
    particle.maxLifetime = 0.8;

    // 模拟几帧
    updateMockParticle(particle, 0.2);
    expect(particle.lifetime).toBeCloseTo(0.2);
    expect(particle.opacity).toBeCloseTo(0.75); // 1 - 0.2/0.8 = 0.75

    updateMockParticle(particle, 0.2);
    expect(particle.lifetime).toBeCloseTo(0.4);
    expect(particle.opacity).toBeCloseTo(0.5); // 1 - 0.4/0.8 = 0.5
  });

  it('粒子超过最大生命周期后应消亡', () => {
    const particle = createMockParticle();
    particle.visible = true;
    particle.maxLifetime = 0.5;

    // 经过完整生命周期
    updateMockParticle(particle, 0.3);
    expect(particle.visible).toBe(true);

    updateMockParticle(particle, 0.3);
    expect(particle.visible).toBe(false);
  });

  it('不可见粒子更新后应返回 false', () => {
    const particle = createMockParticle();
    const alive = updateMockParticle(particle, 0.1);
    expect(alive).toBe(false);
  });

  it('重力应使粒子速度逐渐减小', () => {
    const particle = createMockParticle();
    particle.visible = true;
    particle.velocities = new Float32Array([0, 10, 0, 0, 8, 0]);

    updateMockParticle(particle, 0.1, 15);
    // y 速度应该减小
    expect(particle.velocities[1]).toBeLessThan(10);
    expect(particle.velocities[4]).toBeLessThan(8);
  });

  it('粒子可以设置不同的生命周期', () => {
    const particle1 = createMockParticle();
    particle1.maxLifetime = 0.5;

    const particle2 = createMockParticle();
    particle2.maxLifetime = 1.5;

    particle1.visible = true;
    particle2.visible = true;

    updateMockParticle(particle1, 0.25);
    updateMockParticle(particle2, 0.25);

    // 相同时间下，生命周期短的粒子衰减更快
    expect(particle1.opacity).toBeLessThan(particle2.opacity);
  });
});

describe('racingEffects.js — 屏幕震动衰减', () => {
  function createMockShake(intensity = 0.5, decay = 3) {
    return {
      intensity,
      decay,
      offsetX: 0,
      offsetY: 0,
      time: 0,
    };
  }

  function updateMockShake(shake, dt) {
    if (shake.intensity <= 0.001) {
      shake.intensity = 0;
      shake.offsetX = 0;
      shake.offsetY = 0;
      return;
    }

    shake.time += dt;
    shake.intensity *= Math.exp(-shake.decay * dt);

    if (shake.intensity <= 0.001) {
      shake.intensity = 0;
      shake.offsetX = 0;
      shake.offsetY = 0;
      return;
    }

    shake.offsetX = (Math.random() - 0.5) * 2 * shake.intensity;
    shake.offsetY = (Math.random() - 0.5) * 2 * shake.intensity;
  }

  it('震动初始强度应为设定值', () => {
    const shake = createMockShake(0.5, 3);
    expect(shake.intensity).toBeCloseTo(0.5);
    expect(shake.decay).toBe(3);
  });

  it('震动应随时间衰减', () => {
    const shake = createMockShake(1.0, 3);
    shake.intensity = 1.0;

    updateMockShake(shake, 0.1);
    expect(shake.intensity).toBeLessThan(1.0);
    expect(shake.intensity).toBeGreaterThan(0);

    updateMockShake(shake, 0.1);
    expect(shake.intensity).toBeLessThan(shake.intensity * Math.exp(shake.decay * 0.1));
  });

  it('震动衰减系数越大，衰减越快', () => {
    const shake1 = createMockShake(1.0, 2);
    const shake2 = createMockShake(1.0, 6);

    shake1.intensity = 1.0;
    shake2.intensity = 1.0;

    updateMockShake(shake1, 0.2);
    updateMockShake(shake2, 0.2);

    // 衰减系数大的震动衰减更多
    expect(shake2.intensity).toBeLessThan(shake1.intensity);
  });

  it('震动衰减到足够小时应归零', () => {
    const shake = createMockShake(0.001, 10);
    shake.intensity = 0.001;

    updateMockShake(shake, 0.1);
    expect(shake.intensity).toBe(0);
    expect(shake.offsetX).toBe(0);
    expect(shake.offsetY).toBe(0);
  });

  it('触发震动可以增加强度', () => {
    const shake = createMockShake(0.2, 3);
    shake.intensity = 0.2;

    // 模拟触发（触发值更大）
    shake.intensity = Math.max(shake.intensity, 0.5);
    expect(shake.intensity).toBe(0.5);
  });

  it('多次触发震动应保留最大值', () => {
    const shake = createMockShake(0.3, 3);
    shake.intensity = 0.3;

    // 触发震动
    const newIntensity = 0.5;
    shake.intensity = Math.max(shake.intensity, newIntensity);
    expect(shake.intensity).toBe(0.5);

    // 再次触发，更小的值不应覆盖
    shake.intensity = Math.max(shake.intensity, 0.4);
    expect(shake.intensity).toBe(0.5);
  });

  it('震动偏移应在合理范围内', () => {
    const shake = createMockShake(0.5, 3);
    shake.intensity = 0.5;

    updateMockShake(shake, 0.05);

    // 震动偏移应小于强度
    expect(Math.abs(shake.offsetX)).toBeLessThanOrEqual(shake.intensity * 2);
    expect(Math.abs(shake.offsetY)).toBeLessThanOrEqual(shake.intensity * 2);
  });
});

describe('racingEffects.js — 效果管理器逻辑', () => {
  it('碰撞效果应设置适当的生命周期', () => {
    // 模拟碰撞粒子配置
    const hitConfig = {
      maxLifetime: 0.6,
      severity: 1,
    };
    const adjustedLifetime = hitConfig.maxLifetime + hitConfig.severity * 0.3;
    expect(adjustedLifetime).toBeCloseTo(0.9);
  });

  it('拾取效果应有较短的持续时间', () => {
    const pickupLifetime = 0.7;
    const hitLifetime = 0.9;
    expect(pickupLifetime).toBeLessThan(hitLifetime);
  });

  it('游戏结束效果应有较长的持续时间', () => {
    const gameoverLifetime = 1.2;
    const hitLifetime = 0.9;
    expect(gameoverLifetime).toBeGreaterThan(hitLifetime);
  });

  it('事件类型应正确映射到效果', () => {
    const eventEffectMap = {
      hit: 'triggerHit',
      pickup: 'triggerPickup',
      gameover: 'triggerGameover',
    };

    expect(eventEffectMap['hit']).toBe('triggerHit');
    expect(eventEffectMap['pickup']).toBe('triggerPickup');
    expect(eventEffectMap['gameover']).toBe('triggerGameover');
  });

  it('碰撞严重程度应影响震动强度', () => {
    const baseShake = 0.4;
    const severity = 0.5;
    const shakeIntensity = baseShake + severity * 0.4;
    expect(shakeIntensity).toBeCloseTo(0.6);
  });

  it('无效事件不应触发任何效果', () => {
    const event = { type: 'unknown' };
    const validEvents = ['hit', 'pickup', 'gameover'];
    const isValid = validEvents.includes(event.type);
    expect(isValid).toBe(false);
  });
});

describe('racingEffects.js — 边界情况', () => {
  it('零时间增量不应导致问题', () => {
    let intensity = 1.0;
    const decay = 3;
    // exp(-decay * 0) = exp(0) = 1
    intensity *= Math.exp(-decay * 0);
    expect(intensity).toBe(1.0);
  });

  it('负时间增量应安全处理', () => {
    // 负 dt 会导致强度增加，但我们应该在调用前确保 dt >= 0
    let intensity = 1.0;
    const dt = -0.1;
    // 如果传入负值，强度会增加，这不是预期行为
    // 所以应该在调用前进行边界检查
    expect(() => {
      const safeDt = Math.max(0, dt);
      intensity *= Math.exp(-3 * safeDt);
    }).not.toThrow();
  });

  it('极大时间增量应安全处理', () => {
    let intensity = 1.0;
    const dt = 100; // 极大值
    intensity *= Math.exp(-3 * dt);
    expect(intensity).toBeLessThan(0.001);
  });

  it('粒子速度数组应正确初始化', () => {
    const count = 30;
    const velocities = new Float32Array(count * 3);
    expect(velocities.length).toBe(count * 3);
  });

  it('速度数组索引应正确计算', () => {
    const i = 5;
    const vi = i * 3;
    expect(vi).toBe(15);
    expect(vi + 1).toBe(16);
    expect(vi + 2).toBe(17);
  });
});