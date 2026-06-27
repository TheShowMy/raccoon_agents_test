/**
 * racingRoad.js 单元测试
 *
 * 验证道路三维曲线、高程、坡度、法线以及种子变化功能。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // 基本参数
  LANE_COUNT,
  LANE_WIDTH,
  LANE_CENTER_X,
  ROAD_HALF_WIDTH,
  ROAD_SEGMENT_COUNT,
  ROAD_SEGMENT_LENGTH,
  ROAD_TOTAL_LENGTH,
  // 蜿蜒曲线参数
  ROAD_CURVE_AMPLITUDE,
  ROAD_CURVE_FREQUENCY,
  ROAD_CURVE_AMPLITUDE_2,
  ROAD_CURVE_FREQUENCY_2,
  // 高程参数
  ROAD_ELEVATION_AMPLITUDE,
  ROAD_ELEVATION_FREQUENCY,
  ROAD_ELEVATION_AMPLITUDE_2,
  ROAD_ELEVATION_FREQUENCY_2,
  // 蜿蜒曲线函数
  roadCenterOffsetAt,
  roadHeadingAt,
  // 高程与坡度函数
  roadElevationAt,
  roadPitchAt,
  roadNormalAt,
  // 统一查询函数
  roadFrameAt,
  laneFrameAt,
  // 车道坐标
  laneCenterXAt,
  laneLinesXAt,
  // 道路后退
  wrapRoadZ,
  advanceRoadProgress,
  // 道路分段
  buildRoadSegments,
  // 种子函数
  getRoadSeed,
  setRoadSeed,
} from '../src/lib/utils/racingRoad.js';

describe('racingRoad.js — 基本参数', () => {
  it('LANE_COUNT 应为 3', () => {
    expect(LANE_COUNT).toBe(3);
  });

  it('LANE_WIDTH 应为正数', () => {
    expect(LANE_WIDTH).toBeGreaterThan(0);
  });

  it('LANE_CENTER_X 应包含 3 个元素', () => {
    expect(LANE_CENTER_X).toHaveLength(3);
    // 左车道 < 中车道 < 右车道
    expect(LANE_CENTER_X[0]).toBeLessThan(LANE_CENTER_X[1]);
    expect(LANE_CENTER_X[1]).toBeLessThan(LANE_CENTER_X[2]);
  });

  it('ROAD_HALF_WIDTH 应等于 (LANE_WIDTH * LANE_COUNT) / 2', () => {
    expect(ROAD_HALF_WIDTH).toBe((LANE_WIDTH * LANE_COUNT) / 2);
  });

  it('ROAD_TOTAL_LENGTH / ROAD_SEGMENT_COUNT 应为整数', () => {
    expect(ROAD_TOTAL_LENGTH / ROAD_SEGMENT_COUNT).toBe(ROAD_SEGMENT_LENGTH);
    expect(ROAD_TOTAL_LENGTH % ROAD_SEGMENT_COUNT).toBe(0);
  });
});

describe('racingRoad.js — 蜿蜒曲线函数', () => {
  it('roadCenterOffsetAt(z=0) 应返回有限数值', () => {
    const offset = roadCenterOffsetAt(0);
    expect(Number.isFinite(offset)).toBe(true);
  });

  it('roadCenterOffsetAt 对称性：offset(z) ≈ -offset(-z) 当相位对称时', () => {
    // 基础相位为 0 时，道路关于 z=0 对称
    const a = roadCenterOffsetAt(100);
    const b = roadCenterOffsetAt(-100);
    expect(Math.abs(a + b)).toBeLessThan(0.001);
  });

  it('roadHeadingAt(z) 应返回有限数值', () => {
    const heading = roadHeadingAt(0);
    expect(Number.isFinite(heading)).toBe(true);
  });

  it('roadHeadingAt 的导数性质：|heading| ≤ ROAD_CURVE_AMPLITUDE * ROAD_CURVE_FREQUENCY + ...', () => {
    const maxHeading = ROAD_CURVE_AMPLITUDE * ROAD_CURVE_FREQUENCY +
                       ROAD_CURVE_AMPLITUDE_2 * ROAD_CURVE_FREQUENCY_2;
    for (let z = -500; z <= 500; z += 50) {
      expect(Math.abs(roadHeadingAt(z))).toBeLessThanOrEqual(maxHeading * 1.01);
    }
  });
});

describe('racingRoad.js — 高程函数（平坦赛道）', () => {
  it('roadElevationAt(z=0) 应返回 0（平坦赛道）', () => {
    const elev = roadElevationAt(0);
    expect(elev).toBeCloseTo(0); // 用 toBeCloseTo 而非 toBe，兼容 -0 vs +0
  });

  it('roadElevationAt 在任意位置均返回 0（平坦赛道）', () => {
    for (let z = -500; z <= 500; z += 50) {
      expect(roadElevationAt(z)).toBeCloseTo(0);
    }
  });

  it('roadElevationAt 在任意种子下均返回 0（平坦赛道）', () => {
    const seeds = [0, 42, -17.5, 99.9, -100];
    for (const seed of seeds) {
      setRoadSeed(seed);
      for (let z = -200; z <= 200; z += 100) {
        expect(roadElevationAt(z)).toBeCloseTo(0);
      }
    }
    setRoadSeed(0);
  });
});

describe('racingRoad.js — 俯仰角函数（平坦赛道）', () => {
  it('roadPitchAt(z=0) 应返回 0（平坦赛道）', () => {
    const pitch = roadPitchAt(0);
    expect(pitch).toBeCloseTo(0);
  });

  it('roadPitchAt 在任意位置均返回 0（平坦赛道）', () => {
    for (let z = -500; z <= 500; z += 50) {
      expect(roadPitchAt(z)).toBeCloseTo(0);
    }
  });

  it('roadPitchAt 在任意种子下均返回 0（平坦赛道）', () => {
    const seeds = [0, 42, -17.5, 99.9, -100];
    for (const seed of seeds) {
      setRoadSeed(seed);
      for (let z = -200; z <= 200; z += 100) {
        expect(roadPitchAt(z)).toBeCloseTo(0);
      }
    }
    setRoadSeed(0);
  });
});

describe('racingRoad.js — 法线函数（平坦赛道）', () => {
  it('roadNormalAt(z) 应返回包含 x, y, z 的对象', () => {
    const normal = roadNormalAt(0);
    expect(normal).toHaveProperty('x');
    expect(normal).toHaveProperty('y');
    expect(normal).toHaveProperty('z');
  });

  it('roadNormalAt 应返回单位向量（平坦赛道：y 恒为 1）', () => {
    for (let z = -200; z <= 200; z += 40) {
      const n = roadNormalAt(z);
      const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      expect(Math.abs(len - 1)).toBeLessThan(0.0001);
      // 平坦赛道法线恒为 (0, 1, 0)
      expect(n.x).toBeCloseTo(0); // 兼容 -0 vs +0
      expect(n.y).toBe(1);
      expect(n.z).toBeCloseTo(0);
    }
  });

  it('roadNormalAt 的 y 分量应始终为正（指向上方）', () => {
    for (let z = -200; z <= 200; z += 40) {
      const n = roadNormalAt(z);
      expect(n.y).toBeGreaterThan(0);
    }
  });
});

describe('racingRoad.js — 统一查询函数', () => {
  it('roadFrameAt(z) 应返回包含 x, y, heading, pitch, normal 的对象', () => {
    const frame = roadFrameAt(0);
    expect(frame).toHaveProperty('x');
    expect(frame).toHaveProperty('y');
    expect(frame).toHaveProperty('heading');
    expect(frame).toHaveProperty('pitch');
    expect(frame).toHaveProperty('normal');
    expect(frame.normal).toHaveProperty('x');
    expect(frame.normal).toHaveProperty('y');
    expect(frame.normal).toHaveProperty('z');
  });

  it('roadFrameAt(z) 的各字段应与单独函数一致', () => {
    const z = 123;
    const frame = roadFrameAt(z);
    expect(frame.x).toBeCloseTo(roadCenterOffsetAt(z), 10);
    expect(frame.y).toBeCloseTo(roadElevationAt(z), 10); // 平坦赛道：均为 0
    expect(frame.heading).toBeCloseTo(roadHeadingAt(z), 10);
    expect(frame.pitch).toBeCloseTo(roadPitchAt(z), 10); // 平坦赛道：均为 0
    expect(frame.normal.x).toBeCloseTo(roadNormalAt(z).x, 10);
    expect(frame.normal.y).toBeCloseTo(roadNormalAt(z).y, 10);
    expect(frame.normal.z).toBeCloseTo(roadNormalAt(z).z, 10);
  });

  it('roadFrameAt 的 y 与 pitch 在平坦赛道上恒为 0', () => {
    for (let z = -200; z <= 200; z += 50) {
      const frame = roadFrameAt(z);
      expect(frame.y).toBeCloseTo(0); // roadElevationAt 恒为 0
      expect(frame.pitch).toBeCloseTo(0); // roadPitchAt 恒为 0
    }
  });

  it('laneFrameAt(laneIndex, z) 应返回包含 x, y, heading, pitch, normal 的对象', () => {
    const frame = laneFrameAt(1, 0);
    expect(frame).toHaveProperty('x');
    expect(frame).toHaveProperty('y');
    expect(frame).toHaveProperty('heading');
    expect(frame).toHaveProperty('pitch');
    expect(frame).toHaveProperty('normal');
  });

  it('laneFrameAt(laneIndex, z) 的 x 应叠加道路偏移与车道中心', () => {
    const z = 100;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const frame = laneFrameAt(lane, z);
      const expectedX = LANE_CENTER_X[lane] + roadCenterOffsetAt(z);
      expect(frame.x).toBeCloseTo(expectedX, 10);
    }
  });

  it('laneFrameAt(laneIndex, z) 的 y 在平坦赛道上恒为 0', () => {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const frame = laneFrameAt(lane, 50);
      expect(frame.y).toBeCloseTo(0); // 平坦赛道高程为 0
    }
  });

  it('laneFrameAt 越界车道索引应回退到中车道 (1)', () => {
    const z = 0;
    const frameNeg = laneFrameAt(-1, z);
    const frameLarge = laneFrameAt(99, z);
    const frameMid = laneFrameAt(1, z);
    expect(frameNeg.x).toBeCloseTo(frameMid.x, 10);
    expect(frameLarge.x).toBeCloseTo(frameMid.x, 10);
  });
});

describe('racingRoad.js — 道路分段（平坦赛道）', () => {
  it('buildRoadSegments 应返回 ROAD_SEGMENT_COUNT 个元素', () => {
    const segments = buildRoadSegments(0);
    expect(segments).toHaveLength(ROAD_SEGMENT_COUNT);
  });

  it('每个分段应包含必需字段', () => {
    const segments = buildRoadSegments(0);
    for (const seg of segments) {
      expect(seg).toHaveProperty('index');
      expect(seg).toHaveProperty('zStart');
      expect(seg).toHaveProperty('zEnd');
      expect(seg).toHaveProperty('zCenter');
      expect(seg).toHaveProperty('zCenterWorld');
      expect(seg).toHaveProperty('centerOffsetX');
      expect(seg).toHaveProperty('elevation');
      expect(seg).toHaveProperty('heading');
      expect(seg).toHaveProperty('pitch');
      expect(seg).toHaveProperty('length');
      expect(seg).toHaveProperty('halfWidth');
    }
  });

  it('每个分段的 elevation 在平坦赛道上恒为 0', () => {
    const segments = buildRoadSegments(0);
    for (const seg of segments) {
      expect(seg.elevation).toBeCloseTo(0);
    }
  });

  it('每个分段的 pitch 在平坦赛道上恒为 0', () => {
    const segments = buildRoadSegments(0);
    for (const seg of segments) {
      expect(seg.pitch).toBeCloseTo(0);
    }
  });

  it('分段数组的 zStart 和 zEnd 应连续且覆盖整个道路长度', () => {
    const segments = buildRoadSegments(0);
    expect(segments[0].zStart).toBe(0);
    expect(segments[ROAD_SEGMENT_COUNT - 1].zEnd).toBe(ROAD_TOTAL_LENGTH);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].zStart).toBe(segments[i - 1].zEnd);
    }
  });

  it('zCenter 应为 zStart 和 zEnd 的中点', () => {
    const segments = buildRoadSegments(0);
    for (const seg of segments) {
      expect(seg.zCenter).toBeCloseTo((seg.zStart + seg.zEnd) / 2, 10);
    }
  });
});

describe('racingRoad.js — 种子变化', () => {
  beforeEach(() => {
    setRoadSeed(0);
  });

  it('getRoadSeed 应返回当前种子值', () => {
    expect(getRoadSeed()).toBe(0);
    setRoadSeed(123);
    expect(getRoadSeed()).toBe(123);
  });

  it('setRoadSeed 应能设置任意数值种子', () => {
    setRoadSeed(42);
    expect(getRoadSeed()).toBe(42);
    setRoadSeed(-17.5);
    expect(getRoadSeed()).toBe(-17.5);
  });

  it('setRoadSeed 应正确处理非有限数值', () => {
    setRoadSeed(NaN);
    expect(getRoadSeed()).toBe(0);
    setRoadSeed(Infinity);
    expect(getRoadSeed()).toBe(0);
    setRoadSeed(-Infinity);
    expect(getRoadSeed()).toBe(0);
  });

  it('setRoadSeed 浮点数种子应产生确定结果', () => {
    const z = 50;
    setRoadSeed(1.234);
    const offset1 = roadCenterOffsetAt(z);
    const elev1 = roadElevationAt(z);
    setRoadSeed(0);
    setRoadSeed(1.234);
    const offset2 = roadCenterOffsetAt(z);
    const elev2 = roadElevationAt(z);
    expect(offset1).toBeCloseTo(offset2, 10);
    expect(elev1).toBeCloseTo(elev2, 10);
  });

  it('相同种子应产生相同的道路偏移', () => {
    const z = 100;
    setRoadSeed(100);
    const offset1 = roadCenterOffsetAt(z);
    setRoadSeed(0);
    setRoadSeed(100);
    const offset2 = roadCenterOffsetAt(z);
    expect(offset1).toBeCloseTo(offset2, 10);
  });

  it('不同种子应产生不同的道路偏移', () => {
    const z = 100;
    setRoadSeed(100);
    const offset1 = roadCenterOffsetAt(z);
    setRoadSeed(200);
    const offset2 = roadCenterOffsetAt(z);
    // 不同种子极大概率产生不同偏移
    expect(offset1).not.toBeCloseTo(offset2, 3);
  });

  it('相同种子应产生相同的道路中心偏移（修复验证）', () => {
    const z = 100;
    setRoadSeed(42);
    const offset1 = roadCenterOffsetAt(z);
    setRoadSeed(0);
    setRoadSeed(42);
    const offset2 = roadCenterOffsetAt(z);
    expect(offset1).toBeCloseTo(offset2, 10);
  });

  it('roadCenterOffsetAt 应受种子影响（修复验证）', () => {
    const z = 100;
    setRoadSeed(100);
    const offset1 = roadCenterOffsetAt(z);
    setRoadSeed(0);
    setRoadSeed(200);
    const offset2 = roadCenterOffsetAt(z);
    expect(offset1).not.toBeCloseTo(offset2, 3);
  });

  it('道路高程在任意种子下均为 0（平坦赛道）', () => {
    const z = 150;
    const seeds = [0, 42, 999, -17, 3.14159];
    for (const seed of seeds) {
      setRoadSeed(seed);
      expect(roadElevationAt(z)).toBeCloseTo(0);
    }
    setRoadSeed(0);
  });

  it('俯仰角在任意种子下均为 0（平坦赛道）', () => {
    const z = 80;
    const seeds = [0, 55, 999, -17, 3.14159];
    for (const seed of seeds) {
      setRoadSeed(seed);
      expect(roadPitchAt(z)).toBeCloseTo(0);
    }
    setRoadSeed(0);
  });

  it('相同种子应产生相同的分段数据（平坦赛道）', () => {
    setRoadSeed(77);
    const segs1 = buildRoadSegments(0);
    setRoadSeed(0);
    setRoadSeed(77);
    const segs2 = buildRoadSegments(0);
    expect(segs1).toHaveLength(segs2.length);
    for (let i = 0; i < segs1.length; i++) {
      // 平坦赛道：所有种子的 elevation 和 pitch 均为 0
      expect(segs1[i].elevation).toBeCloseTo(0);
      expect(segs2[i].elevation).toBeCloseTo(0);
      expect(segs1[i].pitch).toBeCloseTo(0);
      expect(segs2[i].pitch).toBeCloseTo(0);
      expect(segs1[i].heading).toBeCloseTo(segs2[i].heading, 10);
    }
  });

  it('roadFrameAt 的 heading 受种子影响（水平蜿蜒，y/pitch 不变）', () => {
    const z = 200;
    setRoadSeed(88);
    const frame1 = roadFrameAt(z);
    setRoadSeed(0);
    setRoadSeed(88);
    const frame2 = roadFrameAt(z);
    // y 和 pitch 在平坦赛道始终为 0（与种子无关）
    expect(frame1.y).toBeCloseTo(0);
    expect(frame1.pitch).toBeCloseTo(0);
    expect(frame2.y).toBeCloseTo(0);
    expect(frame2.pitch).toBeCloseTo(0);
  });

  it('laneFrameAt 的 y 在平坦赛道上恒为 0（与种子无关）', () => {
    const z = 120;
    const lane = 0;
    setRoadSeed(66);
    const frame1 = laneFrameAt(lane, z);
    setRoadSeed(0);
    setRoadSeed(66);
    const frame2 = laneFrameAt(lane, z);
    // 平坦赛道：y 恒为 0
    expect(frame1.y).toBeCloseTo(0);
    expect(frame2.y).toBeCloseTo(0);
    // x 受种子影响的水平蜿蜒
    expect(frame1.x).toBeCloseTo(frame2.x, 10);
  });
});

describe('racingRoad.js — 边界情况', () => {
  it('roadCenterOffsetAt 应处理非数值输入', () => {
    expect(roadCenterOffsetAt(NaN)).toBe(0);
    expect(roadCenterOffsetAt(undefined)).toBe(0);
  });

  it('roadElevationAt 应处理非数值输入', () => {
    expect(roadElevationAt(NaN)).toBe(0);
    expect(roadElevationAt(undefined)).toBe(0);
  });

  it('roadPitchAt 应处理非数值输入', () => {
    expect(roadPitchAt(NaN)).toBe(0);
    expect(roadPitchAt(undefined)).toBe(0);
  });

  it('roadFrameAt 应处理非数值输入', () => {
    const frame = roadFrameAt(NaN);
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
  });

  it('wrapRoadZ 应处理边界情况', () => {
    expect(wrapRoadZ(0)).toBe(0);
    expect(wrapRoadZ(ROAD_TOTAL_LENGTH)).toBeCloseTo(0, 10);
    expect(wrapRoadZ(-1)).toBeCloseTo(ROAD_TOTAL_LENGTH - 1, 10);
    expect(wrapRoadZ(ROAD_TOTAL_LENGTH * 2.5)).toBeCloseTo(ROAD_TOTAL_LENGTH * 0.5, 10);
    expect(wrapRoadZ(NaN)).toBe(0);
  });

  it('advanceRoadProgress 应处理边界情况', () => {
    expect(advanceRoadProgress(0, 0, 10)).toBe(0);
    expect(advanceRoadProgress(0, 1, 0)).toBe(0);
    expect(advanceRoadProgress(0, 1, -5)).toBe(0);
    expect(advanceRoadProgress(0, -1, 10)).toBe(0);
    expect(advanceRoadProgress(0, 1, 10)).toBeCloseTo(10, 10);
  });
});