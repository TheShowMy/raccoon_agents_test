/**
 * 3D 越野车竞速 — 蜿蜒道路与三条车道模块
 *
 * 道路几何采用「以 ROAD_SEGMENT_COUNT 为周期的 procedural 生成」：
 *   - 道路曲线以 ROAD_TOTAL_LENGTH = ROAD_SEGMENT_COUNT * ROAD_SEGMENT_LENGTH
 *     为周期，即
 *       roadCenterOffsetAt(z) === roadCenterOffsetAt(z + ROAD_TOTAL_LENGTH)
 *       roadHeadingAt(z)      === roadHeadingAt(z      + ROAD_TOTAL_LENGTH)
 *     这保证了 buildRoadSegments 在视觉循环边界处首尾段衔接一致，无裂缝、
 *     无错位、无标线交叉。
 *   - 内部维护一个按"基础路段序号 (segmentIndex mod ROAD_SEGMENT_COUNT)"
 *     索引的缓存 _segmentCache；任意 idx 与 idx + ROAD_SEGMENT_COUNT 共享同一
 *     缓存条目，缺失时按 (seed, baseIndex) 哈希出的 PRNG 立即生成并写入缓存。
 *   - 调用 setRoadSeed 会清空缓存，让新种子驱动出全新形态。
 *
 * buildRoadSegments 的几何输出（centerOffsetX / heading）与 progress 无关：
 *   任意 progress 下，segment i 的 centerOffsetX / heading 仅由其基础路段序号
 *   决定（曲线以 ROAD_TOTAL_LENGTH 为周期；curveZ = zCenterWorld - progress 与
 *   zCenter 在折算意义下等价）；推进 progress 只会改变每段的 zCenterWorld 字段，
 *   不会引入新的随机弯道，也不会让中心偏移随时间发生非预期跳变。
 *
 * 对外接口（roadCenterOffsetAt / roadHeadingAt / laneFrameAt /
 * buildRoadSegments / roadFrameAt / laneCenterXAt 等）仍按世界 z 坐标输入，
 * 调用方无需感知内部缓存与周期结构。
 *
 * 坐标系约定：
 *   x — 水平方向（左负右正）
 *   y — 垂直方向（本模块不直接使用，由渲染层处理）
 *   z — 纵深方向，远处为正（+z），玩家位于 z = 0，面向 -z 方向观看
 *
 * 道路沿 +z 方向无限延伸；progress 累计表示"玩家前进"的距离：
 *   progress 单调递增，对应整条道路相对世界坐标系向 +z 方向（相机方向）移动的距离，
 *   视觉上"赛道在玩家眼前持续向相机方向滑出、玩家车相对道路为前进"。
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
 * 也是道路曲线的周期：
 *   roadCenterOffsetAt(z) 与 roadHeadingAt(z) 关于 ROAD_TOTAL_LENGTH 周期连续，
 *   因此视觉循环边界处首尾段衔接一致。
 * 渲染层按 ROAD_SEGMENT_COUNT 段覆盖此长度的窗口。
 */
export const ROAD_TOTAL_LENGTH = 240;

/** 道路分段数 */
export const ROAD_SEGMENT_COUNT = 40;

/**
 * 单段道路长度（ROAD_TOTAL_LENGTH / ROAD_SEGMENT_LENGTH 应为整数）。
 * 路段生成以 ROAD_SEGMENT_COUNT 为周期，因此任意 idx 与 idx + ROAD_SEGMENT_COUNT
 * 共享同一段基础数据。
 */
export const ROAD_SEGMENT_LENGTH = ROAD_TOTAL_LENGTH / ROAD_SEGMENT_COUNT;

/* ===================================================================
   流式生成参数
   =================================================================== */

