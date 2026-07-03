import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANES,
  getLaneX,
  clampLane,
  MAX_HEALTH,
  OBSTACLE_DAMAGE,
  VEHICLE_DAMAGE,
  REPAIR_HEAL,
  SEGMENT_LENGTH,
  MAX_CURVE_OFFSET,
  MAX_HEIGHT_DELTA,
  CURVE_NOISE_FREQUENCY,
  HEIGHT_NOISE_FREQUENCY,
  HEIGHT_NOISE_OFFSET,
  NOISE_OCTAVES,
  generateSegment,
  generateSegments,
  getRoadOffsetAt,
  sampleCurveOffset,
  sampleHeightOffset,
  OBJECT_TYPES,
  OBJECT_WEIGHTS,
  ONCOMING_VEHICLE_SPEED,
  ENEMY_VEHICLE_MODELS,
  ENEMY_VEHICLE_MODEL_MAP,
  ENEMY_VEHICLE_MODEL_IDS,
  pickRandomEnemyModel,
  getEnemyModelById,
  createObject,
  randomObjectType,
  generateObjectsForSegment,
  recycleObjects,
  CAMERA_Z,
  CAMERA_RECYCLE_MARGIN,
  JUMP_IMMUNITY_HEIGHT,
  ROAD_Y,
  checkCollision,
  applyCollision,
  calculateScore,
  startEngineHum,
  stopEngineHum,
  ENGINE_HUM_STOP_BUFFER,
  playLaneSwitchSound,
  playJumpSound,
  playCollisionSound,
  playPickupSound,
  playGameOverSound,
} from '../src/lib/utils/racingGame.js';

/* ===================================================================
   Constants
   =================================================================== */
