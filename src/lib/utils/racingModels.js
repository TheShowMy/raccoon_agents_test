/**
 * 3D 越野车竞速模型工厂
 *
 * 提供玩家越野车、障碍物、对向车辆、加血道具的 three.js 工厂函数。
 * 全部使用基础几何体（Box / Cylinder / Sphere 等）组合而成。
 * 本模块只负责构建可视的 3D 模型，不包含任何移动、碰撞或游戏逻辑。
 *
 * 方向约定（所有模型统一）：
 * - 模型正前方（车头 / 运动方向）位于 -Z 方向
 * - 顶部为 +Y，底部贴地（车轮底部 / 道具底面位于 y = 0）
 * - 右侧为 +X，左侧为 -X
 *
 * 调用方可通过修改返回 Group 的 .position / .rotation / .userData
 * 在游戏循环中驱动模型。
 */

import * as THREE from 'three';

/* ============================================================
 * 尺寸常量（世界单位）
 *
 * 这些常量与下方工厂函数实际构建的模型视觉包围盒保持一致。
 * 游戏逻辑（车道宽度、碰撞检测、生成间距）应基于这些常量。
 *
 * 视觉包围盒为轴对齐盒（AABB），以模型局部原点为中心：
 *   - 半宽 = width / 2
 *   - 半高 = height / 2（模型底面位于 y = 0，顶面位于 y = height）
 *   - 半深 = depth / 2
 * ============================================================ */

/** 玩家越野车整体包围盒 */
export const CAR_WIDTH = 1.1;
export const CAR_HEIGHT = 1.0;
export const CAR_LENGTH = 1.8;

/** 障碍物（可跳跃越过）整体包围盒 */
export const OBSTACLE_WIDTH = 0.75;
export const OBSTACLE_HEIGHT = 0.7;
export const OBSTACLE_LENGTH = 0.75;

/** 对向车辆（必须变道躲避）整体包围盒 */
export const VEHICLE_WIDTH = 1.05;
export const VEHICLE_HEIGHT = 0.85;
export const VEHICLE_LENGTH = 1.9;

/** 加血道具整体包围盒 */
export const PICKUP_WIDTH = 0.45;
export const PICKUP_HEIGHT = 0.45;
export const PICKUP_LENGTH = 0.45;

/* ============================================================
 * 边界信息（用于碰撞检测）
 * 形状为 { width, height, depth }，表示以模型局部原点为中心的
 * 轴对齐包围盒尺寸。游戏循环中可结合 .position 推算实际占用空间。
 * ============================================================ */

export const PLAYER_CAR_BOUNDS = {
  width: CAR_WIDTH,
  height: CAR_HEIGHT,
  depth: CAR_LENGTH,
};

export const OBSTACLE_BOUNDS = {
  width: OBSTACLE_WIDTH,
  height: OBSTACLE_HEIGHT,
  depth: OBSTACLE_LENGTH,
};

export const VEHICLE_BOUNDS = {
  width: VEHICLE_WIDTH,
  height: VEHICLE_HEIGHT,
  depth: VEHICLE_LENGTH,
};

export const PICKUP_BOUNDS = {
  width: PICKUP_WIDTH,
  height: PICKUP_HEIGHT,
  depth: PICKUP_LENGTH,
};

/* ============================================================
 * 内部工具
 * ============================================================ */

/**
 * 创建一个统一的 PBR 风格材质实例。
 *
 * @param {number | string} color - 颜色（十六进制或字符串）。
 * @param {object} [opts] - 附加材质参数。
 * @param {number} [opts.roughness=0.55] - 粗糙度。
 * @param {number} [opts.metalness=0.25] - 金属度。
 * @param {number} [opts.emissive=0] - 自发光颜色。
 * @param {number} [opts.emissiveIntensity=0] - 自发光强度。
 * @returns {THREE.MeshStandardMaterial}
 */
function makeMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.25,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

/**
 * 创建一个车轮（圆柱），轴向沿 X 轴。
 *
 * @param {object} [opts] - 配置项。
 * @param {number} [opts.radius=0.26] - 车轮半径。
 * @param {number} [opts.width=0.22] - 车轮厚度（沿 X 轴）。
 * @param {number | string} [opts.tireColor=0x111111] - 轮胎颜色。
 * @param {number | string} [opts.rimColor=0xcccccc] - 轮毂颜色。
 * @returns {THREE.Group} 包含轮胎与轮毂的 Group，中心位于车轮中心。
 */
