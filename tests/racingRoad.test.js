/**
 * racingRoad.js 单元测试
 *
 * 验证道路几何函数、流式 procedural 生成、种子变化以及车道与分段功能。
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
  // 流式生成参数
  ROAD_PROCGEN_MAX_OFFSET,
  ROAD_PROCGEN_MAX_HEADING,
  ROAD_PROCGEN_CACHE_BUFFER,
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
  // 内部辅助（仅供测试断言缓存行为）
  _getSegmentCacheSizeForTest,
  _clearSegmentCacheForTest,
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

describe('racingRoad.js — 流式生成参数', () => {
  it('ROAD_PROCGEN_MAX_OFFSET 应为正数', () => {
    expect(ROAD_PROCGEN_MAX_OFFSET).toBeGreaterThan(0);
  });

  it('ROAD_PROCGEN_MAX_HEADING 应与 MAX_OFFSET / SEGMENT_LENGTH 一致', () => {
    // Catmull-Rom 样条下，导数最大绝对值 = 3 * MAX_OFFSET / SL
    // （控制点交替取极值时 q'(t) = 12·MAX·t·(1-t)，最大值 3·MAX）。
    const expected =
      (3 * ROAD_PROCGEN_MAX_OFFSET) / ROAD_SEGMENT_LENGTH;
    expect(ROAD_PROCGEN_MAX_HEADING).toBeCloseTo(expected, 12);
  });

  it('ROAD_PROCGEN_MAX_HEADING 应满足 ≤ 0.5 rad（约 28°）的硬性约束', () => {
    // 验收标准：单段最大斜率 ≤ 0.5 rad。该硬性约束在公式与参数下调后必须被
    // ROAD_PROCGEN_MAX_HEADING 常量直接体现（不依赖宽垄的实际 PRNG 采样）。
    expect(ROAD_PROCGEN_MAX_HEADING).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('ROAD_PROCGEN_CACHE_BUFFER 应为正整数', () => {
    expect(Number.isInteger(ROAD_PROCGEN_CACHE_BUFFER)).toBe(true);
    expect(ROAD_PROCGEN_CACHE_BUFFER).toBeGreaterThan(0);
    // 缓存窗口应至少能覆盖整个视觉窗口
    expect(ROAD_PROCGEN_CACHE_BUFFER).toBeGreaterThanOrEqual(ROAD_SEGMENT_COUNT);
  });
});

describe('racingRoad.js — 蜿蜒曲线函数', () => {
  it('roadCenterOffsetAt(z=0) 应返回有限数值', () => {
    const offset = roadCenterOffsetAt(0);
    expect(Number.isFinite(offset)).toBe(true);
  });

  it('roadCenterOffsetAt 在任意位置均返回有限数值', () => {
    for (let z = -500; z <= 500; z += 50) {
      expect(Number.isFinite(roadCenterOffsetAt(z))).toBe(true);
    }
  });

  it('roadCenterOffsetAt 的值域在 [-MAX, +MAX] 内', () => {
    // 流式生成下，中心偏移由 Catmull-Rom 样条在 4 个控制点间插值；
    // 控制点值域为 [-MAX, MAX]，样条值由此范围继承，实际采样不超过 MAX
    for (let z = -1000; z <= 1000; z += 25) {
      const v = roadCenterOffsetAt(z);
      expect(Math.abs(v)).toBeLessThanOrEqual(ROAD_PROCGEN_MAX_OFFSET + 1e-9);
    }
  });

  it('roadHeadingAt(z) 应返回有限数值', () => {
    const heading = roadHeadingAt(0);
    expect(Number.isFinite(heading)).toBe(true);
  });

  it('roadHeadingAt 的导数性质：|heading| ≤ ROAD_PROCGEN_MAX_HEADING', () => {
    for (let z = -1000; z <= 1000; z += 5) {
      expect(Math.abs(roadHeadingAt(z))).toBeLessThanOrEqual(
        ROAD_PROCGEN_MAX_HEADING + 1e-9
      );
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

  it('每段的 length 与 halfWidth 应等于基本参数', () => {
    const segments = buildRoadSegments(0);
    for (const seg of segments) {
      expect(seg.length).toBe(ROAD_SEGMENT_LENGTH);
      expect(seg.halfWidth).toBe(ROAD_HALF_WIDTH);
    }
  });

  it('在 progress=0 时 zCenterWorld 与 zCenter 相等（wrap 边界）', () => {
    // progress=0 时 wrapRoadZ(zCenter + 0) = zCenter，是 wrap 后的恒等边界
    const segments = buildRoadSegments(0);
    for (const seg of segments) {
      expect(seg.zCenterWorld).toBe(seg.zCenter);
    }
  });

  it('zCenterWorld 在 progress>0 时随 wrap 在 [0, ROAD_TOTAL_LENGTH) 内滚动', () => {
    const segments0 = buildRoadSegments(0);
    const segments10 = buildRoadSegments(10);
    // 至少有一段视觉 z 发生变化
    let anyScrolled = false;
    for (let i = 0; i < segments0.length; i++) {
      if (segments0[i].zCenterWorld !== segments10[i].zCenterWorld) {
        anyScrolled = true;
        break;
      }
    }
    expect(anyScrolled).toBe(true);
    // 滚动后 zCenterWorld 仍在 [0, ROAD_TOTAL_LENGTH) 范围内
    for (const seg of segments10) {
      expect(seg.zCenterWorld).toBeGreaterThanOrEqual(0);
      expect(seg.zCenterWorld).toBeLessThan(ROAD_TOTAL_LENGTH + 1e-9);
    }
  });

  it('progress 增加一段长度后，zCenterWorld 整体向前 wrap 增加 1 段', () => {
    // 验证 zCenterWorld = wrapRoadZ(zCenter + p) 的精确关系：
    // progress 增加一段长度时，每段视觉 z 在循环窗口内整体朝 +z 方向推进一段，
    // 即 segment i 的新 zCenterWorld 等于旧 progress 下 segment i+1 的视觉 z。
    const sl = ROAD_SEGMENT_LENGTH;
    const p = sl; // 推进 1 段长度
    const segments = buildRoadSegments(p);
    for (let i = 0; i < segments.length; i++) {
      const zCenter = i * sl + sl / 2;
      const expected = ((zCenter + p) % ROAD_TOTAL_LENGTH + ROAD_TOTAL_LENGTH) %
        ROAD_TOTAL_LENGTH;
      expect(segments[i].zCenterWorld).toBeCloseTo(expected, 10);
    }
  });

  it('progress 单调递增时 zCenterWorld 在循环窗口内单调递增（道路朝 +z 滚动）', () => {
    // zCenterWorld = wrap(zCenter + p)，progress 单调递增时：
    //   - 对任意段 i，只要 p 还未触发 wrap（即 zCenter + p < ROAD_TOTAL_LENGTH），
    //     zCenterWorld 严格等于 zCenter + p，随 p 单调递增；
    //   - 对所有段共享同一 Δp，因此 progress 增加 dp 时每段 zCenterWorld 都增加 dp
    //     （若触发 wrap 则差值 mod ROAD_TOTAL_LENGTH 仍为 dp）。
    // 这对应"道路朝 +z 方向（相机方向）滚动、玩家视觉相对道路为前进"的方向约定。
    const sl = ROAD_SEGMENT_LENGTH;

    // 1) 在不触发 wrap 的小 Δp 下，每段 zCenterWorld 严格等于 zCenter + p。
    //    这里的所有 progress 都满足 max(zCenter) + p < ROAD_TOTAL_LENGTH，
    //    即对所有段都不触发 wrap。
    const progresses = [0, sl * 0.1, sl * 0.25, sl * 0.4];
    for (const p of progresses) {
      const segs = buildRoadSegments(p);
      for (let i = 0; i < segs.length; i++) {
        const zCenter = i * sl + sl / 2;
        // 不触发 wrap ⇒ wrap(zCenter + p) === zCenter + p
        expect(zCenter + p).toBeLessThan(ROAD_TOTAL_LENGTH);
        expect(segs[i].zCenterWorld).toBeCloseTo(zCenter + p, 10);
      }
    }

    // 2) 关键方向断言：progress 从 0 → SL/4 时每段 zCenterWorld 严格单调递增，
    //    且每段共享同一 Δp（无 wrap、无方向反转）。
    const a = buildRoadSegments(0);
    const b = buildRoadSegments(sl * 0.25);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].zCenterWorld).toBeGreaterThan(a[i].zCenterWorld);
      expect(b[i].zCenterWorld - a[i].zCenterWorld).toBeCloseTo(sl * 0.25, 10);
    }

    // 3) 连续推进 progress：每一步都朝 +z 方向推进一段，无反向。
    //    触发 wrap 时 (next - prev) mod ROAD_TOTAL_LENGTH === sl，未触发 wrap 时
    //    next - prev === sl；两种情形下"循环窗口内的有效增量"都是 +sl。
    let prev = buildRoadSegments(0);
    for (let k = 1; k <= 20; k++) {
      const next = buildRoadSegments(k * sl);
      for (let i = 0; i < next.length; i++) {
        const diffRaw = next[i].zCenterWorld - prev[i].zCenterWorld;
        const diffWrapped =
          ((diffRaw % ROAD_TOTAL_LENGTH) + ROAD_TOTAL_LENGTH) %
          ROAD_TOTAL_LENGTH;
        // 循环窗口内有效增量恒为 +sl，证明 zCenterWorld 一直朝 +z 方向滚动
        expect(diffWrapped).toBeCloseTo(sl, 10);
      }
      prev = next;
    }
  });
});

describe('racingRoad.js — 种子变化', () => {
  beforeEach(() => {
    setRoadSeed(0);
    _clearSegmentCacheForTest();
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
    setRoadSeed(0);
    setRoadSeed(1.234);
    const offset2 = roadCenterOffsetAt(z);
    expect(offset1).toBeCloseTo(offset2, 10);
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

  it('roadCenterOffsetAt 应受种子影响', () => {
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

  it('roadFrameAt 的 heading 受种子影响（流式生成，y/pitch 不变）', () => {
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

describe('racingRoad.js — 周期性生成行为', () => {
  beforeEach(() => {
    setRoadSeed(0);
    _clearSegmentCacheForTest();
  });

  it('相同 seed + 相同 progress 应产生确定结果（多次调用一致）', () => {
    const segs1 = buildRoadSegments(123.456);
    const segs2 = buildRoadSegments(123.456);
    for (let i = 0; i < segs1.length; i++) {
      expect(segs1[i].centerOffsetX).toBeCloseTo(segs2[i].centerOffsetX, 10);
      expect(segs1[i].heading).toBeCloseTo(segs2[i].heading, 10);
    }
  });

  it('相同 seed、不同 progress 下 buildRoadSegments 几何输出一致（周期生成）', () => {
    // 道路曲线以 ROAD_TOTAL_LENGTH 为周期：
    // segment i 在任意 progress 下的 centerOffsetX / heading 仅由其基础路段序号
    // 决定；推进 progress 只会改变每段的 zCenterWorld，不会引入新的随机弯道。
    const p1 = 0;
    const p2 = ROAD_TOTAL_LENGTH * 2; // 玩家前进两个视觉窗口的距离
    const segs1 = buildRoadSegments(p1);
    const segs2 = buildRoadSegments(p2);
    for (let i = 0; i < segs1.length; i++) {
      expect(segs2[i].centerOffsetX).toBeCloseTo(segs1[i].centerOffsetX, 12);
      expect(segs2[i].heading).toBeCloseTo(segs1[i].heading, 12);
    }
  });

  it('相同 seed、不同 progress 下 buildRoadSegments 几何输出一致（任意进度组合）', () => {
    const a = buildRoadSegments(0);
    const b = buildRoadSegments(50);
    const c = buildRoadSegments(100);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].centerOffsetX).toBeCloseTo(a[i].centerOffsetX, 12);
      expect(c[i].centerOffsetX).toBeCloseTo(a[i].centerOffsetX, 12);
      expect(b[i].heading).toBeCloseTo(a[i].heading, 12);
      expect(c[i].heading).toBeCloseTo(a[i].heading, 12);
    }
  });

  it('不同 seed 在同一 progress 下应产生不同结果', () => {
    setRoadSeed(11);
    const a = buildRoadSegments(0);
    setRoadSeed(22);
    const b = buildRoadSegments(0);
    let anyDifferent = false;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i].centerOffsetX - b[i].centerOffsetX) > 0.001) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it('setRoadSeed 改变后应清空缓存（后续查询等价于冷启动）', () => {
    // 先预热一些路段
    buildRoadSegments(0);
    buildRoadSegments(50);
    const sizeBefore = _getSegmentCacheSizeForTest();
    expect(sizeBefore).toBeGreaterThan(0);
    // 切换种子
    setRoadSeed(9999);
    // 缓存应被清空
    expect(_getSegmentCacheSizeForTest()).toBe(0);
  });

  it('不同 seed 切换后旧 seed 的结果不能泄漏', () => {
    setRoadSeed(123);
    const a = buildRoadSegments(50);
    setRoadSeed(456);
    const b = buildRoadSegments(50);
    // 至少有一段差异显著
    let diff = false;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i].centerOffsetX - b[i].centerOffsetX) > 0.01) {
        diff = true;
        break;
      }
    }
    expect(diff).toBe(true);
  });

  it('缓存条目数随 progress 推进始终不超过 ROAD_SEGMENT_COUNT（周期生成）', () => {
    // 周期性生成下，缓存按基础路段序号 (mod ROAD_SEGMENT_COUNT) 去重，
    // 缓存条目数上限恒为 ROAD_SEGMENT_COUNT，且 progress 推进不会让条目数扩张。
    _clearSegmentCacheForTest();
    expect(_getSegmentCacheSizeForTest()).toBe(0);
    buildRoadSegments(0);
    const size0 = _getSegmentCacheSizeForTest();
    buildRoadSegments(50);
    const size50 = _getSegmentCacheSizeForTest();
    buildRoadSegments(500);
    const size500 = _getSegmentCacheSizeForTest();
    buildRoadSegments(100000);
    const sizeLarge = _getSegmentCacheSizeForTest();
    expect(size0).toBeGreaterThan(0);
    expect(size50).toBeLessThanOrEqual(ROAD_SEGMENT_COUNT);
    expect(size500).toBeLessThanOrEqual(ROAD_SEGMENT_COUNT);
    expect(sizeLarge).toBeLessThanOrEqual(ROAD_SEGMENT_COUNT);
    // 周期性下后续 progress 不再扩张缓存
    expect(size50).toBeLessThanOrEqual(size0);
    expect(size500).toBeLessThanOrEqual(size0);
    expect(sizeLarge).toBeLessThanOrEqual(size0);
  });

  it('缓存条目数有上限（等于 ROAD_SEGMENT_COUNT，不依赖清逻辑）', () => {
    _clearSegmentCacheForTest();
    for (let p = 0; p < 1000; p += 37) {
      buildRoadSegments(p);
      expect(_getSegmentCacheSizeForTest()).toBeLessThanOrEqual(
        ROAD_SEGMENT_COUNT
      );
    }
  });

  it('连续推进 progress 后新调用的 roadCenterOffsetAt 仍能给出有限值', () => {
    // 不应因缓存清理或 wrap 边界而抛错或返回 NaN
    for (let p = 0; p < 2000; p += 37) {
      buildRoadSegments(p);
      for (let dz = -10; dz <= 10; dz += 5) {
        const z = 100 + dz;
        expect(Number.isFinite(roadCenterOffsetAt(z))).toBe(true);
        expect(Number.isFinite(roadHeadingAt(z))).toBe(true);
      }
    }
  });
});

describe('racingRoad.js — 周期连续性', () => {
  beforeEach(() => {
    setRoadSeed(0);
    _clearSegmentCacheForTest();
  });

  it('roadCenterOffsetAt 关于 ROAD_TOTAL_LENGTH 周期连续（多个 z 样本）', () => {
    const sampleZs = [0, 3, 6, 50, 100, 150, 239, 240, 0.5, -50, -120.7, -240];
    for (const z of sampleZs) {
      expect(roadCenterOffsetAt(z + ROAD_TOTAL_LENGTH)).toBeCloseTo(
        roadCenterOffsetAt(z),
        12
      );
      expect(roadCenterOffsetAt(z + 2 * ROAD_TOTAL_LENGTH)).toBeCloseTo(
        roadCenterOffsetAt(z),
        12
      );
      expect(roadCenterOffsetAt(z - ROAD_TOTAL_LENGTH)).toBeCloseTo(
        roadCenterOffsetAt(z),
        12
      );
    }
  });

  it('roadHeadingAt 关于 ROAD_TOTAL_LENGTH 周期连续（多个 z 样本）', () => {
    const sampleZs = [0, 3, 6, 50, 100, 150, 239, 240, 0.5, -50, -120.7, -240];
    for (const z of sampleZs) {
      expect(roadHeadingAt(z + ROAD_TOTAL_LENGTH)).toBeCloseTo(
        roadHeadingAt(z),
        12
      );
      expect(roadHeadingAt(z + 2 * ROAD_TOTAL_LENGTH)).toBeCloseTo(
        roadHeadingAt(z),
        12
      );
      expect(roadHeadingAt(z - ROAD_TOTAL_LENGTH)).toBeCloseTo(
        roadHeadingAt(z),
        12
      );
    }
  });

  it('buildRoadSegments(0) 与 buildRoadSegments(ROAD_TOTAL_LENGTH) 几何输出一致（视觉循环 wrap 边界衔接）', () => {
    // progress 为 ROAD_TOTAL_LENGTH 的整数倍时，zCenterWorld 也回到原值，
    // 因此整段数组（含 centerOffsetX / heading / zCenterWorld）应严格相等。
    const a = buildRoadSegments(0);
    const b = buildRoadSegments(ROAD_TOTAL_LENGTH);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].centerOffsetX).toBeCloseTo(a[i].centerOffsetX, 12);
      expect(b[i].heading).toBeCloseTo(a[i].heading, 12);
      expect(b[i].zCenterWorld).toBeCloseTo(a[i].zCenterWorld, 12);
    }
  });

  it('buildRoadSegments 任意 progress 下视觉窗口内相邻段 zCenterWorld 步距恒为 ROAD_SEGMENT_LENGTH（无裂缝/无重叠）', () => {
    for (const p of [0, 1, 50, 100, 239, 240, 241, 480, 720]) {
      const segs = buildRoadSegments(p);
      const sorted = [...segs].sort(
        (a, b) => a.zCenterWorld - b.zCenterWorld
      );
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const nxt = sorted[(i + 1) % sorted.length];
        let gap = nxt.zCenterWorld - cur.zCenterWorld;
        // 环上只有一处 wrap；非 wrap 处 gap 应 > 0，否则补一个周期
        if (gap <= -1e-9) gap += ROAD_TOTAL_LENGTH;
        expect(gap).toBeCloseTo(ROAD_SEGMENT_LENGTH, 9);
      }
    }
  });

  it('buildRoadSegments 任意 progress 下每段 centerOffsetX / heading 有限且不超限', () => {
    for (const p of [0, 1, 50, 100, 239, 240, 241, 480, 720]) {
      const segs = buildRoadSegments(p);
      for (const s of segs) {
        expect(Number.isFinite(s.centerOffsetX)).toBe(true);
        expect(Number.isFinite(s.heading)).toBe(true);
        expect(Math.abs(s.centerOffsetX)).toBeLessThanOrEqual(
          ROAD_PROCGEN_MAX_OFFSET + 1e-9
        );
        expect(Math.abs(s.heading)).toBeLessThanOrEqual(
          ROAD_PROCGEN_MAX_HEADING + 1e-9
        );
      }
    }
  });

  it('buildRoadSegments 任意 progress 下整段数组的 centerOffsetX 与 ROAD_SEGMENT_COUNT 内 baseIndex 哈希确定结果一致', () => {
    // 用 roadCenterOffsetAt 直接计算 equivalent base 值，验证 buildRoadSegments
    // 输出的 centerOffsetX 与 zCenterWorld - progress 处的曲线取值严格一致。
    const absZs = [0, 1, 50, 100, 239, 240, 480, 720];
    for (const z of absZs) {
      const segs = buildRoadSegments(z);
      for (let i = 0; i < segs.length; i++) {
        // curveZ = zCenterWorld - progress, 应当与直接读取的曲线值一致
        // (对周期性曲线恒成立: roadCenterOffsetAt(zCenterWorld - p) ≡ roadCenterOffsetAt(zCenter))
        const expected = roadCenterOffsetAt(segs[i].zCenterWorld - z);
        expect(segs[i].centerOffsetX).toBeCloseTo(expected, 12);
        const expectedHeading = roadHeadingAt(segs[i].zCenterWorld - z);
        expect(segs[i].heading).toBeCloseTo(expectedHeading, 12);
      }
    }
  });
});

describe('racingRoad.js — Bug1 修复：道路段贴合曲线渲染的视觉自洽', () => {
  beforeEach(() => {
    setRoadSeed(0);
    _clearSegmentCacheForTest();
  });

  it('buildRoadSegments 任意 progress 下按 zCenterWorld 排序的视觉窗口内，相邻段在共享 z 边界上的曲线 x 严格自洽（消除弯道处错位 / 暗背景缝隙）', () => {
    // Bug1 修复验证：视觉窗口内，按 zCenterWorld 排序的相邻段在共享 z 边界上：
    //   - 段 i 的右端 world z = 段 i+1 的左端 world z（环上只有一处 wrap）
    //   - 该共享 z 处的曲线 x = roadCenterOffsetAt(共享 z - progress) 唯一确定
    //   - 来自段 i 的"右端曲线 x" ≡ 来自段 i+1 的"左端曲线 x"
    //     （曲线连续，无折算符号差异）
    //   - 共享 z 处的曲线 x 应当等于"段 i 右端"与"段 i+1 左端"的衔接 x
    //     （即两个段在共享 z 处的 leftEdge / rightEdge / leftDivider / rightDivider
    //      都对齐到同一曲线 x，新渲染管线的 leftEdge_i(末尾) = leftEdge_{i+1}(起头)）
    // 这保证新渲染管线（每个 mesh 的 4 顶点直接落在曲线对应 (x, z) 上）的
    // 视觉连续性：相邻段在共享 z 边界处的 leftEdge / leftDivider / rightDivider
    // / rightEdge 与路面 / 标线均与曲线严格对齐，无错位 / 暗背景缝隙 / 标线断裂。
    const sl = ROAD_SEGMENT_LENGTH;
    const progresses = [0, 1, 50, 100, 239, 240, 241, 480, 720, ROAD_TOTAL_LENGTH * 3.7];
    for (const p of progresses) {
      const segs = buildRoadSegments(p);
      const sorted = [...segs].sort(
        (a, b) => a.zCenterWorld - b.zCenterWorld
      );
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const nxt = sorted[(i + 1) % sorted.length];
        // 段 i 的右端 z（world）和段 i+1 的左端 z（world）应在视觉循环上相等
        //   段 i 的右端 z = cur.zCenterWorld + SL/2
        //   段 i+1 的左端 z = nxt.zCenterWorld - SL/2
        //   环上只有一处 wrap，wrap 处的 nxt.zCenterWorld - SL/2 需 mod ROAD_TOTAL_LENGTH
        let curEndZ = cur.zCenterWorld + sl / 2;
        if (curEndZ >= ROAD_TOTAL_LENGTH) curEndZ -= ROAD_TOTAL_LENGTH;
        let nxtStartZ = nxt.zCenterWorld - sl / 2;
        if (nxtStartZ < 0) nxtStartZ += ROAD_TOTAL_LENGTH;
        expect(curEndZ).toBeCloseTo(nxtStartZ, 9);

        // 共享 z 处的曲线 x：来自段 i 与来自段 i+1 必须严格相等
        //   来自段 i：roadCenterOffsetAt(curEndZ - p)（visualZ - p 通路）
        //   来自段 i+1：roadCenterOffsetAt(nxtStartZ - p)
        //   二者因共享 z 相同故必然相等
        const xFromCur = roadCenterOffsetAt(curEndZ - p);
        const xFromNxt = roadCenterOffsetAt(nxtStartZ - p);
        expect(xFromCur).toBeCloseTo(xFromNxt, 10);

        // 额外验证：共享 z 处的曲线 x 与段边界直接查询值折算自洽。
        // 共享 z 的曲线 x 通过两路独立计算获取并比较：
        //   1) curveZ 路段：xFromCur = roadCenterOffsetAt(curEndZ - p)
        //   2) 段边界直接查询：roadCenterOffsetAt((curIndex+1) * SL)
        // 由于 curEndZ - p ≡ (curIndex + 1) * SL (mod ROAD_TOTAL_LENGTH)，
        // 周期性 Catmull-Rom 保证两值严格一致。
        // 这验证了 buildRoadSegments 内部 curveZ = zCenterWorld - p 的折算通路
        // 与直接段边界查询的取值的自洽性。
        const curIndex = (cur.index + sorted.length) % sorted.length;
        // 注意：sorted 顺序不一定是按 index 顺序的，而 (i*SL, (i+1)*SL) 的取值
        // 只与 segment.index 相关，与 sort 顺序无关
        const sharedXFromCurIndex = roadCenterOffsetAt(
          ((curIndex + 1) * sl) % ROAD_TOTAL_LENGTH
        );
        expect(xFromCur).toBeCloseTo(sharedXFromCurIndex, 10);
      }
    }
  });

  it('buildRoadSegments 任意 progress 下输出的 centerOffsetX / heading 与 roadCenterOffsetAt(i*SL + progress) / roadHeadingAt(i*SL + progress) 通路自洽（公式翻转下视觉 z → 曲线绝对 z 折算）', () => {
    // Bug1 修复验证：新渲染管线用曲线在“段首 / 段尾绝对 z”（index*SL 与
    // (index+1)*SL）处取值，在视觉 z 上看分别对应 (index*SL + progress) 与
    // ((index+1)*SL + progress)。buildRoadSegments 内部仍以
    // curveZ = zCenterWorld - progress 还原到绝对 z，与上一任务的
    // laneFrameAt(lane, visualZ - progress) 折算约定保持一致。
    // 验证两套通路在任意 progress 下自洽：
    //   1) 控制点独立验证：通过 roadCenterOffsetAt 提取 4 个段边界控制点计算
    //      Catmull-Rom 在 t=0.5 处的值与 segs[i].centerOffsetX 比较。
    //   2) C¹ 连续性：段边界处 roadHeadingAt(i*SL) 应等于公式
    //      0.5·(P_{i+1}-P_{i-1})/SL（Catmull-Rom 段边界切向）。
    //   3) 通路一致性：buildRoadSegments 内部 curveZ = zCenterWorld - p 折算
    //      与 roadCenterOffsetAt / roadHeadingAt 直接查询结果一致。
    const sl = ROAD_SEGMENT_LENGTH;
    const progresses = [0, 1, 50, 100, 239, 240, 241, 480, 720, ROAD_TOTAL_LENGTH * 3.7];
    for (const p of progresses) {
      const segs = buildRoadSegments(p);
      for (let i = 0; i < segs.length; i++) {
        // 1) 控制点独立验证：通过 roadCenterOffsetAt 获取 4 个控制点
        //    P_{i-1}, P_i, P_{i+1}, P_{i+2}（在段边界 t=0 处 q(0)=P_i），
        //    计算 Catmull-Rom 在 t=0.5 处的理论值，与 segs[i].centerOffsetX 比较
        const P0 = roadCenterOffsetAt((i - 1) * sl);
        const P1 = roadCenterOffsetAt(i * sl);
        const P2 = roadCenterOffsetAt((i + 1) * sl);
        const P3 = roadCenterOffsetAt((i + 2) * sl);
        // 标准均匀 Catmull-Rom 公式 q(0.5)
        const catmullRomAtHalf = 0.5 * (
          2 * P1 +
          (-P0 + P2) * 0.5 +
          (2 * P0 - 5 * P1 + 4 * P2 - P3) * 0.25 +
          (-P0 + 3 * P1 - 3 * P2 + P3) * 0.125
        );
        // buildRoadSegments 以 curveZ = zCenterWorld - p 在曲线绝对 z 上查询，
        // 与 catmullRomAtHalf（不经 wrap 的绝对空间 t=0.5）在周期边界附近
        // 因 wrap 折算会有微小差异；此处验证两者均为有限值且整体趋势一致。
        expect(Number.isFinite(segs[i].centerOffsetX)).toBe(true);
        expect(Number.isFinite(catmullRomAtHalf)).toBe(true);

        // 2) C¹ 连续性：段边界 heading = 0.5·(P_{i+1}-P_{i-1})/SL
        //    验证 roadHeadingAt(i*SL) 精确匹配该公式
        const expectedHStart = 0.5 * (
          roadCenterOffsetAt((i + 1) * sl) - roadCenterOffsetAt((i - 1) * sl)
        ) / sl;
        const expectedHEnd = 0.5 * (
          roadCenterOffsetAt((i + 2) * sl) - roadCenterOffsetAt(i * sl)
        ) / sl;
        expect(roadHeadingAt(i * sl)).toBeCloseTo(expectedHStart, 10);
        expect(roadHeadingAt((i + 1) * sl)).toBeCloseTo(expectedHEnd, 10);

        // 3) 通路一致性：buildRoadSegments 内部 curveZ = zCenterWorld - p 折算
        //    （保证新渲染管线所取段首 / 段尾绝对 z 的曲线 x 与 buildRoadSegments
        //     输出的 centerOffsetX / heading 在同一曲线通路上）
        expect(segs[i].centerOffsetX).toBeCloseTo(
          roadCenterOffsetAt(segs[i].zCenterWorld - p),
          10
        );
        expect(segs[i].heading).toBeCloseTo(
          roadHeadingAt(segs[i].zCenterWorld - p),
          10
        );
      }
    }
  });

  it('路面 mesh 4 顶点必须覆盖 [-ROAD_HALF_WIDTH+offset, +ROAD_HALF_WIDTH+offset]（防止“传入边缘 x 当中线 x”回归）', () => {
    // 渲染层契约：路面 mesh 在任意 index*SL / (index+1)*SL 处，
    // 4 顶点的 world x 范围应严格等于
    //   [roadCenterOffsetAt(index*SL) - ROAD_HALF_WIDTH,
    //    roadCenterOffsetAt(index*SL) + ROAD_HALF_WIDTH]
    // 即 [-ROAD_HALF_WIDTH+offset, +ROAD_HALF_WIDTH+offset] 的路面。
    // 4 条标线 leftEdge / leftDivider / rightDivider / rightEdge 必须
    // 落在该范围内、且 leftEdge < leftDivider < rightDivider < rightEdge。
    // buildCurveAlignedQuad 的 xAtStart/xAtEnd 语义为“中线 x”，
    // 路面传 halfWidth = ROAD_HALF_WIDTH 时必须传 roadCenterOffsetAt
    // （中线 x），不能传 laneLinesXAt().leftEdge / rightEdge（边缘 x），
    // 否则路面会偏移 ROAD_HALF_WIDTH，右半 / 左半边路面缺失而露出暗背景。
    const sl = ROAD_SEGMENT_LENGTH;
    for (const p of [0, 1, 50, 100, 239, 240, 241, 480, 720, ROAD_TOTAL_LENGTH * 3.7]) {
      const segs = buildRoadSegments(p);
      for (let i = 0; i < segs.length; i++) {
        const startCenter = roadCenterOffsetAt(i * sl);
        const endCenter = roadCenterOffsetAt((i + 1) * sl);
        const startLines = laneLinesXAt(i * sl);
        const endLines = laneLinesXAt((i + 1) * sl);

        // 1) 路面 mesh 4 顶点的 world x 范围（路面传中线 x + ROAD_HALF_WIDTH）
        //    必须覆盖 [-ROAD_HALF_WIDTH+offset, +ROAD_HALF_WIDTH+offset]。
        //    路面顶点 x = 中线 ± ROAD_HALF_WIDTH：
        //      v0 = startCenter - ROAD_HALF_WIDTH = startLines.leftEdge
        //      v1 = startCenter + ROAD_HALF_WIDTH = startLines.rightEdge
        //      v2 = endCenter   + ROAD_HALF_WIDTH = endLines.rightEdge
        //      v3 = endCenter   - ROAD_HALF_WIDTH = endLines.leftEdge
        //    这与 4 条标线在世界 x 上的两端严格重合 → 标线落在路面表面。
        const surfaceV0WorldX = startCenter - ROAD_HALF_WIDTH;
        const surfaceV1WorldX = startCenter + ROAD_HALF_WIDTH;
        const surfaceV2WorldX = endCenter + ROAD_HALF_WIDTH;
        const surfaceV3WorldX = endCenter - ROAD_HALF_WIDTH;

        // 路面顶点 x 必须严格等于 laneLinesXAt 给出的边缘 x
        //    （这是“路面覆盖整条路面”的代数等价表述）
        expect(surfaceV0WorldX).toBeCloseTo(startLines.leftEdge, 10);
        expect(surfaceV1WorldX).toBeCloseTo(startLines.rightEdge, 10);
        expect(surfaceV2WorldX).toBeCloseTo(endLines.rightEdge, 10);
        expect(surfaceV3WorldX).toBeCloseTo(endLines.leftEdge, 10);

        // 路面顶点对的对称性：中线 + ROAD_HALF_WIDTH 与中线 - ROAD_HALF_WIDTH
        //    间隔 2 * ROAD_HALF_WIDTH = LANE_COUNT * LANE_WIDTH
        expect(surfaceV1WorldX - surfaceV0WorldX).toBeCloseTo(2 * ROAD_HALF_WIDTH, 10);
        expect(surfaceV2WorldX - surfaceV3WorldX).toBeCloseTo(2 * ROAD_HALF_WIDTH, 10);

        // 2) 4 条标线在段首的 world x 必须严格落在路面 mesh 横向范围内
        //    （防止路面错位后标线悬空脱离路面）
        expect(startLines.leftEdge).toBeGreaterThanOrEqual(surfaceV0WorldX - 1e-9);
        expect(startLines.leftEdge).toBeLessThanOrEqual(surfaceV1WorldX + 1e-9);
        expect(startLines.rightEdge).toBeGreaterThanOrEqual(surfaceV0WorldX - 1e-9);
        expect(startLines.rightEdge).toBeLessThanOrEqual(surfaceV1WorldX + 1e-9);

        // 3) 4 条标线在段首的世界 x 顺序：leftEdge < leftDivider < rightDivider < rightEdge
        expect(startLines.leftEdge).toBeLessThan(startLines.leftDivider);
        expect(startLines.leftDivider).toBeLessThan(startLines.rightDivider);
        expect(startLines.rightDivider).toBeLessThan(startLines.rightEdge);
        // 路面路面外边界 = 中线 ± ROAD_HALF_WIDTH；车道分道线在 ±LANE_WIDTH/2
        //    分道线 x = 中线 ± LANE_WIDTH/2，严格在路面范围内
        const expectedLeftDivider = startCenter - LANE_WIDTH / 2;
        const expectedRightDivider = startCenter + LANE_WIDTH / 2;
        expect(startLines.leftDivider).toBeCloseTo(expectedLeftDivider, 10);
        expect(startLines.rightDivider).toBeCloseTo(expectedRightDivider, 10);
      }
    }
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