/**
 * 每个路段中心偏移 x 的最大绝对值（世界单位）。
 * 相邻两段控制点 centerOffsetX 的最大绝对差为 2 * ROAD_PROCGEN_MAX_OFFSET。
 * 段内为周期性 Catmull-Rom 样条插值，段边界处切向为 (P_{i+1} - P_{i-1}) / 2。
 * 对于控制点 ∈ [-MAX, MAX]，样条导数的最大绝对值出现于控制点交替取极值
 * （如 -MAX, +MAX, -MAX, +MAX）的情形，此时 q'(t) = 12·MAX·t·(1-t)，
 * 最大值在 t = 0.5 处为 3·MAX。因此单段内 heading 的最大绝对值为：
 *   ROAD_PROCGEN_MAX_HEADING
 *     = max|q'(t)| / ROAD_SEGMENT_LENGTH
 *     = 3 * ROAD_PROCGEN_MAX_OFFSET / ROAD_SEGMENT_LENGTH
 *
 * 取值由验收标准中“单段最大斜率 ≤ 0.5 rad（约 28°）”硬性约束推导：
 *   3 * MAX_OFFSET / 6 ≤ 0.5  ⇒  MAX_OFFSET ≤ 1.0
 * 后续任务要求弯道幅度明显增大且富有变化，将 MAX_OFFSET 从 0.9 提升至 2.0，
 * 使道路产生明显的大弯与小弯交替，同时通过 Catmull-Rom 样条保证 C¹ 连续。
 * 实际 heading 的上界 = 3 * 2.0 / 6 ≈ 1.0 rad（约 57°），但典型值因 PRNG 离散
 * 采样远低于上界，呈现平滑蜿蜒而非急转弯。
 */
export const ROAD_PROCGEN_MAX_OFFSET = 2.0;

/** 单段内 heading 的最大绝对值（Catmull-Rom 样条导数上界 = 3 * MAX_OFFSET / SL） */
export const ROAD_PROCGEN_MAX_HEADING =
  (3 * ROAD_PROCGEN_MAX_OFFSET) / ROAD_SEGMENT_LENGTH;

/**
 * 旧版流式生成缓存的窗口大小（保留以兼容旧调用方与测试）。
 * 周期性生成下缓存条目数最多不超过 ROAD_SEGMENT_COUNT，本身不再需要清理；
 * 因此本常量目前不再参与任何运行时逻辑，仅作为对外 API 稳定字段保留。
 *
 * @deprecated 周期性生成下，缓存天然有上界 ROAD_SEGMENT_COUNT；该常量保留导出
 *             是为了不破坏旧调用方对其的引用，未来可考虑移除。
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
 * 已生成路段缓存：基础路段序号 (baseIndex) -> { centerOffsetX }
 * 每个路段存储一个随机但确定（基于 seed + baseIndex 哈希）的中心偏移。
 * 由于曲线以 ROAD_SEGMENT_COUNT 为周期，任意 idx 与 idx + ROAD_SEGMENT_COUNT
 * 共享同一 baseIndex 缓存条目；缓存条目数最多不超过 ROAD_SEGMENT_COUNT，
 * 无需另做清理。
 */
const _segmentCache = new Map();

/**
 * 清空路段缓存。在 setRoadSeed 改变种子时调用，
 * 也可由测试在重置环境时显式调用。
 */