function makeWheel(opts = {}) {
  const radius = opts.radius ?? 0.26;
  const width = opts.width ?? 0.22;
  const tireColor = opts.tireColor ?? 0x111111;
  const rimColor = opts.rimColor ?? 0xcccccc;

  const group = new THREE.Group();
  group.name = 'Wheel';

  // 轮胎：圆柱沿 Y 轴，旋转后沿 X 轴
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 18);
  const tireMat = makeMaterial(tireColor, { roughness: 0.85, metalness: 0.05 });
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  tire.receiveShadow = true;
  group.add(tire);

  // 轮毂：略小的圆柱
  const rimGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.01, 12);
  const rimMat = makeMaterial(rimColor, { roughness: 0.4, metalness: 0.6 });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.z = Math.PI / 2;
  rim.castShadow = true;
  group.add(rim);

  return group;
}

/* ============================================================
 * 工厂函数
 * ============================================================ */

/**
 * 创建玩家越野车。
 *
 * 组合结构（off-road SUV 风格）：
 * - 高底盘车身 + 底盘护板
 * - 驾驶舱（前后挡风玻璃 + 侧窗）
 * - 前 / 后保险杠
 * - 4 个大轮子（off-road 风格）
 * - 2 个前大灯 + 2 个后尾灯
 * - 简化的防滚架（4 立柱 + 顶部横梁）
 *
 * 模型局部原点位于车底地面中心。
 * "车头"朝向 -Z 方向。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.bodyColor=0xd9543d] - 车身主色。
 * @param {number | string} [options.cageColor=0x2a2a2a] - 防滚架颜色。
 * @returns {THREE.Group} 玩家越野车根节点，.userData.bounds = PLAYER_CAR_BOUNDS。
 */
