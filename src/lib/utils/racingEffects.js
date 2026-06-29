/**
 * 3D 越野车竞速 — 反馈效果模块
 *
 * 提供粒子爆发、屏幕震动和音效系统，供渲染层在特定游戏事件发生时调用。
 * 不修改游戏逻辑，只负责视觉/听觉反馈。
 *
 * 粒子使用 THREE.Points 实现，性能高效。
 * 音效使用 Web Audio API，支持程序化生成，无需预加载音频文件。
 *
 * 实体差异化反馈：
 *   障碍物（橙色路障）、对向车辆（红色轿车）、加血道具（绿色医疗包）
 *   在碰撞/拾取时使用**独立**的粒子系统，表现为：
 *     - 颜色：橙 / 亮红 / 翠绿
 *     - 大小：0.35 / 0.20 / 0.25
 *     - 数量：32 / 40 / 28
 *     - 扩散形状：水平弧形碎片 / 全方位激烈爆裂 / 上扬光雨
 *   加上各自不同的屏幕震动强度与生命周期，玩家一眼可分辨触发了哪类事件。
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
 *
 * 内置四个独立的粒子系统，分别对应障碍物碰撞、对向车辆碰撞、
 * 加血道具拾取、游戏结束；颜色 / 大小 / 数量 / 扩散形状均有明显
 * 区分，渲染层只需根据事件类型调用对应 trigger 即可。
 *
 * @param {THREE.Scene} scene - three.js 场景
 * @returns {object} 效果管理器
 */
export function createEffectsManager(scene) {
  // 障碍物碰撞粒子（橙色路障碎片）—— 水平弧形 + 落地感
  const obstacleHitParticles = createParticleSystem(32, 0xff7a1a, 0.35);
  scene.add(obstacleHitParticles.points);

  // 对向车辆碰撞粒子（亮红火花）—— 全方位激烈爆裂
  const vehicleHitParticles = createParticleSystem(40, 0xff3030, 0.2);
  scene.add(vehicleHitParticles.points);

  // 加血道具拾取粒子（翠绿光点）—— 上扬光雨
  const pickupParticles = createParticleSystem(28, 0x44ff88, 0.25);
  scene.add(pickupParticles.points);

  // 游戏结束粒子（紫色大爆发）
  const gameoverParticles = createParticleSystem(50, 0x8844ff, 0.4);
  scene.add(gameoverParticles.points);

  // 屏幕震动
  const screenShake = createScreenShake(0, 4);

  return {
    obstacleHitParticles,
    vehicleHitParticles,
    pickupParticles,
    gameoverParticles,
    screenShake,

    /**
     * 在指定位置触发障碍物碰撞效果
     * 颜色：橙色（与障碍物锥体同色），形状：水平弧形碎片。
     * @param {number} x - 世界坐标 x
     * @param {number} y - 世界坐标 y
     * @param {number} z - 世界坐标 z
     * @param {number} severity - 严重程度 0-1，影响音量和音高
     */
    triggerObstacleHit(x, y, z, severity = 1) {
      const p = this.obstacleHitParticles;
      p.points.position.set(x, y, z);
      p.points.visible = true;
      p.lifetime = 0;
      p.maxLifetime = 0.7 + severity * 0.3;

      // 水平弧形碎片：水平扩散强，向上抛物较弱 → 落体感强
      const velocities = p.velocities;
      for (let i = 0; i < velocities.length / 3; i++) {
        velocities[i * 3] = (Math.random() - 0.5) * 12 * severity;
        velocities[i * 3 + 1] = Math.random() * 5 + 1.5;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 12 * severity;
      }

      triggerScreenShake(screenShake, 0.35 + severity * 0.3);
      playCollisionSound(severity);
    },

    /**
     * 在指定位置触发对向车辆碰撞效果
     * 颜色：亮红（与尾灯同色），形状：全方位激烈爆裂；伤害更高，震动更强。
     * @param {number} x - 世界坐标 x
     * @param {number} y - 世界坐标 y
     * @param {number} z - 世界坐标 z
     * @param {number} severity - 严重程度 0-1，影响音量和音高
     */
    triggerVehicleHit(x, y, z, severity = 1) {
      const p = this.vehicleHitParticles;
      p.points.position.set(x, y, z);
      p.points.visible = true;
      p.lifetime = 0;
      p.maxLifetime = 0.6 + severity * 0.4;

      // 全方位激烈爆裂：上下左右均强扩散 + 较高初速
      const velocities = p.velocities;
      for (let i = 0; i < velocities.length / 3; i++) {
        velocities[i * 3] = (Math.random() - 0.5) * 18 * severity;
        velocities[i * 3 + 1] = Math.random() * 9 + 3;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 18 * severity;
      }

      // vehicle 伤害比 obstacle 高 → 震动幅度更大
      triggerScreenShake(screenShake, 0.55 + severity * 0.45);
      playCollisionSound(severity);
    },

    /**
     * 在指定位置触发拾取效果
     * 颜色：翠绿（与加血道具十字同色），形状：上扬光雨。
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

      // 上扬光雨：水平扩散小，向上冲力大
      const velocities = p.velocities;
      for (let i = 0; i < velocities.length / 3; i++) {
        velocities[i * 3] = (Math.random() - 0.5) * 5;
        velocities[i * 3 + 1] = Math.random() * 7 + 3;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 5;
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
      updateParticleSystem(this.obstacleHitParticles, dt);
      updateParticleSystem(this.vehicleHitParticles, dt);
      updateParticleSystem(this.pickupParticles, dt);
      updateParticleSystem(this.gameoverParticles, dt);
      updateScreenShake(screenShake, dt);
    },

    /**
     * 清理所有效果
     */
    dispose() {
      scene.remove(this.obstacleHitParticles.points);
      scene.remove(this.vehicleHitParticles.points);
      scene.remove(this.pickupParticles.points);
      scene.remove(this.gameoverParticles.points);

      this.obstacleHitParticles.points.geometry.dispose();
      this.obstacleHitParticles.points.material.dispose();
      this.vehicleHitParticles.points.geometry.dispose();
      this.vehicleHitParticles.points.material.dispose();
      this.pickupParticles.points.geometry.dispose();
      this.pickupParticles.points.material.dispose();
      this.gameoverParticles.points.geometry.dispose();
      this.gameoverParticles.points.material.dispose();
    },
  };
}

