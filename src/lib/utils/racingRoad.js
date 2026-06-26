/**
 * 3D 越野车竞速 — 蜿蜒道路与三条车道模块
 *
 * 定义赛道几何参数、蜿蜒曲线函数与道路后退滚动逻辑，
 * 供渲染层按需读取路段数组、车道线位置和弯曲偏移等参数。
 *
 * 本模块只描述道路与车道的数据，不创建车辆 / 障碍物 / 加血道具模型，
 * 也不处理游戏状态（分数、生命值、难度曲线等）。
 *
 * 坐标系约定：
 *   x — 水平方向（左负右正）
 *   y — 垂直方向（本模块不直接使用，由渲染层处理）
 *   z — 纵深方向，远处为正（+z），玩家位于 z = 0，面向 -z 方向观看
 *
 * 道路沿 +z 方向无限延伸；"道路后退"通过 progress 累计表示：
 *   progress 单调递增，对应整条道路相对世界坐标系向 -z 方向移动的距离。
 *   渲染层每帧只需读取最新的 progress，即可由本模块派生出所有几何参数。
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

/** 道路总长（沿 z 方向，世界单位），一个完整循环周期 */
export const ROAD_TOTAL_LENGTH = 240;

/** 道路分段数 */
export const ROAD_SEGMENT_COUNT = 40;

/** 单段道路长度（ROAD_TOTAL_LENGTH / ROAD_SEGMENT_LENGTH 应为整数） */
export const ROAD_SEGMENT_LENGTH = ROAD_TOTAL_LENGTH / ROAD_SEGMENT_COUNT;

/* ===================================================================
   蜿蜒曲线参数
   =================================================================== */

/** 第一层蜿蜒振幅（道路中线相对 z 轴的最大水平偏移） */
export const ROAD_CURVE_AMPLITUDE = 6;

/** 第一层蜿蜒角频率（每 z 单位的弧度） */
export const ROAD_CURVE_FREQUENCY = 0.045;

/** 第一层蜿蜒相位偏移 */
export const ROAD_CURVE_PHASE = 0;

/** 第二层蜿蜒振幅（叠加产生更自然的摆动） */
export const ROAD_CURVE_AMPLITUDE_2 = 2.5;

/** 第二层蜿蜒角频率 */
export const ROAD_CURVE_FREQUENCY_2 = 0.018;

/** 第二层蜿蜒相位偏移 */
export const ROAD_CURVE_PHASE_2 = 0;

/* ===================================================================
   蜿蜒曲线函数
   =================================================================== */

/**
 * 计算道路中心线在指定 z 处的水平偏移 x
 * 使用两层正弦叠加，模拟蜿蜒效果；两条曲线在 z = 0 处相位均为 0，
 * 保证玩家初始位置正好落在道路正中央。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 道路中心线在 z 处的 x 偏移
 */
export function roadCenterOffsetAt(z) {
  const zz = Number(z) || 0;
  return (
    ROAD_CURVE_AMPLITUDE * Math.sin(zz * ROAD_CURVE_FREQUENCY + ROAD_CURVE_PHASE) +
    ROAD_CURVE_AMPLITUDE_2 * Math.sin(zz * ROAD_CURVE_FREQUENCY_2 + ROAD_CURVE_PHASE_2)
  );
}

/**
 * 计算道路中心线在指定 z 处的切线斜率（弧度）
 * 取自蜿蜒曲线的解析导数，用于让路段沿曲线方向微微旋转。
 *
 * @param {number} z - 世界 z 坐标
 * @returns {number} 切线方向角（弧度，正值为绕 +y 轴左转）
 */
export function roadHeadingAt(z) {
  const zz = Number(z) || 0;
  return (
    ROAD_CURVE_AMPLITUDE * ROAD_CURVE_FREQUENCY * Math.cos(zz * ROAD_CURVE_FREQUENCY + ROAD_CURVE_PHASE) +
    ROAD_CURVE_AMPLITUDE_2 * ROAD_CURVE_FREQUENCY_2 * Math.cos(zz * ROAD_CURVE_FREQUENCY_2 + ROAD_CURVE_PHASE_2)
  );
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
 * 用于在循环道路上复用同一组路段数据：超出长度的 z 自动回绕到起点。
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
 * 段内 z 坐标会自动按 ROAD_TOTAL_LENGTH 回绕，使分段可无限滚动。
 *
 * @param {number} [progress=0] - 当前道路滚动进度
 * @returns {Array<{
 *   index: number,
 *   zStart: number,
 *   zEnd: number,
 *   zCenter: number,
 *   zCenterWorld: number,
 *   centerOffsetX: number,
 *   heading: number,
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
    const zCenterWorld = wrapRoadZ(zCenter - p);
    const centerOffsetX = roadCenterOffsetAt(zCenterWorld);
    const heading = roadHeadingAt(zCenterWorld);
    segments[i] = {
      index: i,
      zStart: i * ROAD_SEGMENT_LENGTH,
      zEnd: (i + 1) * ROAD_SEGMENT_LENGTH,
      zCenter,
      zCenterWorld,
      centerOffsetX,
      heading,
      length: ROAD_SEGMENT_LENGTH,
      halfWidth: ROAD_HALF_WIDTH,
    };
  }
  return segments;
}
