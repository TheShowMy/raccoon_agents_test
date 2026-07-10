/**
 * Racing Game — difficulty module
 *
 * Pure functions for dynamic difficulty computation based on distance
 * and running time.
 */

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
