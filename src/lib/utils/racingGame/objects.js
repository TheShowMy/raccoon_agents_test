/**
 * Racing Game — objects module
 *
 * Pure functions for road object creation, collision detection,
 * scoring, and recycling.
 */

import { getLaneX } from './road.js';

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