export function createPlayerCar(options = {}) {
  const bodyColor = options.bodyColor ?? 0xd9543d;
  const cageColor = options.cageColor ?? 0x2a2a2a;

  const group = new THREE.Group();
  group.name = 'PlayerCar';
  group.userData.bounds = PLAYER_CAR_BOUNDS;
  group.userData.kind = 'player';

  const bodyMat = makeMaterial(bodyColor, { roughness: 0.45, metalness: 0.35 });
  const darkMat = makeMaterial(0x1d1d1f, { roughness: 0.7, metalness: 0.2 });
  const cageMat = makeMaterial(cageColor, { roughness: 0.6, metalness: 0.5 });
  const glassMat = makeMaterial(0x8ab4f8, { roughness: 0.2, metalness: 0.4 });
  const headlightMat = makeMaterial(0xfff4c2, {
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xfff4c2,
    emissiveIntensity: 0.4,
  });
  const taillightMat = makeMaterial(0xff3030, {
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xff3030,
    emissiveIntensity: 0.5,
  });

  // —— 底盘（高离地间隙） ——
  const chassisGeo = new THREE.BoxGeometry(0.85, 0.26, 1.55);
  const chassis = new THREE.Mesh(chassisGeo, bodyMat);
  chassis.position.y = 0.5;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // 底盘下方的护板
  const skidGeo = new THREE.BoxGeometry(0.7, 0.06, 1.4);
  const skid = new THREE.Mesh(skidGeo, darkMat);
  skid.position.y = 0.36;
  skid.castShadow = true;
  group.add(skid);

  // —— 驾驶舱 ——
  const cabinGeo = new THREE.BoxGeometry(0.72, 0.3, 0.85);
  const cabin = new THREE.Mesh(cabinGeo, bodyMat);
  cabin.position.set(0, 0.78, 0.05);
  cabin.castShadow = true;
  group.add(cabin);

  // 挡风玻璃（前）
  const windshieldGeo = new THREE.BoxGeometry(0.66, 0.24, 0.04);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 0.8, -0.36);
  windshield.rotation.x = -0.35;
  group.add(windshield);

  // 后车窗
  const rearWindowGeo = new THREE.BoxGeometry(0.66, 0.2, 0.04);
  const rearWindow = new THREE.Mesh(rearWindowGeo, glassMat);
  rearWindow.position.set(0, 0.82, 0.46);
  rearWindow.rotation.x = 0.4;
  group.add(rearWindow);

  // 侧窗（左右）
  const sideWindowGeo = new THREE.BoxGeometry(0.04, 0.16, 0.7);
  const sideWindowL = new THREE.Mesh(sideWindowGeo, glassMat);
  sideWindowL.position.set(-0.37, 0.82, 0.05);
  group.add(sideWindowL);
  const sideWindowR = new THREE.Mesh(sideWindowGeo, glassMat);
  sideWindowR.position.set(0.37, 0.82, 0.05);
  group.add(sideWindowR);

  // —— 防滚架：4 根短立柱 + 顶部 2 根横梁 ——
  const postGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8);
  const postPositions = [
    [-0.34, 0.93, -0.32],
    [0.34, 0.93, -0.32],
    [-0.34, 0.93, 0.32],
    [0.34, 0.93, 0.32],
  ];
  for (const [x, y, z] of postPositions) {
    const post = new THREE.Mesh(postGeo, cageMat);
    post.position.set(x, y, z);
    post.castShadow = true;
    group.add(post);
  }

  // 顶部横梁（沿 X 轴）
  const cageTopXGeo = new THREE.BoxGeometry(0.72, 0.025, 0.025);
  const cageTopX = new THREE.Mesh(cageTopXGeo, cageMat);
  cageTopX.position.set(0, 0.99, 0);
  cageTopX.castShadow = true;
  group.add(cageTopX);

  // 顶部横梁（沿 Z 轴，前后各一）
  const cageTopZGeo = new THREE.BoxGeometry(0.025, 0.025, 0.65);
  const cageTopZ = new THREE.Mesh(cageTopZGeo, cageMat);
  cageTopZ.position.set(0, 0.99, 0);
  cageTopZ.castShadow = true;
  group.add(cageTopZ);

  // —— 前 / 后保险杠 ——
  const frontBumperGeo = new THREE.BoxGeometry(0.88, 0.14, 0.08);
  const frontBumper = new THREE.Mesh(frontBumperGeo, darkMat);
  frontBumper.position.set(0, 0.42, -0.79);
  frontBumper.castShadow = true;
  group.add(frontBumper);

  const rearBumperGeo = new THREE.BoxGeometry(0.88, 0.14, 0.08);
  const rearBumper = new THREE.Mesh(rearBumperGeo, darkMat);
  rearBumper.position.set(0, 0.42, 0.79);
  rearBumper.castShadow = true;
  group.add(rearBumper);

  // —— 大灯与尾灯 ——
  const headlightGeo = new THREE.SphereGeometry(0.06, 12, 8);
  const headlightL = new THREE.Mesh(headlightGeo, headlightMat);
  headlightL.position.set(-0.3, 0.58, -0.78);
  group.add(headlightL);
  const headlightR = new THREE.Mesh(headlightGeo, headlightMat);
  headlightR.position.set(0.3, 0.58, -0.78);
  group.add(headlightR);

  const taillightGeo = new THREE.BoxGeometry(0.14, 0.07, 0.04);
  const taillightL = new THREE.Mesh(taillightGeo, taillightMat);
  taillightL.position.set(-0.3, 0.58, 0.79);
  group.add(taillightL);
  const taillightR = new THREE.Mesh(taillightGeo, taillightMat);
  taillightR.position.set(0.3, 0.58, 0.79);
  group.add(taillightR);

  // —— 4 个轮子 ——
  const wheelOffsetX = 0.43;
  const wheelOffsetZ = 0.55;
  const wheelRadius = 0.26;
  const wheelWidth = 0.22;
  const wheelPositions = [
    [-wheelOffsetX, wheelRadius, -wheelOffsetZ], // 前左
    [wheelOffsetX, wheelRadius, -wheelOffsetZ],  // 前右
    [-wheelOffsetX, wheelRadius, wheelOffsetZ],  // 后左
    [wheelOffsetX, wheelRadius, wheelOffsetZ],   // 后右
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = makeWheel({ radius: wheelRadius, width: wheelWidth });
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  return group;
}

/**
 * 创建道路障碍物。
 *
 * 组合结构（路障风格）：橙色锥体主体 + 灰色方形底座 + 锥顶警示灯。
 * 障碍物高度小于跳跃上限（CAR_HEIGHT 以下），玩家可通过跳跃越过；
 * 同时宽度较窄，玩家亦可选择变道躲避。
 *
 * 模型局部原点位于地面中心，"前方"朝向 -Z。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.coneColor=0xff7a1a] - 锥体主色。
 * @param {number | string} [options.baseColor=0x3a3a44] - 底座颜色。
 * @returns {THREE.Group} 障碍物根节点，.userData.bounds = OBSTACLE_BOUNDS。
 */