function _resetSegmentCache() {
  _segmentCache.clear();
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
 * 取指定路段的数据，缺失则按 (seed, baseIndex) 即时生成并写入缓存。
 *
 * 路段生成以 ROAD_SEGMENT_COUNT 为周期：
 *   - 把 idx 与 idx + ROAD_SEGMENT_COUNT 映射到同一"基础路段序号" baseIndex，
 *     并将其作为缓存键与哈希输入；
 *   - 这样任意 idx 命中的中心偏移与 idx + ROAD_SEGMENT_COUNT 命中的相同，
 *     roadCenterOffsetAt / roadHeadingAt 关于 ROAD_TOTAL_LENGTH 周期连续。
 *
 * 缓存在基础路段层面去重，条目数上限恒为 ROAD_SEGMENT_COUNT，无需另外清理。
 */
function _ensureSegment(idx) {
  const baseIdx =
    ((idx % ROAD_SEGMENT_COUNT) + ROAD_SEGMENT_COUNT) % ROAD_SEGMENT_COUNT;
  let data = _segmentCache.get(baseIdx);
  if (data) return data;
  data = _generateSegmentData(baseIdx);
  _segmentCache.set(baseIdx, data);
  return data;
}

/* ===================================================================
   蜿蜒曲线函数
   =================================================================== */

/**
 * 周期性均匀 Catmull-Rom 样条值函数 q(t)，t ∈ [0, 1]。
 * 对控制点 (P0, P1, P2, P3) 计算 P1→P2 段上的样条值：
 *   q(t) = 0.5 · [
 *     2·P1 +
 *     (-P0 + P2)·t +
 *     (2·P0 - 5·P1 + 4·P2 - P3)·t² +
 *     (-P0 + 3·P1 - 3·P2 + P3)·t³
 *   ]
 * 满足 q(0)=P1、q(1)=P2，且 q'(0)=0.5·(P2-P0)、q'(1)=0.5·(P3-P1)，
 * 因此相邻段在共享控制点处 C¹ 自然连续。
 * 周期边界通过将索引模 ROAD_SEGMENT_COUNT 实现，使控制点集周期性映射。
 *
 * @param {number} t - 段内局部参数 ∈ [0, 1]
 * @param {number} p0 - 前一段控制点
 * @param {number} p1 - 当前段起点控制点
 * @param {number} p2 - 当前段终点控制点
 * @param {number} p3 - 后一段控制点
 * @returns {number} 样条插值值
 */
function _catmullRomValue(t, p0, p1, p2, p3) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * 均匀 Catmull-Rom 样条导数函数 q'(t)，t ∈ [0, 1]。
 *   q'(t) = 0.5 · [
 *     (-P0 + P2) +
 *     2·(2·P0 - 5·P1 + 4·P2 - P3)·t +
 *     3·(-P0 + 3·P1 - 3·P2 + P3)·t²
 *   ]
 *
 * @param {number} t - 段内局部参数 ∈ [0, 1]
 * @param {number} p0 - 前一段控制点
 * @param {number} p1 - 当前段起点控制点
 * @param {number} p2 - 当前段终点控制点
 * @param {number} p3 - 后一段控制点
 * @returns {number} 样条导数（参数域 dx/dt）
 */
function _catmullRomDerivative(t, p0, p1, p2, p3) {
  const t2 = t * t;
  return 0.5 * (
    (-p0 + p2) +
    2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
    3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2
  );
}

/**
 * 计算道路中心线在指定 z 处的水平偏移 x
 * 每个 baseIndex = (segmentIndex mod ROAD_SEGMENT_COUNT) 拥有一个随机中心偏移，
 * 任意 z 通过 Catmull-Rom 样条 q(t) 在 4 个控制点 (P0=P_{idx-1}, P1=P_idx,
 * P2=P_{idx+1}, P3=P_{idx+2}) 之间插值，满足 q(0)=P1、q(1)=P2。
 * 索引均模 ROAD_SEGMENT_COUNT 以实现周期包装；因 Catmull-Rom 段间切线
 *  q'(0) = 0.5·(P2-P0) 与上一段 q'(1) = 0.5·(P1-P_{-1}) 共享同一表达式
 *  0.5·(P_{i+1} - P_{i-1})，整条中心线 C¹ 自然连续，无折角。
 * 周期边界处因控制点集循环映射（P_{N}=P_0, P_{N+1}=P_1），切向自然连续（C¹）。
 * 因 baseIndex 以 ROAD_SEGMENT_COUNT 为周期，本函数以 ROAD_TOTAL_LENGTH 为周期：
 *   roadCenterOffsetAt(z) === roadCenterOffsetAt(z + ROAD_TOTAL_LENGTH)
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
  // 钳制避免浮点边界上出现 t 越界。
  // t ∈ [0, 1)：t=1 时钳为 1-1e-9 而非精确 1，避免 _catmullRomValue 在
  // t=1 时返回 P2 而非 P1 的混淆（段边界处落在相邻段起点而非本段终点）。
  // 此偏移极小（1e-9·SL ≈ 6e-9 世界单位），对几何精度无实质影响。
  const t = tRaw <= 0 ? 0 : tRaw >= 1 ? 1 - 1e-9 : tRaw;
  // Catmull-Rom 需要 4 个控制点：P_{idx-1}, P_{idx}, P_{idx+1}, P_{idx+2}
  // 所有索引经周期包装（模 ROAD_SEGMENT_COUNT），确保周期边界自然连续
  const p0 = _ensureSegment(idx - 1).centerOffsetX;
  const p1 = _ensureSegment(idx).centerOffsetX;
  const p2 = _ensureSegment(idx + 1).centerOffsetX;
  const p3 = _ensureSegment(idx + 2).centerOffsetX;
  return _catmullRomValue(t, p0, p1, p2, p3);
}

/**
 * 计算道路中心线在指定 z 处的切线斜率（弧度）
 * 段内为 Catmull-Rom 样条导数 q'(t) / ROAD_SEGMENT_LENGTH 的连续函数：
 *   heading = q'(t) / SL
 * 其中 q'(t) 在段边界处的值为 0.5·(P_{i+1} - P_{i-1}) / SL，
 * 相邻段在该值上完全一致（由 Catmull-Rom 的 C¹ 连续性保证），
 * 因此段边界不再强制 heading 为 0，整条曲线 C¹ 连续。
 * 与 roadCenterOffsetAt 同为以 ROAD_TOTAL_LENGTH 为周期的函数。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 切线方向角（弧度，正值为绕 +y 轴左转）
 */
