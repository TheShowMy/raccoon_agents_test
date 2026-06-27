/**
 * 3D 越野车竞速 — 反馈效果模块
 *
 * 提供粒子爆发、屏幕震动和音效系统，供渲染层在特定游戏事件发生时调用。
 * 不修改游戏逻辑，只负责视觉/听觉反馈。
 *
 * 粒子使用 THREE.Points 实现，性能高效。
 * 音效使用 Web Audio API，支持程序化生成，无需预加载音频文件。
 */

import * as THREE from 'three';

/* ============================================================
 * 粒子效果
 * ============================================================ */

/**
 * 创建粒子系统
 * @param {number} count - 粒子数量
 * @param {number} color - 颜色值 (0xRRGGBB)
 * @param {number} size - 粒子大小
 * @returns {{ points: THREE.Points, velocities: Float32Array, lifetime: number, maxLifetime: number, elapsed: number }}
 */
function createParticleSystem(count, color, size) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  // 随机初始化位置（在原点附近）
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 0.5;
    positions[i * 3 + 1] = Math.random() * 0.3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

    // 随机速度：向上和四周扩散
    velocities[i * 3] = (Math.random() - 0.5) * 8;
    velocities[i * 3 + 1] = Math.random() * 6 + 2;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 8;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 1,
    sizeAttenuation: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false;

  return {
    points,
    velocities,
    lifetime: 0,
    maxLifetime: 0.8,
    elapsed: 0,
  };
}

/**
 * 更新粒子系统
 * @param {object} particle - 粒子系统对象
 * @param {number} dt - 时间增量（秒）
 * @param {number} gravity - 重力加速度
 * @returns {boolean} 是否仍在存活（true=存活，false=已消亡）
 */
function updateParticleSystem(particle, dt, gravity = 15) {
  if (!particle.points.visible) return false;

  particle.elapsed += dt;
  particle.lifetime += dt;

  const progress = particle.lifetime / particle.maxLifetime;
  if (progress >= 1) {
    particle.points.visible = false;
    return false;
  }

  // 更新不透明度（渐隐）
  particle.points.material.opacity = 1 - progress;

  // 更新粒子位置
  const positions = particle.points.geometry.attributes.position.array;
  const count = positions.length / 3;

  for (let i = 0; i < count; i++) {
    const vi = i * 3;
    // 应用重力
    particle.velocities[vi + 1] -= gravity * dt;

    // 更新位置
    positions[vi] += particle.velocities[vi] * dt;
    positions[vi + 1] += particle.velocities[vi + 1] * dt;
    positions[vi + 2] += particle.velocities[vi + 2] * dt;
  }

  particle.points.geometry.attributes.position.needsUpdate = true;
  return true;
}

/* ============================================================
 * 屏幕震动
 * ============================================================ */

/**
 * 创建屏幕震动状态
 * @param {number} intensity - 震动强度（初始幅度）
 * @param {number} decay - 每秒衰减系数（0-1，越小衰减越快）
 * @returns {{ intensity: number, decay: number, offsetX: number, offsetY: number, time: number }}
 */
function createScreenShake(intensity = 0.5, decay = 3) {
  return {
    intensity,
    decay,
    offsetX: 0,
    offsetY: 0,
    time: 0,
  };
}

/**
 * 触发屏幕震动
 * @param {object} shake - 震动状态对象
 * @param {number} amount - 震动强度增量
 */
function triggerScreenShake(shake, amount) {
  shake.intensity = Math.max(shake.intensity, amount);
}

/**
 * 更新屏幕震动
 * @param {object} shake - 震动状态对象
 * @param {number} dt - 时间增量（秒）
 */
function updateScreenShake(shake, dt) {
  if (shake.intensity <= 0.001) {
    shake.intensity = 0;
    shake.offsetX = 0;
    shake.offsetY = 0;
    return;
  }

  shake.time += dt;

  // 衰减震动强度
  shake.intensity *= Math.exp(-shake.decay * dt);

  if (shake.intensity <= 0.001) {
    shake.intensity = 0;
    shake.offsetX = 0;
    shake.offsetY = 0;
    return;
  }

  // 生成震动偏移（高频随机抖动）
  const t = shake.time * 30;
  shake.offsetX = (Math.random() - 0.5) * 2 * shake.intensity;
  shake.offsetY = (Math.random() - 0.5) * 2 * shake.intensity;

  // 叠加低频摆动效果
  shake.offsetX += Math.sin(t * 1.1) * shake.intensity * 0.3;
  shake.offsetY += Math.cos(t * 0.9) * shake.intensity * 0.3;
}