export function createObstacle(options = {}) {
  const coneColor = options.coneColor ?? 0xff7a1a;
  const baseColor = options.baseColor ?? 0x3a3a44;

  const group = new THREE.Group();
  group.name = 'Obstacle';
  group.userData.bounds = OBSTACLE_BOUNDS;
  group.userData.kind = 'obstacle';

  const coneMat = makeMaterial(coneColor, { roughness: 0.5, metalness: 0.1 });
  const stripeMat = makeMaterial(0xffffff, { roughness: 0.6, metalness: 0.05 });
  const baseMat = makeMaterial(baseColor, { roughness: 0.7, metalness: 0.2 });
  const tipMat = makeMaterial(0xff3030, {
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xff3030,
    emissiveIntensity: 0.6,
  });

  // 方形底座
  const baseGeo = new THREE.BoxGeometry(0.7, 0.08, 0.7);
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.04;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 锥体主体（下宽上窄的圆柱）
  const coneGeo = new THREE.CylinderGeometry(0.05, 0.3, 0.5, 16);
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 0.33;
  cone.castShadow = true;
  group.add(cone);

  // 白色反光条（中部环带）
  const stripeGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.07, 16);
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.y = 0.27;
  group.add(stripe);

  // 顶部警示灯
  const tipGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.y = 0.62;
  group.add(tip);

  return group;
}

/**
 * 创建对向车辆。
 *
 * 组合结构（普通轿车风格）：扁宽的车身 + 平滑的驾驶舱 + 4 个较小的轮子
 * + 2 个前大灯（朝向 -Z，即朝向来车方向）+ 2 个后尾灯 + 前后保险杠。
 * 整体高度超过跳跃上限，玩家只能通过切换车道躲避。
 *
 * 模型局部原点位于车底地面中心，"前方"朝向 -Z。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.bodyColor=0x4a78c8] - 车身主色。
 * @returns {THREE.Group} 对向车辆根节点，.userData.bounds = VEHICLE_BOUNDS。
 */
export function createOncomingVehicle(options = {}) {
  const bodyColor = options.bodyColor ?? 0x4a78c8;

  const group = new THREE.Group();
  group.name = 'OncomingVehicle';
  group.userData.bounds = VEHICLE_BOUNDS;
  group.userData.kind = 'vehicle';

  const bodyMat = makeMaterial(bodyColor, { roughness: 0.4, metalness: 0.45 });
  const darkMat = makeMaterial(0x1d1d1f, { roughness: 0.7, metalness: 0.2 });
  const glassMat = makeMaterial(0x6a8db5, { roughness: 0.2, metalness: 0.5 });
  const headlightMat = makeMaterial(0xfff4c2, {
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xfff4c2,
    emissiveIntensity: 0.5,
  });
  const taillightMat = makeMaterial(0xff3030, {
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xff3030,
    emissiveIntensity: 0.45,
  });

  // 下车身（扁宽）
  const lowerGeo = new THREE.BoxGeometry(0.88, 0.3, 1.7);
  const lower = new THREE.Mesh(lowerGeo, bodyMat);
  lower.position.y = 0.38;
  lower.castShadow = true;
  lower.receiveShadow = true;
  group.add(lower);

  // 上车身（驾驶舱）—— 前后更窄，呈流线型
  const upperGeo = new THREE.BoxGeometry(0.8, 0.26, 1.0);
  const upper = new THREE.Mesh(upperGeo, bodyMat);
  upper.position.set(0, 0.66, 0.0);
  upper.castShadow = true;
  group.add(upper);

  // 挡风玻璃（前）
  const windshieldGeo = new THREE.BoxGeometry(0.74, 0.22, 0.04);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 0.66, -0.5);
  windshield.rotation.x = -0.5;
  group.add(windshield);

  // 后车窗
  const rearWindowGeo = new THREE.BoxGeometry(0.74, 0.2, 0.04);
  const rearWindow = new THREE.Mesh(rearWindowGeo, glassMat);
  rearWindow.position.set(0, 0.66, 0.5);
  rearWindow.rotation.x = 0.5;
  group.add(rearWindow);

  // 侧窗
  const sideWindowGeo = new THREE.BoxGeometry(0.04, 0.16, 0.85);
  const sideWindowL = new THREE.Mesh(sideWindowGeo, glassMat);
  sideWindowL.position.set(-0.41, 0.7, 0);
  group.add(sideWindowL);
  const sideWindowR = new THREE.Mesh(sideWindowGeo, glassMat);
  sideWindowR.position.set(0.41, 0.7, 0);
  group.add(sideWindowR);

  // 前大灯
  const headlightGeo = new THREE.BoxGeometry(0.14, 0.07, 0.04);
  const headlightL = new THREE.Mesh(headlightGeo, headlightMat);
  headlightL.position.set(-0.3, 0.46, -0.85);
  group.add(headlightL);
  const headlightR = new THREE.Mesh(headlightGeo, headlightMat);
  headlightR.position.set(0.3, 0.46, -0.85);
  group.add(headlightR);

  // 后尾灯
  const taillightGeo = new THREE.BoxGeometry(0.14, 0.07, 0.04);
  const taillightL = new THREE.Mesh(taillightGeo, taillightMat);
  taillightL.position.set(-0.3, 0.46, 0.85);
  group.add(taillightL);
  const taillightR = new THREE.Mesh(taillightGeo, taillightMat);
  taillightR.position.set(0.3, 0.46, 0.85);
  group.add(taillightR);

  // 前 / 后保险杠
  const frontBumperGeo = new THREE.BoxGeometry(0.92, 0.1, 0.06);
  const frontBumper = new THREE.Mesh(frontBumperGeo, darkMat);
  frontBumper.position.set(0, 0.3, -0.86);
  group.add(frontBumper);

  const rearBumperGeo = new THREE.BoxGeometry(0.92, 0.1, 0.06);
  const rearBumper = new THREE.Mesh(rearBumperGeo, darkMat);
  rearBumper.position.set(0, 0.3, 0.86);
  group.add(rearBumper);

  // 4 个较小的轮子
  const wheelOffsetX = 0.42;
  const wheelOffsetZ = 0.62;
  const wheelRadius = 0.22;
  const wheelWidth = 0.18;
  const wheelPositions = [
    [-wheelOffsetX, wheelRadius, -wheelOffsetZ],
    [wheelOffsetX, wheelRadius, -wheelOffsetZ],
    [-wheelOffsetX, wheelRadius, wheelOffsetZ],
    [wheelOffsetX, wheelRadius, wheelOffsetZ],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = makeWheel({ radius: wheelRadius, width: wheelWidth, rimColor: 0xb8b8b8 });
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  return group;
}

