/**
 * Racing Game — pure JS utility module
 *
 * Provides lane constants, road segment generation, object (obstacle / oncoming
 * vehicle / repair kit) creation & recycling, collision detection helpers, and
 * Web Audio API‑based sound synthesis functions.
 *
 * All functions are pure (no DOM, no Three.js, no side effects) except the
 * sound functions which accept an AudioContext and produce sound.
 *
 * Road centre-line is generated using continuous Perlin noise (fBm) from
 * noise.js, replacing the old per-segment random walk.
 */

import { fbm1D } from './noise.js';

/* ===================================================================
   Lane constants & coordinate mapping
   =================================================================== */

/** Number of lanes on the road. */
export const LANE_COUNT = 3;

/** Width of one lane in world units. */
export const LANE_WIDTH = 3.5;

/** Lane identifiers. */
export const LANES = Object.freeze({
  LEFT: -1,
  CENTER: 0,
  RIGHT: 1,
});

/**
 * Convert a lane index (-1, 0, 1) to its world X coordinate.
 *
 * @param {number} lane - Lane index (-1, 0, 1).
 * @returns {number} World X position centered in that lane.
 */
export function getLaneX(lane) {
  return lane * LANE_WIDTH;
}

/**
 * Clamp a lane index to the valid range [-1, 1].
 *
 * @param {number} lane - Candidate lane index.
 * @returns {number} Clamped lane index.
 */
export function clampLane(lane) {
  const clamped = Math.max(-1, Math.min(1, Math.round(lane)));
  // Normalise -0 to 0
  return clamped === 0 ? 0 : clamped;
}

/* ===================================================================
   Player state constants
   =================================================================== */

/** Maximum (and starting) health. */
export const MAX_HEALTH = 5;

/** Damage dealt by an obstacle. */
export const OBSTACLE_DAMAGE = 1;

/** Damage dealt by an oncoming vehicle. */
export const VEHICLE_DAMAGE = 2;

/** Health restored by a repair kit. */
export const REPAIR_HEAL = 1;

/* ===================================================================
   Noise-based road parameters
   =================================================================== */

/**
 * Noise frequency for lateral (curve) offset.
 * Low frequency = long wavelength, giving long, smooth bends that
 * read clearly as either "straight" (the noise is near zero for an
 * extended Z range) or "curve" (the noise ramps to a sustained ±
 * MAX_CURVE_OFFSET for a longer run). Tuned in tandem with
 * {@link MAX_CURVE_OFFSET} so the player can tell curves and
 * straights apart at a glance.
 */
export const CURVE_NOISE_FREQUENCY = 0.006;

/**
 * Noise frequency for vertical (height) offset.
 */
export const HEIGHT_NOISE_FREQUENCY = 0.006;

/**
 * Seed offset applied to the Z coordinate for height noise to decorrelate
 * lateral and vertical variations.
 */
export const HEIGHT_NOISE_OFFSET = 1000;

/**
 * Number of fBm octaves for road noise.
 * 2 octaves adds subtle secondary detail while keeping the shape gentle.
 */
export const NOISE_OCTAVES = 2;

/* ===================================================================
   Road segment generation
   =================================================================== */

/** Length of one road segment in world units (along Z axis). */
export const SEGMENT_LENGTH = 20;

/**
 * Maximum lateral offset amplitude for the road centre-line.
 * The noise output is scaled by this value. Increasing this constant
 * amplifies the lateral swing of the road: the player, camera and
 * roadside scenery all swing much further sideways in a curve than
 * they do on a straight, so curves become visually obvious instead
 * of feeling like a slightly-bent line.
 */
export const MAX_CURVE_OFFSET = 5.0;

/**
 * Maximum vertical offset amplitude for the road centre-line.
 * The noise output is scaled by this value.
 */
export const MAX_HEIGHT_DELTA = 1.5;

/**
 * Sample the noise-based lateral curve offset at a given road Z coordinate.
 *
 * @param {number} z - Road-space Z coordinate.
 * @returns {number} Lateral offset in world units.
 */
export function sampleCurveOffset(z) {
  return fbm1D(z * CURVE_NOISE_FREQUENCY, NOISE_OCTAVES) * MAX_CURVE_OFFSET;
}

/**
 * Sample the noise-based vertical height offset at a given road Z coordinate.
 *
 * @param {number} z - Road-space Z coordinate.
 * @returns {number} Height offset in world units.
 */
export function sampleHeightOffset(z) {
  return fbm1D(z * HEIGHT_NOISE_FREQUENCY + HEIGHT_NOISE_OFFSET, NOISE_OCTAVES) * MAX_HEIGHT_DELTA;
}

/**
 * Generate a single road segment descriptor.
 *
 * Each segment contains:
 *  - `zStart`: world Z where the segment begins.
 *  - `curveOffset`: noise-based lateral offset at the segment's start.
 *  - `heightOffset`: noise-based vertical offset at the segment's start.
 *  - `length`: segment length along Z.
 *
 * The offset values are computed from continuous Perlin noise so that
 * adjacent segments blend seamlessly.
 *
 * @param {number} zStart - Starting Z coordinate.
 * @param {object} [options] - Optional parameters to scale noise amplitude.
 * @param {number} [options.maxCurve] - Curve amplitude (default MAX_CURVE_OFFSET).
 * @param {number} [options.maxHeight] - Height amplitude (default MAX_HEIGHT_DELTA).
 * @returns {object} Segment descriptor.
 */
export function generateSegment(zStart, options = {}) {
  const maxCurve = options.maxCurve ?? MAX_CURVE_OFFSET;
  const maxHeight = options.maxHeight ?? MAX_HEIGHT_DELTA;
  // Use noise sampled at the segment start, scaled by the amplitude options.
  return {
    zStart,
    curveOffset: fbm1D(zStart * CURVE_NOISE_FREQUENCY, NOISE_OCTAVES) * maxCurve,
    heightOffset: fbm1D(zStart * HEIGHT_NOISE_FREQUENCY + HEIGHT_NOISE_OFFSET, NOISE_OCTAVES) * maxHeight,
    length: SEGMENT_LENGTH,
  };
}

