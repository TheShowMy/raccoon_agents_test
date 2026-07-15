import * as THREE from 'three';

/**
 * 玩家战机
 * 使用 Three.js 内置几何体组装成可辨识的战斗机外形
 * 坐标系：+Z = 机头方向（前方），+Y = 上方，+X = 右翼
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
    const bodyColor = 0x7aa2f7;
    const accentColor = 0x5a8ae7;
    const darkAccent = 0x3b5db0;

    /* ========== 机身（多段组合） ========== */
    // 机头 — 尖锥（尖端朝 +Z）
    const noseGeo = new THREE.ConeGeometry(0.35, 0.7, 12);
    const noseMat = new THREE.MeshPhongMaterial({ color: bodyColor, emissive: 0x2a4a8a, emissiveIntensity: 0.2 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, 1.35);
    this.group.add(nose);

    // 前机身 — 圆柱
    const frontBodyGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.8, 10);
    const frontBodyMat = new THREE.MeshPhongMaterial({ color: bodyColor, emissive: 0x2a4a8a, emissiveIntensity: 0.2 });
    const frontBody = new THREE.Mesh(frontBodyGeo, frontBodyMat);
    frontBody.rotation.x = Math.PI / 2;
    frontBody.position.set(0, 0, 0.6);
    this.group.add(frontBody);

    // 主机身 — 中部略粗
    const midBodyGeo = new THREE.CylinderGeometry(0.45, 0.42, 0.7, 10);
    const midBodyMat = new THREE.MeshPhongMaterial({ color: bodyColor, emissive: 0x2a4a8a, emissiveIntensity: 0.2 });
    const midBody = new THREE.Mesh(midBodyGeo, midBodyMat);
    midBody.rotation.x = Math.PI / 2;
    midBody.position.set(0, 0, -0.15);
    this.group.add(midBody);

    // 后机身 — 收窄
    const rearBodyGeo = new THREE.CylinderGeometry(0.35, 0.25, 1.0, 10);
    const rearBodyMat = new THREE.MeshPhongMaterial({ color: darkAccent, emissive: 0x1a2a5a, emissiveIntensity: 0.15 });
    const rearBody = new THREE.Mesh(rearBodyGeo, rearBodyMat);
    rearBody.rotation.x = Math.PI / 2;
    rearBody.position.set(0, 0, -0.85);
    this.group.add(rearBody);

    /* ========== 机翼 — 后掠翼（Box 组合） ========== */
    const wingMat = new THREE.MeshPhongMaterial({ color: accentColor, emissive: 0x1a3a6a, emissiveIntensity: 0.15 });

    // 左主翼 — 使用 Box 拉伸 + 后掠感（通过前缘后掠角补偿）
    const leftWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.5), wingMat);
    // 旋转使前缘后掠：以 Z 轴为法线旋转，让翼尖向后
    const leftWingPylon = new THREE.Group();
    leftWingPylon.rotation.y = 0.2; // 后掠角约 11.5°
    leftWingMain.position.set(-0.75, 0, 0);
    leftWingPylon.add(leftWingMain);
    leftWingPylon.position.set(-0.35, 0, -0.15);
    this.group.add(leftWingPylon);

    // 右主翼
    const rightWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.5), wingMat);
    const rightWingPylon = new THREE.Group();
    rightWingPylon.rotation.y = -0.2; // 对称后掠
    rightWingMain.position.set(0.75, 0, 0);
    rightWingPylon.add(rightWingMain);
    rightWingPylon.position.set(0.35, 0, -0.15);
    this.group.add(rightWingPylon);

    // 翼尖灯 — 左红右绿（航空标准）
    const tipLightMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const tipLightGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const leftTip = new THREE.Mesh(tipLightGeo, tipLightMat);
    leftTip.position.set(-1.5, 0.05, -0.15);
    this.group.add(leftTip);

    const rightTipMat = new THREE.MeshBasicMaterial({ color: 0x22ff22 });
    const rightTip = new THREE.Mesh(tipLightGeo, rightTipMat);
    rightTip.position.set(1.5, 0.05, -0.15);
    this.group.add(rightTip);

    /* ========== 水平尾翼 ========== */
    const tailHorizMat = new THREE.MeshPhongMaterial({ color: darkAccent });
    const tailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.25), tailHorizMat);
    tailLeft.position.set(-0.55, 0.02, -1.2);
    this.group.add(tailLeft);
    const tailRight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.25), tailHorizMat);
    tailRight.position.set(0.55, 0.02, -1.2);
    this.group.add(tailRight);

    // 垂直尾翼（垂尾）— 居中
    const finMat = new THREE.MeshPhongMaterial({ color: accentColor, emissive: 0x1a3a6a, emissiveIntensity: 0.1 });
    const finGeo = new THREE.BoxGeometry(0.04, 0.45, 0.5);
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.set(0, 0.3, -1.15);
    fin.rotation.z = -0.12; // 略后掠
    this.group.add(fin);

    /* ========== 进气口 ========== */
    const intakeMat = new THREE.MeshPhongMaterial({ color: 0x1a2a4a });
    const intakeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.35), intakeMat);
    intakeLeft.position.set(-0.5, -0.08, 0.4);
    this.group.add(intakeLeft);
    const intakeRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.35), intakeMat);
    intakeRight.position.set(0.5, -0.08, 0.4);
    this.group.add(intakeRight);

    // 进气口内腔（深色）
    const intakeInnerMat = new THREE.MeshBasicMaterial({ color: 0x0a0a1a });
    const intakeInnerL = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), intakeInnerMat);
    intakeInnerL.position.set(-0.5, -0.08, 0.58);
    this.group.add(intakeInnerL);
    const intakeInnerR = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), intakeInnerMat);
    intakeInnerR.position.set(0.5, -0.08, 0.58);
    this.group.add(intakeInnerR);

    /* ========== 座舱盖 ========== */
    const cockpitBaseGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.15, 8);
    const cockpitBaseMat = new THREE.MeshPhongMaterial({ color: darkAccent });
    const cockpitBase = new THREE.Mesh(cockpitBaseGeo, cockpitBaseMat);
    cockpitBase.position.set(0, 0.32, 0.5);
    this.group.add(cockpitBase);

    // 座舱罩 — 半球（上半）
    const canopyGeo = new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const canopyMat = new THREE.MeshPhongMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.4,
      emissive: 0x224488,
      emissiveIntensity: 0.1,
      shininess: 100,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.4, 0.5);
    canopy.scale.set(1, 0.45, 1.3);
    this.group.add(canopy);

    // 座舱框架（前后两道弧）
    const frameMat = new THREE.MeshPhongMaterial({ color: 0x444466 });
    const frame1 = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.015, 6, 10), frameMat);
    frame1.rotation.x = Math.PI / 2;
    frame1.position.set(0, 0.25, 0.6);
    this.group.add(frame1);
    const frame2 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 10), frameMat);
    frame2.rotation.x = Math.PI / 2;
    frame2.position.set(0, 0.25, 0.4);
    this.group.add(frame2);

    /* ========== 引擎喷口 ========== */
    // 喷口环
    const nozzleGeo = new THREE.RingGeometry(0.15, 0.25, 12);
    const nozzleMat = new THREE.MeshPhongMaterial({ color: 0x333355, side: THREE.DoubleSide });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0, -1.35);
    this.group.add(nozzle);

    // 喷口内壁（深色）
    const nozzleInnerMat = new THREE.MeshBasicMaterial({ color: 0x111122 });
    const nozzleInner = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), nozzleInnerMat);
    nozzleInner.rotation.x = -Math.PI / 2;
    nozzleInner.position.set(0, 0, -1.35);
    this.group.add(nozzleInner);

    /* ========== 尾焰效果 ========== */
    // 内焰 — 亮白/淡蓝
    const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const flameInner = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), flameInnerMat);
    flameInner.position.set(0, 0, -1.55);
    flameInner.scale.set(1, 1, 2.8);
    this.group.add(flameInner);

    // 中焰 — 亮橙
    const flameMidMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7 });
    const flameMid = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), flameMidMat);
    flameMid.position.set(0, 0, -1.6);
    flameMid.scale.set(1.1, 1.1, 3.0);
    this.group.add(flameMid);

    // 外焰 — 红橙辉光
    const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.25 });
    const flameOuter = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), flameOuterMat);
    flameOuter.position.set(0, 0, -1.65);
    flameOuter.scale.set(1.2, 1.2, 3.2);
    this.group.add(flameOuter);

    /* ========== 装饰元素 ========== */
    // 机头装饰环（黄色）
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 6, 16), stripeMat);
    stripe.rotation.y = Math.PI / 2;
    stripe.position.set(0, 0, 1.0);
    this.group.add(stripe);

    // 机腹中线（暗色条带）
    const bellyMat = new THREE.MeshPhongMaterial({ color: 0x2a2a4a });
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 1.8), bellyMat);
    belly.position.set(0, -0.35, -0.1);
    this.group.add(belly);

    // 机背隆起线
    const dorsalMat = new THREE.MeshPhongMaterial({ color: darkAccent });
    const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), dorsalMat);
    dorsal.position.set(0, 0.38, -0.3);
    this.group.add(dorsal);
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
    const boundX = 24;
    const yMin = 0.5;
    const yMax = 18;
    const boundZ = 24;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -boundX, boundX);
    this.group.position.y = THREE.MathUtils.clamp(this.group.position.y, yMin, yMax);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -boundZ, boundZ);

    // 战机朝向 — 根据水平方向（XZ 平面）计算偏航角，使机头朝向运动方向
    if (dir.x !== 0 || dir.z !== 0) {
      const targetYaw = Math.atan2(dir.x, dir.z);
      let diff = targetYaw - this.group.rotation.y;
      // 将差值归一化到 [-PI, PI]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * 5 * dt;
    }

    // 战机倾斜动画（滚转 & 俯仰）
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
    return 1.4;
  }
}
