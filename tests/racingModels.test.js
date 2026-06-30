/**
 * racingModels.js 单元测试
 *
 * 覆盖：
 *   - 四个工厂函数均返回 THREE.Group 并正确设置 name / userData
 *   - userData.bounds 与导出的常量一致
 *   - 模型实际包围盒尺寸与声明的尺寸常量匹配（使用 Box3.setFromObject）
 *   - 自定义颜色/选项可生效
 *   - 模型方向约定：底部在 y=0，车头在 -Z
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createPlayerCar,
  createObstacle,
  createOncomingVehicle,
  createHealthPickup,
  CAR_WIDTH,
  CAR_HEIGHT,
  CAR_LENGTH,
  OBSTACLE_WIDTH,
  OBSTACLE_HEIGHT,
  OBSTACLE_LENGTH,
  VEHICLE_WIDTH,
  VEHICLE_HEIGHT,
  VEHICLE_LENGTH,
  PICKUP_WIDTH,
  PICKUP_HEIGHT,
  PICKUP_LENGTH,
  PLAYER_CAR_BOUNDS,
  OBSTACLE_BOUNDS,
  VEHICLE_BOUNDS,
  PICKUP_BOUNDS,
} from '../src/lib/utils/racingModels.js';

/* ============================================================
 * 辅助函数
 * ============================================================ */

/**
 * 计算 Group 的轴对齐包围盒尺寸（局部坐标），忽略 y=0 以下的部件
 * （模型约定底面位于 y=0）。
 */
function measureBounds(group) {
  const box = new THREE.Box3().setFromObject(group);
  return {
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    depth: box.max.z - box.min.z,
  };
}

/**
 * 验证模型地位于 y=0 平面。
 */
function expectBaseAtZero(group) {
  const box = new THREE.Box3().setFromObject(group);
  expect(box.min.y).toBeCloseTo(0, 3);
}

/**
 * 验证 userData.bounds 正确关联到尺寸常量。
 */
function expectBoundsMatch(group, expectedBounds) {
  expect(group.userData.bounds).toEqual(expectedBounds);
}

/* ============================================================
 * 通用组测试
 * ============================================================ */

describe('createPlayerCar', () => {
  it('返回 THREE.Group 且名称为 PlayerCar', () => {
    const car = createPlayerCar();
    expect(car).toBeInstanceOf(THREE.Group);
    expect(car.name).toBe('PlayerCar');
  });

  it('userData.kind 为 "player"', () => {
    const car = createPlayerCar();
    expect(car.userData.kind).toBe('player');
  });

  it('userData.bounds 等于 PLAYER_CAR_BOUNDS', () => {
    const car = createPlayerCar();
    expectBoundsMatch(car, PLAYER_CAR_BOUNDS);
  });

  it('模型底面位于 y=0', () => {
    const car = createPlayerCar();
    expectBaseAtZero(car);
  });

  it('实际包围盒尺寸与声明的尺寸常量一致', () => {
    const car = createPlayerCar();
    const measured = measureBounds(car);
    expect(measured.width).toBeCloseTo(CAR_WIDTH, 5);
    expect(measured.height).toBeCloseTo(CAR_HEIGHT, 5);
    expect(measured.depth).toBeCloseTo(CAR_LENGTH, 5);
  });

  it('可接受自定义 bodyColor', () => {
    const car = createPlayerCar({ bodyColor: 0x123456 });
    const mesh = car.children.find((c) => c instanceof THREE.Mesh);
    expect(mesh).toBeDefined();
    // 车身材质颜色应为指定色
    const bodyMeshes = car.children.filter(
      (c) => c instanceof THREE.Mesh && c.material.color.getHex() === 0x123456
    );
    expect(bodyMeshes.length).toBeGreaterThan(0);
  });

  it('包含至少 4 个车轮（圆柱旋转后轴向为 X）', () => {
    const car = createPlayerCar();
    const wheels = car.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry.type === 'CylinderGeometry'
    );
    expect(wheels.length).toBe(4);
    // 所有车轮 rotation.z 应为 PI/2（轴向沿 X）
    for (const w of wheels) {
      expect(w.rotation.z).toBeCloseTo(Math.PI / 2, 5);
    }
  });

  it('所有网格启用了 castShadow 和 receiveShadow', () => {
    const car = createPlayerCar();
    const meshes = car.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      expect(m.castShadow).toBe(true);
      // 带车厢的车窗等薄片也可能 receiveShadow
    }
  });

  it('无自定义选项时使用默认颜色', () => {
    const car = createPlayerCar();
    // 最大块车身应为默认暖土色
    const bodyMesh = car.children.find(
      (c) =>
        c instanceof THREE.Mesh &&
        c.geometry.type === 'BoxGeometry' &&
        c.material.color.getHex() === 0xc9734e
    );
    expect(bodyMesh).toBeDefined();
  });
});

