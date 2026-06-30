/**
 * racingRoad.js — 极简蜿蜒道路几何模块
 *
 * 道路几何以 ROAD_SEGMENT_COUNT 为周期，使用 Catmull-Rom 样条在预计算的
 * 控制点之间插值，产生 C¹ 连续的道路中心线。控制点由种子驱动伪随机生成，
 * 相同种子产生完全相同的结果。所有曲线函数以 ROAD_TOTAL_LENGTH 为周期：
 *   roadCenterOffsetAt(z) === roadCenterOffsetAt(z + ROAD_TOTAL_LENGTH)
 *
 * 坐标系：x 水平（左负右正），y 垂直（本模块平坦），z 纵深（远处为正）。
 * 道路沿 +z 方向延伸；progress 单调递增表示玩家前进。
 */

/* ── 基本参数 ── */

export const LANE_COUNT = 3;
export const LANE_WIDTH = 4;

/** 三条车道中心 x 坐标（道路局部坐标系） */
export const LANE_CENTER_X = Object.freeze([-LANE_WIDTH, 0, LANE_WIDTH]);

/** 道路总半宽 */
export const ROAD_HALF_WIDTH = (LANE_WIDTH * LANE_COUNT) / 2;

/* ── 道路分段参数 ── */

/** 视觉窗口总长（也是道路曲线周期） */
export const ROAD_TOTAL_LENGTH = 240;
export const ROAD_SEGMENT_COUNT = 40;
export const ROAD_SEGMENT_LENGTH = ROAD_TOTAL_LENGTH / ROAD_SEGMENT_COUNT;

/* ── 流式生成参数 ── */

/** 控制点偏移最大绝对值 */
export const ROAD_PROCGEN_MAX_OFFSET = 2.0;

/** 单段内 heading 最大绝对值（Catmull-Rom 导数上界） */
export const ROAD_PROCGEN_MAX_HEADING =
  (3 * ROAD_PROCGEN_MAX_OFFSET) / ROAD_SEGMENT_LENGTH;

/**
 * 保留以兼容旧调用方与测试。周期性生成下无用。
 * @deprecated
 */
export const ROAD_PROCGEN_CACHE_BUFFER = 60;

/* ── 辅助常量（内部） ── */

/** 相邻控制点最大绝对差值，避免急转弯 */
const _MAX_ADJACENT_DIFF = 4.0;

/**
 * 控制点钳制系数。Catmull-Rom 在控制点交替取极值时插值可能略微超界，
 * 此系数将控制点范围缩小到 ±MAX_OFFSET*_CLAMP_FACTOR，
 * 保证样条输出始终在 ±MAX_OFFSET 内。
 */
const _CLAMP_FACTOR = 0.9;

/* ── 道路种子 ── */

let _roadSeed = 0;

export function getRoadSeed() {
  return _roadSeed;
}

export function setRoadSeed(seed) {
  const next = Number.isFinite(seed) ? seed : 0;
  if (next !== _roadSeed) {
    _roadSeed = next;
    _resetCache();
  }
}

/* ── 缓存 ── */

const _segmentCache = new Map();
let _controlPoints = null;

function _resetCache() {
  _segmentCache.clear();
  _controlPoints = null;
}

/* ── 伪随机数生成 ── */