/**
 * Generate an array of road segments starting from a given Z offset.
 *
 * Useful for initialising or extending the road ahead of the player.
 *
 * @param {number} fromZ - Starting Z coordinate.
 * @param {number} count - Number of segments to generate.
 * @param {object} [options] - Optional parameters passed to generateSegment.
 * @returns {Array<object>} Array of segment descriptors.
 */
export function generateSegments(fromZ, count, options = {}) {
  const segments = [];
  let z = fromZ;
  for (let i = 0; i < count; i++) {
    segments.push(generateSegment(z, options));
    z -= SEGMENT_LENGTH;
  }
  return segments;
}

/**
 * Compute the continuous road offset (lateral & vertical) at any given Z
 * coordinate using the Perlin noise-based road model.
 *
 * Unlike the old cumulative segment-interpolation approach, this function
 * returns a value that varies smoothly and continuously for every Z,
 * because it directly samples the underlying noise function.
 *
 * The `segments` parameter is retained for API compatibility (object
 * generation, LOD, etc.) but the offset computation is purely noise-driven.
 *
 * @param {Array<object>} segments - Ordered segments (unused in noise mode).
 * @param {number} z - World Z coordinate (negative = ahead).
 * @returns {{ curveOffset: number, heightOffset: number }} Noise-based offsets.
 */
export function getRoadOffsetAt(segments, z) {
  return {
    curveOffset: sampleCurveOffset(z),
    heightOffset: sampleHeightOffset(z),
  };
}

/* ===================================================================
   Road objects (obstacles, oncoming vehicles, repair kits)
   =================================================================== */

/** Object type identifiers. */
export const OBJECT_TYPES = Object.freeze({
  OBSTACLE: 'obstacle',
  ONCOMING_VEHICLE: 'oncoming_vehicle',
  REPAIR_KIT: 'repair_kit',
});

/** Probability weights for random object generation. */
export const OBJECT_WEIGHTS = Object.freeze({
  [OBJECT_TYPES.OBSTACLE]: 0.4,
  [OBJECT_TYPES.ONCOMING_VEHICLE]: 0.35,
  [OBJECT_TYPES.REPAIR_KIT]: 0.25,
});

/* ===================================================================
   Enemy vehicle model configurations

   Three distinct oncoming-vehicle models — 轿车 (sedan), 卡车 (truck)
   and 跑车 (sports car) — are defined as a frozen, ordered table. Each
   model carries:

     - `id`            : stable identifier attached to every oncoming
                         vehicle descriptor as `modelId`.
     - `label`         : human-readable label for logs / debugging.
     - `weight`        : relative probability weight used by
                         `pickRandomEnemyModel`.
     - `speed`         : per-model approach speed in world units /
                         second, stored on the descriptor as `speed`.
     - `body`          : chassis proportions (width × height × length).
     - `cabin`         : cabin proportions (width × height × length).
     - `color`         : primary body colour (Three.js-style hex int).
     - `hasRoof`       : whether the model has an enclosed roof.
     - `hasSpoiler`    : whether the model has a rear spoiler.
     - `wheelCount`    : number of wheels.
     - `headlightCount`: number of headlights.

   The three models deliberately differ on every distinguishing axis:
     - 车身比例: sedan 1.2×0.5×2.0, truck 1.4×0.7×2.6, sports 1.0×0.35×1.8.
     - 颜色:     sedan 0x4488ff (blue), truck 0xcc4422 (red-orange),
                 sports 0xffcc00 (yellow).
     - 车顶/车灯/扰流板/车轮数 are also distinct across the set.
     - 行驶速度: sedan 14, truck 9 (slow / heavy), sports 19 (fast).

   The exposed `ENEMY_VEHICLE_MODEL_MAP` and `ENEMY_VEHICLE_MODEL_IDS`
   helpers let consumers look up a model by id (for, e.g., tests or
   external renderers that want to switch on the model) and iterate
   over the table without mutating it.
   =================================================================== */

export const ENEMY_VEHICLE_MODELS = Object.freeze([
  Object.freeze({
    id: 'sedan',
    label: '轿车',
    weight: 1,
    speed: 14,
    body: Object.freeze({ width: 1.2, height: 0.5, length: 2.0 }),
    cabin: Object.freeze({ width: 1.0, height: 0.35, length: 1.2 }),
    color: 0x4488ff,
    hasRoof: true,
    hasSpoiler: false,
    wheelCount: 4,
    headlightCount: 2,
  }),
  Object.freeze({
    id: 'truck',
    label: '卡车',
    weight: 1,
    speed: 9,
    body: Object.freeze({ width: 1.4, height: 0.7, length: 2.6 }),
    cabin: Object.freeze({ width: 0.9, height: 0.5, length: 0.7 }),
    color: 0xcc4422,
    hasRoof: false,
    hasSpoiler: false,
    wheelCount: 6,
    headlightCount: 2,
  }),
  Object.freeze({
    id: 'sports',
    label: '跑车',
    weight: 1,
    speed: 19,
    body: Object.freeze({ width: 1.0, height: 0.35, length: 1.8 }),
    cabin: Object.freeze({ width: 0.9, height: 0.25, length: 0.9 }),
    color: 0xffcc00,
    hasRoof: true,
    hasSpoiler: true,
    wheelCount: 4,
    headlightCount: 2,
  }),
]);

/** Stable id → model lookup. Frozen so consumers cannot mutate the table. */
export const ENEMY_VEHICLE_MODEL_MAP = Object.freeze(
  Object.fromEntries(ENEMY_VEHICLE_MODELS.map((m) => [m.id, m])),
);

/** Ordered list of every model id, convenient for tests and iteration. */
export const ENEMY_VEHICLE_MODEL_IDS = Object.freeze(
  ENEMY_VEHICLE_MODELS.map((m) => m.id),
);

/**
 * Pick a random enemy vehicle model, weighted by each model's
 * `weight` field. Returns one of the entries from
 * {@link ENEMY_VEHICLE_MODELS}; falls back to the first model on the
 * (theoretical) degenerate case where every weight is zero, negative
 * or non-finite.
 *
 * Each model's `weight` is sanitised: only finite, strictly positive
 * numbers contribute to the total and are eligible for selection.
 * NaN, zero, negative and non-number weights are treated as zero
 * contribution. This keeps `totalWeight` finite (no NaN taint from a
 * `NaN` weight) and prevents a NaN-weight model from being silently
 * unreachable (subtracting NaN from `r` makes the subsequent `r <= 0`
 * check `false`, so the model would never be returned even when its
 * slot in the cumulative distribution is reached).
 *
 * @returns {object} A model descriptor from ENEMY_VEHICLE_MODELS.
 */