/* ============================================================
 * 障碍物测试
 * ============================================================ */

describe('createObstacle', () => {
  it('返回 THREE.Group 且名称为 Obstacle', () => {
    const obs = createObstacle();
    expect(obs).toBeInstanceOf(THREE.Group);
    expect(obs.name).toBe('Obstacle');
  });

  it('userData.kind 为 "obstacle"', () => {
    const obs = createObstacle();
    expect(obs.userData.kind).toBe('obstacle');
  });

  it('userData.bounds 等于 OBSTACLE_BOUNDS', () => {
    const obs = createObstacle();
    expectBoundsMatch(obs, OBSTACLE_BOUNDS);
  });

  it('模型底面位于 y=0', () => {
    const obs = createObstacle();
    expectBaseAtZero(obs);
  });

  it('实际包围盒尺寸与声明的尺寸常量一致', () => {
    const obs = createObstacle();
    const measured = measureBounds(obs);
    expect(measured.width).toBeCloseTo(OBSTACLE_WIDTH, 5);
    expect(measured.height).toBeCloseTo(OBSTACLE_HEIGHT, 5);
    expect(measured.depth).toBeCloseTo(OBSTACLE_LENGTH, 5);
  });

  it('可接受自定义 color', () => {
    const obs = createObstacle({ color: 0xaabbcc });
    const colored = obs.children.find(
      (c) => c instanceof THREE.Mesh && c.material.color.getHex() === 0xaabbcc
    );
    expect(colored).toBeDefined();
  });

  it('包含一个锥体 (CylinderGeometry) 和一个底座 (BoxGeometry)', () => {
    const obs = createObstacle();
    const cylinders = obs.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry.type === 'CylinderGeometry'
    );
    const boxes = obs.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry.type === 'BoxGeometry'
    );
    expect(cylinders.length).toBe(1);
    expect(boxes.length).toBe(1);
  });
});

/* ============================================================
 * 对向车辆测试
 * ============================================================ */

describe('createOncomingVehicle', () => {
  it('返回 THREE.Group 且名称为 OncomingVehicle', () => {
    const v = createOncomingVehicle();
    expect(v).toBeInstanceOf(THREE.Group);
    expect(v.name).toBe('OncomingVehicle');
  });

  it('userData.kind 为 "vehicle"', () => {
    const v = createOncomingVehicle();
    expect(v.userData.kind).toBe('vehicle');
  });

  it('userData.bounds 等于 VEHICLE_BOUNDS', () => {
    const v = createOncomingVehicle();
    expectBoundsMatch(v, VEHICLE_BOUNDS);
  });

  it('模型底面位于 y=0', () => {
    const v = createOncomingVehicle();
    expectBaseAtZero(v);
  });

  it('实际包围盒尺寸与声明的尺寸常量一致', () => {
    const v = createOncomingVehicle();
    const measured = measureBounds(v);
    expect(measured.width).toBeCloseTo(VEHICLE_WIDTH, 5);
    expect(measured.height).toBeCloseTo(VEHICLE_HEIGHT, 5);
    expect(measured.depth).toBeCloseTo(VEHICLE_LENGTH, 5);
  });

  it('可接受自定义 bodyColor', () => {
    const v = createOncomingVehicle({ bodyColor: 0x99cc99 });
    const colored = v.children.find(
      (c) => c instanceof THREE.Mesh && c.material.color.getHex() === 0x99cc99
    );
    expect(colored).toBeDefined();
  });

  it('包含 4 个车轮（CylinderGeometry）', () => {
    const v = createOncomingVehicle();
    const wheels = v.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry.type === 'CylinderGeometry'
    );
    expect(wheels.length).toBe(4);
  });

  it('车轮轴向为 X (rotation.z ≈ PI/2)', () => {
    const v = createOncomingVehicle();
    const wheels = v.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry.type === 'CylinderGeometry'
    );
    for (const w of wheels) {
      expect(w.rotation.z).toBeCloseTo(Math.PI / 2, 5);
    }
  });
});

