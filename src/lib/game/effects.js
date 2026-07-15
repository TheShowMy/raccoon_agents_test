import * as THREE from 'three';

/**
 * 视觉效果管理器
 *
 * 管理：
 * - 敌机被子弹击毁时的爆炸粒子
 * - 玩家被敌机撞击时的受击闪烁与冲击波环
 */
export class EffectsManager {
  constructor(scene) {
    this.scene = scene;

    /** @type {Array<{type:string, mesh:THREE.Points|THREE.Mesh, update:(dt:number)=>void, dispose:()=>void}>} */
    this.effects = [];

    /** 玩家受击闪烁计时（秒），>0 时由 flashPlayer() 消费 */
    this.playerHitFlash = 0;

    // 重用向量
    this._vec3 = new THREE.Vector3();
  }

  // ────────────────────── 爆炸粒子 ──────────────────────

  /**
   * 在指定位置生成爆炸粒子效果
   * @param {THREE.Vector3} position  爆炸中心
   * @param {number}        [color]   主色调，默认橙黄
   * @param {number}        [count]   粒子数量，默认 25
   */
  createExplosion(position, color = 0xff6600, count = 25) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];

    // 辅助色
    const col = new THREE.Color(color);
    const col2 = new THREE.Color(0xffdd44);
    const col3 = new THREE.Color(0xff3300);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      // 随机颜色（在主色~亮黄~暗红之间渐变）
      const t = Math.random();
      const c = t < 0.5 ? col.clone().lerp(col2, t * 2) : col.clone().lerp(col3, (t - 0.5) * 2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      // 球面随机速度方向
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 4 + Math.random() * 8;
      velocities.push({
        x: Math.sin(phi) * Math.cos(theta) * speed,
        y: Math.sin(phi) * Math.sin(theta) * speed,
        z: Math.cos(phi) * speed,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    const life = { value: 0 };
    const maxLife = 0.7;

    const effect = {
      type: 'explosion',
      mesh: points,
      geometry,
      material,
      velocities,
      life,
      maxLife,
      update: (dt) => {
        life.value += dt;
        if (life.value >= maxLife) return;

        const pos = geometry.attributes.position.array;
        const t = life.value / maxLife;

        for (let j = 0; j < count; j++) {
          pos[j * 3] += velocities[j].x * dt;
          pos[j * 3 + 1] += velocities[j].y * dt;
          pos[j * 3 + 2] += velocities[j].z * dt;
          // 重力微弱拖尾
          velocities[j].y -= 3 * dt;
        }
        geometry.attributes.position.needsUpdate = true;

        // 粒子变大同时淡出
        material.size = 0.35 + t * 0.6;
        material.opacity = 1 - t;
      },
      dispose: () => {
        this.scene.remove(points);
        geometry.dispose();
        material.dispose();
      },
    };

    this.effects.push(effect);
  }

  // ────────────────────── 受击冲击波环 ──────────────────────

  /**
   * 在玩家位置生成一个快速扩散的冲击波环（Ring + 膨胀粒子）
   * @param {THREE.Vector3} playerPosition
   */
  createHitShockwave(playerPosition) {
    // 冲击波环 — 使用 RingGeometry
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(playerPosition);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    const life = { value: 0 };
    const maxLife = 0.5;

    const effect = {
      type: 'shockwave',
      mesh: ring,
      geometry: ringGeo,
      material: ringMat,
      life,
      maxLife,
      baseScale: 0.5,
      update: (dt) => {
        life.value += dt;
        if (life.value >= maxLife) return;

        const t = life.value / maxLife;
        // 环快速膨胀
        const scale = 0.5 + t * 18;
        ring.scale.set(scale, scale, scale);
        // 快速淡出
        ringMat.opacity = 0.8 * (1 - t);
      },
      dispose: () => {
        this.scene.remove(ring);
        ringGeo.dispose();
        ringMat.dispose();
      },
    };

    this.effects.push(effect);

    // 伴随少量溅射粒子（红色/橙色）
    this.createExplosion(playerPosition, 0xff2200, 10);
  }

  // ────────────────────── 每帧更新 ──────────────────────

  /**
   * 更新所有活跃效果，清理已结束的效果
   * @param {number} dt
   */
  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.update(dt);

      if (e.life.value >= e.maxLife) {
        e.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  /**
   * 触发玩家受击闪烁效果（由外部在碰撞回调中调用）
   */
  triggerPlayerHit() {
    this.playerHitFlash = 0.25;
  }

  /**
   * 对玩家战机组应用受击闪烁（每帧由 gameLoop 调用）
   * @param {THREE.Group} playerGroup
   */
  flashPlayer(playerGroup) {
    if (this.playerHitFlash <= 0) {
      // 恢复默认外观
      this._setPlayerEmissive(playerGroup, 0x000000, 0);
      return;
    }

    this.playerHitFlash -= 1 / 60; // 近似帧间隔
    const intensity = Math.sin(this.playerHitFlash * 40) * 0.3 + 0.3;
    this._setPlayerEmissive(playerGroup, 0xff2222, intensity);
  }

  /**
   * 递归设置玩家组中所有网格的自发光
   */
  _setPlayerEmissive(group, color, intensity) {
    group.children.forEach((child) => {
      if (child.isMesh && child.material && child.material.emissive !== undefined) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.emissive.setHex(color);
            m.emissiveIntensity = intensity;
          });
        } else {
          child.material.emissive.setHex(color);
          child.material.emissiveIntensity = intensity;
        }
      }
      if (child.children && child.children.length > 0) {
        this._setPlayerEmissive(child, color, intensity);
      }
    });
  }

  // ────────────────────── 清理 ──────────────────────

  clear() {
    for (const e of this.effects) {
      e.dispose();
    }
    this.effects = [];
    this.playerHitFlash = 0;
  }
}
