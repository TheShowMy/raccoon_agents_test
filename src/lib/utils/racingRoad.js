/**
 * 3D 越野车竞速 — 蜿蜒道路与三条车道模块
 *
 * 道路几何采用「流式 procedural 生成」：
 *   - 内部维护一个按"路段序号 (segmentIndex)"索引的缓存 _segmentCache
 *   - 每次 roadCenterOffsetAt(z) / roadHeadingAt(z) 根据绝对 z 算出所属路段，
 *     缺失的路段会按 (seed, segmentIndex) 哈希出的 PRNG 立即生成并写入缓存
 *   - 缓存中离"光标"（已生成的最大路段序号）较远的旧路段会被自动清理
 *   - 调用 setRoadSeed 会清空缓存，让新种子驱动出全新形态
 *
 * 道路不再"开局一次性按周期函数铺设"——同一局游戏中，玩家前进行驶时，
 * 原本未知的绝对 z 会触发新路段生成，玩家看到的就是源源不断的新弯道。
 *
 * 对外接口（roadCenterOffsetAt / roadHeadingAt / laneFrameAt /
 * buildRoadSegments / roadFrameAt / laneCenterXAt 等）仍按世界 z 坐标输入，
 * 调用方无需感知内部缓存。
 *
 * 坐标系约定：
 *   x — 水平方向（左负右正）
 *   y — 垂直方向（本模块不直接使用，由渲染层处理）
 *   z — 纵深方向，远处为正（+z），玩家位于 z = 0，面向 -z 方向观看
 *
 * 道路沿 +z 方向无限延伸；"道路后退"通过 progress 累计表示：
 *   progress 单调递增，对应整条道路相对世界坐标系向 -z 方向移动的距离。
 *   渲染层每帧只需读取最新的 progress，即可由本模块派生出所有几何参数。
 *
 * 高程与坡度：当前实现保持赛道完全平坦（elevation = pitch = 0）。
 */

/* ===================================================================
   道路与车道基本参数
   =================================================================== */

/** 三条车道总数 */
export const LANE_COUNT = 3;

/** 单条车道宽度（世界单位） */
export const LANE_WIDTH = 4;

/**
 * 三条车道中心 x 坐标（道路局部坐标系，尚未叠加曲线偏移）
 * 从左到右：左车道、中车道、右车道
 */
export const LANE_CENTER_X = Object.freeze([
  -LANE_WIDTH,
  0,
  LANE_WIDTH,
]);

/** 道路总半宽（左右边缘到中线的距离，世界单位） */
export const ROAD_HALF_WIDTH = (LANE_WIDTH * LANE_COUNT) / 2;

/* ===================================================================
   道路分段
   =================================================================== */

/**
 * 视觉窗口总长（沿 z 方向，世界单位）。
 * 渲染层按 ROAD_SEGMENT_COUNT 段覆盖此长度的窗口；该值在流式生成下不再
 * 决定道路"循环周期"，仅作为可视窗口长度，保留以兼容旧调用方对
 * "zStart / zEnd 连续覆盖整段" 的测试与视觉假设。
 */
export const ROAD_TOTAL_LENGTH = 240;

/** 道路分段数 */
export const ROAD_SEGMENT_COUNT = 40;

/** 单段道路长度（ROAD_TOTAL_LENGTH / ROAD_SEGMENT_LENGTH 应为整数） */
export const ROAD_SEGMENT_LENGTH = ROAD_TOTAL_LENGTH / ROAD_SEGMENT_COUNT;

/* ===================================================================
   流式生成参数
   =================================================================== */

/**
 * 每个路段中心偏移 x 的最大绝对值（世界单位）。
 * 相邻两段 centerOffsetX 之差最大为 2 * ROAD_PROCGEN_MAX_OFFSET，
 * 因此单段内 heading 的最大绝对值为：
 *   ROAD_PROCGEN_MAX_HEADING = 2 * ROAD_PROCGEN_MAX_OFFSET / ROAD_SEGMENT_LENGTH
 */
