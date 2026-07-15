import * as THREE from 'three';

/**
 * 子弹系统
 * 管理玩家子弹的生成、更新与移除
 */
export class BulletManager {
  constructor(scene) {
    this.scene = scene;
    this.bullets = [];
    this.speed = 50;
    this.lifetime = 2.5; // 秒
  }

  fire(origin) {
    const geo = new THREE.SphereGeometry(0.12, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.position.z += 1.5; // 从机头射出
    this.scene.add(mesh);

    // 光晕
    const glowGeo = new THREE.SphereGeometry(0.2, 6, 6);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.4 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(mesh.position);
    this.scene.add(glow);

    this.bullets.push({
      mesh,
      glow,
      velocity: new THREE.Vector3(0, 0, this.speed),
      age: 0,
    });
  }

  update(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;

      // 移动
      b.mesh.position.add(b.velocity.clone().multiplyScalar(dt));
      if (b.glow) {
        b.glow.position.copy(b.mesh.position);
      }

      // 移除过期或超出范围的子弹
      if (b.age > this.lifetime || b.mesh.position.z > 50 || b.mesh.position.z < -50) {
        this.scene.remove(b.mesh);
        if (b.glow) this.scene.remove(b.glow);
        this.bullets.splice(i, 1);
      }
    }
  }

  getBullets() {
    return this.bullets;
  }

  removeBullet(index) {
    const b = this.bullets[index];
    if (b) {
      this.scene.remove(b.mesh);
      if (b.glow) this.scene.remove(b.glow);
      this.bullets.splice(index, 1);
    }
  }

  clear() {
    for (const b of this.bullets) {
      this.scene.remove(b.mesh);
      if (b.glow) this.scene.remove(b.glow);
    }
    this.bullets = [];
  }
}