/**
 * 创建加血道具（医疗包）。
 *
 * 组合结构：白色立方体主体 + 前后两面红色十字（两条相互垂直的薄板）
 * + 顶面红色十字。整体带轻微的红色自发光，便于在场景中被发现。
 *
 * 模型局部原点位于地面（即立方体底面）中心。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.boxColor=0xf5f5f0] - 主体颜色。
 * @param {number | string} [options.crossColor=0xff3b3b] - 十字颜色。
 * @returns {THREE.Group} 加血道具根节点，.userData.bounds = PICKUP_BOUNDS。
 */
export function createHealthPickup(options = {}) {
  const boxColor = options.boxColor ?? 0xf5f5f0;
  const crossColor = options.crossColor ?? 0xff3b3b;

  const group = new THREE.Group();
  group.name = 'HealthPickup';
  group.userData.bounds = PICKUP_BOUNDS;
  group.userData.kind = 'pickup';

  const boxMat = makeMaterial(boxColor, {
    roughness: 0.5,
    metalness: 0.1,
    emissive: crossColor,
    emissiveIntensity: 0.05,
  });
  const crossMat = makeMaterial(crossColor, {
    roughness: 0.4,
    metalness: 0.1,
    emissive: crossColor,
    emissiveIntensity: 0.55,
  });

  // 主体立方体（底面在 y = 0，顶面在 y = 0.4）
  const boxGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.y = 0.2;
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);

  // 前（-Z）面十字
  const crossHGGeo = new THREE.BoxGeometry(0.24, 0.05, 0.04);
  const crossFrontH = new THREE.Mesh(crossHGGeo, crossMat);
  crossFrontH.position.set(0, 0.2, -0.205);
  group.add(crossFrontH);

  const crossVGGeo = new THREE.BoxGeometry(0.05, 0.24, 0.04);
  const crossFrontV = new THREE.Mesh(crossVGGeo, crossMat);
  crossFrontV.position.set(0, 0.2, -0.205);
  group.add(crossFrontV);

  // 后（+Z）面十字
  const crossRearH = new THREE.Mesh(crossHGGeo, crossMat);
  crossRearH.position.set(0, 0.2, 0.205);
  group.add(crossRearH);

  const crossRearV = new THREE.Mesh(crossVGGeo, crossMat);
  crossRearV.position.set(0, 0.2, 0.205);
  group.add(crossRearV);

  // 顶面十字
  const crossTopXGeo = new THREE.BoxGeometry(0.24, 0.04, 0.05);
  const crossTopX = new THREE.Mesh(crossTopXGeo, crossMat);
  crossTopX.position.set(0, 0.405, 0);
  group.add(crossTopX);

  const crossTopZGeo = new THREE.BoxGeometry(0.05, 0.04, 0.24);
  const crossTopZ = new THREE.Mesh(crossTopZGeo, crossMat);
  crossTopZ.position.set(0, 0.405, 0);
  group.add(crossTopZ);

  return group;
}