export function pickRandomEnemyModel() {
  let totalWeight = 0;
  for (const model of ENEMY_VEHICLE_MODELS) {
    const w = model.weight;
    // Only count finite, strictly positive numbers. NaN, 0, negative
    // and non-number weights contribute zero to the cumulative total.
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) {
      totalWeight += w;
    }
  }
  // Defensive fallback: if no model has a positive, finite weight,
  // fall back to the first model rather than spinning a NaN-tainted
  // accumulator (the original `0 * NaN` → `NaN` → `!(NaN > 0)` already
  // returned the first model, but the new path makes the intent
  // explicit and is independent of the data values).
  if (!(totalWeight > 0)) {
    return ENEMY_VEHICLE_MODELS[0];
  }
  let r = Math.random() * totalWeight;
  for (const model of ENEMY_VEHICLE_MODELS) {
    const w = model.weight;
    // Skip non-positive / non-finite weights in the selection loop
    // too: subtracting NaN from `r` would make the next `r <= 0`
    // check `false` (NaN comparisons are always false) and the model
    // would be silently unreachable.
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
      continue;
    }
    r -= w;
    if (r <= 0) return model;
  }
  // Numerical drift fallback (r still > 0 after subtracting all weights)
  return ENEMY_VEHICLE_MODELS[ENEMY_VEHICLE_MODELS.length - 1];
}

/**
 * Look up an enemy vehicle model by its `id`.
 *
 * Uses an own-property check (`Object.hasOwn`) rather than a plain
 * property lookup so that prototype-chain keys such as `'__proto__'`,
 * `'constructor'`, `'toString'`, `'hasOwnProperty'`, etc. are
 * correctly treated as "not found" and return `null` instead of the
 * truthy inherited value on `Object.prototype` (which a `||` /
 * truthy-check fallback would happily surface, leading downstream
 * code to read `.speed === undefined`).
 *
 * @param {string} id - Model identifier (e.g. `'sedan'`).
 * @returns {object|null} The matching model descriptor, or `null` if no
 *   model with that id exists.
 */
export function getEnemyModelById(id) {
  if (typeof id !== 'string') return null;
  if (!Object.hasOwn(ENEMY_VEHICLE_MODEL_MAP, id)) return null;
  return ENEMY_VEHICLE_MODEL_MAP[id];
}

/**
 * Approaching speed of an oncoming vehicle in world units per second,
 * measured in the +Z direction (toward the player). Oncoming vehicles
 * advance their own road-space Z by this amount every frame in addition
 * to the global world scroll, so they close in on the player at the
 * sum of this constant and the player's forward speed. This makes them
 * visibly drive toward the player like real oncoming traffic rather
 * than appearing as stationary props carried past the camera by the
 * world scroll.
 *
 * This value is also the default speed for oncoming vehicles that
 * have not been assigned a per-model speed (e.g. descriptors
 * constructed outside `generateObjectsForSegment`). Vehicles produced
 * by `generateObjectsForSegment` carry their model's `speed` on the
 * `speed` descriptor field, allowing future renderers / logic to vary
 * behaviour per model.
 */
export const ONCOMING_VEHICLE_SPEED = 14;

/**
 * Create a road object descriptor.
 *
 * The optional `options` bag carries per-object metadata that does not
 * belong on every road object but only on certain types:
 *
 *   - `modelId`: enemy-vehicle model identifier (e.g. `'sedan'`). Only
 *     meaningful for `OBJECT_TYPES.ONCOMING_VEHICLE`; for other types
 *     the descriptor stores `null`. Look up the full model via
 *     {@link getEnemyModelById}.
 *   - `speed`:   enemy-vehicle approach speed in world units / second.
 *     Only meaningful for `OBJECT_TYPES.ONCOMING_VEHICLE`; for other
 *     types the descriptor stores `null`. Must be a finite, strictly
 *     positive number — zero would make the vehicle stand still and
 *     a negative value would push it *away* from the player, both
 *     of which violate the "approach speed toward the player"
 *     contract documented on {@link ONCOMING_VEHICLE_SPEED}. Non-
 *     positive, non-finite, or non-number values fall back to `null`.
 *
 * The two fields are deliberately also stored on non-vehicle
 * descriptors (as `null`) so consumers can rely on their presence
 * instead of `hasOwnProperty` checks.
 *
 * @param {string} type - One of OBJECT_TYPES.
 * @param {number} lane - Lane index (-1, 0, 1).
 * @param {number} z - World Z position (negative = ahead of player).
 * @param {number} [zWidth=1] - Half‑width of the object's collision zone along Z.
 * @param {number} [xWidth=1] - Half‑width of the object's collision zone along X.
 * @param {number} [height=1] - Height of the object (oncoming vehicles are taller).
 * @param {object} [options] - Optional per-object metadata.
 * @param {string|null} [options.modelId=null] - Enemy-vehicle model id.
 * @param {number|null} [options.speed=null] - Enemy-vehicle approach speed in
 *   world units / second. Must be a finite, strictly positive number; any
 *   other value (including 0, negative numbers, NaN, Infinity, strings) is
 *   stored as `null`.
 * @returns {object} Object descriptor.
 */
export function createObject(type, lane, z, zWidth = 1, xWidth = 1, height = 1, options = null) {
  const opts = options || {};
  const isVehicle = type === OBJECT_TYPES.ONCOMING_VEHICLE;
  const modelId = isVehicle && typeof opts.modelId === 'string' ? opts.modelId : null;
  // Speed must be a finite, strictly positive number — the "approach
  // speed toward the player" contract (see ONCOMING_VEHICLE_SPEED)
  // forbids ≤ 0 values, which would make a vehicle recede from (0)
  // or stand still at (negative / zero) the player. Anything that
  // fails the type / finiteness / positivity check falls back to
  // `null`, so downstream consumers can still rely on a `number` or
  // `null` discriminator on the descriptor.
  const speed = isVehicle
    && typeof opts.speed === 'number'
    && Number.isFinite(opts.speed)
    && opts.speed > 0
    ? opts.speed
    : null;
  return {
    type,
    lane,
    x: getLaneX(lane),
    z,
    zWidth,
    xWidth,
    height,
    active: true,
    modelId,
    speed,
  };
}