export const ROAD_PROCGEN_MAX_OFFSET = 6;

/** 单段内 heading 的最大绝对值（由上述公式推导） */
export const ROAD_PROCGEN_MAX_HEADING =
  (2 * ROAD_PROCGEN_MAX_OFFSET) / ROAD_SEGMENT_LENGTH;

/**
 * 缓存中保留的路段数（围绕已生成的最大路段序号向"过去"方向保留的窗口大小）。
 * 缓存条目数超过 2 * BUFFER 时触发清理：删除 < (highestIdx - BUFFER) 的条目。
 * 选 60 段（≈ 360 世界单位）足够覆盖 40 段视觉窗口 + 玩家前置 look-ahead。
 */
export const ROAD_PROCGEN_CACHE_BUFFER = 60;

/* ===================================================================
   道路种子与随机化
   =================================================================== */

/** 当前道路种子，默认为 0 */
let _roadSeed = 0;

/**
 * 获取当前道路种子
 * @returns {number} 当前种子值
 */
export function getRoadSeed() {
  return _roadSeed;
}

/**
 * 设置道路种子。种子改变会清空路段缓存，让新种子驱动出全新的道路形态。
 * 相同种子下，多次调用将产生完全确定的结果。
 *
 * @param {number} seed - 种子值（任意整数或浮点数）
 */
export function setRoadSeed(seed) {
  const next = Number.isFinite(seed) ? seed : 0;
  if (next !== _roadSeed) {
    _roadSeed = next;
    _resetSegmentCache();
  }
}

/* ===================================================================
   流式路段缓存（内部状态）
   =================================================================== */

/**
 * 已生成路段缓存：segmentIndex -> { centerOffsetX }
 * 每个路段存储一个随机但确定（基于 seed + segmentIndex 哈希）的中心偏移。
 */
const _segmentCache = new Map();

/** 缓存中最大的 segmentIndex（用于"光标"推进） */
let _cachedHighestIdx = -1;

/** 缓存中最小的 segmentIndex（用于调试 / 避免越界删除时误清） */
let _cachedLowestIdx = Infinity;

/**
 * 清空路段缓存并重置光标。在 setRoadSeed 改变种子时调用，
 * 也可由测试在重置环境时显式调用。
 */
function _resetSegmentCache() {
  _segmentCache.clear();
  _cachedHighestIdx = -1;
  _cachedLowestIdx = Infinity;
}

/**
 * 哈希函数：将 (seed, segmentIndex) 混合为 32 位整数，
 * 用作 PRNG 的种子。种子或序号任一变化都会大幅改变输出。
 */
