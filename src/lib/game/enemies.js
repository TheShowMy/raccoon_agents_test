import * as THREE from 'three';

/**
 * 敌机系统
 * 管理敌机的生成、行为与移除
 */
export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5; // 秒
    this.speed = 8;
  }

  _createEnemy() {
    const group = new THREE.Group();

    // 机身 — 深色锥体
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

    // 随机出生位置（在远处 Z 方向两端）
    const side = (Math.random() > 0.5) ? 1 : -1;
    group.position.set(
      (Math.random() - 0.5) * 30,
      1 + Math.random() * 12,
      -25 * side
    );

    // 目标：朝玩家大概方向移动
    const targetX = (Math.random() - 0.5) * 10;
    const targetY = 2 + Math.random() * 8;
    const targetZ = 25;
    const dir = new THREE.Vector3(targetX, targetY, targetZ).sub(group.position).normalize();

    return {
      group,
      velocity: dir.multiplyScalar(this.speed),
      health: 1,
    };
  }

  update(dt, playerPosition) {
    // 生成新敌机
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.enemies.push(this._createEnemy());
    }

    // 更新敌机位置
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.group.position.add(e.velocity.clone().multiplyScalar(dt));

      // 让敌机朝向运动方向
      e.group.lookAt(e.group.position.clone().add(e.velocity));
      e.group.rotateX(Math.PI / 2);

      // 移除超出范围的敌机
      const pos = e.group.position;
      if (Math.abs(pos.x) > 30 || Math.abs(pos.y) > 20 || Math.abs(pos.z) > 30) {
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