function _hash(seed, idx) {
  let h = ((seed | 0) ^ Math.imul(idx | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function _makeRng(seed32) {
  let a = seed32 | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 控制点生成 ── */

/**
 * 预计算 ROAD_SEGMENT_COUNT 个控制点。
 * 每个点由 PRNG 在 [-MAX_OFFSET, MAX_OFFSET] 内采样，经钳制和相邻差
 * 限制后存储。首次访问时自动触发。
 */
function _precomputeControlPoints() {
  const pts = new Array(ROAD_SEGMENT_COUNT);
  const rng = _makeRng(_hash(_roadSeed, 0));
  const clampVal = ROAD_PROCGEN_MAX_OFFSET * _CLAMP_FACTOR;

  pts[0] = (rng() - 0.5) * 2 * ROAD_PROCGEN_MAX_OFFSET;
  pts[0] = Math.max(-clampVal, Math.min(clampVal, pts[0]));

  for (let i = 1; i < ROAD_SEGMENT_COUNT; i++) {
    let val = (rng() - 0.5) * 2 * ROAD_PROCGEN_MAX_OFFSET;
    val = Math.max(-clampVal, Math.min(clampVal, val));

    const diff = val - pts[i - 1];
    if (Math.abs(diff) > _MAX_ADJACENT_DIFF) {
      val = pts[i - 1] + Math.sign(diff) * _MAX_ADJACENT_DIFF;
    }

    pts[i] = val;
  }

  _controlPoints = pts;
}

/* ── 路段缓存 ── */

function _ensureSegment(idx) {
  const baseIdx =
    ((idx % ROAD_SEGMENT_COUNT) + ROAD_SEGMENT_COUNT) % ROAD_SEGMENT_COUNT;
  let data = _segmentCache.get(baseIdx);
  if (data) return data;
  if (!_controlPoints) _precomputeControlPoints();
  data = { centerOffsetX: _controlPoints[baseIdx] };
  _segmentCache.set(baseIdx, data);
  return data;
}

/* ── Catmull-Rom 样条 ── */

function _catmullRom(t, p0, p1, p2, p3) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function _catmullRomDeriv(t, p0, p1, p2, p3) {
  const t2 = t * t;
  return 0.5 * (
    (-p0 + p2) +
    2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
    3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2
  );
}

function _clampT(tRaw) {
  return tRaw <= 0 ? 0 : tRaw >= 1 ? 1 - 1e-9 : tRaw;
}

/* ── 道路曲线函数 ── */

export function roadCenterOffsetAt(z) {
  if (!Number.isFinite(z)) return 0;
  const sl = ROAD_SEGMENT_LENGTH;
  const idx = Math.floor(z / sl);
  const t = _clampT((z - idx * sl) / sl);
  const p0 = _ensureSegment(idx - 1).centerOffsetX;
  const p1 = _ensureSegment(idx).centerOffsetX;
  const p2 = _ensureSegment(idx + 1).centerOffsetX;
  const p3 = _ensureSegment(idx + 2).centerOffsetX;
  return _catmullRom(t, p0, p1, p2, p3);
}

export function roadHeadingAt(z) {
  if (!Number.isFinite(z)) return 0;
  const sl = ROAD_SEGMENT_LENGTH;
  const idx = Math.floor(z / sl);
  const t = _clampT((z - idx * sl) / sl);
  const p0 = _ensureSegment(idx - 1).centerOffsetX;
  const p1 = _ensureSegment(idx).centerOffsetX;
  const p2 = _ensureSegment(idx + 1).centerOffsetX;
  const p3 = _ensureSegment(idx + 2).centerOffsetX;
  return _catmullRomDeriv(t, p0, p1, p2, p3) / sl;
}

export function roadElevationAt(z) {
  if (!Number.isFinite(z)) return 0;
  return 0;
}

export function roadPitchAt(z) {
  if (!Number.isFinite(z)) return 0;
  return 0;
}

export function roadNormalAt(z) {
  if (!Number.isFinite(z)) return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 1, z: 0 };
}

export function roadFrameAt(z) {
  if (!Number.isFinite(z)) {
    return { x: 0, y: 0, heading: 0, pitch: 0, normal: { x: 0, y: 1, z: 0 } };
  }
  return {
    x: roadCenterOffsetAt(z),
    y: roadElevationAt(z),
    heading: roadHeadingAt(z),
    pitch: roadPitchAt(z),
    normal: roadNormalAt(z),
  };
}

export function laneFrameAt(laneIndex, z) {
  const frame = roadFrameAt(z);
  const idx =
    Number.isInteger(laneIndex) && laneIndex >= 0 && laneIndex < LANE_COUNT
      ? laneIndex
      : 1;
  return {
    x: LANE_CENTER_X[idx] + frame.x,
    y: frame.y,
    heading: frame.heading,
    pitch: frame.pitch,
    normal: frame.normal,
  };
}

/* ── 车道坐标 ── */

export function laneCenterXAt(laneIndex, z) {
  const idx =
    Number.isInteger(laneIndex) && laneIndex >= 0 && laneIndex < LANE_COUNT
      ? laneIndex
      : 1;
  return LANE_CENTER_X[idx] + roadCenterOffsetAt(z);
}

export function laneLinesXAt(z = 0) {
  const offset = roadCenterOffsetAt(z);
  return {
    leftEdge: -ROAD_HALF_WIDTH + offset,
    leftDivider: (LANE_CENTER_X[0] + LANE_CENTER_X[1]) / 2 + offset,
    rightDivider: (LANE_CENTER_X[1] + LANE_CENTER_X[2]) / 2 + offset,
    rightEdge: ROAD_HALF_WIDTH + offset,
  };
}

/* ── 道路滚动 ── */

export function wrapRoadZ(z) {
  const total = ROAD_TOTAL_LENGTH;
  if (total <= 0) return 0;
  const v = Number(z);
  if (!Number.isFinite(v)) return 0;
  let r = v % total;
  if (r < 0) r += total;
  return r;
}

export function advanceRoadProgress(progress, deltaSeconds, speed) {
  const ds = Math.max(0, Number(deltaSeconds) || 0);
  const sp = Math.max(0, Number(speed) || 0);
  return (Number(progress) || 0) + ds * sp;
}

/* ── 路段数组 ── */

export function buildRoadSegments(progress = 0) {
  const p = Number(progress) || 0;
  const halfLen = ROAD_SEGMENT_LENGTH / 2;
  const segments = new Array(ROAD_SEGMENT_COUNT);

  for (let i = 0; i < ROAD_SEGMENT_COUNT; i++) {
    const zCenter = i * ROAD_SEGMENT_LENGTH + halfLen;
    const zCenterWorld = wrapRoadZ(zCenter + p);
    const curveZ = zCenterWorld - p;

    segments[i] = {
      index: i,
      zStart: i * ROAD_SEGMENT_LENGTH,
      zEnd: (i + 1) * ROAD_SEGMENT_LENGTH,
      zCenter,
      zCenterWorld,
      centerOffsetX: roadCenterOffsetAt(curveZ),
      elevation: 0,
      heading: roadHeadingAt(curveZ),
      pitch: 0,
      length: ROAD_SEGMENT_LENGTH,
      halfWidth: ROAD_HALF_WIDTH,
    };
  }

  return segments;
}

/* ── 测试辅助 ── */

export function _getSegmentCacheSizeForTest() {
  return _segmentCache.size;
}

export function _clearSegmentCacheForTest() {
  _resetCache();
}