function _hashSeedIndex(seed, idx) {
  let h = ((seed | 0) ^ Math.imul(idx | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Mulberry32 PRNG：基于 32 位种子返回 [0, 1) 的伪随机数。
 * 相比 Math.random 的优势是完全确定性，便于测试与可重现回放。
 */
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

/**
 * 为指定路段序号生成基础数据（仅 centerOffsetX）。
 * 每次对同一 (seed, idx) 调用结果完全一致。
 */
function _generateSegmentData(idx) {
  const rng = _makeRng(_hashSeedIndex(_roadSeed, idx));
  // 取第一个 PRNG 值并映射到 [-MAX, +MAX]
  const u = rng();
  return {
    centerOffsetX: (u - 0.5) * 2 * ROAD_PROCGEN_MAX_OFFSET,
  };
}

/**
 * 取指定路段的数据，缺失则按 (seed, idx) 即时生成并写入缓存。
 * 缓存超容时按"光标 - BUFFER"为界清理掉更早的路段，限制内存占用。
 */
function _ensureSegment(idx) {
  let data = _segmentCache.get(idx);
  if (data) return data;
  data = _generateSegmentData(idx);
  _segmentCache.set(idx, data);
  if (idx > _cachedHighestIdx) _cachedHighestIdx = idx;
  if (idx < _cachedLowestIdx) _cachedLowestIdx = idx;
  // 缓存超容时清理：保留 [highestIdx - BUFFER, highestIdx] 范围附近
  if (_segmentCache.size > ROAD_PROCGEN_CACHE_BUFFER * 2) {
    const minKeep = _cachedHighestIdx - ROAD_PROCGEN_CACHE_BUFFER;
    if (minKeep > _cachedLowestIdx) {
      for (const k of _segmentCache.keys()) {
        if (k < minKeep) _segmentCache.delete(k);
      }
      _cachedLowestIdx = minKeep;
    }
  }
  return data;
}

/* ===================================================================
   蜿蜒曲线函数
   =================================================================== */

/**
 * 计算道路中心线在指定 z 处的水平偏移 x
 * 在流式生成下，每个 segmentIndex 拥有一个随机中心偏移，
 * 任意 z 通过"所在段 → 下一段"的线性插值得到连续结果。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 道路中心线在 z 处的 x 偏移
 */
export function roadCenterOffsetAt(z) {
  if (!Number.isFinite(z)) return 0;
  const zz = Number(z);
  const sl = ROAD_SEGMENT_LENGTH;
  const idx = Math.floor(zz / sl);
  // 把 z 落在 [idx*sl, (idx+1)*sl) 的局部参数 t
  const tRaw = (zz - idx * sl) / sl;
  // 钳制避免浮点边界上出现 t 越界
  const t = tRaw <= 0 ? 0 : tRaw >= 1 ? 1 - 1e-9 : tRaw;
  const segA = _ensureSegment(idx);
  const segB = _ensureSegment(idx + 1);
  return segA.centerOffsetX * (1 - t) + segB.centerOffsetX * t;
}

/**
 * 计算道路中心线在指定 z 处的切线斜率（弧度）
 * 在流式生成下，段内为线性插值，因此斜率（heading）在一段内为常量：
 *   heading = (segB.centerOffsetX - segA.centerOffsetX) / ROAD_SEGMENT_LENGTH
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 切线方向角（弧度，正值为绕 +y 轴左转）
 */
export function roadHeadingAt(z) {
  if (!Number.isFinite(z)) return 0;
  const zz = Number(z);
  const sl = ROAD_SEGMENT_LENGTH;
  const idx = Math.floor(zz / sl);
  const segA = _ensureSegment(idx);
  const segB = _ensureSegment(idx + 1);
  return (segB.centerOffsetX - segA.centerOffsetX) / sl;
}

/**
 * 计算道路中心线在指定 z 处的高程（y 坐标）
 * 当前实现保持赛道完全平坦。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 道路中心线在 z 处的高程（始终为 0）
 */
export function roadElevationAt(z) {
  if (!Number.isFinite(z)) return 0;
  return 0;
}

/**
 * 计算道路中心线在指定 z 处的俯仰角（弧度）
 * 当前实现保持赛道完全平坦。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 俯仰角（始终为 0）
 */
export function roadPitchAt(z) {
  if (!Number.isFinite(z)) return 0;
  return 0;
}

/**
 * 计算道路中心线在指定 z 处的法线向量
 * 平坦赛道下恒为 (0, 1, 0)，指向上方。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {{ x: number, y: number, z: number }} 单位法线向量
 */
export function roadNormalAt(z) {
  if (!Number.isFinite(z)) return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 1, z: 0 };
}

/**
 * 获取道路在指定 z 处的完整坐标系框架
 * 返回道路中心线的位置、方向和法线，可用于将车辆/物体对齐到路面。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {{ x: number, y: number, heading: number, pitch: number, normal: { x: number, y: number, z: number } }}
 */
export function roadFrameAt(z) {
  if (!Number.isFinite(z)) {
    return {
      x: 0,
      y: 0,
      heading: 0,
      pitch: 0,
      normal: { x: 0, y: 1, z: 0 },
    };
  }
  const zz = Number(z);
  return {
    x: roadCenterOffsetAt(zz),
    y: roadElevationAt(zz),
    heading: roadHeadingAt(zz),
    pitch: roadPitchAt(zz),
    normal: roadNormalAt(zz),
  };
}

/**
 * 获取指定车道在指定 z 处的完整坐标系框架
 * 车道 frame 的 x 位置已叠加道路中心线偏移，y 为道路高程。
 *
 * @param {number} laneIndex - 车道索引，0=左车道、1=中车道、2=右车道
 * @param {number} z - 世界 z 坐标
 * @returns {{ x: number, y: number, heading: number, pitch: number, normal: { x: number, y: number, z: number } }}
 */
export function laneFrameAt(laneIndex, z) {
  const frame = roadFrameAt(z);
  const idx = Number.isInteger(laneIndex) && laneIndex >= 0 && laneIndex < LANE_COUNT
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

/* ===================================================================
   车道坐标
   =================================================================== */

/**
 * 给定车道索引与 z，返回该车道中心在世界中的 x 坐标
 * （已叠加蜿蜒曲线偏移）
 *
 * @param {number} laneIndex - 车道索引，0=左车道、1=中车道、2=右车道
 * @param {number} z - 世界 z 坐标
 * @returns {number} 该车道中心在 (z) 处的 x 坐标；越界车道回退到中车道
 */
export function laneCenterXAt(laneIndex, z) {
  const idx = Number.isInteger(laneIndex) && laneIndex >= 0 && laneIndex < LANE_COUNT
    ? laneIndex
    : 1;
  return LANE_CENTER_X[idx] + roadCenterOffsetAt(z);
}

/**
 * 返回当前道路在指定 z 处的边缘与车道分隔线 x 坐标
 * 包含两条外边缘与两条车道分隔线，渲染层可直接用于绘制路面与标线。
 *
 * @param {number} [z=0] - 世界 z 坐标
 * @returns {{ leftEdge: number, leftDivider: number, rightDivider: number, rightEdge: number }}
 */
export function laneLinesXAt(z = 0) {
  const offset = roadCenterOffsetAt(z);
  return {
    leftEdge: -ROAD_HALF_WIDTH + offset,
    leftDivider: (LANE_CENTER_X[0] + LANE_CENTER_X[1]) / 2 + offset,
    rightDivider: (LANE_CENTER_X[1] + LANE_CENTER_X[2]) / 2 + offset,
    rightEdge: ROAD_HALF_WIDTH + offset,
  };
}

/* ===================================================================
   道路后退滚动
   =================================================================== */

/**
 * 将 z 坐标折算到 [0, ROAD_TOTAL_LENGTH) 区间
 * 在流式生成下，道路不再有真实循环周期；该函数仍保留以兼容旧调用方
 * 的"模运算"语义（事实上等价于对窗口长度的取模）。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 折算后等价 z
 */
export function wrapRoadZ(z) {
  const total = ROAD_TOTAL_LENGTH;
  if (total <= 0) return 0;
  const v = Number(z);
  if (!Number.isFinite(v)) return 0;
  let r = v % total;
  if (r < 0) r += total;
  return r;
}

/**
 * 给定当前 progress、时间增量与移动速度，返回新的 progress
 * （progress 单调递增，对应道路整体向 -z 方向后退的距离）
 *
 * @param {number} progress - 当前滚动进度（z 单位）
 * @param {number} deltaSeconds - 上一帧经过的秒数（负值会被钳为 0）
 * @param {number} speed - 当前移动速度（z 单位/秒），负值会被钳为 0
 * @returns {number} 新的滚动进度
 */
export function advanceRoadProgress(progress, deltaSeconds, speed) {
  const ds = Math.max(0, Number(deltaSeconds) || 0);
  const sp = Math.max(0, Number(speed) || 0);
  return (Number(progress) || 0) + ds * sp;
}

/* ===================================================================
   路段数组
   =================================================================== */

/**
 * 构建道路分段数组，每段包含渲染所需的全部几何参数
 *
 * 在流式生成下：
 *   - 每段对应一个固定的"索引 z"（zCenter = i * SL + halfLen），代表该路段
 *     在缓存中的稳定身份。路段身份与曲线查询都用这个 z。
 *   - 视觉 z（zCenterWorld）= wrapRoadZ(zCenter - progress)，随 progress 推进
 *     在 [0, ROAD_TOTAL_LENGTH) 区间内循环 wrap，对应"赛道在玩家眼前持续后退、
 *     路段源源不断从前方进入视野"的视觉感受，与旧实现保持一致。
 *   - 曲线查询（centerOffsetX / heading）使用未 wrap 的绝对 z = zCenter + progress，
 *     因此 progress 推进时，曲线对应到越来越远的绝对 z，原本未在缓存中的前方
 *     路段会被 _ensureSegment 即时生成，让玩家感到"前方出现新的随机弯道"。
 *   - 同 index 的路段在不同 progress 下的视觉 z 会绕回到相近位置，但其曲线
 *     由绝对 z 决定，每一圈都不相同，从而兼顾"循环滚动"与"非周期内容"。
 *
 * @param {number} [progress=0] - 当前道路滚动进度
 * @returns {Array<{
 *   index: number,
 *   zStart: number,
 *   zEnd: number,
 *   zCenter: number,
 *   zCenterWorld: number,
 *   centerOffsetX: number,
 *   elevation: number,
 *   heading: number,
 *   pitch: number,
 *   length: number,
 *   halfWidth: number
 * }>} 长度恒为 ROAD_SEGMENT_COUNT 的分段数组
 */
export function buildRoadSegments(progress = 0) {
  const p = Number(progress) || 0;
  const halfLen = ROAD_SEGMENT_LENGTH / 2;
  const segments = new Array(ROAD_SEGMENT_COUNT);
  for (let i = 0; i < ROAD_SEGMENT_COUNT; i++) {
    const zCenter = i * ROAD_SEGMENT_LENGTH + halfLen;
    // 视觉 z 与旧实现保持一致：随 progress 推进在 [0, ROAD_TOTAL_LENGTH) 内
    // 循环 wrap，让玩家感到"赛道在持续后退"。
    const zCenterWorld = wrapRoadZ(zCenter - p);
    // 曲线查询使用未 wrap 的绝对 z：随 progress 推进，绝对 z 持续增长，
    // 触发 _ensureSegment 即时生成新的随机路段。
    const absZ = zCenter + p;
    segments[i] = {
      index: i,
      zStart: i * ROAD_SEGMENT_LENGTH,
      zEnd: (i + 1) * ROAD_SEGMENT_LENGTH,
      zCenter,
      zCenterWorld,
      centerOffsetX: roadCenterOffsetAt(absZ),
      elevation: 0,
      heading: roadHeadingAt(absZ),
      pitch: 0,
      length: ROAD_SEGMENT_LENGTH,
      halfWidth: ROAD_HALF_WIDTH,
    };
  }
  return segments;
}

/* ===================================================================
   内部辅助：暴露给测试用（不构成对外契约）
   =================================================================== */

/**
 * 返回当前缓存中已生成的路段数量。供测试断言"流式生成在
 * progress 推进时确实新增了路段"，仅用于单测，不要在生产代码中依赖。
 *
 * @returns {number} 缓存中 _segmentCache 的条目数
 */
export function _getSegmentCacheSizeForTest() {
  return _segmentCache.size;
}

/**
 * 显式清空流式路段缓存。供测试在断言之间隔离状态使用。
 */
export function _clearSegmentCacheForTest() {
  _resetSegmentCache();
}