/**
 * Pick a random object type based on configured weights.
 *
 * @returns {string} One of OBJECT_TYPES.
 */
export function randomObjectType() {
  const r = Math.random();
  let cumulative = 0;
  for (const [type, weight] of Object.entries(OBJECT_WEIGHTS)) {
    cumulative += weight;
    if (r < cumulative) return type;
  }
  return OBJECT_TYPES.OBSTACLE;
}

/**
 * Generate a batch of objects for a road segment.
 *
 * Places 0–2 objects randomly across lanes. Objects are positioned within
 * the segment's Z range. Oncoming vehicles always get a larger height.
 *
 * Collision dimensions are aligned with the visual model:
 *   - Obstacles use a 1.2 × 0.8 × 1.2 box, so collision half-extents are
 *     zWidth = 0.6 (half of 1.2 depth), xWidth = 0.6 (half of 1.2 width),
 *     and height = 0.8 (full visual height). This matches
 *     `new THREE.BoxGeometry(1.2, 0.8, 1.2)` in the scene.
 *   - Oncoming vehicles keep a tall height so they cannot be jumped over.
 *
 * Each oncoming vehicle is also tagged with a randomly-chosen enemy
 * vehicle model via {@link pickRandomEnemyModel}: the chosen model's
 * `id` is stored on the descriptor as `modelId`, and the model's
 * `speed` is stored as `speed`. Obstacles and repair kits leave
 * `modelId` / `speed` as `null` on the descriptor.
 *
 * @param {object} segment - Segment descriptor.
 * @param {number} [maxObjects=2] - Maximum objects per segment.
 * @returns {Array<object>} New object descriptors.
 */
export function generateObjectsForSegment(segment, maxObjects = 2) {
  // Cap at 3 lanes to prevent infinite loop in lane selection
  const safeMax = Math.min(maxObjects, 3);
  const count = Math.floor(Math.random() * (safeMax + 1));
  const objects = [];
  const usedLanes = new Set();

  for (let i = 0; i < count; i++) {
    const type = randomObjectType();
    let lane;
    let attempts = 0;
    // Avoid placing two objects in the same lane within a single segment
    do {
      lane = Math.floor(Math.random() * 3) - 1;
      attempts++;
      if (attempts > 20) break; // safety guard against infinite loop
    } while (usedLanes.has(lane));
    usedLanes.add(lane);

    const z = segment.zStart - Math.random() * segment.length;
    const isVehicle = type === OBJECT_TYPES.ONCOMING_VEHICLE;
    let modelId = null;
    let speed = null;
    if (isVehicle) {
      const model = pickRandomEnemyModel();
      modelId = model.id;
      speed = model.speed;
    }
    objects.push(
      createObject(
        type,
        lane,
        z,
        /* zWidth */ isVehicle ? 1.5 : 0.6,
        /* xWidth */ isVehicle ? 1.2 : 0.6,
        /* height */ isVehicle ? 2.0 : 0.8,
        /* options */ { modelId, speed },
      ),
    );
  }
  return objects;
}

/**
 * Z position of the in-game camera (world units).
 *
 * The camera sits roughly at world z = CAMERA_Z looking forward at the
 * player, so anything past this point has already fully cleared the
 * near plane and is no longer rendered in front of the player. The
 * recycle threshold for objects is calibrated against this distance so
 * that the player never sees an object "pop" out of existence while it
 * was still in view.
 */
export const CAMERA_Z = 12;

/**
 * Default cleanup margin for {@link recycleObjects}, in world units.
 *
 * Kept synchronised with the camera's Z position so that, by default, an
 * object is only recycled after it has travelled past the camera (and
 * therefore past the camera near plane) rather than the moment it passes
 * the player. Callers may still pass a different value to override this.
 */
export const CAMERA_RECYCLE_MARGIN = 12;

/**
 * Filter out objects that have passed behind the player.
 *
 * Objects whose world Z is greater than `playerZ + cleanupMargin` are
 * considered passed and are removed from the returned list. The default
 * {@link CAMERA_RECYCLE_MARGIN} matches the camera's Z position so
 * objects are kept visible until they fully exit the camera's field of
 * view (past the near plane), preventing the visual pop-out where an
 * object disappears while still on-screen.
 *
 * @param {Array<object>} objects - Current active objects.
 * @param {number} playerZ - Player's current Z position.
 * @param {number} [cleanupMargin=CAMERA_RECYCLE_MARGIN] - Extra margin
 *   behind the player; defaults to {@link CAMERA_RECYCLE_MARGIN} so the
 *   threshold aligns with the camera view distance.
 * @returns {Array<object>} Objects still ahead of the camera / player.
 */
export function recycleObjects(objects, playerZ, cleanupMargin = CAMERA_RECYCLE_MARGIN) {
  const threshold = playerZ + cleanupMargin;
  return objects.filter((o) => o != null && typeof o.z === 'number' && o.z < threshold);
}

/* ===================================================================
   Collision detection
   =================================================================== */

/**
 * Legacy jump-height constant for obstacles.
 *
 * Historically {@link checkCollision} ignored an obstacle when the player's Y
 * was strictly greater than this constant. The collision check has since been
 * changed so that immunity is determined by the obstacle's own height
 * (see {@link checkCollision}), making jumps feel fair relative to the
 * visual model. This export is retained for backwards compatibility with
 * any external consumer and is no longer consulted inside the collision
 * logic.
 *
 * @deprecated Use `object.height` instead — see {@link checkCollision}.
 */
export const JUMP_IMMUNITY_HEIGHT = 1.2;

/** Y position of the road surface. */
export const ROAD_Y = 0;