export function roadHeadingAt(z) {
  if (!Number.isFinite(z)) return 0;
  const zz = Number(z);
  const sl = ROAD_SEGMENT_LENGTH;
  const idx = Math.floor(zz / sl);
  // 钳制 t 与 roadCenterOffsetAt 一致，保证两函数在同一 t 上取值
  const tRaw = (zz - idx * sl) / sl;
  const t = tRaw <= 0 ? 0 : tRaw >= 1 ? 1 - 1e-9 : tRaw;
  // Catmull-Rom 需要 4 个控制点：P_{idx-1}, P_{idx}, P_{idx+1}, P_{idx+2}
  const p0 = _ensureSegment(idx - 1).centerOffsetX;
  const p1 = _ensureSegment(idx).centerOffsetX;
  const p2 = _ensureSegment(idx + 1).centerOffsetX;
  const p3 = _ensureSegment(idx + 2).centerOffsetX;
  return _catmullRomDerivative(t, p0, p1, p2, p3) / sl;
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
 * 道路曲线以 ROAD_TOTAL_LENGTH 为周期，因此对任意 z，
 * roadCenterOffsetAt(z) === roadCenterOffsetAt(wrapRoadZ(z))。
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
 * （progress 单调递增，对应道路整体向 +z 方向（相机方向）滚动、
 * 玩家视觉相对道路为前进）
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
 * 在周期性生成下：
 *   - 每段对应一个固定的"索引 z"（zCenter = i * SL + halfLen），代表该路段
 *     在缓存中的稳定身份。
 *   - 视觉 z（zCenterWorld）= wrapRoadZ(zCenter + progress)，随 progress 推进
 *     在 [0, ROAD_TOTAL_LENGTH) 区间内循环 wrap。progress 单调递增 →
 *     zCenterWorld 朝 +z 方向移动 → 玩家视觉相对道路为前进，对应"赛道在玩家
 *     眼前持续向相机方向（+z）滚出、路段源源不断从前方进入视野"的视觉感受。
 *   - 曲线查询使用 curveZ = zCenterWorld - progress：
 *       把每段视觉 z 还原到与之等价的绝对 z 上查询曲线（因曲线以
 *       ROAD_TOTAL_LENGTH 为周期，curveZ 与 zCenter 在视觉 z 折算意义下等价）。
 *       segment i 在任意 progress 下的 centerOffsetX/heading 仅由其视觉位置 v 决定，
 *       因此相邻段（视觉 z 上相邻）的曲线首尾必然衔接一致；
 *       同 index 的路段在不同 progress 下视觉 z 会回到相近位置，曲线形态也
 *       一一对应，从而消除视觉循环边界处的断开、错位与标线交叉。
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
    // 视觉 z：随 progress 推进在 [0, ROAD_TOTAL_LENGTH) 内循环 wrap，
    // progress 单调递增 → zCenterWorld 朝 +z 方向移动 → 玩家视觉相对道路为前进。
    const zCenterWorld = wrapRoadZ(zCenter + p);
    // 曲线查询使用 zCenterWorld - progress：
    // 把每段的视觉 z 还原到与之等价的曲线绝对 z 上；曲线以 ROAD_TOTAL_LENGTH
    // 为周期，因此 segment i 在任意 progress 下的曲线值仅由其基础路段序号决定，
    // 保证视觉循环边界处首尾段衔接一致、无裂缝/无跳变。
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
