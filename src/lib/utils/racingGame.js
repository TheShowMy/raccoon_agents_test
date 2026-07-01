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

/**
 * Approaching speed of an oncoming vehicle in world units per second,
 * measured in the +Z direction (toward the player). Oncoming vehicles
 * advance their own road-space Z by this amount every frame in addition
 * to the global world scroll, so they close in on the player at the
 * sum of this constant and the player's forward speed. This makes them
 * visibly drive toward the player like real oncoming traffic rather
 * than appearing as stationary props carried past the camera by the
 * world scroll.
 */
export const ONCOMING_VEHICLE_SPEED = 14;

/**
 * Create a road object descriptor.
 *
 * @param {string} type - One of OBJECT_TYPES.
 * @param {number} lane - Lane index (-1, 0, 1).
 * @param {number} z - World Z position (negative = ahead of player).
 * @param {number} [zWidth=1] - Half‑width of the object's collision zone along Z.
 * @param {number} [xWidth=1] - Half‑width of the object's collision zone along X.
 * @param {number} [height=1] - Height of the object (oncoming vehicles are taller).
 * @returns {object} Object descriptor.
 */
export function createObject(type, lane, z, zWidth = 1, xWidth = 1, height = 1) {
  return {
    type,
    lane,
    x: getLaneX(lane),
    z,
    zWidth,
    xWidth,
    height,
    active: true,
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
    objects.push(
      createObject(
        type,
        lane,
        z,
        /* zWidth */ isVehicle ? 1.5 : 0.6,
        /* xWidth */ isVehicle ? 1.2 : 0.6,
        /* height */ isVehicle ? 2.0 : 0.8,
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
 * @param {AudioContext} ctx - Web Audio API context.
 * @returns {{ oscillator: OscillatorNode, gain: GainNode }}
 */
export function startEngineHum(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(120, ctx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  return { oscillator: osc, gain };
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
