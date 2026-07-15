import * as THREE from 'three';

/**
 * 玩家战机
 * 使用 Three.js 内置几何体组装
 */
export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.speed = 20;
    this.health = 3;
    this.alive = true;
    this.fireCooldown = 0;
    this.fireRate = 0.15; // 秒

    this._buildMesh();
  }

  _buildMesh() {
    // 机身 — 锥体
    const bodyGeo = new THREE.ConeGeometry(0.6, 1.8, 8);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x7aa2f7, emissive: 0x2a4a8a, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0;
    this.group.add(body);

    // 机翼
    const wingGeo = new THREE.BoxGeometry(2.2, 0.08, 0.4);
    const wingMat = new THREE.MeshPhongMaterial({ color: 0x5a8ae7 });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.position.x = 0;
    wings.position.z = 0;
    this.group.add(wings);

    // 尾翼
    const tailGeo = new THREE.BoxGeometry(0.6, 0.6, 0.15);
    const tailMat = new THREE.MeshPhongMaterial({ color: 0x5a8ae7 });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(0, 0, -0.8);
    this.group.add(tail);

    // 驾驶舱
    const cockpitGeo = new THREE.SphereGeometry(0.25, 6, 6);
    const cockpitMat = new THREE.MeshPhongMaterial({ color: 0x4a7ac7, emissive: 0x1a3a6a, emissiveIntensity: 0.2 });
    const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
    cockpit.position.set(0, 0.2, 0.3);
    cockpit.scale.set(1, 0.5, 1);
    this.group.add(cockpit);

    // 引擎光效
    const glowGeo = new THREE.SphereGeometry(0.2, 6, 6);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0, -1.0);
    this.group.add(glow);

    // 引擎辉光
    const glow2Geo = new THREE.SphereGeometry(0.3, 6, 6);
    const glow2Mat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.3 });
    const glow2 = new THREE.Mesh(glow2Geo, glow2Mat);
    glow2.position.set(0, 0, -1.0);
    this.group.add(glow2);
  }

  reset() {
    this.group.position.set(0, 2, 0);
    this.health = 3;
    this.alive = true;
    this.fireCooldown = 0;
  }

  update(dt, input) {
    if (!this.alive) return;

    const dir = input.getDirection();
    const moveSpeed = this.speed * dt;

    this.group.position.x += dir.x * moveSpeed;
    this.group.position.y += dir.y * moveSpeed;
    this.group.position.z += dir.z * moveSpeed;

    // 边界限制
    const bound = 24;
    const yMin = 0.5;
    const yMax = 18;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -bound, bound);
    this.group.position.y = THREE.MathUtils.clamp(this.group.position.y, yMin, yMax);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -24, 24);

    // 战机倾斜动画
    const targetRoll = -dir.x * 0.5;
    const targetPitch = dir.z * 0.3;
    this.group.rotation.z += (targetRoll - this.group.rotation.z) * 5 * dt;
    this.group.rotation.x += (targetPitch - this.group.rotation.x) * 5 * dt;

    // 开火冷却
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  canFire() {
    return this.alive && this.fireCooldown <= 0;
  }

  fire() {
    this.fireCooldown = this.fireRate;
  }

  takeDamage() {
    this.health -= 1;
    if (this.health <= 0) {
      this.alive = false;
    }
  }

  getPosition() {
    return this.group.position;
  }

  getBoundsRadius() {
    return 1.2;
  }
}