/**
 * 处理游戏事件，触发相应效果
 *
 * 调用方负责把事件实体的世界坐标计算好后传入 (x, y, z) —— 推荐
 * 从事件本身携带的 lane/z 派发（参见 RacingGame.svelte 的 animate 中
 * 调 `laneFrameAt(event.lane, event.z + Z_VISUAL_OFFSET)`）。
 *
 * hit 事件按 event.kind ('obstacle' | 'vehicle') 区分触发不同颜色的
 * 粒子系统；pickup / gameover 各自走专属通道。
 *
 * @param {object} effectsManager - 效果管理器
 * @param {object} event - 游戏事件对象
 * @param {number} x - 事件触发点的世界 x
 * @param {number} y - 事件触发点的世界 y
 * @param {number} z - 事件触发点的世界 z
 */
export function handleEvent(effectsManager, event, x, y, z) {
  if (!effectsManager || !event) return;

  switch (event.type) {
    case 'hit': {
      // hit 事件按 event.kind 区分不同粒子系统
      const severity = event.damage / 2;
      if (event.kind === 'vehicle') {
        effectsManager.triggerVehicleHit(x, y, z, severity);
      } else {
        // 障碍物（默认走橙色系统）
        effectsManager.triggerObstacleHit(x, y, z, severity);
      }
      break;
    }

    case 'pickup':
      effectsManager.triggerPickup(x, y, z);
      break;

    case 'gameover':
      effectsManager.triggerGameover(x, y + 0.5, z);
      break;

    default:
      break;
  }
}

// 导出单个粒子系统更新函数（供测试用）
export { updateParticleSystem, createParticleSystem };

// 导出屏幕震动函数（供测试用）
export { updateScreenShake, createScreenShake, triggerScreenShake };