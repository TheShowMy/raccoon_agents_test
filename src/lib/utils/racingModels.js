/**
 * 极简高可读性 3D 赛车模型工厂
 *
 * 提供玩家越野车、障碍物、对向车辆、加血道具的 Three.js 工厂函数。
 * 全部使用基础几何体（BoxGeometry / CylinderGeometry / SphereGeometry）组合而成，
 * 采用柔和配色、简洁几何，避免高饱和与过度光效。
 *
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
 * 创建一个柔和哑光材质。
 *
 * @param {number | string} color - 颜色（十六进制或字符串）。
 * @param {object} [opts] - 附加材质参数。
 * @param {number} [opts.roughness=0.7] - 粗糙度。
 * @param {number} [opts.metalness=0.0] - 金属度。
 * @returns {THREE.MeshStandardMaterial}
 */
function softMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.0,
  });
}

/* ============================================================
 * 工厂函数
 * ============================================================ */

/**
 * 创建玩家越野车。
 *
 * 极简风格：扁宽车身 + 略缩驾驶舱 + 4 个圆柱车轮 + 小圆大灯。
 * 柔和色调、清晰轮廓，无过多装饰。
 *
 * 模型局部原点位于车底地面中心，"车头"朝向 -Z。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.bodyColor=0xc9734e] - 车身主色（暖土色）。
 * @param {number | string} [options.wheelColor=0x2a2a2a] - 车轮颜色。
 * @returns {THREE.Group} 玩家越野车根节点，.userData.bounds = PLAYER_CAR_BOUNDS。
 */
export function createPlayerCar(options = {}) {
  const bodyColor = options.bodyColor ?? 0xc9734e;
  const wheelColor = options.wheelColor ?? 0x2a2a2a;

  const group = new THREE.Group();
  group.name = 'PlayerCar';
  group.userData.bounds = PLAYER_CAR_BOUNDS;
  group.userData.kind = 'player';

  const bodyMat = softMat(bodyColor);
  const cabinMat = softMat(0xe8946a, { roughness: 0.6 });
  const wheelMat = softMat(wheelColor, { roughness: 0.9 });
  const windowMat = softMat(0xaac8e8, { roughness: 0.3 });
  const accentMat = softMat(0xf5e6a0);

  // —— 车身（扁宽 Box） —— 精确填充宽度 1.1 深度 1.8
  const bodyGeo = new THREE.BoxGeometry(0.9, 0.32, 1.8);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.44;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // —— 驾驶舱 —— 顶部达 y=1.0 以满足 CAR_HEIGHT
  const cabinGeo = new THREE.BoxGeometry(0.72, 0.36, 0.85);
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.y = 0.82;
  cabin.castShadow = true;
  group.add(cabin);

  // —— 前挡风（薄片） ——
  const windshieldGeo = new THREE.BoxGeometry(0.66, 0.22, 0.04);
  const windshield = new THREE.Mesh(windshieldGeo, windowMat);
  windshield.position.set(0, 0.82, -0.42);
  windshield.castShadow = true;
  group.add(windshield);

  // —— 后窗 ——
  const rearWindowGeo = new THREE.BoxGeometry(0.66, 0.18, 0.04);
  const rearWindow = new THREE.Mesh(rearWindowGeo, windowMat);
  rearWindow.position.set(0, 0.82, 0.42);
  rearWindow.castShadow = true;
  group.add(rearWindow);

  // —— 前大灯（两颗小圆球） ——
  const headlightGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const headlightL = new THREE.Mesh(headlightGeo, accentMat);
  headlightL.position.set(-0.28, 0.52, -0.84);
  headlightL.castShadow = true;
  group.add(headlightL);
  const headlightR = new THREE.Mesh(headlightGeo, accentMat);
  headlightR.position.set(0.28, 0.52, -0.84);
  headlightR.castShadow = true;
  group.add(headlightR);

  // —— 4 个车轮（圆柱） —— 确保车轮最外沿达到 ±0.55 使 width=1.1
  const wheelRadius = 0.24;
  const wheelWidth = 0.18;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 12);

  const wheelOffsetX = 0.46;
  const wheelOffsetZ = 0.56;
  const wheelPositions = [
    [-wheelOffsetX, wheelRadius, -wheelOffsetZ],
    [wheelOffsetX, wheelRadius, -wheelOffsetZ],
    [-wheelOffsetX, wheelRadius, wheelOffsetZ],
    [wheelOffsetX, wheelRadius, wheelOffsetZ],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2; // cylindrical axis → X
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);
  }

  return group;
}