/**
 * Check if the player vehicle collides with a road object.
 *
 * Collision uses a lane‑only model for the X axis — the player's X is
 * derived from `player.lane` via {@link getLaneX} and matched against the
 * object's lane. During lane transitions the player is not considered to
 * occupy any lane, which prevents false positives while switching.
 *
 * A collision occurs when:
 *  1. The object is active.
 *  2. The player's lane matches the object's lane.
 *  3. The player's Z position is within the object's Z bounds
 *     (using `object.zWidth` as a half-extent around the object's Z).
 *  4. If the object is an obstacle AND the player's Y position is
 *     **strictly greater than the obstacle's own height**, the collision
 *     is ignored (jump immunity). This makes the immunity threshold track
 *     the visual model: a jump that visually clears the top of the
 *     obstacle is treated as having cleared it. At exactly the obstacle
 *     height, the player still grazes the top and the collision is
 *     registered.
 *  5. Oncoming vehicles always collide regardless of the player's Y
 *     position; repair kits never apply jump-immunity either and are
 *     collected by simple overlap.
 *
 * @param {object} player - Player state: { lane, z, y }.
 * @param {object} object - Object descriptor from createObject.
 * @returns {boolean} True if a collision is detected.
 */
export function checkCollision(player, object) {
  if (!object.active) return false;

  // Lane check
  if (player.lane !== object.lane) return false;

  // Z bounds check (zWidth is the half-extent of the collision zone along Z)
  const halfZ = object.zWidth;
  if (player.z < object.z - halfZ || player.z > object.z + halfZ) return false;

  // Jump immunity for obstacles only — strict greater-than the obstacle's
  // own height makes the check tolerant: a jump that visually clears the
  // obstacle is treated as a successful clear.
  if (object.type === OBJECT_TYPES.OBSTACLE && player.y > object.height) {
    return false;
  }

  // Oncoming vehicles and repair kits always react to overlap regardless
  // of the player's Y position (vehicles always collide; repair kits are
  // simply picked up).
  return true;
}

/**
 * Apply collision effect: deduct health or heal.
 *
 * Pure function — returns the new state without mutating the inputs.
 *
 * @param {number} currentHealth - Player's health before the collision.
 * @param {object} object - Object that was collided with.
 * @returns {{ healthDelta: number, health: number }} Change applied and resulting health.
 */
export function applyCollision(currentHealth, object) {
  let delta;
  switch (object.type) {
    case OBJECT_TYPES.OBSTACLE:
      delta = -OBSTACLE_DAMAGE;
      break;
    case OBJECT_TYPES.ONCOMING_VEHICLE:
      delta = -VEHICLE_DAMAGE;
      break;
    case OBJECT_TYPES.REPAIR_KIT:
      delta = REPAIR_HEAL;
      break;
    default:
      delta = 0;
  }

  const health = Math.max(0, Math.min(MAX_HEALTH, currentHealth + delta));
  const healthDelta = health - currentHealth;

  return { healthDelta, health };
}

/* ===================================================================
   Scoring
   =================================================================== */

/**
 * Calculate the score from distance travelled.
 *
 * @param {number} distanceZ - Total Z distance the player has moved forward.
 * @param {number} [multiplier=1] - Score multiplier.
 * @returns {number} Score (always an integer).
 */
export function calculateScore(distanceZ, multiplier = 1) {
  return Math.floor(Math.abs(distanceZ) * multiplier);
}

/* ===================================================================
   Web Audio API — Synthesised sound effects
   =================================================================== */

/** Buffer time (seconds) added after the fade‑out ramp in stopEngineHum. */
export const ENGINE_HUM_STOP_BUFFER = 0.05;

/** Minimum engine hum frequency in Hz. */
export const ENGINE_HUM_FREQ_MIN = 80;

/** Maximum engine hum frequency in Hz (approached at high speed). */
export const ENGINE_HUM_FREQ_MAX = 400;

/**
 * Speed (world units / second) at which audio effects reach maximum intensity.
 * Shared by engine hum frequency and wind noise synthesis as a common
 * speed‑normalisation ceiling.
 */
export const AUDIO_SPEED_MAX = 50;

/** Smoothing time constant (seconds) for setTargetAtTime calls in audio update loops. */
export const AUDIO_SMOOTH_TIME = 0.05;

/** Startup frequency (Hz) for the engine hum oscillator — the ramp target during warm‑up. */
export const ENGINE_HUM_STARTUP_FREQ = 120;

/** Buffer time (seconds) added after the fade‑out ramp in stopWindNoise. */
export const WIND_NOISE_STOP_BUFFER = 0.05;

/** Minimum lowpass filter cutoff for wind noise (Hz, at idle speed). */
export const WIND_NOISE_FILTER_FREQ_MIN = 400;

/** Maximum lowpass filter cutoff for wind noise (Hz, at full speed). */
export const WIND_NOISE_FILTER_FREQ_MAX = 2000;

/** Maximum gain for wind noise at full speed. */
export const WIND_NOISE_GAIN_MAX = 0.15;

/** Shared oscillator / gain helper — creates and connects a one‑shot tone. */
function playTone(ctx, frequency, type, duration, volume = 0.3, rampDown = true) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/**
 * Start a continuous engine / driving background hum.
 *
 * Returns an object with `{ oscillator, gain }` that the caller can
 * manipulate (e.g. adjust frequency or volume) and must eventually stop.
 *
 * The oscillator begins at 80 Hz and performs a brief warm‑up ramp to
 * {@link ENGINE_HUM_STARTUP_FREQ}.  Call {@link updateEngineHumFrequency}
 * each frame to track the speed‑to‑frequency curve dynamically.
 *
 * @param {AudioContext} ctx - Web Audio API context.
 * @returns {{ oscillator: OscillatorNode, gain: GainNode }}
 */