/* ============================================================
 * Web Audio 音效
 * ============================================================ */

let audioContext = null;

/**
 * 获取或创建 AudioContext（用户交互后才能创建）
 * @returns {AudioContext|null}
 */
function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[racingEffects] 无法创建 AudioContext:', e);
      return null;
    }
  }
  // 恢复上下文（如果被暂停）
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * 播放碰撞音效（低频冲击波）
 * @param {number} severity - 严重程度 0-1，影响音量和音高
 */
function playCollisionSound(severity = 1) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 创建振荡器：低频冲击
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150 * (1 + severity * 0.5), now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + 0.2);

  const volume = Math.min(0.4, 0.15 + severity * 0.25);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.35);

  // 添加噪声层
  const noiseLength = 0.1;
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * noiseLength, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseData.length * 0.3));
  }

  const noiseSource = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();

  noiseSource.buffer = noiseBuffer;
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(1000, now);
  noiseGain.gain.setValueAtTime(volume * 0.5, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLength);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noiseSource.start(now);
}

/**
 * 播放拾取音效（清脆的上升音）
 */
function playPickupSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 主音调：上升的正弦波
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523, now); // C5
  osc1.frequency.setValueAtTime(659, now + 0.05); // E5
  osc1.frequency.setValueAtTime(784, now + 0.1); // G5
  osc1.frequency.setValueAtTime(1047, now + 0.15); // C6

  gain1.gain.setValueAtTime(0.2, now);
  gain1.gain.setValueAtTime(0.2, now + 0.15);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);

  osc1.start(now);
  osc1.stop(now + 0.4);

  // 装饰音：高频泛音
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(2093, now + 0.05); // C7
  osc2.frequency.setValueAtTime(2637, now + 0.1); // E7

  gain2.gain.setValueAtTime(0.08, now + 0.05);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now + 0.05);
  osc2.stop(now + 0.3);
}

/**
 * 播放游戏结束音效（下降的低音）
 */
function playGameoverSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 主音调：下降的弦乐效果
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.8);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(150, now + 0.8);

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 1);

  // 添加不协和音
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc2.type = 'square';
  osc2.frequency.setValueAtTime(300, now + 0.1);
  osc2.frequency.exponentialRampToValueAtTime(60, now + 0.6);

  gain2.gain.setValueAtTime(0.1, now + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now + 0.1);
  osc2.stop(now + 0.8);
}

/* ============================================================
 * 效果管理器
 * ============================================================ */

/**
 * 创建效果管理器
 * @param {THREE.Scene} scene - three.js 场景
 * @returns {object} 效果管理器
 */