/**
 * 创建道路障碍物。
 *
 * 极简风格：方形底座 + 截锥体（矮锥），柔和橙色。
 * 障碍物高度小于跳跃上限，玩家可通过跳跃越过或变道躲避。
 *
 * 模型局部原点位于地面中心。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.color=0xe8854a] - 障碍物主色。
 * @returns {THREE.Group} 障碍物根节点，.userData.bounds = OBSTACLE_BOUNDS。
 */
export function createObstacle(options = {}) {
  const color = options.color ?? 0xe8854a;

  const group = new THREE.Group();
  group.name = 'Obstacle';
  group.userData.bounds = OBSTACLE_BOUNDS;
  group.userData.kind = 'obstacle';

  const mainMat = softMat(color);
  const baseMat = softMat(0x4a4a52, { roughness: 0.8 });
  const tipMat = softMat(0xee6666);

  // —— 方形底座 —— 宽度 0.75 匹配 OBSTACLE_WIDTH
  const baseGeo = new THREE.BoxGeometry(0.75, 0.08, 0.75);
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.04;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // —— 矮锥体 ——
  const coneGeo = new THREE.CylinderGeometry(0.06, 0.30, 0.46, 12);
  const cone = new THREE.Mesh(coneGeo, mainMat);
  cone.position.y = 0.31;
  cone.castShadow = true;
  group.add(cone);

  // —— 顶球 —— 球心 y=0.63 使顶部达到 0.70
  const tipGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.y = 0.63;
  tip.castShadow = true;
  group.add(tip);

  return group;
}

/**
 * 创建对向车辆。
 *
 * 极简风格：扁宽车身 + 驾驶舱 + 4 个小车轮 + 前灯/尾灯。
 * 整体高度超过跳跃上限，玩家只能通过切换车道躲避。
 *
 * 模型局部原点位于车底地面中心，"前方"朝向 -Z。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.bodyColor=0x5a8ab5] - 车身主色（柔和蓝色）。
 * @returns {THREE.Group} 对向车辆根节点，.userData.bounds = VEHICLE_BOUNDS。
 */
