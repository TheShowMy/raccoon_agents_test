import * as THREE from 'three';

/**
 * 敌机系统
 *
 * 规则：
 * - 在场景前方（+Z 方向）以固定间隔生成敌机
 * - 敌机沿 X（水平）和 Y（垂直）随机散布
 * - 生成后朝玩家区域（Z 负方向）持续移动
 * - 超出游戏区域边界时被移除
 */
export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5; // 秒
    this.speed = 10;

    // 生成区域配置
    this.spawnZMin = 25;  // 最近生成距离（场景前方）
    this.spawnZMax = 40;  // 最远生成距离
    this.spawnXRange = 24; // X 方向散布半幅
    this.spawnYMin = 1;
    this.spawnYMax = 14;

    // 移除边界
    this.removeZ = -30;
    this.removeX = 30;
    this.removeY = 20;

    // 重用向量
    this._dirVec = new THREE.Vector3();
  }

  /**
   * 在场景前方随机位置生成一架敌机
   */
  _createEnemy() {
    const group = new THREE.Group();

    // 机身 — 深色锥体，尖端朝 +Z（与玩家同向）
    const bodyGeo = new THREE.ConeGeometry(0.5, 1.2, 6);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xe74c3c, emissive: 0x442222, emissiveIntensity: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    // 机翼
    const wingGeo = new THREE.BoxGeometry(1.6, 0.06, 0.3);
    const wingMat = new THREE.MeshPhongMaterial({ color: 0xc0392b });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    group.add(wings);

    // 引擎光
    const glowGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0, 0.8);
    group.add(glow);

    this.scene.add(group);

    // 在场景前方随机生成：Z ∈ [spawnZMin, spawnZMax]
    const spawnZ = this.spawnZMin + Math.random() * (this.spawnZMax - this.spawnZMin);
    group.position.set(
      (Math.random() - 0.5) * this.spawnXRange * 2,
      this.spawnYMin + Math.random() * (this.spawnYMax - this.spawnYMin),
      spawnZ
    );

    // 移动方向：朝向玩家区域（Z 负方向），带随机横向偏移
    const targetX = (Math.random() - 0.5) * 12;
    const targetY = 2 + Math.random() * 8;
    const targetZ = -20;
    this._dirVec.set(targetX, targetY, targetZ).sub(group.position).normalize();

    return {
      group,
      velocity: this._dirVec.clone().multiplyScalar(this.speed),
      health: 1,
    };
  }

  /**
   * 每帧更新：生成新敌机 + 移动已有敌机 + 移除越界
   */
  update(dt, _playerPosition) {
    // --- 按固定间隔生成新敌机 ---
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.enemies.push(this._createEnemy());
    }

    // --- 更新所有敌机位置 ---
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.group.position.addScaledVector(e.velocity, dt);

      // 敌机朝向运动方向
      e.group.lookAt(e.group.position.clone().add(e.velocity));
      e.group.rotateX(Math.PI / 2);

      // --- 移除超出游戏区域边界的敌机 ---
      const pos = e.group.position;
      if (pos.z < this.removeZ || Math.abs(pos.x) > this.removeX || pos.y > this.removeY || pos.y < -2) {
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
      }
    }
  }

  getEnemies() {
    return this.enemies;
  }

  removeEnemy(index) {
    const e = this.enemies[index];
    if (e) {
      this.scene.remove(e.group);
      this.enemies.splice(index, 1);
    }
  }

  clear() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
    }
    this.enemies = [];
  }
}