describe('constants', () => {
  it('has 3 lanes', () => {
    expect(LANE_COUNT).toBe(3);
  });

  it('has LANE_WIDTH > 0', () => {
    expect(LANE_WIDTH).toBeGreaterThan(0);
  });

  it('has LANES object with LEFT, CENTER, RIGHT', () => {
    expect(LANES.LEFT).toBe(-1);
    expect(LANES.CENTER).toBe(0);
    expect(LANES.RIGHT).toBe(1);
  });

  it('has MAX_HEALTH of 5', () => {
    expect(MAX_HEALTH).toBe(5);
  });

  it('has correct damage/heal values', () => {
    expect(OBSTACLE_DAMAGE).toBe(1);
    expect(VEHICLE_DAMAGE).toBe(2);
    expect(REPAIR_HEAL).toBe(1);
  });

  it('has JUMP_IMMUNITY_HEIGHT > 0', () => {
    expect(JUMP_IMMUNITY_HEIGHT).toBeGreaterThan(0);
  });

  it('has ROAD_Y of 0', () => {
    expect(ROAD_Y).toBe(0);
  });

  it('defines all OBJECT_TYPES', () => {
    expect(OBJECT_TYPES.OBSTACLE).toBe('obstacle');
    expect(OBJECT_TYPES.ONCOMING_VEHICLE).toBe('oncoming_vehicle');
    expect(OBJECT_TYPES.REPAIR_KIT).toBe('repair_kit');
  });

  it('OBJECT_WEIGHTS sum to ~1', () => {
    const sum = Object.values(OBJECT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});

/* ===================================================================
   ONCOMING_VEHICLE_SPEED

   The oncoming-vehicle approaching speed is exposed as a tunable
   constant so the component can advance oncoming vehicles in
   road-space each frame (see `advanceOncomingVehicles` inside
   RacingGameScene.svelte). The tests below pin down its sign,
   finiteness and an upper bound that guards against accidental
   tweaks that would let vehicles zoom past the player before the
   player can react.
   =================================================================== */
describe('ONCOMING_VEHICLE_SPEED constant', () => {
  it('is exported and is a finite number', () => {
    expect(typeof ONCOMING_VEHICLE_SPEED).toBe('number');
    expect(Number.isFinite(ONCOMING_VEHICLE_SPEED)).toBe(true);
  });

  it('is positive (vehicles approach the player in +Z, do not recede)', () => {
    // A negative value would push oncoming vehicles *away* from the
    // player, which is the opposite of the requirement. A zero value
    // would leave them stationary (the previous behaviour), so the
    // sign strictly positive check is the core contract.
    expect(ONCOMING_VEHICLE_SPEED).toBeGreaterThan(0);
  });

  it('has a sane magnitude (not absurdly large)', () => {
    // Generous upper bound: any reasonable oncoming-vehicle speed is
    // well below 100 units / second. This guards against accidental
    // unit-mix-ups (e.g. ms vs s) or runaway tuning.
    expect(ONCOMING_VEHICLE_SPEED).toBeLessThan(100);
  });
});

/* ===================================================================
   ENEMY_VEHICLE_MODELS — exportable model configuration table

   The racing-game must differentiate enemy vehicles by appearance
   (geometry, proportions, colour, roof / lights / spoiler) AND by
   driving speed. The table is a frozen array of model descriptors;
   the tests below pin down count, structure, distinctness on every
   differentiating axis, and lookup helpers.
   =================================================================== */
describe('ENEMY_VEHICLE_MODELS table', () => {
  it('exports a frozen array', () => {
    expect(Array.isArray(ENEMY_VEHICLE_MODELS)).toBe(true);
    expect(Object.isFrozen(ENEMY_VEHICLE_MODELS)).toBe(true);
  });

  it('defines at least 3 distinct enemy vehicle models', () => {
    expect(ENEMY_VEHICLE_MODELS.length).toBeGreaterThanOrEqual(3);
  });

  it('each entry is frozen and contains every required field', () => {
    const required = [
      'id', 'label', 'weight', 'speed',
      'body', 'cabin', 'color',
      'hasRoof', 'hasSpoiler', 'wheelCount', 'headlightCount',
    ];
    const bodyRequired = ['width', 'height', 'length'];
    const cabinRequired = ['width', 'height', 'length'];
    for (const model of ENEMY_VEHICLE_MODELS) {
      expect(Object.isFrozen(model)).toBe(true);
      for (const key of required) {
        expect(model).toHaveProperty(key);
      }
      expect(typeof model.id).toBe('string');
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.label).toBe('string');
      expect(typeof model.weight).toBe('number');
      expect(model.weight).toBeGreaterThan(0);
      expect(typeof model.speed).toBe('number');
      expect(model.speed).toBeGreaterThan(0);
      expect(Object.isFrozen(model.body)).toBe(true);
      expect(Object.isFrozen(model.cabin)).toBe(true);
      for (const key of bodyRequired) {
        expect(model.body).toHaveProperty(key);
        expect(typeof model.body[key]).toBe('number');
      }
      for (const key of cabinRequired) {
        expect(model.cabin).toHaveProperty(key);
        expect(typeof model.cabin[key]).toBe('number');
      }
      expect(typeof model.color).toBe('number');
      expect(typeof model.hasRoof).toBe('boolean');
      expect(typeof model.hasSpoiler).toBe('boolean');
      expect(Number.isInteger(model.wheelCount)).toBe(true);
      expect(model.wheelCount).toBeGreaterThan(0);
      expect(Number.isInteger(model.headlightCount)).toBe(true);
      expect(model.headlightCount).toBeGreaterThan(0);
    }
  });

  it('all model ids are unique', () => {
    const ids = ENEMY_VEHICLE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the three expected archetype models (轿车 / 卡车 / 跑车)', () => {
    const ids = new Set(ENEMY_VEHICLE_MODELS.map((m) => m.id));
    // 3 named archetypes are part of the data layer contract.
    for (const id of ['sedan', 'truck', 'sports']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('models differ in body proportions', () => {
    // Each archetype has a distinct (width, height, length) signature.
    const signatures = ENEMY_VEHICLE_MODELS.map(
      (m) => `${m.body.width}x${m.body.height}x${m.body.length}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('models differ in primary body color', () => {
    const colors = ENEMY_VEHICLE_MODELS.map((m) => m.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('models differ in driving speed (speed values are distinct)', () => {
    const speeds = ENEMY_VEHICLE_MODELS.map((m) => m.speed);
    expect(new Set(speeds).size).toBe(speeds.length);
  });

  it('models differ on at least one feature flag or wheel count', () => {
    // The 3 archetypes must be distinguishable on the
    // hasRoof / hasSpoiler / wheelCount axes, not just geometry
    // and colour. Aggregate the flags so a single feature differing
    // is enough to satisfy the "明显区分" contract.
    const signatures = ENEMY_VEHICLE_MODELS.map(
      (m) => `${m.hasRoof}|${m.hasSpoiler}|${m.wheelCount}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('every model id appears in ENEMY_VEHICLE_MODEL_IDS', () => {
    expect(ENEMY_VEHICLE_MODEL_IDS.length).toBe(ENEMY_VEHICLE_MODELS.length);
    const modelIds = new Set(ENEMY_VEHICLE_MODELS.map((m) => m.id));
    for (const id of ENEMY_VEHICLE_MODEL_IDS) {
      expect(modelIds.has(id)).toBe(true);
    }
  });

  it('ENEMY_VEHICLE_MODEL_MAP maps every id back to the original model', () => {
    expect(Object.isFrozen(ENEMY_VEHICLE_MODEL_MAP)).toBe(true);
    for (const model of ENEMY_VEHICLE_MODELS) {
      expect(ENEMY_VEHICLE_MODEL_MAP[model.id]).toBe(model);
    }
  });
});

/* ===================================================================
   pickRandomEnemyModel

   Returns a model from ENEMY_VEHICLE_MODELS, weighted by each
   entry's `weight` field. Tests cover the basic return type,
   coverage of every model over many samples, and a coarse
   distribution check.
   =================================================================== */
describe('pickRandomEnemyModel', () => {
  it('returns one of the entries from ENEMY_VEHICLE_MODELS', () => {
    for (let i = 0; i < 200; i++) {
      const model = pickRandomEnemyModel();
      expect(ENEMY_VEHICLE_MODELS).toContain(model);
    }
  });

  it('all models appear over many samples (no model is unreachable)', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      seen.add(pickRandomEnemyModel().id);
    }
    for (const model of ENEMY_VEHICLE_MODELS) {
      expect(seen.has(model.id)).toBe(true);
    }
  });

  it('distribution is roughly uniform when all weights are equal', () => {
    // With equal weights, each model should appear ~N/3 times out of N
    // samples. Allow ±15% deviation to avoid flakiness on small samples
    // while still catching egregious weighting bugs.
    const N = 3000;
    const counts = {};
    for (const m of ENEMY_VEHICLE_MODELS) counts[m.id] = 0;
    for (let i = 0; i < N; i++) {
      counts[pickRandomEnemyModel().id] += 1;
    }
    const expected = N / ENEMY_VEHICLE_MODELS.length;
    const tolerance = expected * 0.15;
    for (const id of Object.keys(counts)) {
      expect(counts[id]).toBeGreaterThan(expected - tolerance);
      expect(counts[id]).toBeLessThan(expected + tolerance);
    }
  });

  it('returned model is frozen (consumers cannot mutate the table)', () => {
    const model = pickRandomEnemyModel();
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('always returns a defined, frozen entry from ENEMY_VEHICLE_MODELS (defensive contract)', () => {
    // Regression: if a (frozen) weight became NaN, the previous
    // implementation could spin a NaN-tainted accumulator and either
    // fall through the `r <= 0` check (NaN comparisons are always
    // false) — yielding the last-model fallback at best — or
    // NaN-taint the total and short-circuit to the first model. The
    // new implementation sanitises weights (NaN / non-positive
    // contribute zero) and always returns a defined, frozen entry
    // from the table.
    for (let i = 0; i < 1000; i++) {
      const model = pickRandomEnemyModel();
      expect(model).toBeDefined();
      expect(model).not.toBeNull();
      expect(ENEMY_VEHICLE_MODELS).toContain(model);
      expect(Object.isFrozen(model)).toBe(true);
    }
  });
});

/* ===================================================================
   getEnemyModelById
   =================================================================== */
describe('getEnemyModelById', () => {
  it('returns the matching model for a known id', () => {
    for (const model of ENEMY_VEHICLE_MODELS) {
      expect(getEnemyModelById(model.id)).toBe(model);
    }
  });

  it('returns null for an unknown id', () => {
    expect(getEnemyModelById('not-a-model')).toBeNull();
  });

  it('returns null for non-string ids', () => {
    expect(getEnemyModelById(undefined)).toBeNull();
    expect(getEnemyModelById(null)).toBeNull();
    expect(getEnemyModelById(42)).toBeNull();
    expect(getEnemyModelById({})).toBeNull();
  });

  it('returns null for prototype-chain keys (does not leak Object.prototype values)', () => {
    // Regression: a plain `MAP[id] || null` fallback would return
    // truthy inherited values for keys like '__proto__', 'constructor',
    // 'toString' / 'valueOf' / 'hasOwnProperty' — all of which live on
    // Object.prototype. Downstream code that reads `.speed` on the
    // returned value would then get `undefined` and produce undefined
    // behaviour. The implementation must use an own-property check.
    const prototypeKeys = [
      '__proto__',
      'constructor',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
    ];
    for (const key of prototypeKeys) {
      expect(getEnemyModelById(key)).toBeNull();
    }
  });
});

/* ===================================================================
   getLaneX
   =================================================================== */
describe('getLaneX', () => {
  it('returns 0 for center lane', () => {
    expect(getLaneX(0)).toBe(0);
  });

  it('returns negative for left lane', () => {
    expect(getLaneX(-1)).toBe(-LANE_WIDTH);
  });

  it('returns positive for right lane', () => {
    expect(getLaneX(1)).toBe(LANE_WIDTH);
  });

  it('is proportional to lane index', () => {
    expect(getLaneX(2)).toBe(2 * LANE_WIDTH);
    expect(getLaneX(-2)).toBe(-2 * LANE_WIDTH);
  });
});

/* ===================================================================
   clampLane
   =================================================================== */
describe('clampLane', () => {
  it('returns -1 for values below -1', () => {
    expect(clampLane(-5)).toBe(-1);
    expect(clampLane(-2)).toBe(-1);
  });

  it('returns 1 for values above 1', () => {
    expect(clampLane(3)).toBe(1);
    expect(clampLane(10)).toBe(1);
  });

  it('returns 0 for 0', () => {
    expect(clampLane(0)).toBe(0);
  });

  it('returns -1 for -1', () => {
    expect(clampLane(-1)).toBe(-1);
  });

  it('returns 1 for 1', () => {
    expect(clampLane(1)).toBe(1);
  });

  it('rounds to nearest integer', () => {
    expect(clampLane(0.4)).toBe(0);
    expect(clampLane(0.6)).toBe(1);
    expect(clampLane(-0.4)).toBe(0);
    expect(clampLane(-0.6)).toBe(-1);
  });
});

/* ===================================================================
   generateSegment
   =================================================================== */
describe('generateSegment', () => {
  it('returns an object with zStart, curveOffset, heightOffset, length', () => {
    const seg = generateSegment(0);
    expect(seg).toHaveProperty('zStart', 0);
    expect(seg).toHaveProperty('curveOffset');
    expect(seg).toHaveProperty('heightOffset');
    expect(seg).toHaveProperty('length', SEGMENT_LENGTH);
  });

  it('curveOffset is within ±MAX_CURVE_OFFSET', () => {
    for (let i = 0; i < 50; i++) {
      const seg = generateSegment(i * -20);
      expect(Math.abs(seg.curveOffset)).toBeLessThanOrEqual(MAX_CURVE_OFFSET + 1e-9);
    }
  });

  it('heightOffset is within ±MAX_HEIGHT_DELTA', () => {
    for (let i = 0; i < 50; i++) {
      const seg = generateSegment(i * -20);
      expect(Math.abs(seg.heightOffset)).toBeLessThanOrEqual(MAX_HEIGHT_DELTA + 1e-9);
    }
  });

  it('respects custom maxCurve and maxHeight options', () => {
    const seg = generateSegment(0, { maxCurve: 1, maxHeight: 0.5 });
    expect(Math.abs(seg.curveOffset)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.abs(seg.heightOffset)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('generates varying values across different z positions', () => {
    const offsets = new Set();
    for (let i = 0; i < 20; i++) {
      // Use non-integer z values so noise output is non-zero
      offsets.add(generateSegment(i * -20 + 0.5).curveOffset);
    }
    // There should be some variety (not all identical)
    expect(offsets.size).toBeGreaterThan(1);
  });

  it('is deterministic (same zStart yields same values)', () => {
    const a = generateSegment(-42.5);
    const b = generateSegment(-42.5);
    expect(b.curveOffset).toBe(a.curveOffset);
    expect(b.heightOffset).toBe(a.heightOffset);
  });
});

/* ===================================================================
   generateSegments
   =================================================================== */
describe('generateSegments', () => {
  it('generates the requested number of segments', () => {
    const segs = generateSegments(0, 5);
    expect(segs).toHaveLength(5);
  });

  it('each segment has decreasing zStart', () => {
    const segs = generateSegments(0, 5);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].zStart).toBe(segs[i - 1].zStart - SEGMENT_LENGTH);
    }
  });

  it('returns empty array for count = 0', () => {
    expect(generateSegments(0, 0)).toHaveLength(0);
  });
});

/* ===================================================================
   sampleCurveOffset / sampleHeightOffset
   =================================================================== */
describe('sampleCurveOffset', () => {
  it('returns finite values for all inputs', () => {
    for (let i = -100; i <= 100; i += 5) {
      expect(Number.isFinite(sampleCurveOffset(i))).toBe(true);
    }
  });

  it('is continuous (small delta → small change)', () => {
    const step = 0.001;
    let maxDelta = 0;
    for (let z = 0; z < 5; z += step) {
      const d = Math.abs(sampleCurveOffset(z) - sampleCurveOffset(z + step));
      maxDelta = Math.max(maxDelta, d);
    }
    // With low-frequency noise and 0.001 step, delta should be very small
    expect(maxDelta).toBeLessThan(0.05);
  });

  it('is within ±MAX_CURVE_OFFSET', () => {
    for (let i = -200; i <= 200; i++) {
      expect(Math.abs(sampleCurveOffset(i * 0.5))).toBeLessThanOrEqual(MAX_CURVE_OFFSET + 1e-9);
    }
  });

  it('is deterministic (same z → same result)', () => {
    const z = -37.25;
    expect(sampleCurveOffset(z)).toBe(sampleCurveOffset(z));
  });
});

describe('sampleHeightOffset', () => {
  it('returns finite values for all inputs', () => {
    for (let i = -100; i <= 100; i += 5) {
      expect(Number.isFinite(sampleHeightOffset(i))).toBe(true);
    }
  });

  it('is continuous (small delta → small change)', () => {
    const step = 0.001;
    let maxDelta = 0;
    for (let z = 0; z < 5; z += step) {
      const d = Math.abs(sampleHeightOffset(z) - sampleHeightOffset(z + step));
      maxDelta = Math.max(maxDelta, d);
    }
    expect(maxDelta).toBeLessThan(0.05);
  });

  it('is within ±MAX_HEIGHT_DELTA', () => {
    for (let i = -200; i <= 200; i++) {
      expect(Math.abs(sampleHeightOffset(i * 0.5))).toBeLessThanOrEqual(MAX_HEIGHT_DELTA + 1e-9);
    }
  });

  it('is deterministic (same z → same result)', () => {
    const z = -43.75;
    expect(sampleHeightOffset(z)).toBe(sampleHeightOffset(z));
  });
});

/* ===================================================================
   getRoadOffsetAt — delegates to sample*Offset functions
   =================================================================== */
describe('getRoadOffsetAt', () => {
  it('returns noise-based offset regardless of segments argument', () => {
    // With noise, the value at z=0 is 0 (Perlin noise is 0 at integer lattice points).
    // Empty segments and null segments should still return values.
    const result = getRoadOffsetAt([], 0);
    expect(result.curveOffset).toBeCloseTo(0);
    expect(result.heightOffset).toBeCloseTo(0);
  });

  it('ignores segments content and uses noise directly', () => {
    // Even with hand-crafted segment offsets, getRoadOffsetAt returns noise values.
    const segs = [{ zStart: 0, curveOffset: 999, heightOffset: 999, length: 20 }];
    const result = getRoadOffsetAt(segs, 0);
    // At z=0, noise gives 0, not 999
    expect(result.curveOffset).toBeCloseTo(0);
    expect(result.heightOffset).toBeCloseTo(0);
  });

  it('returns the same as sampling functions directly', () => {
    const z = -47.25;
    const direct = {
      curveOffset: sampleCurveOffset(z),
      heightOffset: sampleHeightOffset(z),
    };
    const viaSegments = getRoadOffsetAt([], z);
    expect(viaSegments.curveOffset).toBe(direct.curveOffset);
    expect(viaSegments.heightOffset).toBe(direct.heightOffset);
  });

  it('returns finite values for any z', () => {
    for (let z = -500; z <= 500; z += 10) {
      const result = getRoadOffsetAt([], z);
      expect(Number.isFinite(result.curveOffset)).toBe(true);
      expect(Number.isFinite(result.heightOffset)).toBe(true);
    }
  });

  it('is continuous (no step changes between adjacent z values)', () => {
    const step = 0.001;
    let maxCurveDelta = 0;
    let maxHeightDelta = 0;
    for (let z = -10; z < 10; z += step) {
      const a = getRoadOffsetAt([], z);
      const b = getRoadOffsetAt([], z + step);
      maxCurveDelta = Math.max(maxCurveDelta, Math.abs(b.curveOffset - a.curveOffset));
      maxHeightDelta = Math.max(maxHeightDelta, Math.abs(b.heightOffset - a.heightOffset));
    }
    // With step = 0.001, continuous noise should give very small deltas
    expect(maxCurveDelta).toBeLessThan(0.05);
    expect(maxHeightDelta).toBeLessThan(0.05);
  });

  it('is within expected amplitude range', () => {
    for (let z = -200; z <= 200; z += 0.5) {
      const result = getRoadOffsetAt([], z);
      expect(Math.abs(result.curveOffset)).toBeLessThanOrEqual(MAX_CURVE_OFFSET + 1e-9);
      expect(Math.abs(result.heightOffset)).toBeLessThanOrEqual(MAX_HEIGHT_DELTA + 1e-9);
    }
  });
});

/* ===================================================================
   createObject
   =================================================================== */
describe('createObject', () => {
  it('creates an object with correct type, lane, and position', () => {
    const obj = createObject('obstacle', 0, -30);
    expect(obj.type).toBe('obstacle');
    expect(obj.lane).toBe(0);
    expect(obj.z).toBe(-30);
    expect(obj.x).toBe(0);
    expect(obj.active).toBe(true);
  });

  it('places object in correct lane X', () => {
    const left = createObject('obstacle', -1, -30);
    expect(left.x).toBe(-LANE_WIDTH);
    const right = createObject('obstacle', 1, -30);
    expect(right.x).toBe(LANE_WIDTH);
  });

  it('accepts custom dimensions', () => {
    const obj = createObject('vehicle', 0, -30, 2, 1.5, 2.5);
    expect(obj.zWidth).toBe(2);
    expect(obj.xWidth).toBe(1.5);
    expect(obj.height).toBe(2.5);
  });

  it('attaches modelId and speed for oncoming vehicles via the options bag', () => {
    const obj = createObject(OBJECT_TYPES.ONCOMING_VEHICLE, 0, -30, 1.5, 1.2, 2.0, {
      modelId: 'truck',
      speed: 9,
    });
    expect(obj.modelId).toBe('truck');
    expect(obj.speed).toBe(9);
  });

  it('leaves modelId and speed as null for non-vehicle types', () => {
    const obstacle = createObject(OBJECT_TYPES.OBSTACLE, 0, -30, 0.6, 0.6, 0.8, {
      modelId: 'sedan',
      speed: 14,
    });
    expect(obstacle.modelId).toBeNull();
    expect(obstacle.speed).toBeNull();

    const kit = createObject(OBJECT_TYPES.REPAIR_KIT, 0, -30, 0.6, 0.6, 0.8, {
      modelId: 'sports',
      speed: 19,
    });
    expect(kit.modelId).toBeNull();
    expect(kit.speed).toBeNull();
  });

  it('falls back to null modelId / speed when options are missing or invalid', () => {
    const noOpts = createObject(OBJECT_TYPES.ONCOMING_VEHICLE, 0, -30, 1.5, 1.2, 2.0);
    expect(noOpts.modelId).toBeNull();
    expect(noOpts.speed).toBeNull();

    const badOpts = createObject(OBJECT_TYPES.ONCOMING_VEHICLE, 0, -30, 1.5, 1.2, 2.0, {
      modelId: 42, // wrong type
      speed: 'fast', // wrong type
    });
    expect(badOpts.modelId).toBeNull();
    expect(badOpts.speed).toBeNull();
  });

  it('rejects non-positive speed values (zero and negative fall back to null)', () => {
    // Regression: the previous guard only checked `typeof === 'number'`
    // and `Number.isFinite`, so `0` and negative numbers would pass
    // through as valid speeds. Zero would make the vehicle stand still
    // and a negative value would push it *away* from the player, both
    // of which violate the "approach speed toward the player" contract
    // documented on ONCOMING_VEHICLE_SPEED.
    for (const badSpeed of [0, -1, -14, -Infinity, Number.MIN_VALUE * -1]) {
      const obj = createObject(OBJECT_TYPES.ONCOMING_VEHICLE, 0, -30, 1.5, 1.2, 2.0, {
        modelId: 'sedan',
        speed: badSpeed,
      });
      expect(obj.modelId).toBe('sedan'); // modelId still valid
      expect(obj.speed).toBeNull();
    }
  });

  it('rejects non-finite speed values (NaN / Infinity fall back to null)', () => {
    // `Number.isFinite` already catches NaN / ±Infinity, but pin it
    // down explicitly so the regression intent is unambiguous.
    for (const badSpeed of [NaN, Infinity, -Infinity]) {
      const obj = createObject(OBJECT_TYPES.ONCOMING_VEHICLE, 0, -30, 1.5, 1.2, 2.0, {
        modelId: 'sports',
        speed: badSpeed,
      });
      expect(obj.speed).toBeNull();
    }
  });

  it('accepts strictly positive finite speeds (e.g. 0.0001, 14, 19)', () => {
    // Boundary: a very small but strictly positive speed must still
    // pass the guard (vehicles approach, just very slowly). The
    // current models' `speed` values (9 / 14 / 19) all sit comfortably
    // above the floor.
    for (const goodSpeed of [0.0001, 1, 9, 14, 19, 100]) {
      const obj = createObject(OBJECT_TYPES.ONCOMING_VEHICLE, 0, -30, 1.5, 1.2, 2.0, {
        modelId: 'sedan',
        speed: goodSpeed,
      });
      expect(obj.speed).toBe(goodSpeed);
    }
  });
});

/* ===================================================================
   randomObjectType
   =================================================================== */
describe('randomObjectType', () => {
  it('returns one of the valid types', () => {
    const valid = Object.values(OBJECT_TYPES);
    for (let i = 0; i < 100; i++) {
      expect(valid).toContain(randomObjectType());
    }
  });

  it('can return all types over many calls', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      seen.add(randomObjectType());
    }
    expect(seen.has(OBJECT_TYPES.OBSTACLE)).toBe(true);
    expect(seen.has(OBJECT_TYPES.ONCOMING_VEHICLE)).toBe(true);
    expect(seen.has(OBJECT_TYPES.REPAIR_KIT)).toBe(true);
  });
});

/* ===================================================================
   generateObjectsForSegment
   =================================================================== */
describe('generateObjectsForSegment', () => {
  it('returns between 0 and maxObjects items', () => {
    const seg = { zStart: 0, length: 20 };
    for (let i = 0; i < 50; i++) {
      const objs = generateObjectsForSegment(seg, 2);
      expect(objs.length).toBeGreaterThanOrEqual(0);
      expect(objs.length).toBeLessThanOrEqual(2);
    }
  });

  it('all objects have lanes within [-1, 1]', () => {
    const seg = { zStart: 0, length: 20 };
    for (let i = 0; i < 50; i++) {
      const objs = generateObjectsForSegment(seg, 3);
      objs.forEach((o) => {
        expect(o.lane).toBeGreaterThanOrEqual(-1);
        expect(o.lane).toBeLessThanOrEqual(1);
      });
    }
  });

  it('all objects have z within the segment range', () => {
    const seg = { zStart: 0, length: 20 };
    for (let i = 0; i < 50; i++) {
      const objs = generateObjectsForSegment(seg, 2);
      objs.forEach((o) => {
        expect(o.z).toBeGreaterThanOrEqual(-20);
        expect(o.z).toBeLessThanOrEqual(0);
      });
    }
  });

  it('caps at 3 objects max regardless of maxObjects argument', () => {
    const seg = { zStart: 0, length: 20 };
    for (let i = 0; i < 50; i++) {
      const objs = generateObjectsForSegment(seg, 100);
      expect(objs.length).toBeLessThanOrEqual(3);
    }
  });

  it('oncoming vehicles have larger height', () => {
    const seg = { zStart: 0, length: 20 };
    for (let i = 0; i < 100; i++) {
      const objs = generateObjectsForSegment(seg, 3);
      objs.forEach((o) => {
        if (o.type === OBJECT_TYPES.ONCOMING_VEHICLE) {
          expect(o.height).toBeGreaterThanOrEqual(1.5);
        } else {
          expect(o.height).toBeLessThanOrEqual(1);
        }
      });
    }
  });

  it('obstacle collision descriptor matches the visual 1.2×0.8×1.2 box (zWidth=0.6, xWidth=0.6, height=0.8)', () => {
    // The obstacle is rendered as BoxGeometry(1.2, 0.8, 1.2) in the scene;
    // the collision descriptor (zWidth is half-extent) must align with that
    // visual volume so collision feels fair.
    const seg = { zStart: 0, length: 20 };
    let sawObstacle = false;
    for (let i = 0; i < 200; i++) {
      const objs = generateObjectsForSegment(seg, 3);
      for (const o of objs) {
        if (o.type === OBJECT_TYPES.OBSTACLE) {
          expect(o.zWidth).toBe(0.6);
          expect(o.xWidth).toBe(0.6);
          expect(o.height).toBe(0.8);
          sawObstacle = true;
        }
      }
    }
    expect(sawObstacle).toBe(true);
  });

  it('oncoming vehicles carry a modelId drawn from ENEMY_VEHICLE_MODELS', () => {
    const seg = { zStart: 0, length: 20 };
    const validIds = new Set(ENEMY_VEHICLE_MODEL_IDS);
    let sawVehicle = false;
    for (let i = 0; i < 500; i++) {
      const objs = generateObjectsForSegment(seg, 3);
      for (const o of objs) {
        if (o.type === OBJECT_TYPES.ONCOMING_VEHICLE) {
          expect(typeof o.modelId).toBe('string');
          expect(validIds.has(o.modelId)).toBe(true);
          sawVehicle = true;
        }
      }
    }
    expect(sawVehicle).toBe(true);
  });

  it('oncoming vehicle speed matches the picked model\u2019s speed exactly', () => {
    const seg = { zStart: 0, length: 20 };
    for (let i = 0; i < 500; i++) {
      const objs = generateObjectsForSegment(seg, 3);
      for (const o of objs) {
        if (o.type === OBJECT_TYPES.ONCOMING_VEHICLE) {
          const model = getEnemyModelById(o.modelId);
          expect(model).not.toBeNull();
          expect(o.speed).toBe(model.speed);
        }
      }
    }
  });

  it('non-vehicle objects always have modelId and speed as null', () => {
    const seg = { zStart: 0, length: 20 };
    for (let i = 0; i < 500; i++) {
      const objs = generateObjectsForSegment(seg, 3);
      for (const o of objs) {
        if (o.type !== OBJECT_TYPES.ONCOMING_VEHICLE) {
          expect(o.modelId).toBeNull();
          expect(o.speed).toBeNull();
        }
      }
    }
  });

  it('every archetype (轿车 / 卡车 / 跑车) appears among generated vehicles', () => {
    // Generate enough segments to expect all three models. With
    // maxObjects = 3 and OBJECT_WEIGHTS giving oncoming vehicles a
    // 0.35 share, the expected number of vehicles per call is small
    // (≤ 1 on average), so 4000 segments is more than enough to see
    // every archetype on a uniform random distribution.
    const seg = { zStart: 0, length: 20 };
    const seenModels = new Set();
    for (let i = 0; i < 4000; i++) {
      const objs = generateObjectsForSegment(seg, 3);
      for (const o of objs) {
        if (o.type === OBJECT_TYPES.ONCOMING_VEHICLE) {
          seenModels.add(o.modelId);
        }
      }
      if (seenModels.size === ENEMY_VEHICLE_MODELS.length) break;
    }
    expect(seenModels.size).toBe(ENEMY_VEHICLE_MODELS.length);
    for (const model of ENEMY_VEHICLE_MODELS) {
      expect(seenModels.has(model.id)).toBe(true);
    }
  });
});

/* ===================================================================
   recycleObjects
   =================================================================== */
describe('recycleObjects', () => {
  it('removes objects behind the player Z plus cleanup margin', () => {
    const objects = [
      { z: -10 },
      { z: 0 },
      { z: 5 },
      { z: 15 },
    ];
    // Default cleanupMargin is now CAMERA_RECYCLE_MARGIN (12), so
    // threshold = 0 + 12 = 12; z=-10, 0, 5 are <12 → kept; z=15 → removed.
    const result = recycleObjects(objects, 0);
    expect(result).toHaveLength(3);
    expect(result[0].z).toBe(-10);
    expect(result[1].z).toBe(0);
    expect(result[2].z).toBe(5);
  });

  it('uses cleanupMargin to extend retention zone', () => {
    const objects = [{ z: 12 }, { z: 8 }, { z: -5 }];
    const result = recycleObjects(objects, 0, 10);
    // threshold = 0 + 10 = 10, so z=8 stays, z=12 is removed
    expect(result).toHaveLength(2);
  });

  it('returns empty array when all objects are behind', () => {
    const objects = [{ z: 20 }, { z: 30 }];
    expect(recycleObjects(objects, 0, 5)).toHaveLength(0);
  });

  it('filters out null/undefined objects gracefully', () => {
    const objects = [{ z: -10 }, null, undefined, { z: 5 }];
    const result = recycleObjects(objects, 0);
    expect(result).toHaveLength(2);
  });

  it('filters out objects without a valid numeric z', () => {
    const objects = [{ z: -10 }, { z: undefined }, { z: 'abc' }, { z: 5 }];
    const result = recycleObjects(objects, 0);
    expect(result).toHaveLength(2);
  });

  it('default cleanup margin keeps objects until they exit the camera near plane', () => {
    // Regression: the previous default (10) recycled objects while they
    // were still in the camera's view at z≈12. The default must be at
    // least as large as the camera Z position so the player never sees
    // an object pop out while it's still rendered.
    expect(CAMERA_RECYCLE_MARGIN).toBeGreaterThanOrEqual(CAMERA_Z);

    const objects = [{ z: 8 }, { z: 11 }, { z: 12.5 }, { z: 20 }];
    const result = recycleObjects(objects, 0);
    // z=8 and z=11 are in front of / right at the camera → keep
    // z=12.5 and z=20 are behind the camera → remove
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.z)).toEqual([8, 11]);
  });
});

/* ===================================================================
   checkCollision
   =================================================================== */
describe('checkCollision', () => {
  it('returns false for inactive object', () => {
    const player = { lane: 0, z: -10, y: 0 };
    const object = { active: false, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.OBSTACLE };
    expect(checkCollision(player, object)).toBe(false);
  });

  it('returns false when lane differs', () => {
    const player = { lane: 0, z: -10, y: 0 };
    const object = { active: true, lane: 1, z: -10, zWidth: 1, type: OBJECT_TYPES.OBSTACLE, height: 1 };
    expect(checkCollision(player, object)).toBe(false);
  });

  it('returns false when player Z is out of object Z bounds', () => {
    const player = { lane: 0, z: -50, y: 0 };
    const object = { active: true, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.OBSTACLE, height: 1 };
    expect(checkCollision(player, object)).toBe(false);
  });

  it('returns true for obstacle collision when player is on ground', () => {
    const player = { lane: 0, z: -10, y: 0 };
    const object = { active: true, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.OBSTACLE, height: 0.8 };
    expect(checkCollision(player, object)).toBe(true);
  });

  it('returns false for obstacle when player is jumping above immunity height', () => {
    const player = { lane: 0, z: -10, y: 2.0 };
    const object = { active: true, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.OBSTACLE, height: 0.8 };
    expect(checkCollision(player, object)).toBe(false);
  });

  it('returns true for obstacle when player Y is exactly at the obstacle top (boundary, not strictly above)', () => {
    // Jump immunity requires player.y to be strictly greater than object.height.
    // At exactly object.height the player still grazes the top of the
    // obstacle, so the collision is registered.
    const player = { lane: 0, z: -10, y: 0.8 };
    const object = { active: true, lane: 0, z: -10, zWidth: 0.6, type: OBJECT_TYPES.OBSTACLE, height: 0.8 };
    expect(checkCollision(player, object)).toBe(true);
  });

  it('returns false for obstacle when player Y is just above the obstacle top', () => {
    // Just barely above object.height — jump immunity kicks in.
    const player = { lane: 0, z: -10, y: 0.8 + 1e-3 };
    const object = { active: true, lane: 0, z: -10, zWidth: 0.6, type: OBJECT_TYPES.OBSTACLE, height: 0.8 };
    expect(checkCollision(player, object)).toBe(false);
  });

  it('returns true for obstacle when player jumps but is below immunity height', () => {
    const player = { lane: 0, z: -10, y: 0.5 };
    const object = { active: true, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.OBSTACLE, height: 0.8 };
    expect(checkCollision(player, object)).toBe(true);
  });

  it('returns true for oncoming vehicle (对向来车忽略 Y 轴) — Y overlaps', () => {
    const player = { lane: 0, z: -10, y: 2.0 };
    const object = { active: true, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.ONCOMING_VEHICLE, height: 2.0 };
    expect(checkCollision(player, object)).toBe(true);
  });

  it('returns true for oncoming vehicle when player is far above (对向来车忽略 Y 轴)', () => {
    const player = { lane: 0, z: -10, y: 5.0 };
    const object = { active: true, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.ONCOMING_VEHICLE, height: 2.0 };
    // Oncoming vehicles always collide regardless of jump height
    expect(checkCollision(player, object)).toBe(true);
  });

  it('returns true for repair kit pickup on same lane/z', () => {
    const player = { lane: 0, z: -10, y: 0 };
    const object = { active: true, lane: 0, z: -10, zWidth: 1, type: OBJECT_TYPES.REPAIR_KIT, height: 0.8 };
    expect(checkCollision(player, object)).toBe(true);
  });
});

/* ===================================================================
   applyCollision
   =================================================================== */
describe('applyCollision', () => {
  it('deducts OBSTACLE_DAMAGE for obstacle', () => {
    const result = applyCollision(5, { type: OBJECT_TYPES.OBSTACLE });
    expect(result.healthDelta).toBe(-OBSTACLE_DAMAGE);
    expect(result.health).toBe(4);
  });

  it('deducts VEHICLE_DAMAGE for oncoming vehicle', () => {
    const result = applyCollision(5, { type: OBJECT_TYPES.ONCOMING_VEHICLE });
    expect(result.healthDelta).toBe(-VEHICLE_DAMAGE);
    expect(result.health).toBe(3);
  });

  it('heals REPAIR_HEAL for repair kit', () => {
    const result = applyCollision(3, { type: OBJECT_TYPES.REPAIR_KIT });
    expect(result.healthDelta).toBe(REPAIR_HEAL);
    expect(result.health).toBe(4);
  });

  it('caps health at MAX_HEALTH', () => {
    const result = applyCollision(5, { type: OBJECT_TYPES.REPAIR_KIT });
    expect(result.health).toBe(5);
  });

  it('clamps health to 0 minimum', () => {
    const result = applyCollision(1, { type: OBJECT_TYPES.ONCOMING_VEHICLE });
    expect(result.health).toBe(0);
  });

  it('handles unknown object type gracefully', () => {
    const result = applyCollision(3, { type: 'unknown' });
    expect(result.healthDelta).toBe(0);
    expect(result.health).toBe(3);
  });

  it('returns correct delta when health would go negative', () => {
    const result = applyCollision(1, { type: OBJECT_TYPES.OBSTACLE });
    expect(result.healthDelta).toBe(-1);
    expect(result.health).toBe(0);
  });
});

/* ===================================================================
   calculateScore
   =================================================================== */
describe('calculateScore', () => {
  it('returns 0 for zero distance', () => {
    expect(calculateScore(0)).toBe(0);
  });

  it('returns floor of distance * multiplier', () => {
    expect(calculateScore(100, 1)).toBe(100);
    expect(calculateScore(150, 2)).toBe(300);
  });

  it('works with negative distance (player moving forward = negative Z)', () => {
    expect(calculateScore(-100, 1)).toBe(100);
  });

  it('defaults multiplier to 1 with negative distance', () => {
    expect(calculateScore(-100)).toBe(100);
  });

  it('defaults multiplier to 1', () => {
    expect(calculateScore(50)).toBe(50);
  });

  it('maintains integer result', () => {
    expect(calculateScore(123.456, 1)).toBe(123);
    expect(calculateScore(99.9, 1)).toBe(99);
  });
});

/* ===================================================================
   Sound functions — AudioContext mock smoke tests
   =================================================================== */
describe('sound functions', () => {
  let mockCtx;
  let mockOsc;
  let mockGain;

  beforeEach(() => {
    mockGain = {
      gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    mockOsc = {
      type: '',
      frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => mockGain),
      start: vi.fn(),
      stop: vi.fn(),
      context: { currentTime: 0 },
    };
    mockCtx = {
      currentTime: 0,
      destination: 'mock-dest',
      createOscillator: vi.fn(() => mockOsc),
      createGain: vi.fn(() => mockGain),
    };
  });

  describe('startEngineHum', () => {
    it('creates and starts an oscillator', () => {
      const engine = startEngineHum(mockCtx);
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(engine.oscillator).toBe(mockOsc);
      expect(engine.gain).toBe(mockGain);
    });
  });

  describe('stopEngineHum', () => {
    it('stops the engine with a fade‑out ramp', () => {
      const engine = { oscillator: mockOsc, gain: mockGain };
      stopEngineHum(engine);
      expect(mockGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 0.3);
      expect(mockOsc.stop).toHaveBeenCalledWith(0.3 + ENGINE_HUM_STOP_BUFFER);
    });

    it('does nothing when engine is null', () => {
      expect(() => stopEngineHum(null)).not.toThrow();
    });

    it('does nothing when engine.oscillator is null', () => {
      expect(() => stopEngineHum({ oscillator: null, gain: mockGain })).not.toThrow();
    });

    it('does nothing when engine.gain is null', () => {
      expect(() => stopEngineHum({ oscillator: mockOsc, gain: null })).not.toThrow();
    });
  });

  describe('playLaneSwitchSound', () => {
    it('creates and starts oscillator nodes', () => {
      playLaneSwitchSound(mockCtx);
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(mockOsc.stop).toHaveBeenCalled();
    });
  });

  describe('playJumpSound', () => {
    it('creates two oscillator nodes (both inline)', () => {
      playJumpSound(mockCtx);
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    });
  });

  describe('playCollisionSound', () => {
    it('creates oscillator nodes', () => {
      playCollisionSound(mockCtx);
      expect(mockCtx.createOscillator).toHaveBeenCalled();
    });
  });

  describe('playPickupSound', () => {
    it('creates and starts oscillator', () => {
      playPickupSound(mockCtx);
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(mockOsc.stop).toHaveBeenCalled();
    });
  });

  describe('playGameOverSound', () => {
    it('creates multiple oscillator nodes for descending notes', () => {
      playGameOverSound(mockCtx);
      // 4 notes = 4 oscillators created
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(4);
    });
  });
});