export function startEngineHum(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  // Initial frequency at 80 Hz
  osc.frequency.setValueAtTime(ENGINE_HUM_FREQ_MIN, ctx.currentTime);
  // Brief warm‑up ramp to startup frequency
  osc.frequency.linearRampToValueAtTime(ENGINE_HUM_STARTUP_FREQ, ctx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  return { oscillator: osc, gain };
}

/**
 * Update the engine hum frequency based on current speed.
 *
 * Call this every frame (or whenever the player's speed changes) to
 * smoothly track the speed‑to‑frequency curve using a short smoothing
 * time constant to avoid discrete steps.
 *
 * @param {{ oscillator: OscillatorNode, gain: GainNode }} engine - Result from startEngineHum.
 * @param {number} speed - Current player speed in world units / second.
 */
export function updateEngineHumFrequency(engine, speed) {
  if (!engine || !engine.oscillator) return;
  const clamped = Math.max(0, speed);
  const ratio = Math.min(1, clamped / AUDIO_SPEED_MAX);
  const targetFreq = ENGINE_HUM_FREQ_MIN + ratio * (ENGINE_HUM_FREQ_MAX - ENGINE_HUM_FREQ_MIN);
  const t = engine.oscillator.context.currentTime;
  engine.oscillator.frequency.setTargetAtTime(targetFreq, t, AUDIO_SMOOTH_TIME);
}

/**
 * Stop the engine hum.
 *
 * @param {{ oscillator: OscillatorNode, gain: GainNode }} engine - Result from startEngineHum.
 * @param {number} [fadeOut=0.3] - Fade‑out duration in seconds.
 */
export function stopEngineHum(engine, fadeOut = 0.3) {
  if (!engine || !engine.oscillator || !engine.gain) return;
  const t = engine.oscillator.context?.currentTime ?? 0;
  engine.gain.gain.linearRampToValueAtTime(0, t + fadeOut);
  engine.oscillator.stop(t + fadeOut + ENGINE_HUM_STOP_BUFFER);
}

/**
 * Create a wind‑noise layer that varies with vehicle speed.
 *
 * Creates a looping white‑noise buffer through a lowpass BiquadFilter
 * so the wind timbre is softer than raw noise. Callers should call
 * {@link updateWindNoiseGain} each frame to scale the wind volume
 * proportionally to the current speed.
 *
 * @param {AudioContext} ctx - Web Audio API context.
 * @returns {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }}
 */
export function createWindNoise(ctx) {
  // White‑noise buffer (2 seconds, looping)
  const sampleRate = ctx.sampleRate ?? 44100;
  const bufferSize = sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(WIND_NOISE_FILTER_FREQ_MIN, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  return { source, gain, filter };
}

/**
 * Update wind noise filter cutoff based on speed.
 *
 * Higher speed opens the lowpass filter more, letting the wind
 * sound brighter. Uses a short smoothing time constant to avoid
 * discrete stepping artifacts.
 *
 * @param {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }} wind - Result from createWindNoise.
 * @param {number} speed - Current player speed in world units / second.
 */
export function updateWindNoiseFilter(wind, speed) {
  if (!wind || !wind.filter) return;
  const clamped = Math.max(0, speed);
  const ratio = Math.min(1, clamped / AUDIO_SPEED_MAX);
  const cutoff = WIND_NOISE_FILTER_FREQ_MIN + ratio * (WIND_NOISE_FILTER_FREQ_MAX - WIND_NOISE_FILTER_FREQ_MIN);
  const t = wind.filter.context.currentTime;
  wind.filter.frequency.setTargetAtTime(cutoff, t, AUDIO_SMOOTH_TIME);
}

/**
 * Update wind noise gain based on speed.
 *
 * Uses a short smoothing time constant to avoid clicks when
 * gain changes rapidly.
 *
 * @param {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }} wind - Result from createWindNoise.
 * @param {number} speed - Current player speed in world units / second.
 */
export function updateWindNoiseGain(wind, speed) {
  if (!wind || !wind.gain) return;
  const clamped = Math.max(0, speed);
  const ratio = Math.min(1, clamped / AUDIO_SPEED_MAX);
  const targetGain = ratio * WIND_NOISE_GAIN_MAX;
  const t = wind.gain.context.currentTime;
  wind.gain.gain.setTargetAtTime(targetGain, t, AUDIO_SMOOTH_TIME);
}

/**
 * Stop the wind noise with an optional fade‑out.
 *
 * @param {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }} wind - Result from createWindNoise.
 * @param {number} [fadeOut=0.3] - Fade‑out duration in seconds.
 */
export function stopWindNoise(wind, fadeOut = 0.3) {
  if (!wind || !wind.source || !wind.gain) return;
  const t = wind.gain.context.currentTime;
  wind.gain.gain.linearRampToValueAtTime(0, t + fadeOut);
  wind.source.stop(t + fadeOut + WIND_NOISE_STOP_BUFFER);
}

/**
 * Play a lane‑switch "whoosh" sound.
 *
 * @param {AudioContext} ctx
 */
export function playLaneSwitchSound(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

/**
 * Play a jump "boing" sound.
 *
 * Both oscillator/gain pairs are created inline (no "playTone" helper) so
 * all nodes are directly visible and can be managed or disconnected if
 * the playback needs to be interrupted before the tone finishes.
 *
 * @param {AudioContext} ctx
 */
export function playJumpSound(ctx) {
  // Low tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(200, ctx.currentTime);
  gain1.gain.setValueAtTime(0.2, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 0.2);

  // Quick pitch rise overlay
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(400, ctx.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
  gain2.gain.setValueAtTime(0.12, ctx.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(ctx.currentTime);
  osc2.stop(ctx.currentTime + 0.2);
}

/**
 * Play a collision "thud / crunch" sound.
 *
 * @param {AudioContext} ctx
 */
export function playCollisionSound(ctx) {
  // Low‑frequency noise burst
  playTone(ctx, 80, 'sawtooth', 0.25, 0.25);
  // Smash overlay
  playTone(ctx, 150, 'square', 0.1, 0.15);
}

/**
 * Play a repair‑kit pickup "ding" sound.
 *
 * @param {AudioContext} ctx
 */
export function playPickupSound(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

/* ===================================================================
   Dynamic difficulty

   A pure, deterministic curve that ramps from "easy" (game start)
   to a fixed cap as the player accumulates distance and/or running
   time. The curve is computed from two non‑negative scalar inputs
   and returns a snapshot of every pacing parameter the game loop
   should apply this frame: the enemy speed multiplier, the spawn
   density (per‑segment max object count + per‑segment chance),
   and the spawn cooldown.

   Both inputs feed the curve on equal footing: a slow player can
   still progress through the ramp purely via time, and a fast
   player can skip the time‑based ramp. The integer level itself
   saturates at {@link DIFFICULTY_MAX_LEVEL} but the multipliers
   remain bounded by their own per‑axis caps (see
   {@link ENEMY_SPEED_MAX_MULTIPLIER} and
   {@link SPAWN_DENSITY_MAX_MULTIPLIER}), so beyond the cap
   further distance / time has no additional effect on the game
   pacing.

   All functions in this section are pure — no DOM, no Three.js,
   no state. The component is expected to call
   {@link computeDifficulty} once per frame inside its update
   loop and thread the returned parameters into its spawn /
   advance pipeline.
   =================================================================== */

/** World units between consecutive distance‑driven difficulty
 *  levels. One level is gained every DIFFICULTY_DISTANCE_PER_LEVEL
 *  units of forward travel, so the cap (see DIFFICULTY_MAX_LEVEL)
 *  is reached at DIFFICULTY_DISTANCE_PER_LEVEL *
 *  DIFFICULTY_MAX_LEVEL ≈ 2000 m. */
export const DIFFICULTY_DISTANCE_PER_LEVEL = 200;

/** Seconds between consecutive time‑driven difficulty levels. A
 *  stationary player still progresses through the curve at this
 *  rate (so a single long run feels progressively harder even when
 *  the player is stuck behind a truck). */
export const DIFFICULTY_TIME_PER_LEVEL = 30;

/** Upper bound on the integer level. Beyond this value the level
 *  stops climbing; the multipliers remain bounded by their own
 *  per‑axis caps. */
export const DIFFICULTY_MAX_LEVEL = 10;

/** Multiplier added to the oncoming‑vehicle approach speed per
 *  difficulty level. The effective multiplier is
 *  `1 + level * ENEMY_SPEED_PER_LEVEL`, clamped to
 *  {@link ENEMY_SPEED_MAX_MULTIPLIER}. */
export const ENEMY_SPEED_PER_LEVEL = 0.08;

/** Upper bound on the oncoming‑vehicle speed multiplier. */
export const ENEMY_SPEED_MAX_MULTIPLIER = 1 + DIFFICULTY_MAX_LEVEL * ENEMY_SPEED_PER_LEVEL;

/** Multiplier added to the spawn density factor per level.
 *  Currently informational — spawn density is expressed via
 *  {@link MAX_OBJECTS_BASE} / {@link MAX_OBJECTS_PER_LEVEL_STEP}
 *  / {@link MAX_OBJECTS_CAP} and {@link SPAWN_CHANCE_BASE} /
 *  {@link SPAWN_CHANCE_STEP} / {@link SPAWN_CHANCE_MAX} below —
 *  but the explicit multiplier is exported so external consumers
 *  (UI, tests) can read a single density indicator. */
export const SPAWN_DENSITY_PER_LEVEL = 0.10;

/** Upper bound on the spawn density multiplier. */
export const SPAWN_DENSITY_MAX_MULTIPLIER = 1 + DIFFICULTY_MAX_LEVEL * SPAWN_DENSITY_PER_LEVEL;

/** Per‑segment max object count at level 0. */
export const MAX_OBJECTS_BASE = 1;

/** Object count step per level. With a value of 0.25, an extra
 *  object per segment is added every 4 levels (4→2, 8→3) so the
 *  count climbs gently from 1 to {@link MAX_OBJECTS_CAP} across
 *  the cap range. */
export const MAX_OBJECTS_PER_LEVEL_STEP = 0.25;

/** Hard cap on the per‑segment max object count. The count is
 *  clamped to this value, mirroring the existing
 *  `Math.min(maxObjects, 3)` guard inside
 *  {@link generateObjectsForSegment}. */
export const MAX_OBJECTS_CAP = 3;

/** Base spawn cooldown, in seconds. Used at level 0. */
export const SPAWN_COOLDOWN_BASE = 0.25;

/** Cooldown reduction per level, in seconds. The cooldown is
 *  `MAX(SPAWN_COOLDOWN_MIN, SPAWN_COOLDOWN_BASE - level *
 *  SPAWN_COOLDOWN_STEP)`. */
export const SPAWN_COOLDOWN_STEP = 0.018;

/** Floor on the spawn cooldown, in seconds. Even at the
 *  difficulty cap the cooldown cannot drop below this value,
 *  preserving a tiny per‑frame cadence for the spawn loop. */
export const SPAWN_COOLDOWN_MIN = 0.08;

/** Base per‑eligible‑segment spawn chance, in [0, 1]. Used at
 *  level 0; matches the prior hard‑coded `0.3` inside
 *  `spawnObjects()`. */
export const SPAWN_CHANCE_BASE = 0.3;

/** Per‑level increase in spawn chance, additive in [0, 1]. The
 *  effective chance is `MIN(SPAWN_CHANCE_MAX, SPAWN_CHANCE_BASE
 *  + level * SPAWN_CHANCE_STEP)`. */
export const SPAWN_CHANCE_STEP = 0.06;

/** Cap on the per‑eligible‑segment spawn chance, in [0, 1]. The
 *  cap leaves a small amount of randomness even at the top of
 *  the curve so a player at high difficulty is not guaranteed
 *  a fresh obstacle in every segment. */
export const SPAWN_CHANCE_MAX = 0.95;

/**
 * Coerce an arbitrary input to a finite, non‑negative number.
 * Negative numbers, NaN, Infinity, non‑numbers, and missing values
 * all fall back to the supplied default. Used to make
 * {@link computeDifficulty} defensive against `null` / `undefined`
 * / hand‑crafted inputs from external callers.
 *
 * @param {*} value - Candidate number.
 * @param {number} fallback - Value returned when `value` is not
 *   a finite, non‑negative number.
 * @returns {number} The sanitised value.
 */
function sanitizeDifficultyInput(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

/**
 * Compute the raw (unfloored, uncapped) difficulty progress from
 * the player's distance and running time. The two inputs are
 * summed in their own units (distance in world units, time in
 * seconds) via {@link DIFFICULTY_DISTANCE_PER_LEVEL} and
 * {@link DIFFICULTY_TIME_PER_LEVEL} respectively, so a value of
 * `1` corresponds to "one full level's worth of progress".
 *
 * @param {number} distance - World units travelled (sanitised
 *   internally; non‑finite / negative inputs are treated as 0).
 * @param {number} runningTime - Seconds elapsed (sanitised
 *   internally; non‑finite / negative inputs are treated as 0).
 * @returns {number} Raw progress in [0, ∞).
 */
function rawDifficultyProgress(distance, runningTime) {
  const d = sanitizeDifficultyInput(distance, 0);
  const t = sanitizeDifficultyInput(runningTime, 0);
  const distProgress = d / DIFFICULTY_DISTANCE_PER_LEVEL;
  const timeProgress = t / DIFFICULTY_TIME_PER_LEVEL;
  return distProgress + timeProgress;
}

/**
 * Compute the current dynamic‑difficulty snapshot from the
 * player's distance and elapsed running time. Pure function — no
 * DOM, no Three.js, no state — so it is safe to call from the
 * per‑frame update loop and from unit tests.
 *
 * The returned object contains the following fields:
 *
 *   - `level` (integer in `[0, DIFFICULTY_MAX_LEVEL]`) — the
 *     floored raw progress, clamped to the cap. Multipliers below
 *     are derived from this value.
 *   - `rawProgress` (number in `[0, ∞)`) — the unfloored /
 *     uncapped progress value, exposed for callers that want to
 *     apply their own curve on top of the level (e.g. a UI bar
 *     showing "almost level 5").
 *   - `enemySpeedMultiplier` (number in `[1, ENEMY_SPEED_MAX_MULTIPLIER]`)
 *     — applied to the oncoming‑vehicle approach speed so later
 *     vehicles close in faster. A value of `1` means "no
 *     scaling".
 *   - `spawnDensityMultiplier` (number in `[1, SPAWN_DENSITY_MAX_MULTIPLIER]`)
 *     — informational density indicator. The effective per‑frame
 *     spawn parameters are expressed directly via
 *     `maxObjectsPerSegment` / `spawnChance` / `spawnCooldownSeconds`.
 *   - `maxObjectsPerSegment` (integer in `[MAX_OBJECTS_BASE, MAX_OBJECTS_CAP]`)
 *     — passed to {@link generateObjectsForSegment} so each road
 *     segment produces more objects as difficulty rises.
 *   - `spawnCooldownSeconds` (number in `[SPAWN_COOLDOWN_MIN, SPAWN_COOLDOWN_BASE]`)
 *     — replaces the hard‑coded `0.25` cooldown reset in the
 *     component's spawn loop.
 *   - `spawnChance` (number in `[SPAWN_CHANCE_BASE, SPAWN_CHANCE_MAX]`)
 *     — replaces the hard‑coded `0.3` per‑segment chance check.
 *
 * Both inputs are sanitised: `null`, `undefined`, `NaN`,
 * `Infinity` and negative numbers are treated as 0, so a caller
 * can pass either one of the two inputs and still receive a
 * sensible snapshot.
 *
 * @param {object} [params] - Parameters (all optional; missing
 *   or invalid inputs are treated as 0).
 * @param {number} [params.distance=0] - World units travelled.
 * @param {number} [params.runningTime=0] - Seconds elapsed.
 * @returns {{
 *   level: number,
 *   rawProgress: number,
 *   enemySpeedMultiplier: number,
 *   spawnDensityMultiplier: number,
 *   maxObjectsPerSegment: number,
 *   spawnCooldownSeconds: number,
 *   spawnChance: number,
 * }} Difficulty snapshot.
 */
export function computeDifficulty({ distance = 0, runningTime = 0 } = {}) {
  const raw = rawDifficultyProgress(distance, runningTime);
  // Clamp the raw progress to [0, DIFFICULTY_MAX_LEVEL] before
  // flooring, so negative inputs (defensively sanitised to 0)
  // cannot produce a negative level and over‑cap progress cannot
  // produce a level above DIFFICULTY_MAX_LEVEL.
  const level = Math.min(
    DIFFICULTY_MAX_LEVEL,
    Math.max(0, Math.floor(raw)),
  );
  const enemySpeedMultiplier = Math.min(
    ENEMY_SPEED_MAX_MULTIPLIER,
    1 + level * ENEMY_SPEED_PER_LEVEL,
  );
  const spawnDensityMultiplier = Math.min(
    SPAWN_DENSITY_MAX_MULTIPLIER,
    1 + level * SPAWN_DENSITY_PER_LEVEL,
  );
  // The per‑segment object count starts at MAX_OBJECTS_BASE and
  // gains 1 every `1 / MAX_OBJECTS_PER_LEVEL_STEP` levels,
  // clamped to [MAX_OBJECTS_BASE, MAX_OBJECTS_CAP]. With
  // MAX_OBJECTS_BASE=1, MAX_OBJECTS_PER_LEVEL_STEP=0.25 and
  // MAX_OBJECTS_CAP=3 the count rises as 1,1,1,1,2,2,2,2,3,3,3
  // for levels 0..10 — i.e. +1 object every 4 levels, then a
  // 3‑level plateau at the cap.
  const maxObjectsPerSegment = Math.max(
    MAX_OBJECTS_BASE,
    Math.min(
      MAX_OBJECTS_CAP,
      MAX_OBJECTS_BASE + Math.floor(level * MAX_OBJECTS_PER_LEVEL_STEP),
    ),
  );
  // The spawn cooldown shrinks linearly with level but is
  // floored at SPAWN_COOLDOWN_MIN so a high difficulty does not
  // collapse the cooldown to zero (which would starve the rest
  // of the per‑frame work).
  const spawnCooldownSeconds = Math.max(
    SPAWN_COOLDOWN_MIN,
    SPAWN_COOLDOWN_BASE - level * SPAWN_COOLDOWN_STEP,
  );
  // The per‑segment spawn chance grows linearly with level but
  // is capped at SPAWN_CHANCE_MAX so even at the top of the
  // curve the spawn loop retains a small amount of randomness.
  const spawnChance = Math.min(
    SPAWN_CHANCE_MAX,
    SPAWN_CHANCE_BASE + level * SPAWN_CHANCE_STEP,
  );
  return {
    level,
    rawProgress: raw,
    enemySpeedMultiplier,
    spawnDensityMultiplier,
    maxObjectsPerSegment,
    spawnCooldownSeconds,
    spawnChance,
  };
}

/**
 * Play a game‑over descending tone.
 *
 * @param {AudioContext} ctx
 */
export function playGameOverSound(ctx) {
  // Slow descending notes
  const notes = [400, 350, 300, 200];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const t = ctx.currentTime + i * 0.2;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}