export function createEffectsManager(scene) {
  // 碰撞粒子（红色）
  const hitParticles = createParticleSystem(30, 0xff4444, 0.3);
  scene.add(hitParticles.points);

  // 拾取粒子（绿色/金色）
  const pickupParticles = createParticleSystem(25, 0x44ff88, 0.25);
  scene.add(pickupParticles.points);

  // 游戏结束粒子（紫色）
  const gameoverParticles = createParticleSystem(50, 0x8844ff, 0.4);
  scene.add(gameoverParticles.points);

  // 屏幕震动
  const screenShake = createScreenShake(0, 4);

  return {
    hitParticles,
    pickupParticles,
    gameoverParticles,
    screenShake,

    /**
     * 在指定位置触发碰撞效果
     * @param {number} x - 世界坐标 x
     * @param {number} y - 世界坐标 y
     * @param {number} z - 世界坐标 z
     * @param {number} severity - 严重程度 0-1
     */
    triggerHit(x, y, z, severity = 1) {
      const p = this.hitParticles;
      p.points.position.set(x, y, z);
      p.points.visible = true;
      p.lifetime = 0;
      p.maxLifetime = 0.6 + severity * 0.3;

      // 重新随机化速度
      const velocities = p.velocities;
      for (let i = 0; i < velocities.length / 3; i++) {
        velocities[i * 3] = (Math.random() - 0.5) * 10 * severity;
        velocities[i * 3 + 1] = Math.random() * 8 + 3;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 10 * severity;
      }

      triggerScreenShake(screenShake, 0.4 + severity * 0.4);
      playCollisionSound(severity);
    },

    /**
     * 在指定位置触发拾取效果
     * @param {number} x - 世界坐标 x
     * @param {number} y - 世界坐标 y
     * @param {number} z - 世界坐标 z
     */
    triggerPickup(x, y, z) {
      const p = this.pickupParticles;
      p.points.position.set(x, y, z);
      p.points.visible = true;
      p.lifetime = 0;
      p.maxLifetime = 0.7;

      // 重新随机化速度（向上扩散）
      const velocities = p.velocities;
      for (let i = 0; i < velocities.length / 3; i++) {
        velocities[i * 3] = (Math.random() - 0.5) * 6;
        velocities[i * 3 + 1] = Math.random() * 5 + 2;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 6;
      }

      playPickupSound();
    },

    /**
     * 触发游戏结束效果
     * @param {number} x - 世界坐标 x
     * @param {number} y - 世界坐标 y
     * @param {number} z - 世界坐标 z
     */
    triggerGameover(x, y, z) {
      const p = this.gameoverParticles;
      p.points.position.set(x, y, z);
      p.points.visible = true;
      p.lifetime = 0;
      p.maxLifetime = 1.2;

      // 重新随机化速度
      const velocities = p.velocities;
      for (let i = 0; i < velocities.length / 3; i++) {
        velocities[i * 3] = (Math.random() - 0.5) * 12;
        velocities[i * 3 + 1] = Math.random() * 10 + 4;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 12;
      }

      triggerScreenShake(screenShake, 0.8);
      playGameoverSound();
    },

    /**
     * 获取屏幕震动偏移
     * @returns {{ x: number, y: number }}
     */
    getShakeOffset() {
      return { x: screenShake.offsetX, y: screenShake.offsetY };
    },

    /**
     * 更新所有效果
     * @param {number} dt - 时间增量（秒）
     */
    update(dt) {
      updateParticleSystem(this.hitParticles, dt);
      updateParticleSystem(this.pickupParticles, dt);
      updateParticleSystem(this.gameoverParticles, dt);
      updateScreenShake(screenShake, dt);
    },

    /**
     * 清理所有效果
     */
    dispose() {
      scene.remove(this.hitParticles.points);
      scene.remove(this.pickupParticles.points);
      scene.remove(this.gameoverParticles.points);

      this.hitParticles.points.geometry.dispose();
      this.hitParticles.points.material.dispose();
      this.pickupParticles.points.geometry.dispose();
      this.pickupParticles.points.material.dispose();
      this.gameoverParticles.points.geometry.dispose();
      this.gameoverParticles.points.material.dispose();
    },
  };
}

/**
 * 处理游戏事件，触发相应效果
 * @param {object} effectsManager - 效果管理器
 * @param {object} event - 游戏事件对象
 * @param {number} playerX - 玩家世界坐标 x
 * @param {number} playerY - 玩家世界坐标 y
 * @param {number} playerZ - 玩家世界坐标 z
 * @param {object} eventKind - 实体类型（用于获取实体位置）
 */
export function handleEvent(effectsManager, event, playerX, playerY, playerZ, eventKind) {
  if (!effectsManager || !event) return;

  switch (event.type) {
    case 'hit':
      // 碰撞效果：实体位置或玩家位置
      effectsManager.triggerHit(playerX, playerY + 0.5, playerZ, event.damage / 2);
      break;

    case 'pickup':
      // 拾取效果
      effectsManager.triggerPickup(playerX, playerY + 0.5, playerZ);
      break;

    case 'gameover':
      // 游戏结束效果
      effectsManager.triggerGameover(playerX, playerY + 1, playerZ);
      break;

    default:
      break;
  }
}

// 导出单个粒子系统更新函数（供测试用）
export { updateParticleSystem, createParticleSystem };

// 导出屏幕震动函数（供测试用）
export { updateScreenShake, createScreenShake, triggerScreenShake };