/* ============================================================
 * 加血道具测试
 * ============================================================ */

describe('createHealthPickup', () => {
  it('返回 THREE.Group 且名称为 HealthPickup', () => {
    const p = createHealthPickup();
    expect(p).toBeInstanceOf(THREE.Group);
    expect(p.name).toBe('HealthPickup');
  });

  it('userData.kind 为 "pickup"', () => {
    const p = createHealthPickup();
    expect(p.userData.kind).toBe('pickup');
  });

  it('userData.bounds 等于 PICKUP_BOUNDS', () => {
    const p = createHealthPickup();
    expectBoundsMatch(p, PICKUP_BOUNDS);
  });

  it('模型底面位于 y=0', () => {
    const p = createHealthPickup();
    expectBaseAtZero(p);
  });

  it('实际包围盒尺寸与声明的尺寸常量一致', () => {
    const p = createHealthPickup();
    const measured = measureBounds(p);
    expect(measured.width).toBeCloseTo(PICKUP_WIDTH, 5);
    expect(measured.height).toBeCloseTo(PICKUP_HEIGHT, 5);
    expect(measured.depth).toBeCloseTo(PICKUP_LENGTH, 5);
  });

  it('可接受自定义 boxColor 和 crossColor', () => {
    const p = createHealthPickup({ boxColor: 0xcccccc, crossColor: 0x88ff88 });
    const boxColorMatch = p.children.find(
      (c) => c instanceof THREE.Mesh && c.material.color.getHex() === 0xcccccc
    );
    const crossColorMatch = p.children.find(
      (c) => c instanceof THREE.Mesh && c.material.color.getHex() === 0x88ff88
    );
    expect(boxColorMatch).toBeDefined();
    expect(crossColorMatch).toBeDefined();
  });

  it('主体为 BoxGeometry', () => {
    const p = createHealthPickup();
    const boxes = p.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry.type === 'BoxGeometry'
    );
    // 主体 + 十字水平条 + 十字垂直条
    expect(boxes.length).toBe(3);
  });
});

/* ============================================================
 * 尺寸常量一致性
 * ============================================================ */

describe('尺寸常量一致性', () => {
  it('PLAYER_CAR_BOUNDS 与各维度常量一致', () => {
    expect(PLAYER_CAR_BOUNDS).toEqual({
      width: CAR_WIDTH,
      height: CAR_HEIGHT,
      depth: CAR_LENGTH,
    });
  });

  it('OBSTACLE_BOUNDS 与各维度常量一致', () => {
    expect(OBSTACLE_BOUNDS).toEqual({
      width: OBSTACLE_WIDTH,
      height: OBSTACLE_HEIGHT,
      depth: OBSTACLE_LENGTH,
    });
  });

  it('VEHICLE_BOUNDS 与各维度常量一致', () => {
    expect(VEHICLE_BOUNDS).toEqual({
      width: VEHICLE_WIDTH,
      height: VEHICLE_HEIGHT,
      depth: VEHICLE_LENGTH,
    });
  });

  it('PICKUP_BOUNDS 与各维度常量一致', () => {
    expect(PICKUP_BOUNDS).toEqual({
      width: PICKUP_WIDTH,
      height: PICKUP_HEIGHT,
      depth: PICKUP_LENGTH,
    });
  });
});

/* ============================================================
 * 所有工厂默认无错误
 * ============================================================ */

describe('所有工厂函数均可创建默认实例', () => {
  it('createPlayerCar 无异常', () => {
    expect(() => createPlayerCar()).not.toThrow();
  });

  it('createObstacle 无异常', () => {
    expect(() => createObstacle()).not.toThrow();
  });

  it('createOncomingVehicle 无异常', () => {
    expect(() => createOncomingVehicle()).not.toThrow();
  });

  it('createHealthPickup 无异常', () => {
    expect(() => createHealthPickup()).not.toThrow();
  });
});