export function createOncomingVehicle(options = {}) {
  const bodyColor = options.bodyColor ?? 0x5a8ab5;

  const group = new THREE.Group();
  group.name = 'OncomingVehicle';
  group.userData.bounds = VEHICLE_BOUNDS;
  group.userData.kind = 'vehicle';

  const bodyMat = softMat(bodyColor);
  const cabinMat = softMat(0x7aa3cc, { roughness: 0.6 });
  const wheelMat = softMat(0x222222, { roughness: 0.9 });
  const windowMat = softMat(0xaac8e8, { roughness: 0.3 });
  const headlightMat = softMat(0xf5e6a0);
  const taillightMat = softMat(0xcc4444);

  // —— 下车身 —— 深度 1.90 以匹配 VEHICLE_LENGTH
  const lowerGeo = new THREE.BoxGeometry(0.88, 0.30, 1.90);
  const lower = new THREE.Mesh(lowerGeo, bodyMat);
  lower.position.y = 0.35;
  lower.castShadow = true;
  lower.receiveShadow = true;
  group.add(lower);

  // —— 驾驶舱 —— 顶部达到 y=0.85 以满足 VEHICLE_HEIGHT
  const cabinGeo = new THREE.BoxGeometry(0.78, 0.26, 1.00);
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.y = 0.72;
  cabin.castShadow = true;
  group.add(cabin);

  // —— 前挡风 ——
  const windshieldGeo = new THREE.BoxGeometry(0.72, 0.20, 0.04);
  const windshield = new THREE.Mesh(windshieldGeo, windowMat);
  windshield.position.set(0, 0.74, -0.50);
  windshield.castShadow = true;
  group.add(windshield);

  // —— 后窗 ——
  const rearWindowGeo = new THREE.BoxGeometry(0.72, 0.18, 0.04);
  const rearWindow = new THREE.Mesh(rearWindowGeo, windowMat);
  rearWindow.position.set(0, 0.74, 0.50);
  rearWindow.castShadow = true;
  group.add(rearWindow);

  // —— 前灯 ——
  const lightGeo = new THREE.BoxGeometry(0.12, 0.06, 0.04);
  const headlightL = new THREE.Mesh(lightGeo, headlightMat);
  headlightL.position.set(-0.3, 0.44, -0.93);
  headlightL.castShadow = true;
  group.add(headlightL);
  const headlightR = new THREE.Mesh(lightGeo, headlightMat);
  headlightR.position.set(0.3, 0.44, -0.93);
  headlightR.castShadow = true;
  group.add(headlightR);

  // —— 尾灯 ——
  const taillightL = new THREE.Mesh(lightGeo, taillightMat);
  taillightL.position.set(-0.3, 0.44, 0.93);
  taillightL.castShadow = true;
  group.add(taillightL);
  const taillightR = new THREE.Mesh(lightGeo, taillightMat);
  taillightR.position.set(0.3, 0.44, 0.93);
  taillightR.castShadow = true;
  group.add(taillightR);

  // —— 4 个小车轮 —— wheelWidth=0.17 保证总宽 1.05
  const wheelRadius = 0.2;
  const wheelWidth = 0.17;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
  const wheelPositions = [
    [-0.44, wheelRadius, -0.64],
    [0.44, wheelRadius, -0.64],
    [-0.44, wheelRadius, 0.64],
    [0.44, wheelRadius, 0.64],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);
  }

  return group;
}

/**
 * 创建加血道具（医疗包）。
 *
 * 极简风格：柔和灰色立方体 + 顶面浅绿色十字（两条薄板交叉）。
 * 弱化自发光，通过柔和浅绿高亮吸引注意。
 *
 * 模型局部原点位于底面中心。
 *
 * @param {object} [options] - 配置项。
 * @param {number | string} [options.boxColor=0xe8e8e0] - 主体颜色。
 * @param {number | string} [options.crossColor=0x66cc88] - 十字颜色。
 * @returns {THREE.Group} 加血道具根节点，.userData.bounds = PICKUP_BOUNDS。
 */
export function createHealthPickup(options = {}) {
  const boxColor = options.boxColor ?? 0xe8e8e0;
  const crossColor = options.crossColor ?? 0x66cc88;

  const group = new THREE.Group();
  group.name = 'HealthPickup';
  group.userData.bounds = PICKUP_BOUNDS;
  group.userData.kind = 'pickup';

  const boxMat = softMat(boxColor, { roughness: 0.6 });
  const crossMat = softMat(crossColor, { roughness: 0.5 });

  // —— 主体立方体 —— 精确 0.45 匹配 PICKUP_WIDTH/HEIGHT/DEPTH
  const boxGeo = new THREE.BoxGeometry(0.45, 0.42, 0.45);
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.y = 0.21;
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);

  // —— 顶面十字 —— 十字顶面使总高达到 0.45
  const crossW = 0.27;
  const crossT = 0.06;
  const crossBarH = 0.04;
  // 水平条
  const barHGeo = new THREE.BoxGeometry(crossW, crossBarH, crossT);
  const barH = new THREE.Mesh(barHGeo, crossMat);
  barH.position.set(0, 0.43, 0);
  barH.castShadow = true;
  group.add(barH);
  // 垂直条
  const barVGeo = new THREE.BoxGeometry(crossT, crossBarH, crossW);
  const barV = new THREE.Mesh(barVGeo, crossMat);
  barV.position.set(0, 0.43, 0);
  barV.castShadow = true;
  group.add(barV);

  return group;
}
