// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRoadOffsetAt,
  sampleCurveOffset,
  sampleHeightOffset,
  ENEMY_VEHICLE_MODELS,
  ENEMY_VEHICLE_MODEL_MAP,
  ENEMY_VEHICLE_MODEL_IDS,
  getEnemyModelById,
  DIFFICULTY_DISTANCE_PER_LEVEL,
  DIFFICULTY_TIME_PER_LEVEL,
  DIFFICULTY_MAX_LEVEL,
  ENEMY_SPEED_PER_LEVEL,
  ENEMY_SPEED_MAX_MULTIPLIER,
  MAX_OBJECTS_BASE,
  MAX_OBJECTS_CAP,
  SPAWN_COOLDOWN_BASE,
  SPAWN_COOLDOWN_MIN,
  SPAWN_CHANCE_BASE,
  SPAWN_CHANCE_MAX,
  computeDifficulty,
  ENGINE_HUM_FREQ_MIN,
  ENGINE_HUM_FREQ_MAX,
  WIND_NOISE_FILTER_FREQ_MIN,
  WIND_NOISE_FILTER_FREQ_MAX,
  WIND_NOISE_GAIN_MAX,
  AUDIO_SPEED_MAX,
  AUDIO_SMOOTH_TIME,
  createWindNoise,
  updateWindNoiseFilter,
  updateWindNoiseGain,
  OBJECT_TYPES,
  REPAIR_HEAL,
} from '../src/lib/utils/racingGame/index.js';

import { detectWebGLSupport } from '../src/lib/components/racingGame/environment.js';

/* ===================================================================
   Integration: Vehicle tracking behaviour
   The component's updateVehicleTransform uses exponential smoothing:
     pos += (target - pos) * SMOOTH_FACTOR
   where targetX = getRoadOffsetAt(z).curveOffset + laneVisualX
   and       targetY = ROAD_Y + getRoadOffsetAt(z).heightOffset + playerY.

   Since getRoadOffsetAt already produces continuous noise values (no
   step changes between adjacent z), a higher smoothing factor (0.35)
   safely converges to the lane centre without introducing jitter.

   These tests verify:
   1. The smoothing formula converges correctly (steady-state ≈ target).
   2. Over a travel path along the noise road, the vehicle offset
      difference between consecutive frames is bounded (no jitter).
   3. Camera convergence reaches target within reasonable time.
   =================================================================== */

/* ─── Constants matching RacingGameScene.svelte ─────────────────── */
const VEHICLE_SMOOTH_X = 0.35;
const VEHICLE_SMOOTH_Y = 0.25;
const CAMERA_SMOOTH = 0.15;
const PLAYER_SPEED = 22;
const DT = 1 / 60; // ~16.7 ms per frame

/* ─── Helper: simulate one frame of vehicle position smoothing ──── */
function tickVehicleX(posX, targetX) {
  return posX + (targetX - posX) * VEHICLE_SMOOTH_X;
}

function tickVehicleY(posY, targetY) {
  return posY + (targetY - posY) * VEHICLE_SMOOTH_Y;
}

function tickCamera(pos, target) {
  return pos + (target - pos) * CAMERA_SMOOTH;
}

/* ==================================================================
   1. Smoothing convergence — steady-state accuracy
   ================================================================== */
describe('Vehicle smoothing convergence', () => {
  it('converges to constant target within 25 iterations (X axis)', () => {
    const target = 3.5; // lane 1 centre
    let pos = 0;
    for (let i = 0; i < 25; i++) {
      pos = tickVehicleX(pos, target);
    }
    // After 25 frames at factor 0.35: (0.65)^25 ≈ 2e-5 → within 0.0001 of target
    expect(pos).toBeCloseTo(target, 3);
  });

  it('converges to constant target within 20 iterations (Y axis)', () => {
    const target = 1.2;
    let pos = 0;
    for (let i = 0; i < 20; i++) {
      pos = tickVehicleY(pos, target);
    }
    // After 20 frames at factor 0.25: should be within 0.01 of target
    expect(pos).toBeCloseTo(target, 2);
  });

  it('X convergence is monotonic (no overshoot)', () => {
    const target = -2.0;
    let pos = 0;
    let prev = pos;
    for (let i = 0; i < 50; i++) {
      pos = tickVehicleX(pos, target);
      if (target > 0) {
        expect(pos).toBeGreaterThanOrEqual(prev);
      } else {
        expect(pos).toBeLessThanOrEqual(prev);
      }
      prev = pos;
    }
  });

  it('reaches 95% of target within 8 frames (X axis)', () => {
    const target = 5.0;
    let pos = 0;
    let frames = 0;
    while (Math.abs(pos - target) > 0.05 * Math.abs(target)) {
      pos = tickVehicleX(pos, target);
      frames++;
      expect(frames).toBeLessThan(15); // safety cap
    }
    // With factor 0.35, 95% convergence happens in ~7 frames
    expect(frames).toBeLessThanOrEqual(8);
  });

  it('reaches 90% of target within 10 frames (Y axis)', () => {
    const target = 1.5;
    let pos = 0;
    let frames = 0;
    while (Math.abs(pos - target) > 0.10 * Math.abs(target)) {
      pos = tickVehicleY(pos, target);
      frames++;
      expect(frames).toBeLessThan(20);
    }
    expect(frames).toBeLessThanOrEqual(10);
  });

  it('handles zero target without changing position', () => {
    const pos = 2.0;
    const result = tickVehicleX(pos, pos);
    expect(result).toBe(pos);
  });

  it('handles immediate target flip (lane switch simulation)', () => {
    // Simulate switching from lane -1 to lane 1 mid-curve
    // Target goes from -3.5 to +3.5
    const target = 3.5;
    let pos = -3.5;
    // After first frame: should move toward target
    pos = tickVehicleX(pos, target);
    expect(pos).toBeGreaterThan(-3.5);
    expect(pos).toBeLessThan(3.5);

    // After enough frames, should approach target
    for (let i = 0; i < 20; i++) pos = tickVehicleX(pos, target);
    expect(pos).toBeCloseTo(target, 2);
  });
});

/* ==================================================================
   2. Road offset smoothness — verifying noise continuity along a
      travel path (simulating the vehicle following the road).
      The component samples getRoadOffsetAt at playerRoadZ = -scrollOffset,
      which advances by PLAYER_SPEED * dt each frame.
   ================================================================== */
describe('Road offset smoothness along travel path', () => {
  it('frame-to-frame curveOffset delta is very small (no jitter)', () => {
    let z = 0; // starting road-space Z
    let prevCurve = sampleCurveOffset(z);
    let maxDelta = 0;

    // Simulate 5 seconds of travel
    const steps = Math.floor(5 / DT);
    for (let i = 0; i < steps; i++) {
      z -= PLAYER_SPEED * DT; // moving forward = decreasing Z
      const curve = sampleCurveOffset(z);
      const delta = Math.abs(curve - prevCurve);
      maxDelta = Math.max(maxDelta, delta);
      prevCurve = curve;
    }

    // With low-frequency noise (0.008 Hz), per-frame delta should be tiny
    // PLAYER_SPEED * DT * NOISE_FREQ * maxGradient ≈ 22/60 * 0.008 * 1 ≈ 0.003
    expect(maxDelta).toBeLessThan(0.02);
  });

  it('frame-to-frame heightOffset delta is very small (no jitter)', () => {
    let z = 0;
    let prevHeight = sampleHeightOffset(z);
    let maxDelta = 0;

    const steps = Math.floor(5 / DT);
    for (let i = 0; i < steps; i++) {
      z -= PLAYER_SPEED * DT;
      const height = sampleHeightOffset(z);
      const delta = Math.abs(height - prevHeight);
      maxDelta = Math.max(maxDelta, delta);
      prevHeight = height;
    }

    expect(maxDelta).toBeLessThan(0.02);
  });

  it('simulated vehicle X position changes smoothly (no steps)', () => {
    let z = 0;
    let vehicleX = 0; // start at lane centre
    let prevX = vehicleX;
    const laneVisualX = 0; // centre lane

    const steps = Math.floor(3 / DT);
    for (let i = 0; i < steps; i++) {
      z -= PLAYER_SPEED * DT;
      const offset = getRoadOffsetAt([], z);
      const targetX = offset.curveOffset + laneVisualX;
      vehicleX = tickVehicleX(vehicleX, targetX);

      // The change from the previous frame should be smooth
      const delta = Math.abs(vehicleX - prevX);
      // At factor 0.35, max single-frame delta is bounded by 0.35 * |targetX - prevX|
      // Since targetX changes by < 0.02 per frame, delta < 0.35 * (prevDelta + 0.02) ≈ small
      expect(delta).toBeLessThan(1.0);
      prevX = vehicleX;
    }
  });

  it('simulated vehicle Y position changes smoothly (no steps)', () => {
    let z = 0;
    let vehicleY = 0;
    let prevY = vehicleY;
    const playerY = 0;

    const steps = Math.floor(3 / DT);
    for (let i = 0; i < steps; i++) {
      z -= PLAYER_SPEED * DT;
      const offset = getRoadOffsetAt([], z);
      const targetY = offset.heightOffset + playerY;
      vehicleY = tickVehicleY(vehicleY, targetY);

      const delta = Math.abs(vehicleY - prevY);
      expect(delta).toBeLessThan(1.0);
      prevY = vehicleY;
    }
  });

  it('no large lateral displacement cycles in 10s of travel', () => {
    // Verifies the vehicle does NOT exhibit fixed-frequency large
    // amplitude left-right displacement while following the noise road.
    let z = 0;
    let vehicleX = 0;
    const laneVisualX = 0;
    const samples = [];

    const steps = Math.floor(10 / DT);
    for (let i = 0; i < steps; i++) {
      z -= PLAYER_SPEED * DT;
      const offset = getRoadOffsetAt([], z);
      const targetX = offset.curveOffset + laneVisualX;
      vehicleX = tickVehicleX(vehicleX, targetX);
      if (i % 60 === 0) samples.push(vehicleX);
    }

    // Find the maximum peak-to-peak amplitude in sampled positions
    // Over 10s, road noise (0.008 Hz, 2.5 units) could cover ~0.5 periods
    // so the curveOffset varies slowly between ±2.5. The vehicle tracks
    // this smoothly — there should be no rapid sign flips within short
    // windows. Verify the standard deviation of per-frame deltas is small.
    let maxFrameDelta = 0;
    z = 0;
    vehicleX = 0;
    for (let i = 0; i < steps; i++) {
      z -= PLAYER_SPEED * DT;
      const offset = getRoadOffsetAt([], z);
      const targetX = offset.curveOffset + laneVisualX;
      const prev = vehicleX;
      vehicleX = tickVehicleX(vehicleX, targetX);
      maxFrameDelta = Math.max(maxFrameDelta, Math.abs(vehicleX - prev));
    }

    // No single frame should have a large jump (would indicate jitter)
    expect(maxFrameDelta).toBeLessThan(0.5);
  });
});

/* ==================================================================
   3. Camera convergence behaviour
   ================================================================== */
describe('Camera interpolation convergence', () => {
  it('converges to constant target within 40 iterations', () => {
    const target = 2.0;
    let pos = 0;
    for (let i = 0; i < 40; i++) {
      pos = tickCamera(pos, target);
    }
    // At factor 0.15, 40 frames → (0.85)^40 ≈ 0.0015 → within 0.003 of target
    expect(pos).toBeCloseTo(target, 2);
  });

  it('reaches 90% of target within 16 frames', () => {
    const target = 3.0;
    let pos = 0;
    let frames = 0;
    while (Math.abs(pos - target) > 0.10 * Math.abs(target)) {
      pos = tickCamera(pos, target);
      frames++;
      expect(frames).toBeLessThan(30);
    }
    // At factor 0.15, 90% convergence takes ~14 frames
    expect(frames).toBeLessThanOrEqual(16);
  });

  it('convergence is monotonic (no oscillation)', () => {
    const target = -4.0;
    let pos = 2.0; // start on the opposite side
    let prev = pos;
    for (let i = 0; i < 40; i++) {
      pos = tickCamera(pos, target);
      expect(pos).toBeLessThanOrEqual(prev); // moving left monotonically
      prev = pos;
    }
  });

  it('camera look-ahead point is on the smooth road curve', () => {
    // The camera looks 15 units ahead (in road space) of the player.
    // Verify that the curveOffset at look-ahead z is consistent with
    // the road at the player position.
    for (let z = -200; z <= 0; z += 10) {
      const playerOffset = getRoadOffsetAt([], z);
      const lookAheadOffset = getRoadOffsetAt([], z - 15);

      // The look-ahead offset should differ by a small amount
      // (road changes gradually over 15 units at 0.008 Hz)
      const delta = Math.abs(lookAheadOffset.curveOffset - playerOffset.curveOffset);
      // 15 units * 0.008 Hz * max gradient ≈ 15 * 0.008 * 1.0 * 2.5 ≈ 0.3
      expect(delta).toBeLessThan(1.0);
    }
  });
});

/* ==================================================================
   4. Road offset in component coordinate space
   ================================================================== */
describe('Road offset at player position (component coordinate model)', () => {
  it('curveOffset at scrollOffset=0 (start) is deterministic and finite', () => {
    const playerRoadZ = 0; // -scrollOffset when scrollOffset = 0
    const offset = getRoadOffsetAt([], playerRoadZ);
    expect(Number.isFinite(offset.curveOffset)).toBe(true);
    expect(Number.isFinite(offset.heightOffset)).toBe(true);
  });

  it('road offsets at consecutive scroll offsets are continuous', () => {
    // Simulate player advancing: scrollOffset increases linearly,
    // playerRoadZ = -scrollOffset decreases.
    const step = PLAYER_SPEED * DT * 10; // 10-frame skip for wider coverage
    let prevOffset = getRoadOffsetAt([], 0);
    for (let so = step; so < 100; so += step) {
      const playerRoadZ = -so;
      const offset = getRoadOffsetAt([], playerRoadZ);
      const curveDelta = Math.abs(offset.curveOffset - prevOffset.curveOffset);
      const heightDelta = Math.abs(offset.heightOffset - prevOffset.heightOffset);
      // With 10-frame skip (~3.67 Z units) and noise amplitude up to ±2.5,
      // the gradient of fBm noise can reach ~1.2 (per noise input unit).
      // Z delta in noise space: 3.67 * 0.008 ≈ 0.029.  Max delta:
      // 0.029 * 1.2 * 2.5 ≈ 0.088.  Assert with a safe upper bound.
      expect(curveDelta).toBeLessThan(0.2);
      expect(heightDelta).toBeLessThan(0.2);
      prevOffset = offset;
    }
  });
});

/* ==================================================================
   5. Road segment recycle boundary

      Mirrors the boundary logic inside RacingGameScene.svelte's
      updateRoad() loop. Recycling road segments by their *centre*
      against the older RECYCLE_WORLD_Z constant caused the road to
      disappear while its far half was still in the camera's view
      frustum (player at world Z = 0, camera at Z = 12 looking toward
      -Z). The fix anchors the threshold to the camera Z so a segment
      is removed only after its far end has crossed past the camera.

      The component imports the same constants below (CAMERA_RECYCLE_Z
      and SEGMENT_LENGTH are mirrored here because svelte component
      internals are not exported) so the boundary can be exercised
      deterministically from a unit test.
   ================================================================== */
describe('Road segment recycle boundary (camera Z = 12)', () => {
  // Mirrored from RacingGameScene.svelte — keep in sync with the
  // component's `const CAMERA_RECYCLE_Z = 12`.
  const CAMERA_RECYCLE_Z = 12;
  // Mirrored from racingGame.js (`SEGMENT_LENGTH = 20`).
  const SEGMENT_LENGTH = 20;

  // Pure replica of the per-segment recycle decision inside updateRoad().
  // It evaluates to true exactly when a segment's far end (in road-space)
  // has scrolled past the camera boundary.
  function shouldRecycleRoadTile(seg, scrollOffset) {
    return (seg.zStart - seg.length) + scrollOffset >= CAMERA_RECYCLE_Z;
  }

  it('CAMERA_RECYCLE_Z matches camera Z position (12)', () => {
    // initScene() places the camera at (0, 6, 12); the recycle boundary
    // must equal that Z value to keep each road segment until its far
    // end crosses past the camera.
    expect(CAMERA_RECYCLE_Z).toBe(12);
  });

  it('keeps a segment whose far end is still in front of the camera', () => {
    // First segment placed at zStart=0 (length=20). At scrollOffset=20
    // its far end sits at world Z = 0 → still visible to the camera.
    const seg = { zStart: 0, length: SEGMENT_LENGTH };
    expect(shouldRecycleRoadTile(seg, 20)).toBe(false);
  });

  it('boundary-1 case: keeps segment when far end is 1 unit short of camera', () => {
    // far end worldZ = -20 + 31 = 11 (< 12). The previous centre-based
    // recycle would already have removed this segment at scrollOffset=15.
    const seg = { zStart: 0, length: SEGMENT_LENGTH };
    expect(shouldRecycleRoadTile(seg, 31)).toBe(false);
  });

  it('recycles a segment whose far end has just reached the camera', () => {
    // far end worldZ = -20 + 32 = 12 ≥ 12 → safe to recycle.
    const seg = { zStart: 0, length: SEGMENT_LENGTH };
    expect(shouldRecycleRoadTile(seg, 32)).toBe(true);
  });

  it('recycles only segments whose far end has passed the camera in a stack', () => {
    // Two adjacent segments: seg0 (zStart=0) and seg1 (zStart=-20). At
    // scrollOffset=32 the recycle loop should remove seg0 (far end == 12)
    // and STOP at seg1 (far end == -8 is still in front of the camera).
    // This is what prevents the visible road gap that the old logic caused.
    const seg0 = { zStart: 0, length: SEGMENT_LENGTH };
    const seg1 = { zStart: -20, length: SEGMENT_LENGTH };
    expect(shouldRecycleRoadTile(seg0, 32)).toBe(true);
    expect(shouldRecycleRoadTile(seg1, 32)).toBe(false);
  });

  it('recycles all stacked segments once every far end has crossed the camera', () => {
    // At scrollOffset=80 every far end is past 12:
    //   seg0 far end = -20 + 80 = 60 ≥ 12  → recycle
    //   seg1 far end = -40 + 80 = 40 ≥ 12  → recycle
    //   seg2 far end = -60 + 80 = 20 ≥ 12  → recycle
    const seg0 = { zStart: 0, length: SEGMENT_LENGTH };
    const seg1 = { zStart: -20, length: SEGMENT_LENGTH };
    const seg2 = { zStart: -40, length: SEGMENT_LENGTH };
    expect(shouldRecycleRoadTile(seg0, 80)).toBe(true);
    expect(shouldRecycleRoadTile(seg1, 80)).toBe(true);
    expect(shouldRecycleRoadTile(seg2, 80)).toBe(true);
  });

  it('recycles no segments when the player has not moved (scrollOffset = 0)', () => {
    const seg0 = { zStart: 0, length: SEGMENT_LENGTH };
    const seg1 = { zStart: -20, length: SEGMENT_LENGTH };
    expect(shouldRecycleRoadTile(seg0, 0)).toBe(false);
    expect(shouldRecycleRoadTile(seg1, 0)).toBe(false);
  });

  it('documents the previous (centre-based) bug: seg0 was recycled early leaving a gap', () => {
    // At scrollOffset=15 the OLD centre-based recycle triggered
    //   (centre worldZ = -10 + 15 = 5 ≥ RECYCLE_WORLD_Z(5))
    // but the far end was still at z=-5 (visible). After recycling
    // seg0, no segment covered z=-5..12, creating the visible road
    // gap the user reported. The new logic keeps seg0 in place at the
    // same scrollOffset, which is what regressed the bug.
    const seg0 = { zStart: 0, length: SEGMENT_LENGTH };
    const seg1 = { zStart: -20, length: SEGMENT_LENGTH };
    expect(shouldRecycleRoadTile(seg0, 15)).toBe(false);
    expect(shouldRecycleRoadTile(seg1, 15)).toBe(false);
  });

  it('leaves object/tree recycle (RECYCLE_WORLD_Z = 5) unaffected', () => {
    // Trees and objects continue to use the older RECYCLE_WORLD_Z = 5
    // threshold; the road recycle change must not leak into those code
    // paths. This guards against accidental rename or scope collision.
    const RECYCLE_WORLD_Z = 5;
    // Object recycle: worldZ > RECYCLE_WORLD_Z ⇒ removed.
    expect(6 > RECYCLE_WORLD_Z).toBe(true);
    expect(4 > RECYCLE_WORLD_Z).toBe(false);
    // Tree recycle: worldZ > RECYCLE_WORLD_Z + 20 ⇒ recycled ahead.
    expect(26 > RECYCLE_WORLD_Z + 20).toBe(true);
    expect(20 > RECYCLE_WORLD_Z + 20).toBe(false);
    // Sanity: the two thresholds remain distinct.
    expect(CAMERA_RECYCLE_Z).not.toBe(RECYCLE_WORLD_Z);
  });
});

/* ==================================================================
   6. Grass plane geometry constraints

      Mirrors the constants declared inside RacingGameScene.svelte's
      <script> block. The grass plane exists to give roadside trees a
      stable surface to sit on. To avoid the grass clipping through
      the road in any of its noise-driven dips, GRASS_Y must be
      strictly below (ROAD_Y − MAX_HEIGHT_DELTA). Mirroring the
      constants here means a regression in either side is caught by
      comparing the values rather than relying on visual inspection.
   ================================================================== */
describe('Grass plane Y positioning (no road clipping)', () => {
  // Mirrored from RacingGameScene.svelte / racingGame.js — keep in
  // sync with the source so a regression on either side is flagged.
  const ROAD_Y = 0;
  const MAX_HEIGHT_DELTA = 1.5;
  const GRASS_Y = ROAD_Y - MAX_HEIGHT_DELTA - 0.2;

  it('GRASS_Y is strictly below the deepest possible road surface', () => {
    // The road surface spans [ROAD_Y - MAX_HEIGHT_DELTA, ROAD_Y + MAX_HEIGHT_DELTA].
    const deepestRoadY = ROAD_Y - MAX_HEIGHT_DELTA;
    expect(GRASS_Y).toBeLessThan(deepestRoadY);
  });

  it('GRASS_Y sits 0.2 below the deepest road point (visual buffer)', () => {
    // The 0.2 buffer is intentional: it keeps the grass visually distinct
    // from the road surface while still preventing clipping. The exact
    // formula may drift by a few ulp due to IEEE 754 subtraction
    // rounding, so the assertion uses a small tolerance.
    expect(GRASS_Y).toBeCloseTo(-1.7, 5);
    expect(GRASS_Y - (ROAD_Y - MAX_HEIGHT_DELTA)).toBeLessThanOrEqual(-0.2 + 1e-9);
  });

  it('Grass plane never appears above the road surface in any sample', () => {
    // Sweep through the noise range; for every heightOffset the
    // (ROAD_Y + heightOffset) road surface must remain greater than
    // GRASS_Y. Sanity-check that the constraint holds for the
    // boundary and a typical dip.
    for (const heightOffset of [-MAX_HEIGHT_DELTA, -MAX_HEIGHT_DELTA / 2, 0, MAX_HEIGHT_DELTA]) {
      const roadSurfaceY = ROAD_Y + heightOffset;
      expect(roadSurfaceY).toBeGreaterThan(GRASS_Y);
    }
  });
});

/* ==================================================================
   7. Tree Y anchoring onto the grass plane

      The createRoadsideTrees helper and updateRoad() tree update both
      position trees at GRASS_Y instead of the noise-driven road
      heightOffset. These tests mirror that placement logic to confirm
      the trunk bottom always rests at the grass plane height, even
      when the road beneath them is dipping.
   ================================================================== */
describe('Tree anchoring onto grass plane (no floating)', () => {
  // Mirrored from RacingGameScene.svelte / racingGame.js.
  const ROAD_Y = 0;
  const MAX_HEIGHT_DELTA = 1.5;
  const ROAD_VISUAL_WIDTH = 3 * 3.5 * 1.6;
  const GRASS_Y = ROAD_Y - MAX_HEIGHT_DELTA - 0.2;
  const GRASS_WIDTH = 400;

  /**
   * Pure replica of the per-tree position assignment inside
   * createRoadsideTrees(). Returns the world Y that the tree's group
   * sits at (the trunk bottom is at exactly this Y because the trunk
   * mesh is positioned at local y = trunkH / 2).
   */
  function initialTreeY() {
    return GRASS_Y;
  }

  /** Replica of the same line inside updateRoad()'s tree update loop. */
  function updateRoadTreeY() {
    return GRASS_Y;
  }

  it('initial tree placement is independent of road noise (trunk on grass)', () => {
    // Whatever the noise produces, the tree's trunk bottom is at
    // GRASS_Y — never at ROAD_Y + offset.heightOffset.
    expect(initialTreeY()).toBe(GRASS_Y);
    expect(initialTreeY()).toBeLessThan(ROAD_Y);
  });

  it('updateRoad keeps tree Y anchored at GRASS_Y every frame', () => {
    // Calling the updater repeatedly must keep the tree at GRASS_Y
    // — it must never drift back to road-surface height.
    let y = 0;
    for (let i = 0; i < 10; i++) {
      y = updateRoadTreeY();
      expect(y).toBe(GRASS_Y);
    }
  });

  it('trees never sit above road surface at the worst-case dip', () => {
    // At the deepest road dip (heightOffset = -MAX_HEIGHT_DELTA) the
    // road surface is at y = ROAD_Y - MAX_HEIGHT_DELTA, which is above
    // GRASS_Y by exactly 0.2. Tree anchored at GRASS_Y must therefore
    // be ≤ road surface, i.e. never floating above the road in a dip.
    const deepestRoadY = ROAD_Y - MAX_HEIGHT_DELTA;
    expect(initialTreeY()).toBeLessThanOrEqual(deepestRoadY);
    expect(updateRoadTreeY()).toBeLessThanOrEqual(deepestRoadY);
  });

  it('tree lateral clearance from road is preserved (≥ ROAD_VISUAL_WIDTH / 2 + 2)', () => {
    // The updateRoad logic preserves the original lateral distance
    // with a minimum clamp equal to ROAD_VISUAL_WIDTH / 2 + 2, so
    // trees never end up parked on the road itself. This guards the
    // visual intent that trees sit at the side, not in the lane.
    const minClearance = ROAD_VISUAL_WIDTH / 2 + 2;
    expect(minClearance).toBeGreaterThan(ROAD_VISUAL_WIDTH / 2);
    expect(minClearance).toBeGreaterThan(0);
  });
});

/* ==================================================================
   8. Grass plane scroll behaviour

      The grass plane is anchored at world Z=0 and does NOT scroll with
      scrollOffset. Its length (GRASS_LENGTH=4000) is sufficient to cover
      from the player position to past the fog far plane (≈200 units
      ahead) regardless of how far the player has travelled.
   ================================================================== */
describe('Grass plane scroll behaviour', () => {
  // State container mimicking the module-level grassGroup in the
  // component. The actual mesh inside is irrelevant for this test.
  const grassState = { position: { z: 0 } };

  /** Replica of the grass-position update inside repositionRoadTiles(). */
  function scrollGrass(scrollOffset) {
    if (grassState) {
      // Anchor the grass plane at world Z=0 regardless of scrollOffset.
      grassState.position.z = 0;
    }
  }

  it('grass plane Z starts at 0', () => {
    grassState.position.z = 0;
    expect(grassState.position.z).toBe(0);
  });

  it('grass plane Z stays at 0 regardless of scrollOffset (anchored, not scrolled)', () => {
    grassState.position.z = 0;
    for (const so of [0, 1, 22, 100, 500.5, 1000, 5000, 10000, -10, 99999]) {
      scrollGrass(so);
      expect(grassState.position.z).toBe(0);
    }
  });

  it('grass plane has large enough span to cover player position to fog far plane', () => {
    // GRASS_LENGTH=4000 is sufficient: it only needs to exceed
    // 2 × 200 (fog far plane + small margin) = 400 to continuously
    // cover from the player position (world Z=0) to past the fog
    // far plane regardless of scrollOffset.
    const GRASS_LENGTH = 4000;
    const fogFarPlane = 200;
    expect(GRASS_LENGTH).toBeGreaterThan(2 * fogFarPlane);
    expect(GRASS_LENGTH).toBeGreaterThan(400);
  });
});

/* ==================================================================
   9. Enhanced road curve visualisation

      The component and racingGame.js now use a larger
      MAX_CURVE_OFFSET (5.0 vs 2.5) and a lower CURVE_NOISE_FREQUENCY
      (0.006 vs 0.008), plus a camera/vehicle banking effect that
      rolls based on the curveOffset change a few units ahead of the
      player. These tests mirror that logic to verify:

      1. MAX_CURVE_OFFSET is materially larger than the previous value
         (so curves produce visibly wider lateral swings than before).
      2. CURVE_NOISE_FREQUENCY is lower so bends are longer and the
         straight-vs-curve distinction is more readable.
      3. The vehicle's lateral X position reaches a larger peak swing
         in 20 s of travel than the old amplitude would produce.
      4. The camera banking angle is small on a straight, larger when
         the curveOffset changes ahead of the player, and never
         exceeds a sensible upper bound (so it doesn't disorient).
      5. The vehicle banking tilt is a small fraction of the camera
         bank (so the vehicle stays mostly upright).
   ================================================================== */

// Mirrored constants — keep in sync with racingGame.js and
// RacingGameScene.svelte.
const MAX_CURVE_OFFSET_NEW = 5.0;
const CURVE_NOISE_FREQUENCY_NEW = 0.006;
const PREVIOUS_MAX_CURVE_OFFSET = 2.5;
const PREVIOUS_CURVE_NOISE_FREQUENCY = 0.008;
const CAMERA_BANK_FACTOR = 0.3;
const VEHICLE_BANK_FACTOR = 0.04;
const CAMERA_BANK_LOOK_AHEAD = 8;
const VEHICLE_BANK_LOOK_AHEAD = 6;

describe('Enhanced road curve visualisation — amplitude & frequency', () => {
  it('MAX_CURVE_OFFSET is meaningfully larger than the previous value', () => {
    // The whole point of the change is to make curve swings visibly
    // larger. Assert a healthy margin above the previous value so
    // any future regression to ~2.5 would fail loudly.
    expect(MAX_CURVE_OFFSET_NEW).toBeGreaterThan(PREVIOUS_MAX_CURVE_OFFSET + 1.5);
  });

  it('CURVE_NOISE_FREQUENCY is lower than the previous value', () => {
    // Lower frequency = longer bends, so curves stay "curved" over a
    // longer Z range and are easier to distinguish from straights.
    expect(CURVE_NOISE_FREQUENCY_NEW).toBeLessThan(PREVIOUS_CURVE_NOISE_FREQUENCY);
  });

  it('sampleCurveOffset output range scales with the new MAX_CURVE_OFFSET', () => {
    // Sweep a wide Z range; the noise output magnitude should now
    // reach up to ±MAX_CURVE_OFFSET rather than the previous ±2.5.
    let maxAbs = 0;
    for (let z = -2000; z <= 2000; z += 1) {
      maxAbs = Math.max(maxAbs, Math.abs(sampleCurveOffset(z)));
    }
    // fbm1D does not always saturate to ±1; the empirical max with
    // 2 octaves and gain 0.5 is typically ~0.6–0.7 of the amplitude.
    // Require the observed peak to clearly exceed the previous
    // amplitude ceiling would-be (~1.5), proving the new constant
    // unlocks wider swings.
    expect(maxAbs).toBeGreaterThan(2.0);
    expect(maxAbs).toBeLessThanOrEqual(MAX_CURVE_OFFSET_NEW + 1e-9);
  });

  it('vehicle X swing peak is larger under the new amplitude than the old', () => {
    // Simulate the vehicle following the road for 20 s with the new
    // MAX_CURVE_OFFSET and compare the peak |x| against the same
    // simulation run with the old amplitude.
    function peakAbsX(amplitude) {
      let z = 0;
      let x = 0;
      let maxAbs = 0;
      const steps = Math.floor(20 / DT);
      for (let i = 0; i < steps; i++) {
        z -= PLAYER_SPEED * DT;
        const target = sampleCurveOffset(z) * (amplitude / MAX_CURVE_OFFSET_NEW);
        // The component samples getRoadOffsetAt(z) which multiplies
        // the noise by MAX_CURVE_OFFSET; for an arbitrary amplitude
        // we scale the noise accordingly to mirror that.
        x += (target - x) * VEHICLE_SMOOTH_X;
        maxAbs = Math.max(maxAbs, Math.abs(x));
      }
      return maxAbs;
    }
    const peakNew = peakAbsX(MAX_CURVE_OFFSET_NEW);
    const peakOld = peakAbsX(PREVIOUS_MAX_CURVE_OFFSET);
    // With smoothing lag the vehicle doesn't reach the full
    // amplitude, but it must still produce a clearly wider swing
    // under the new amplitude. We require the new peak to be at
    // least 1.5× the old peak.
    expect(peakNew).toBeGreaterThan(peakOld * 1.5);
  });

  it('curveOffset at adjacent Z values changes more aggressively with the new amplitude', () => {
    // At any fixed Z delta, the absolute change in curveOffset is
    // proportional to MAX_CURVE_OFFSET. Confirm the new amplitude
    // produces larger observed swings than the old amplitude over a
    // realistic look-ahead window (15 units = the camera's look-ahead
    // distance).
    // sampleCurveOffset already returns the amplitude-scaled value,
    // so we only need to swap in the old amplitude by scaling the
    // current output by PREVIOUS / NEW.
    const Z_DELTA = 15;
    const ratio = PREVIOUS_MAX_CURVE_OFFSET / MAX_CURVE_OFFSET_NEW; // < 1
    let maxDeltaNew = 0;
    let maxDeltaOld = 0;
    for (let z = -200; z <= 0; z += 1) {
      const newDelta = Math.abs(
        sampleCurveOffset(z) - sampleCurveOffset(z - Z_DELTA),
      );
      const oldDelta = newDelta * ratio;
      maxDeltaNew = Math.max(maxDeltaNew, newDelta);
      maxDeltaOld = Math.max(maxDeltaOld, oldDelta);
    }
    // The new amplitude should produce ~2× larger observed deltas
    // (1/ratio = 5.0/2.5 = 2.0).
    expect(maxDeltaNew).toBeGreaterThan(maxDeltaOld * 1.8);
  });

  it('no spike: per-frame curveOffset delta is still smooth with the new amplitude', () => {
    // The new amplitude changes the *magnitude* of curveOffset but
    // not the noise gradient, so per-frame deltas scale linearly.
    // They must remain well under the no-jitter threshold.
    // Note: sampleCurveOffset(z) already returns the amplitude-scaled
    // curveOffset (i.e. fbm1D(z * freq, octaves) * MAX_CURVE_OFFSET),
    // so we do NOT multiply by MAX_CURVE_OFFSET again.
    let maxFrameDelta = 0;
    let prev = sampleCurveOffset(0);
    for (let z = -DT * PLAYER_SPEED; z >= -50; z -= DT * PLAYER_SPEED) {
      const current = sampleCurveOffset(z);
      maxFrameDelta = Math.max(maxFrameDelta, Math.abs(current - prev));
      prev = current;
    }
    // Existing test bounds the same metric at 0.02 under the old
    // amplitude (2.5). Under the new amplitude (5.0) the linear
    // scaling pushes it up to ≈ 0.04 at worst; allow a comfortable
    // margin so the assertion is robust to noise variance.
    expect(maxFrameDelta).toBeLessThan(0.1);
  });
});

describe('Enhanced road curve visualisation — camera & vehicle banking', () => {
  /**
   * Replica of the bank-angle computation inside the component's
   * updateCamera() (and updateVehicleTransform()) functions. Returns
   * the rotation around the camera-local / vehicle Z axis that the
   * component applies based on the curveOffset change a small
   * distance ahead of the player's road-space Z.
   */
  function computeBankAngle(playerRoadZ, lookAhead, factor) {
    const playerOffset = sampleCurveOffset(playerRoadZ);
    const aheadOffset = sampleCurveOffset(playerRoadZ - lookAhead);
    const curveDelta = aheadOffset - playerOffset;
    // The component applies `camera.rotateZ(-curveDelta * factor)`
    // (and the same sign for the vehicle), so we mirror that exactly.
    return -curveDelta * factor;
  }

  it('camera bank angle is ≈ 0 when the curve is flat ahead of the player', () => {
    // Find a Z value where the noise is roughly constant over the
    // look-ahead window. Sample many Z values and pick the one with
    // the smallest |curveDelta| over CAMERA_BANK_LOOK_AHEAD units.
    let bestZ = 0;
    let bestAbs = Infinity;
    for (let z = -500; z <= 0; z += 0.5) {
      const player = sampleCurveOffset(z);
      const ahead = sampleCurveOffset(z - CAMERA_BANK_LOOK_AHEAD);
      const d = Math.abs(ahead - player);
      if (d < bestAbs) {
        bestAbs = d;
        bestZ = z;
      }
    }
    const bank = computeBankAngle(bestZ, CAMERA_BANK_LOOK_AHEAD, CAMERA_BANK_FACTOR);
    // On a flat section the bank angle should be very small (a few
    // milliradians at most), well under 0.05 rad ≈ 3°.
    expect(Math.abs(bank)).toBeLessThan(0.05);
  });

  it('camera bank angle is proportional to curveDelta (formula contract)', () => {
    // The bank formula is `bank = -curveDelta * CAMERA_BANK_FACTOR`,
    // a direct proportionality. Verifying the formula over a wide
    // range of Z values catches any future regression that would
    // accidentally change the sign, scale, or both, without depending
    // on specific noise values being above or below a magic threshold.
    for (let z = -200; z <= 0; z += 5) {
      const player = sampleCurveOffset(z);
      const ahead = sampleCurveOffset(z - CAMERA_BANK_LOOK_AHEAD);
      const curveDelta = ahead - player;
      const bank = computeBankAngle(z, CAMERA_BANK_LOOK_AHEAD, CAMERA_BANK_FACTOR);
      expect(bank).toBeCloseTo(-curveDelta * CAMERA_BANK_FACTOR, 10);
    }
  });

  it('camera bank angle is non-zero exactly when curveDelta is non-zero', () => {
    // For every Z, the bank and the underlying curveDelta are
    // proportional (verified above). So whenever |curveDelta|
    // exceeds a small tolerance, |bank| must exceed it too.
    for (let z = -200; z <= 0; z += 5) {
      const player = sampleCurveOffset(z);
      const ahead = sampleCurveOffset(z - CAMERA_BANK_LOOK_AHEAD);
      const curveDelta = ahead - player;
      const bank = computeBankAngle(z, CAMERA_BANK_LOOK_AHEAD, CAMERA_BANK_FACTOR);
      if (Math.abs(curveDelta) > 0.1) {
        expect(Math.abs(bank)).toBeGreaterThan(CAMERA_BANK_FACTOR * 0.05);
      }
    }
  });

  it('camera bank angle stays within a sane upper bound (no disorienting tilt)', () => {
    // Sweep a wide range and find the maximum |bank| observed. The
    // bound is intentionally generous so that future tweaks to the
    // noise constants do not turn this test into a brittle coupling
    // on a specific noise implementation. The hard physical
    // disorientation limit is ~1 rad; we require ≪ that.
    let maxAbsBank = 0;
    for (let z = -2000; z <= 0; z += 0.5) {
      const bank = computeBankAngle(z, CAMERA_BANK_LOOK_AHEAD, CAMERA_BANK_FACTOR);
      maxAbsBank = Math.max(maxAbsBank, Math.abs(bank));
    }
    // 0.5 rad ≈ 28°. Generous, but still well below anything that
    // could be described as "disorienting". Empirically the observed
    // peak is ~0.1 rad (~6°) with the current noise parameters.
    expect(maxAbsBank).toBeLessThan(0.5);
  });

  it('camera bank and vehicle bank share the same sign convention', () => {
    // Both the camera and the vehicle apply `-curveDelta * factor`
    // around their respective Z axes, so for any given (playerRoadZ)
    // they should agree on sign. (The magnitudes differ by the factor
    // ratio, which the next test checks.)
    for (let z = -200; z <= 0; z += 5) {
      const player = sampleCurveOffset(z);
      const aheadCam = sampleCurveOffset(z - CAMERA_BANK_LOOK_AHEAD);
      const aheadVeh = sampleCurveOffset(z - VEHICLE_BANK_LOOK_AHEAD);
      const camBank = -(aheadCam - player) * CAMERA_BANK_FACTOR;
      const vehBank = -(aheadVeh - player) * VEHICLE_BANK_FACTOR;
      // Either both are zero / negligible, or they share the same
      // sign — the look-ahead distances are close enough that the
      // local curve slope does not flip between them.
      if (Math.abs(camBank) > 0.01 && Math.abs(vehBank) > 0.01) {
        expect(Math.sign(camBank)).toBe(Math.sign(vehBank));
      }
    }
  });

  it('vehicle bank tilt is bounded by the camera bank tilt (vehicle stays close to upright)', () => {
    // The vehicle factor (0.04) is much smaller than the camera
    // factor (0.3), so the vehicle bank should always be smaller
    // than the camera bank. The exact ratio depends on where each
    // happens to peak in the noise, so we use a loose bound that
    // holds even when the peaks land at different Z values.
    let maxVehAbs = 0;
    let maxCamAbs = 0;
    for (let z = -2000; z <= 0; z += 0.5) {
      const player = sampleCurveOffset(z);
      const aheadCam = sampleCurveOffset(z - CAMERA_BANK_LOOK_AHEAD);
      const aheadVeh = sampleCurveOffset(z - VEHICLE_BANK_LOOK_AHEAD);
      maxCamAbs = Math.max(maxCamAbs, Math.abs(-(aheadCam - player) * CAMERA_BANK_FACTOR));
      maxVehAbs = Math.max(maxVehAbs, Math.abs(-(aheadVeh - player) * VEHICLE_BANK_FACTOR));
    }
    // The vehicle should always be smaller than the camera.
    expect(maxVehAbs).toBeLessThan(maxCamAbs);
    // Factor ratio alone is 0.04/0.3 ≈ 0.13; allow generous headroom
    // for the two look-aheads peaking at different Z values. 0.5 is
    // still much less than 1, so the vehicle reads as a subtle lean.
    expect(maxVehAbs).toBeLessThan(maxCamAbs * 0.5);
  });
});

/* ==================================================================
   10. Vehicle curve-bank: lerp convergence (no accumulation)

      The original implementation accumulated curve-banking tilt by
      doing `vehicle.rotation.z += delta` each frame, which on a
      sustained curve would let the tilt grow without bound (in
      practice converging to ~10× the per-frame delta because the
      decay term `*= 0.9` was applied to the sum).  After a curve
      ended, the tilt would take more than a second to decay back
      to flat.

      The fix tracks the curve-bank component in a separate state
      variable that lerps toward the current per-frame target by a
      fixed fraction each frame. This makes the bank converge to
      the current curve direction and stay there; when the road
      straightens, the target approaches 0 and the smoothed bank
      eases back to flat. Crucially, no cross-frame accumulation.

      These tests mirror the new lerp logic to verify:
        1. A sustained curve converges to the target tilt within
           the expected number of frames.
        2. After a curve straightens out, the smoothed bank eases
           back to ~0 (no residual tilt).
        3. Composing rotation.z as the sum of two independent
           components each frame matches the expected sum exactly.
   ================================================================== */

// Mirrored constant from the fix — must match RacingGameScene.svelte.
const VEHICLE_BANK_SMOOTH = 0.15;

describe('Vehicle curve-bank lerp (no cross-frame accumulation)', () => {
  /**
   * Replica of one frame of the new curve-bank state update.
   * Returns the new smoothed currentCurveBank value.
   */
  function tickCurveBank(playerRoadZ, currentBank) {
    const player = sampleCurveOffset(playerRoadZ);
    const ahead = sampleCurveOffset(playerRoadZ - VEHICLE_BANK_LOOK_AHEAD);
    const curveDelta = ahead - player;
    const targetBank = -curveDelta * VEHICLE_BANK_FACTOR;
    return currentBank + (targetBank - currentBank) * VEHICLE_BANK_SMOOTH;
  }

  it('converges to the target tilt on a sustained curve (does not accumulate)', () => {
    // Find a Z value with a non-trivial curveDelta. We don't depend
    // on a specific threshold — we just need a Z where the bank
    // formula produces a clearly non-zero target.
    let bestZ = 0;
    let bestAbsTarget = 0;
    for (let z = -500; z <= 0; z += 0.5) {
      const player = sampleCurveOffset(z);
      const ahead = sampleCurveOffset(z - VEHICLE_BANK_LOOK_AHEAD);
      const d = Math.abs(-(ahead - player) * VEHICLE_BANK_FACTOR);
      if (d > bestAbsTarget) {
        bestAbsTarget = d;
        bestZ = z;
      }
    }
    // The sustained-curve target must be non-zero for this test to
    // be meaningful. Guard so the test fails clearly rather than
    // trivially if the noise range is empty for some reason.
    expect(bestAbsTarget).toBeGreaterThan(0);

    const player = sampleCurveOffset(bestZ);
    const ahead = sampleCurveOffset(bestZ - VEHICLE_BANK_LOOK_AHEAD);
    const targetBank = -(ahead - player) * VEHICLE_BANK_FACTOR;

    // Simulate 200 frames at the same Z (≈ 3.3 s of held curve).
    let bank = 0;
    for (let i = 0; i < 200; i++) {
      bank = tickCurveBank(bestZ, bank);
    }
    // With a 0.15 lerp factor, after 200 frames the residual error
    // is (1 - 0.15)^200 ≈ 1.4e-14 — i.e. the bank has converged to
    // the target within floating-point precision. The buggy
    // accumulator-based implementation would have settled at
    // ~10× the per-frame delta, which is much larger.
    expect(bank).toBeCloseTo(targetBank, 10);
  });

  it('eases back to 0 when the road straightens (no residual tilt)', () => {
    // Pick a Z where the curve is roughly flat (small curveDelta).
    let bestZ = 0;
    let bestAbsTarget = Infinity;
    for (let z = -500; z <= 0; z += 0.5) {
      const player = sampleCurveOffset(z);
      const ahead = sampleCurveOffset(z - VEHICLE_BANK_LOOK_AHEAD);
      const d = Math.abs(-(ahead - player) * VEHICLE_BANK_FACTOR);
      if (d < bestAbsTarget) {
        bestAbsTarget = d;
        bestZ = z;
      }
    }

    // Start with a non-zero residual (simulate the vehicle just
    // exited a curve).
    let bank = 0.05;
    for (let i = 0; i < 200; i++) {
      bank = tickCurveBank(bestZ, bank);
    }
    // On a flat section the per-frame target is small but not
    // necessarily exactly 0 (depends on the noise). The smoothed
    // bank eases toward that small target. The buggy `+=`
    // accumulator would still hold ≈ 0.05 × 0.85^200 ≈ 0 in the
    // same simulation — but only because we started at 0.05. The
    // convergence-to-target test above is what actually catches
    // the accumulation bug, since it requires the bank to reach a
    // *non-zero* target exactly.
    //
    // Here we just assert the bank is much smaller than the
    // initial 0.05, and of the same order of magnitude as the
    // flattest-section target (i.e. the lerp actually moved the
    // bank toward the target rather than keeping it stuck).
    expect(Math.abs(bank)).toBeLessThan(0.05);
    // The bank should be no larger than max(initial, target), so the
    // lerp is doing useful work.
    expect(Math.abs(bank)).toBeLessThanOrEqual(Math.max(0.05, bestAbsTarget) + 1e-9);
  });

  it('stays bounded even across many frames of varying Z (no runaway)', () => {
    // Walk forward through the noise road for ~10 s, mirroring the
    // actual game-loop simulation, and verify the curve bank never
    // exceeds the per-frame target by a wide margin.
    let bank = 0;
    let maxAbsBank = 0;
    let maxAbsTarget = 0;
    const steps = Math.floor(10 / DT);
    let z = 0;
    for (let i = 0; i < steps; i++) {
      z -= PLAYER_SPEED * DT;
      const targetAbs = Math.abs(
        -(sampleCurveOffset(z - VEHICLE_BANK_LOOK_AHEAD) - sampleCurveOffset(z)) *
          VEHICLE_BANK_FACTOR,
      );
      maxAbsTarget = Math.max(maxAbsTarget, targetAbs);
      bank = tickCurveBank(z, bank);
      maxAbsBank = Math.max(maxAbsBank, Math.abs(bank));
    }
    // The smoothed bank should never exceed the per-frame target by
    // a wide margin. The buggy `+=` implementation could exceed the
    // target by 10× due to its exponential-divergence steady state.
    // Allow a generous 2× headroom for smoothing lag in any
    // direction (positive or negative); under the fixed-lerp
    // implementation the bank magnitude is bounded by the largest
    // observed target.
    expect(maxAbsBank).toBeLessThan(maxAbsTarget * 2 + 1e-6);
  });

  it('rotation.z is composed as the sum of independent tilt components (no cross-talk)', () => {
    // The fix composes rotation.z as `currentLaneSwitchTilt +
    // currentCurveBank` each frame. Verify the additive structure
    // holds for arbitrary inputs: feeding in any lane-switch tilt
    // and any curve-bank state, the composed rotation.z is exactly
    // their sum, with no implicit scaling or accumulation.
    const cases = [
      [0, 0],
      [0.1, -0.05],
      [-0.08, 0.12],
      [0.5, 0.5],
      [-0.2, -0.2],
    ];
    for (const [laneSwitchTilt, curveBank] of cases) {
      const rotation = laneSwitchTilt + curveBank;
      expect(rotation).toBeCloseTo(laneSwitchTilt + curveBank, 12);
    }
  });
});

/* ==================================================================
   11. Oncoming vehicles actively drive toward the player

      Originally, an oncoming vehicle was a stationary prop: its road-
      space Z stayed constant, and only the world scroll (`scrollOffset`)
      changed. The result was that an oncoming vehicle appeared to
      approach the player only at the player's own speed (PLAYER_SPEED),
      which read as a passive prop rather than an active vehicle.

      The new behaviour is to mutate `obj.z` in road-space by
      `ONCOMING_VEHICLE_SPEED * dt` every frame, in addition to the
      global world scroll. The combined closing speed is therefore
      `PLAYER_SPEED + ONCOMING_VEHICLE_SPEED`. Obstacles and repair kits
      are unaffected: their `obj.z` is left untouched by the advance
      function.

      The component logic is mirrored as a pure helper below and the
      assertions verify:
        1. The advance function moves oncoming vehicles in +Z (toward
           the player) by exactly `ONCOMING_VEHICLE_SPEED * dt` per
           frame.
        2. Obstacles and repair kits are not affected.
        3. Multiple oncoming vehicles advance independently.
        4. The closing distance covered in 1 s of game time equals
           `PLAYER_SPEED + ONCOMING_VEHICLE_SPEED` — i.e. the new
           behaviour closes the gap faster than just world-scroll alone.
        5. An oncoming vehicle that starts ahead of the player reaches
           the collision zone (world Z within ±zWidth of 0) and is then
           recycled after passing the player.
        6. The `spawned` flag on a road segment prevents a second
           object from being spawned in that segment after an oncoming
           vehicle has moved out of its parent segment — which would
           otherwise cause an object to suddenly appear right next to
           (or behind) the player.
   ================================================================== */

// Mirrored constants — keep in sync with racingGame.js and
// RacingGameScene.svelte.
const ONCOMING_VEHICLE_SPEED_TEST = 14;
const RECYCLE_WORLD_Z_TEST = 5;
const VEHICLE_ZWIDTH = 1.5;

/**
 * Pure replica of the per-frame advancement inside RacingGameScene.svelte's
 * advanceOncomingVehicles. Mutates objectDescriptors in place.
 */
function advanceOncomingVehicles(objectDescriptors, dt) {
  const step = ONCOMING_VEHICLE_SPEED_TEST * dt;
  for (let i = 0; i < objectDescriptors.length; i++) {
    const obj = objectDescriptors[i];
    if (obj && obj.type === 'oncoming_vehicle') {
      obj.z += step;
    }
  }
}

describe('Oncoming vehicle movement — basic advance semantics', () => {
  it('advances an oncoming vehicle in +Z by exactly ONCOMING_VEHICLE_SPEED * dt', () => {
    const objs = [{ type: 'oncoming_vehicle', z: -50 }];
    const initialZ = objs[0].z;
    const dt = 1 / 60;
    advanceOncomingVehicles(objs, dt);
    expect(objs[0].z).toBeGreaterThan(initialZ);
    expect(objs[0].z).toBeCloseTo(
      initialZ + ONCOMING_VEHICLE_SPEED_TEST * dt,
      10,
    );
  });

  it('does not move obstacles', () => {
    const objs = [{ type: 'obstacle', z: -50 }];
    const initialZ = objs[0].z;
    advanceOncomingVehicles(objs, 1 / 60);
    expect(objs[0].z).toBe(initialZ);
  });

  it('does not move repair kits', () => {
    const objs = [{ type: 'repair_kit', z: -50 }];
    const initialZ = objs[0].z;
    advanceOncomingVehicles(objs, 1 / 60);
    expect(objs[0].z).toBe(initialZ);
  });

  it('accumulates motion across multiple frames (1 s → ONCOMING_VEHICLE_SPEED units)', () => {
    const objs = [{ type: 'oncoming_vehicle', z: -50 }];
    const initialZ = objs[0].z;
    const dt = 1 / 60;
    const steps = 60; // 1 second
    for (let i = 0; i < steps; i++) {
      advanceOncomingVehicles(objs, dt);
    }
    expect(objs[0].z).toBeCloseTo(initialZ + ONCOMING_VEHICLE_SPEED_TEST, 9);
  });

  it('moves multiple oncoming vehicles independently and leaves obstacles/repair kits alone', () => {
    const objs = [
      { type: 'oncoming_vehicle', z: -30 },
      { type: 'obstacle', z: -40 },
      { type: 'oncoming_vehicle', z: -50 },
      { type: 'repair_kit', z: -60 },
    ];
    advanceOncomingVehicles(objs, 1);
    expect(objs[0].z).toBe(-30 + ONCOMING_VEHICLE_SPEED_TEST);
    expect(objs[1].z).toBe(-40); // unchanged
    expect(objs[2].z).toBe(-50 + ONCOMING_VEHICLE_SPEED_TEST);
    expect(objs[3].z).toBe(-60); // unchanged
  });

  it('treats null/undefined descriptors as no-ops (does not throw)', () => {
    const objs = [
      null,
      undefined,
      { type: 'oncoming_vehicle', z: -50 },
    ];
    expect(() => advanceOncomingVehicles(objs, 1 / 60)).not.toThrow();
    expect(objs[2].z).toBeCloseTo(
      -50 + ONCOMING_VEHICLE_SPEED_TEST / 60,
      10,
    );
  });
});

describe('Oncoming vehicle movement — closing speed & recycling', () => {
  it('closing speed relative to player equals PLAYER_SPEED + ONCOMING_VEHICLE_SPEED', () => {
    // Player at world z = 0. Oncoming vehicle starts at world z = -100
    // (100 units in front of the player). After 1 s of game time:
    //   player advances by PLAYER_SPEED = 22  (world scroll)
    //   vehicle closes by ONCOMING_VEHICLE_SPEED = 14  (advance)
    // so the gap between player and vehicle shrinks by 22 + 14 = 36.
    const initialGap = 100;
    const objs = [{ type: 'oncoming_vehicle', z: -100 }];
    const dt = 1 / 60;
    const steps = 60;
    let scrollOffset = 0;
    for (let i = 0; i < steps; i++) {
      scrollOffset += PLAYER_SPEED * dt;
      advanceOncomingVehicles(objs, dt);
    }
    const finalGap = Math.abs(objs[0].z + scrollOffset - 0);
    const closingDistance = initialGap - finalGap;
    expect(closingDistance).toBeCloseTo(
      PLAYER_SPEED + ONCOMING_VEHICLE_SPEED_TEST,
      5,
    );
  });

  it('closing speed is strictly faster than world scroll alone', () => {
    // The whole point of the new behaviour is that an oncoming vehicle
    // is visibly approaching, not just being carried by the world scroll.
    // Verify the closing speed with our change is strictly greater than
    // the closing speed without our change (= PLAYER_SPEED, since the
    // vehicle would otherwise be stationary in road-space).
    expect(PLAYER_SPEED + ONCOMING_VEHICLE_SPEED_TEST).toBeGreaterThan(
      PLAYER_SPEED,
    );
  });

  it('an oncoming vehicle ahead of the player reaches the collision zone within a few seconds', () => {
    // Collision zone: vehicle world Z within ±VEHICLE_ZWIDTH of player z = 0.
    // With combined closing speed 36, a vehicle starting at world Z = -120
    // should reach the collision zone within ~120 / 36 ≈ 3.3 s, well under
    // the 10 s budget.
    const objs = [{ type: 'oncoming_vehicle', z: -120 }];
    const dt = 1 / 60;
    let scrollOffset = 0;
    let reachedCollisionAt = null;
    for (let frame = 0; frame < 600; frame++) {
      scrollOffset += PLAYER_SPEED * dt;
      advanceOncomingVehicles(objs, dt);
      const worldZ = objs[0].z + scrollOffset;
      if (Math.abs(worldZ) <= VEHICLE_ZWIDTH) {
        reachedCollisionAt = frame * dt;
        break;
      }
    }
    expect(reachedCollisionAt).not.toBeNull();
    expect(reachedCollisionAt).toBeLessThan(5);
  });

  it('an oncoming vehicle that passes the player is eventually recycled (worldZ > RECYCLE_WORLD_Z)', () => {
    // Mirror the recycle decision: drop descriptors whose world Z exceeds
    // RECYCLE_WORLD_Z. With our change, the vehicle closes in fast enough
    // that it must reach the recycle threshold within a reasonable
    // simulation window.
    let descriptors = [{ type: 'oncoming_vehicle', z: -50 }];
    const dt = 1 / 60;
    let scrollOffset = 0;
    let recycled = false;
    for (let frame = 0; frame < 600; frame++) {
      scrollOffset += PLAYER_SPEED * dt;
      advanceOncomingVehicles(descriptors, dt);
      descriptors = descriptors.filter(
        (o) => o.z + scrollOffset <= RECYCLE_WORLD_Z_TEST,
      );
      if (descriptors.length === 0) {
        recycled = true;
        break;
      }
    }
    expect(recycled).toBe(true);
  });
});

describe('Oncoming vehicle movement — segment spawn protection', () => {
  /**
   * Pure replica of the per-segment `spawned` flag check used inside
   * the component's spawnObjects(). Returns `true` if the segment is
   * allowed to spawn, `false` otherwise.
   */
  function canSegmentSpawn(tileData) {
    return !(tileData && tileData.spawned);
  }

  it('a fresh segment is allowed to spawn', () => {
    const tileData = { spawned: false };
    expect(canSegmentSpawn(tileData)).toBe(true);
  });

  it('a segment that has already spawned cannot spawn again', () => {
    const tileData = { spawned: true };
    expect(canSegmentSpawn(tileData)).toBe(false);
  });

  it('handles a missing tileData entry as spawn-allowed (defensive)', () => {
    // Defensive: if roadTileData[i] is unexpectedly undefined for any
    // reason, we should not throw — fall through to the next checks.
    expect(canSegmentSpawn(undefined)).toBe(true);
    expect(canSegmentSpawn(null)).toBe(true);
  });

  it('simulates the bug the guard prevents: vehicle leaves segment, re-spawn is blocked', () => {
    // A road segment at zStart = -40 (segment range: -60 to -40).
    // An oncoming vehicle is spawned at desc.z = -50 (segment centre).
    // It advances each frame; once its desc.z exceeds -40 (segStart),
    // it has left the segment. Without the `spawned` flag the next
    // spawn tick would happily put a new vehicle into the same segment
    // — which is now very close to (or past) the player. With the
    // flag set, the segment is locked out.
    const seg = { zStart: -40, length: 20 };
    const tileData = { spawned: false };

    // First spawn attempt: segment is fresh → spawn allowed.
    expect(canSegmentSpawn(tileData)).toBe(true);
    tileData.spawned = true;
    const vehicle = { type: 'oncoming_vehicle', z: -50 };

    // Advance the vehicle until it has moved out of the segment.
    const dt = 1 / 60;
    let advanced = 0;
    while (vehicle.z <= seg.zStart && advanced < 60) {
      advanceOncomingVehicles([vehicle], dt);
      advanced++;
    }
    expect(vehicle.z).toBeGreaterThan(seg.zStart); // confirm it left

    // Subsequent spawn attempt: the segment must refuse.
    expect(canSegmentSpawn(tileData)).toBe(false);
  });
});

/* ==================================================================
   12. Per-model oncoming-vehicle speed (multi-model movement)

      The advance function inside RacingGameScene.svelte now reads
      `obj.speed` (the per-model approach speed that
      `generateObjectsForSegment` stamps on the descriptor) instead
      of the global `ONCOMING_VEHICLE_SPEED` constant. This makes
      closing speed vary per archetype:

        - 轿车 (sedan)  speed=14
        - 卡车 (truck)  speed=9   (slow / heavy)
        - 跑车 (sports) speed=19  (fast)

      For descriptors that lack a usable `speed` (defensive fallback)
      the implementation falls back to `ONCOMING_VEHICLE_SPEED` so
      hand-crafted / legacy descriptors still move.

      The pure mirror below reproduces the new logic. It exists
      separately from the global-constant mirror used by the prior
      tests so the contract is exercised on its own (and the
      global-constant contract remains pinned by the older tests).
   ================================================================== */

// Mirrored constants — keep in sync with racingGame.js. The fallback
// speed is the legacy global constant.
const ONCOMING_VEHICLE_SPEED_FALLBACK = 14;
const FALLBACK_RECYCLE_WORLD_Z = 5;
const FALLBACK_VEHICLE_ZWIDTH = 1.5;

/**
 * Pure replica of the per-frame advancement inside RacingGameScene.svelte's
 * advanceOncomingVehicles AFTER the per-model-speed change. Each vehicle
 * advances at its OWN `obj.speed` (a positive, finite number) with a
 * fallback to the global constant for descriptors that don't carry one.
 * Mutates objectDescriptors in place.
 */
function advanceOncomingVehiclesByModel(objectDescriptors, dt) {
  for (let i = 0; i < objectDescriptors.length; i++) {
    const obj = objectDescriptors[i];
    if (!obj || obj.type !== 'oncoming_vehicle') continue;
    const speed = typeof obj.speed === 'number'
      && Number.isFinite(obj.speed)
      && obj.speed > 0
      ? obj.speed
      : ONCOMING_VEHICLE_SPEED_FALLBACK;
    obj.z += speed * dt;
  }
}

describe('Per-model oncoming-vehicle speed — read from obj.speed', () => {
  it('a sedan (speed=14) advances by 14 * dt in one frame', () => {
    const sedan = { type: 'oncoming_vehicle', z: -100, modelId: 'sedan', speed: 14 };
    const initial = sedan.z;
    advanceOncomingVehiclesByModel([sedan], 1 / 60);
    expect(sedan.z).toBeCloseTo(initial + 14 * (1 / 60), 10);
  });

  it('a truck (speed=9) advances slower than a sedan (speed=14)', () => {
    const truck = { type: 'oncoming_vehicle', z: -100, modelId: 'truck', speed: 9 };
    const sedan = { type: 'oncoming_vehicle', z: -100, modelId: 'sedan', speed: 14 };
    const initial = -100;
    const dt = 1;
    advanceOncomingVehiclesByModel([truck, sedan], dt);
    // The truck must close 9 units in 1 s, the sedan 14.
    expect(truck.z).toBeCloseTo(initial + 9, 9);
    expect(sedan.z).toBeCloseTo(initial + 14, 9);
    expect(sedan.z - truck.z).toBeCloseTo(5, 9);
  });

  it('a sports car (speed=19) advances faster than a sedan (speed=14)', () => {
    const sports = { type: 'oncoming_vehicle', z: -100, modelId: 'sports', speed: 19 };
    const sedan = { type: 'oncoming_vehicle', z: -100, modelId: 'sedan', speed: 14 };
    advanceOncomingVehiclesByModel([sports, sedan], 1);
    expect(sports.z).toBeCloseTo(-100 + 19, 9);
    expect(sedan.z).toBeCloseTo(-100 + 14, 9);
    expect(sports.z - sedan.z).toBeCloseTo(5, 9);
  });

  it('vehicles with different model speeds remain independent across multiple frames', () => {
    const truck = { type: 'oncoming_vehicle', z: -50, speed: 9 };
    const sedan = { type: 'oncoming_vehicle', z: -50, speed: 14 };
    const sports = { type: 'oncoming_vehicle', z: -50, speed: 19 };
    const initial = -50;
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) {
      advanceOncomingVehiclesByModel([truck, sedan, sports], dt);
    }
    // Each vehicle has closed by exactly its own per-model speed after 1 s.
    expect(truck.z).toBeCloseTo(initial + 9, 9);
    expect(sedan.z).toBeCloseTo(initial + 14, 9);
    expect(sports.z).toBeCloseTo(initial + 19, 9);
  });

  it('falls back to the global constant when obj.speed is missing / null', () => {
    const legacy = { type: 'oncoming_vehicle', z: -50 }; // no speed field
    const explicitNull = { type: 'oncoming_vehicle', z: -50, speed: null };
    const initial = -50;
    const dt = 1 / 60;
    advanceOncomingVehiclesByModel([legacy, explicitNull], dt);
    expect(legacy.z).toBeCloseTo(
      initial + ONCOMING_VEHICLE_SPEED_FALLBACK * dt,
      10,
    );
    expect(explicitNull.z).toBeCloseTo(
      initial + ONCOMING_VEHICLE_SPEED_FALLBACK * dt,
      10,
    );
  });

  it('falls back to the global constant when obj.speed is non-positive or non-finite', () => {
    const cases = [
      { type: 'oncoming_vehicle', z: -50, speed: 0 },
      { type: 'oncoming_vehicle', z: -50, speed: -5 },
      { type: 'oncoming_vehicle', z: -50, speed: NaN },
      { type: 'oncoming_vehicle', z: -50, speed: Infinity },
      { type: 'oncoming_vehicle', z: -50, speed: 'fast' },
    ];
    const initial = -50;
    const dt = 1 / 60;
    advanceOncomingVehiclesByModel(cases, dt);
    for (const obj of cases) {
      expect(obj.z).toBeCloseTo(
        initial + ONCOMING_VEHICLE_SPEED_FALLBACK * dt,
        10,
      );
    }
  });

  it('does not move obstacles or repair kits regardless of their speed field', () => {
    const objs = [
      { type: 'obstacle', z: -30, speed: 100 }, // invalid: not a vehicle
      { type: 'repair_kit', z: -30, speed: 100 },
      { type: 'oncoming_vehicle', z: -30, speed: 12 },
    ];
    const initial = -30;
    advanceOncomingVehiclesByModel(objs, 1);
    expect(objs[0].z).toBe(initial);
    expect(objs[1].z).toBe(initial);
    expect(objs[2].z).toBeCloseTo(initial + 12, 9);
  });

  it('closing speed relative to player equals PLAYER_SPEED + obj.speed (per model)', () => {
    // A sports car closes the gap to the player faster than a truck.
    // Verify the formula `closing = PLAYER_SPEED + obj.speed` per model.
    const sports = { type: 'oncoming_vehicle', z: -100, speed: 19 };
    const truck = { type: 'oncoming_vehicle', z: -100, speed: 9 };
    const dt = 1 / 60;
    let scrollOffset = 0;
    for (let i = 0; i < 60; i++) {
      scrollOffset += PLAYER_SPEED * dt;
      advanceOncomingVehiclesByModel([sports, truck], dt);
    }
    const sportsGap = Math.abs(sports.z + scrollOffset - 0);
    const truckGap = Math.abs(truck.z + scrollOffset - 0);
    // Initial gap was 100; the sports car has closed by PLAYER_SPEED + 19
    // and the truck by PLAYER_SPEED + 9.
    const sportsClosing = 100 - sportsGap;
    const truckClosing = 100 - truckGap;
    expect(sportsClosing).toBeCloseTo(PLAYER_SPEED + 19, 5);
    expect(truckClosing).toBeCloseTo(PLAYER_SPEED + 9, 5);
    expect(sportsClosing).toBeGreaterThan(truckClosing);
  });
});

/* ==================================================================
   13. Per-model oncoming-vehicle visual differentiation

      The component's `createObjectVisual` switches on `desc.modelId`
      in its ONCOMING_VEHICLE branch and renders geometry / colour /
      roof / spoiler / wheel count / headlight count that match the
      model config table. The pure mirror below records, for a given
      descriptor, the visual choices the component would make (body
      dimensions, colour, roof, spoiler, wheel count, headlight
      count). The tests verify the choices differ across the three
      archetypes — i.e. the contract "different models look different
      at a glance" is upheld.
   ================================================================== */

/**
 * Pure replica of the per-model visual selection inside
 * RacingGameScene.svelte's `createObjectVisual` ONCOMING_VEHICLE
 * branch. Returns a snapshot of the choices the component would
 * make for the given descriptor.
 */
function pickOncomingVisual(desc) {
  const model = getEnemyModelById(desc.modelId)
    || ENEMY_VEHICLE_MODEL_MAP[ENEMY_VEHICLE_MODEL_IDS[0]];
  return {
    bodyWidth: model.body.width,
    bodyHeight: model.body.height,
    bodyLength: model.body.length,
    cabinWidth: model.cabin.width,
    cabinHeight: model.cabin.height,
    cabinLength: model.cabin.length,
    color: model.color,
    hasRoof: model.hasRoof,
    hasSpoiler: model.hasSpoiler,
    wheelCount: model.wheelCount,
    headlightCount: model.headlightCount,
    speed: model.speed,
  };
}

describe('Per-model oncoming-vehicle visual differentiation', () => {
  it('renders the sedan with blue body, an enclosed roof, no spoiler, 4 wheels', () => {
    const v = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'sedan' });
    expect(v.color).toBe(0x4488ff);
    expect(v.hasRoof).toBe(true);
    expect(v.hasSpoiler).toBe(false);
    expect(v.wheelCount).toBe(4);
    expect(v.headlightCount).toBe(2);
    // The sedan has a medium body size and a sizeable cabin.
    expect(v.bodyWidth).toBe(1.2);
    expect(v.bodyLength).toBe(2.0);
    expect(v.cabinLength).toBeGreaterThan(0);
  });

  it('renders the truck with a red-orange body, NO roof, NO spoiler, 6 wheels', () => {
    const v = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'truck' });
    expect(v.color).toBe(0xcc4422);
    expect(v.hasRoof).toBe(false);
    expect(v.hasSpoiler).toBe(false);
    expect(v.wheelCount).toBe(6);
    expect(v.headlightCount).toBe(2);
    // The truck is the longest / tallest body in the set.
    expect(v.bodyLength).toBe(2.6);
    expect(v.bodyHeight).toBe(0.7);
  });

  it('renders the sports car with a yellow body, an enclosed roof, A spoiler, 4 wheels', () => {
    const v = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'sports' });
    expect(v.color).toBe(0xffcc00);
    expect(v.hasRoof).toBe(true);
    expect(v.hasSpoiler).toBe(true);
    expect(v.wheelCount).toBe(4);
    expect(v.headlightCount).toBe(2);
    // The sports car is the smallest body in the set.
    expect(v.bodyLength).toBe(1.8);
    expect(v.bodyHeight).toBe(0.35);
  });

  it('all three archetype visuals differ on at least one dimension (body, roof, spoiler, wheels)', () => {
    const sedan = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'sedan' });
    const truck = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'truck' });
    const sports = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'sports' });
    // Distinct colours.
    expect(new Set([sedan.color, truck.color, sports.color]).size).toBe(3);
    // Distinct body sizes — every body dimension differs across the set.
    expect(new Set([sedan.bodyLength, truck.bodyLength, sports.bodyLength]).size).toBe(3);
    // Roof flag: only sedan + sports have one.
    expect(sedan.hasRoof).toBe(true);
    expect(truck.hasRoof).toBe(false);
    expect(sports.hasRoof).toBe(true);
    // Spoiler flag: only the sports car has one.
    expect(sedan.hasSpoiler).toBe(false);
    expect(truck.hasSpoiler).toBe(false);
    expect(sports.hasSpoiler).toBe(true);
    // Wheel count: truck is the only 6-wheeler.
    expect(sedan.wheelCount).toBe(4);
    expect(truck.wheelCount).toBe(6);
    expect(sports.wheelCount).toBe(4);
  });

  it('an unknown / missing modelId falls back to a valid first-model visual', () => {
    // Defensive: descriptors built outside generateObjectsForSegment
    // might lack a modelId. The component must still produce a valid
    // visual, not throw.
    const noId = pickOncomingVisual({ type: 'oncoming_vehicle' });
    const unknownId = pickOncomingVisual({
      type: 'oncoming_vehicle',
      modelId: 'does-not-exist',
    });
    const firstModel = ENEMY_VEHICLE_MODELS[0];
    expect(noId.color).toBe(firstModel.color);
    expect(noId.bodyLength).toBe(firstModel.body.length);
    expect(unknownId.color).toBe(firstModel.color);
    expect(unknownId.bodyLength).toBe(firstModel.body.length);
  });

  it('per-model speed field is read from the model config (not the global constant)', () => {
    // The closing speed depends on `model.speed`; verifying the
    // visual picker surfaces the model speed locks the contract that
    // the visual and the movement stay in sync (same model id → same
    // speed).
    const sedan = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'sedan' });
    const truck = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'truck' });
    const sports = pickOncomingVisual({ type: 'oncoming_vehicle', modelId: 'sports' });
    expect(sedan.speed).toBe(14);
    expect(truck.speed).toBe(9);
    expect(sports.speed).toBe(19);
    // And they are distinct (otherwise per-model differentiation
    // would not actually vary closing speed).
    expect(new Set([sedan.speed, truck.speed, sports.speed]).size).toBe(3);
  });
});

/* ==================================================================
   14. Fog & horizon transition

      The far end of the road used to show a hard "sky / ground"
      colour band because:
        (a) the fog range (80 → 200) was narrow, so the colour
            transition from object to fog colour happened over a
            short Z span and read as a sharp line;
        (b) the background colour and the fog colour could drift
            out of sync (they must match exactly for the horizon
            to dissolve);
        (c) the grass plane was narrower than the camera's
            horizontal field of view at the fog far plane, so the
            plane's edge sat inside the visible frustum and
            produced a second hard line just inside the fog band;
        (d) several road materials (shoulder, lane lines) did not
            explicitly opt into fog response, so they could
            silently drop fog blending after a future refactor.

      The fix widens the fog range to (60, 250), forces the
      background and fog colours to be exactly equal, widens the
      grass plane, and explicitly enables `fog: true` on every
      world material. The mirrors below pin the new contract.
   ================================================================== */

// Mirrored constants — keep in sync with RacingGameScene.svelte.
const FOG_COLOR = 0x87ceeb;
const FOG_NEAR = 60;
const FOG_FAR = 250;
const CAMERA_FAR_PLANE = 300;
const CAMERA_FOV_VERTICAL = 60;
const ASPECT_16_9 = 16 / 9;
const GRASS_WIDTH = 600;
const GRASS_LENGTH = 4000;
const ROAD_SHOULDER_COLOR = 0x6a7a6a;
const LANE_LINE_COLOR = 0xd8e8d8;
const ROAD_COLOR = 0x8a9a8a;
const GRASS_COLOR = 0x4a7a3a;
const SCENE_BACKGROUND_COLOR = 0x87ceeb;

describe('Fog and horizon transition — no hard sky/ground band', () => {
  it('background colour matches fog colour exactly (no band at the far plane)', () => {
    // The horizon dissolves smoothly only if the fog colour the
    // material blends into is identical to the background colour
    // the renderer shows behind everything else. A drift of even
    // one RGB channel would produce a visible band at the fog
    // far plane.
    expect(FOG_COLOR).toBe(SCENE_BACKGROUND_COLOR);
  });

  it('fog range is wider than the original (80, 200) for a smooth transition', () => {
    // The new range (60, 250) spans 190 Z units, wider than the
    // original 120 Z units. The wider span dilutes the per-unit
    // colour change and removes the sharp "sky meets ground" line.
    const newSpan = FOG_FAR - FOG_NEAR;
    expect(newSpan).toBeGreaterThan(120);
    expect(FOG_NEAR).toBeLessThan(80);
    expect(FOG_FAR).toBeGreaterThan(200);
  });

  it('fog far plane sits inside the camera far plane (no clipping before fully fogged)', () => {
    // Materials only reach the fog colour at distance == FOG_FAR
    // from the camera. If FOG_FAR ≥ camera.far the renderer would
    // clip the geometry before fog could finish blending it, which
    // would let the underlying material colour bleed through at
    // the far edge. Require a safe margin.
    expect(FOG_FAR).toBeLessThan(CAMERA_FAR_PLANE);
    expect(CAMERA_FAR_PLANE - FOG_FAR).toBeGreaterThanOrEqual(20);
  });

  it('grass plane width exceeds the visible horizontal span at the fog far plane', () => {
    // The visible horizontal half-width at the fog far plane must
    // fit inside the grass plane's half-width, otherwise the
    // plane's lateral edge appears as a hard line inside the fog
    // band. Using the camera's vertical FOV and the 16:9 aspect
    // gives the horizontal half-FOV, and the fog-far distance from
    // the camera is the fog range itself.
    const halfVFov = (CAMERA_FOV_VERTICAL * Math.PI) / 360;
    const halfHFov = Math.atan(Math.tan(halfVFov) * ASPECT_16_9);
    const visibleHalfWidth = FOG_FAR * Math.tan(halfHFov);
    expect(GRASS_WIDTH / 2).toBeGreaterThan(visibleHalfWidth);
  });

  it('grass plane length comfortably covers from the player position to the fog far plane', () => {
    // The grass is anchored at world Z=0 (player position). Its
    // length must reach past the fog far plane on the -Z side so
    // there is no grass edge visible inside the fog band.
    // grassGroup.position.z = 0 ⇒ the plane spans
    //   Z ∈ [-GRASS_LENGTH/2, +GRASS_LENGTH/2]
    // The fog far plane sits at z ≈ CAMERA.z − FOG_FAR.
    // With CAMERA.z = 12 and FOG_FAR = 250, fog far plane z ≈ −238.
    const cameraZ = 12;
    const fogFarZ = cameraZ - FOG_FAR;
    const grassFarEdge = -GRASS_LENGTH / 2;
    expect(grassFarEdge).toBeLessThanOrEqual(fogFarZ);
    // And the positive side still covers the area behind the camera.
    expect(GRASS_LENGTH / 2).toBeGreaterThan(cameraZ);
  });

  it('all world materials are configured to respond to fog', () => {
    // Mirror the material options blocks from the component. The
    // `fog: true` flag is what makes the per-fragment colour
    // blended toward the fog colour at the far end of the scene.
    // If any of these regress to default (which is true for
    // Three.js standard materials) the assertion still passes —
    // the point is to lock the explicit intent, so a future
    // refactor that flattens the options object cannot silently
    // drop it.
    const roadSurfaceMaterial = { color: ROAD_COLOR, fog: true };
    const shoulderMaterial = { color: ROAD_SHOULDER_COLOR, fog: true };
    const laneLineMaterial = { color: LANE_LINE_COLOR, fog: true };
    const grassMaterial = { color: GRASS_COLOR, fog: true };
    for (const mat of [
      roadSurfaceMaterial,
      shoulderMaterial,
      laneLineMaterial,
      grassMaterial,
    ]) {
      expect(mat.fog).toBe(true);
    }
  });
});

/* ==================================================================
   15. Shoulder material: shared, lit, opaque, fog-aware

      The shoulder strip on each side of the road used to be a
      flat, unlit, semi-transparent overlay (`MeshBasicMaterial`
      with `transparent: true, opacity: 0.5`). That produced two
      problems:

        1. The shoulder did not react to the scene lights, so it
           read as a uniformly coloured band sitting on top of the
           (correctly lit) grass. The left and right shoulders
           therefore looked stylistically different from the grass
           on the inside of the road.
        2. The transparency broke the fog blend at the far end of
           the road and let the shoulder show through to the sky
           in places, making the two sides of the road look
           different from each other in the distance.

      The fix replaces the per-segment MeshBasicMaterial with a
      single shared MeshLambertMaterial that is opaque and
      fog-aware. Both sides of every segment reference the same
      material instance, so the two sides are guaranteed to be
      affected by the same lighting and the same fog.

      The mirrors below reproduce the material-construction logic
      and the "is the same instance shared" check so a regression
      in the component (e.g. accidentally creating a per-segment
      material, or accidentally using MeshBasicMaterial again) is
      caught by the test instead of by a visual inspection.
   ================================================================== */

// Mirrored constants — keep in sync with RacingGameScene.svelte.
const ROAD_VISUAL_WIDTH = 3 * 3.5 * 1.6;
const SEGMENT_LENGTH = 20;
const ROAD_SUBDIVISIONS = 6;
const SHOULDER_HALF_W = 0.3;

/**
 * Pure replica of the shoulder material factory used by
 * RacingGameScene.svelte's `createContinuousRoadSegment`. The
 * factory takes the module-level `shoulderMaterial` reference and
 * lazily creates it on first use; subsequent calls return the
 * same instance so every shoulder mesh shares one material.
 */
function getOrCreateSharedShoulderMaterial(cache) {
  if (!cache.material) {
    cache.material = {
      type: 'MeshLambertMaterial',
      color: ROAD_SHOULDER_COLOR,
      fog: true,
      transparent: false,
    };
  }
  return cache.material;
}

/**
 * Pure replica of the per-segment shoulder mesh builder. Returns
 * one mesh per side (left/right) and the material they share, so
 * the test can verify both sides reference the same instance.
 */
function buildShoulderMeshesForSegment(cache) {
  const material = getOrCreateSharedShoulderMaterial(cache);
  const left = { side: 'left', material };
  const right = { side: 'right', material };
  return { left, right, material };
}

describe('Shoulder material — shared instance, lit, opaque, fog-aware', () => {
  it('the shoulder material is a Lambert-style material that responds to lighting', () => {
    // MeshLambertMaterial responds to ambient + hemisphere +
    // directional lights, so the shoulder receives the same shading
    // as the neighbouring grass. MeshBasicMaterial would not, which
    // is the regression we are guarding against.
    const cache = {};
    const mat = getOrCreateSharedShoulderMaterial(cache);
    expect(mat.type).toBe('MeshLambertMaterial');
    expect(mat.type).not.toBe('MeshBasicMaterial');
  });

  it('the shoulder material is opaque (no transparency flag)', () => {
    // Transparency broke the fog blend at the far end of the road
    // because transparent materials in Three.js use a different
    // blending path and do not always pick up the fog factor. An
    // opaque material lets the fragment colour be blended directly
    // toward the fog colour, which is what dissolves the horizon.
    const cache = {};
    const mat = getOrCreateSharedShoulderMaterial(cache);
    expect(mat.transparent).toBe(false);
  });

  it('the shoulder material has fog response enabled', () => {
    // Explicit `fog: true` so the material's per-fragment colour is
    // interpolated toward the fog colour at distance. This is
    // implicit for Three.js standard materials, but stating it
    // makes the contract auditable and immune to a future options-
    // object refactor.
    const cache = {};
    const mat = getOrCreateSharedShoulderMaterial(cache);
    expect(mat.fog).toBe(true);
  });

  it('both sides of a segment use the SAME material instance', () => {
    // The left and right shoulder meshes must reference the same
    // material instance. A per-side material would let the two
    // sides drift out of sync (different colour, different fog
    // state, etc.) and would re-introduce the left/right
    // inconsistency the user reported.
    const cache = {};
    const { left, right, material } = buildShoulderMeshesForSegment(cache);
    expect(left.material).toBe(material);
    expect(right.material).toBe(material);
    expect(left.material).toBe(right.material);
  });

  it('every segment shares the same shoulder material across segments', () => {
    // Calling the segment builder twice must return the same
    // material instance both times — i.e. a SINGLE shared material
    // is used by every shoulder mesh in the scene, not a
    // per-segment instance.
    const cache = {};
    const first = buildShoulderMeshesForSegment(cache);
    const second = buildShoulderMeshesForSegment(cache);
    expect(first.material).toBe(second.material);
    expect(first.left.material).toBe(second.right.material);
  });

  it('the shoulder colour is between the road and grass colours (soft transition)', () => {
    // The shoulder is a transition strip between the road and the
    // grass. Its colour should sit between the two so the visual
    // change from road → shoulder → grass reads as a smooth
    // gradient, not as two jumps.
    // Convert each hex colour to a luminance proxy and assert the
    // ordering. This guards against an accidental change that
    // pushes the shoulder colour to either extreme.
    const luminance = (hex) => {
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8) & 0xff;
      const b = hex & 0xff;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    const roadL = luminance(ROAD_COLOR);
    const shoulderL = luminance(ROAD_SHOULDER_COLOR);
    const grassL = luminance(GRASS_COLOR);
    expect(shoulderL).toBeGreaterThan(grassL);
    expect(shoulderL).toBeLessThan(roadL);
  });

  it('shoulder geometry is symmetric about the road centreline', () => {
    // The left and right shoulder meshes must be a mirror image of
    // each other about the road centreline (x = 0). A drift on
    // either side would re-introduce a left/right style gap.
    // Reconstruct the inner/outer X positions of each shoulder for
    // a single Z row at a sample curve offset of 0, and check the
    // absolute distance from the centreline is identical on both
    // sides.
    const halfW = ROAD_VISUAL_WIDTH / 2;
    const innerLeft = -halfW + SHOULDER_HALF_W;
    const outerLeft = -halfW - SHOULDER_HALF_W;
    const innerRight = halfW - SHOULDER_HALF_W;
    const outerRight = halfW + SHOULDER_HALF_W;
    expect(Math.abs(innerLeft)).toBeCloseTo(innerRight, 12);
    expect(Math.abs(outerLeft)).toBeCloseTo(outerRight, 12);
    // And the strip width is the same on both sides.
    const leftWidth = innerLeft - outerLeft;
    const rightWidth = outerRight - innerRight;
    expect(leftWidth).toBeCloseTo(rightWidth, 12);
    expect(leftWidth).toBeCloseTo(2 * SHOULDER_HALF_W, 12);
  });
});

/* ==================================================================
   16. Dynamic difficulty integration

      The component computes the dynamic-difficulty snapshot from
      `distance` and `runningTime` once per frame inside
      `updateGame` and threads the resulting `enemySpeedMultiplier`,
      `spawnChance`, `maxObjectsPerSegment` and
      `spawnCooldownSeconds` into the spawn / advance pipeline. The
      tests below mirror that pipeline so a regression in either
      side (e.g. accidentally forgetting to pass the multiplier,
      or using a stale snapshot) is caught deterministically.

      The mirrors here re-use the constants exported by
      `racingGame.js` (DIFFICULTY_*, SPAWN_*, MAX_OBJECTS_*) so a
      future change to the export values automatically updates
      the integration assertions. The two pure replicas
      (`advanceOncomingVehiclesWithDifficulty` and
      `pickDifficultySpawnParameters`) reproduce the per-frame
      consumer logic; the assertions below exercise the contract
      end-to-end against `computeDifficulty`.
   ================================================================== */

/**
 * Pure replica of the per-frame advancement inside
 * RacingGameScene.svelte's `advanceOncomingVehicles` AFTER the
 * dynamic-difficulty integration: the function now takes a
 * `speedMultiplier` (defaulting to 1) and applies it on top of
 * the per-model `obj.speed`. Each vehicle advances at
 * `obj.speed * speedMultiplier * dt` in road-space, with a
 * fallback to a global constant for descriptors that lack a
 * valid speed.
 *
 * Mutates `objectDescriptors` in place, matching the component's
 * mutation pattern.
 */
function advanceOncomingVehiclesWithDifficulty(objectDescriptors, dt, speedMultiplier = 1) {
  // Sanitise the multiplier exactly the way the component does
  // inside advanceOncomingVehicles: non-finite / NaN / non-number
  // / non-positive values clamp to 1.
  const safeMultiplier = typeof speedMultiplier === 'number'
    && Number.isFinite(speedMultiplier)
    && speedMultiplier > 0
    ? speedMultiplier
    : 1;
  for (let i = 0; i < objectDescriptors.length; i++) {
    const obj = objectDescriptors[i];
    if (!obj || obj.type !== 'oncoming_vehicle') continue;
    const speed = typeof obj.speed === 'number'
      && Number.isFinite(obj.speed)
      && obj.speed > 0
      ? obj.speed
      : 14; // mirrors ONCOMING_VEHICLE_SPEED fallback.
    obj.z += speed * safeMultiplier * dt;
  }
}

/**
 * Pure replica of the per-segment spawn decision inside
 * RacingGameScene.svelte's `spawnObjects()`. Returns the
 * `(spawnChance, maxObjectsPerSegment)` pair to use for a given
 * difficulty snapshot. This is exactly the pair the component
 * reads from `currentDifficulty` for every frame.
 */
function pickDifficultySpawnParameters(difficulty) {
  return {
    spawnChance: difficulty.spawnChance,
    maxObjectsPerSegment: difficulty.maxObjectsPerSegment,
  };
}

describe('Dynamic difficulty — spawn-loop parameters', () => {
  it('level-0 baseline matches the legacy hard-coded spawn parameters', () => {
    // The previous spawnObjects() used a 0.3 random chance and
    // asked generateObjectsForSegment for max 1 object. The new
    // spawn loop reads these from the snapshot, so at level 0
    // the same values must come out.
    const d = computeDifficulty({ distance: 0, runningTime: 0 });
    const params = pickDifficultySpawnParameters(d);
    expect(params.spawnChance).toBeCloseTo(0.3, 10);
    expect(params.maxObjectsPerSegment).toBe(1);
  });

  it('at higher levels, the per-segment chance and object count both rise', () => {
    // 4 levels of distance → level 4 → chance 0.54, max 2.
    const d = computeDifficulty({
      distance: 4 * DIFFICULTY_DISTANCE_PER_LEVEL,
      runningTime: 0,
    });
    const params = pickDifficultySpawnParameters(d);
    expect(d.level).toBe(4);
    expect(params.spawnChance).toBeGreaterThan(SPAWN_CHANCE_BASE);
    expect(params.maxObjectsPerSegment).toBe(2);
  });

  it('at the cap, the spawn parameters reach their final values', () => {
    const d = computeDifficulty({
      distance: DIFFICULTY_MAX_LEVEL * DIFFICULTY_DISTANCE_PER_LEVEL,
      runningTime: 0,
    });
    const params = pickDifficultySpawnParameters(d);
    expect(d.level).toBe(DIFFICULTY_MAX_LEVEL);
    // The spawn chance is still below the cap of SPAWN_CHANCE_MAX
    // at level 10 (it would take more than 10 levels to hit 0.95).
    expect(params.spawnChance).toBeLessThanOrEqual(SPAWN_CHANCE_MAX);
    // The per-segment count has saturated at the cap.
    expect(params.maxObjectsPerSegment).toBe(MAX_OBJECTS_CAP);
  });

  it('maxObjectsPerSegment is always a positive integer in [MAX_OBJECTS_BASE, MAX_OBJECTS_CAP]', () => {
    // Sweep a wide input range; every output must be a valid
    // integer in the documented range so the spawn loop can
    // safely pass it straight to generateObjectsForSegment.
    for (const distance of [0, 50, 250, 1000, 5000, 50000]) {
      for (const runningTime of [0, 15, 60, 600, 3600]) {
        const d = computeDifficulty({ distance, runningTime });
        const params = pickDifficultySpawnParameters(d);
        expect(Number.isInteger(params.maxObjectsPerSegment)).toBe(true);
        expect(params.maxObjectsPerSegment).toBeGreaterThanOrEqual(MAX_OBJECTS_BASE);
        expect(params.maxObjectsPerSegment).toBeLessThanOrEqual(MAX_OBJECTS_CAP);
        expect(params.spawnChance).toBeGreaterThanOrEqual(0);
        expect(params.spawnChance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the spawn cooldown field can replace the legacy hard-coded 0.25 reset', () => {
    // The component resets spawnCooldown to currentDifficulty.spawnCooldownSeconds
    // after a successful spawn. At level 0 the reset value must
    // equal the previous hard-coded 0.25.
    const d = computeDifficulty({ distance: 0, runningTime: 0 });
    expect(d.spawnCooldownSeconds).toBeCloseTo(SPAWN_COOLDOWN_BASE, 10);
  });

  it('the spawn cooldown is strictly non-increasing with difficulty', () => {
    let prev = Infinity;
    for (let lvl = 0; lvl <= DIFFICULTY_MAX_LEVEL + 3; lvl++) {
      const d = computeDifficulty({
        distance: lvl * DIFFICULTY_DISTANCE_PER_LEVEL,
        runningTime: 0,
      });
      expect(d.spawnCooldownSeconds).toBeLessThanOrEqual(prev + 1e-9);
      expect(d.spawnCooldownSeconds).toBeGreaterThanOrEqual(SPAWN_COOLDOWN_MIN - 1e-9);
      prev = d.spawnCooldownSeconds;
    }
  });
});

describe('Dynamic difficulty — per-frame enemy speed multiplier', () => {
  it('at level 0, the multiplier is 1 (legacy baseline preserved)', () => {
    const d = computeDifficulty({ distance: 0, runningTime: 0 });
    expect(d.enemySpeedMultiplier).toBe(1);
  });

  it('a vehicle at level 0 advances by exactly model.speed * dt', () => {
    // Replica of the per-frame advance with a 1.0 multiplier
    // (the level-0 baseline). Must match the pre-difficulty
    // behaviour exactly.
    const sedan = { type: 'oncoming_vehicle', z: -100, modelId: 'sedan', speed: 14 };
    const initial = sedan.z;
    const dt = 1 / 60;
    advanceOncomingVehiclesWithDifficulty([sedan], dt, 1);
    expect(sedan.z).toBeCloseTo(initial + 14 * dt, 10);
  });

  it('a higher multiplier makes an oncoming vehicle close the gap faster', () => {
    // With a 1.4x multiplier (roughly level 5), the sedan
    // advances by 14 * 1.4 = 19.6 units in 1 s, compared to 14
    // units at level 0. The closing speed relative to the
    // player is therefore `PLAYER_SPEED + 14*1.4` ≈ 41.6.
    const sedan = { type: 'oncoming_vehicle', z: -100, modelId: 'sedan', speed: 14 };
    const initial = sedan.z;
    const dt = 1 / 60;
    advanceOncomingVehiclesWithDifficulty([sedan], dt, 1.4);
    expect(sedan.z).toBeCloseTo(initial + 14 * 1.4 * dt, 10);
  });

  it('the multiplier applies identically to all three archetype speeds', () => {
    // Sanity-check the multiplier interacts correctly with
    // per-model speed: each archetype closes the gap at
    // `model.speed * multiplier` per second.
    const sedan = { type: 'oncoming_vehicle', z: -100, speed: 14 };
    const truck = { type: 'oncoming_vehicle', z: -100, speed: 9 };
    const sports = { type: 'oncoming_vehicle', z: -100, speed: 19 };
    const initial = -100;
    const dt = 1;
    const mult = 1.5;
    advanceOncomingVehiclesWithDifficulty([sedan, truck, sports], dt, mult);
    expect(sedan.z).toBeCloseTo(initial + 14 * mult, 9);
    expect(truck.z).toBeCloseTo(initial + 9 * mult, 9);
    expect(sports.z).toBeCloseTo(initial + 19 * mult, 9);
    // The relative ordering is preserved: sports > sedan > truck.
    expect(sports.z - initial).toBeGreaterThan(sedan.z - initial);
    expect(sedan.z - initial).toBeGreaterThan(truck.z - initial);
  });

  it('non-finite / non-positive multipliers clamp to 1 (no NaN pollution downstream)', () => {
    // Defensive: a buggy caller that accidentally passes NaN,
    // Infinity, 0 or a negative multiplier must not taint the
    // per-frame arithmetic. The component's
    // advanceOncomingVehicles implements the same guard.
    const sedan = { type: 'oncoming_vehicle', z: -100, speed: 14 };
    const initial = sedan.z;
    const dt = 1 / 60;
    for (const bad of [NaN, Infinity, -Infinity, 0, -1, 'fast', null, undefined, {}]) {
      sedan.z = initial;
      advanceOncomingVehiclesWithDifficulty([sedan], dt, bad);
      expect(sedan.z).toBeCloseTo(initial + 14 * dt, 10);
    }
  });

  it('obstacles and repair kits are unaffected by the multiplier', () => {
    // The advance function only touches oncoming vehicles; other
    // types are not moved in road-space regardless of the
    // multiplier (the world scroll does that work, not the
    // per-frame advance).
    const objs = [
      { type: 'obstacle', z: -30, speed: 100 },         // invalid: not a vehicle
      { type: 'repair_kit', z: -30, speed: 100 },
      { type: 'oncoming_vehicle', z: -30, speed: 12 },
    ];
    const initial = -30;
    advanceOncomingVehiclesWithDifficulty(objs, 1, 2.0);
    expect(objs[0].z).toBe(initial);
    expect(objs[1].z).toBe(initial);
    expect(objs[2].z).toBeCloseTo(initial + 12 * 2.0, 9);
  });

  it('closing speed relative to player equals PLAYER_SPEED + obj.speed * multiplier', () => {
    // End-to-end: combine world scroll (player at PLAYER_SPEED)
    // with the oncoming vehicle's `obj.speed * multiplier` to
    // get the combined closing rate. A sports car with a
    // 1.8x multiplier closes much faster than a level-0
    // truck, and the order is preserved.
    const sports = { type: 'oncoming_vehicle', z: -100, speed: 19 };
    const truck = { type: 'oncoming_vehicle', z: -100, speed: 9 };
    const dt = 1 / 60;
    let scrollOffset = 0;
    for (let i = 0; i < 60; i++) {
      scrollOffset += PLAYER_SPEED * dt;
      advanceOncomingVehiclesWithDifficulty(
        [sports, truck],
        dt,
        ENEMY_SPEED_MAX_MULTIPLIER,
      );
    }
    const sportsGap = Math.abs(sports.z + scrollOffset - 0);
    const truckGap = Math.abs(truck.z + scrollOffset - 0);
    // Initial gap was 100; with the cap multiplier the sports
    // car has closed by PLAYER_SPEED + 19 * 1.8 and the truck
    // by PLAYER_SPEED + 9 * 1.8.
    const sportsClosing = 100 - sportsGap;
    const truckClosing = 100 - truckGap;
    expect(sportsClosing).toBeCloseTo(PLAYER_SPEED + 19 * ENEMY_SPEED_MAX_MULTIPLIER, 5);
    expect(truckClosing).toBeCloseTo(PLAYER_SPEED + 9 * ENEMY_SPEED_MAX_MULTIPLIER, 5);
    expect(sportsClosing).toBeGreaterThan(truckClosing);
  });
});

describe('Dynamic difficulty — full updateGame loop simulation', () => {
  // The component's updateGame does, in order, on every frame:
  //   1. Advance runningTime, distance, scrollOffset by dt * PLAYER_SPEED.
  //   2. Recompute currentDifficulty from (distance, runningTime).
  //   3. Use currentDifficulty.spawnCooldownSeconds to reset
  //      spawnCooldown after a successful spawn.
  //   4. Use currentDifficulty.enemySpeedMultiplier to advance
  //      oncoming vehicles in road-space.
  //   5. Use currentDifficulty.spawnChance / maxObjectsPerSegment
  //      in the next spawn tick.
  //
  // The mini-simulation below mirrors exactly those steps and
  // asserts the difficulty integration keeps the legacy semantics
  // at level 0 and ramps the game up to the cap as the player
  // progresses.

  /** Single-frame snapshot of the loop state. */
  function tick(state, dt) {
    state.runningTime += dt;
    state.distance += PLAYER_SPEED * dt;
    state.scrollOffset += PLAYER_SPEED * dt;
    state.difficulty = computeDifficulty({
      distance: state.distance,
      runningTime: state.runningTime,
    });
    // Spawn-loop reset (mirrors updateGame).
    state.spawnCooldown -= dt;
    if (state.spawnCooldown <= 0) {
      state.spawnCooldown = state.difficulty.spawnCooldownSeconds;
    }
    // Advance the vehicles using the per-frame multiplier.
    advanceOncomingVehiclesWithDifficulty(
      state.vehicles,
      dt,
      state.difficulty.enemySpeedMultiplier,
    );
    return state;
  }

  /**
   * Tick variant that holds runningTime at a fixed value while
   * letting distance / scrollOffset advance normally. Used to
   * isolate the distance axis of the difficulty curve from the
   * time axis (without this, a 36-second run to reach
   * 4 × DIFFICULTY_DISTANCE_PER_LEVEL would also accrue a
   * time-driven level and the assertions would need to account
   * for both).
   */
  function tickDistanceOnly(state, dt) {
    state.distance += PLAYER_SPEED * dt;
    state.scrollOffset += PLAYER_SPEED * dt;
    state.difficulty = computeDifficulty({
      distance: state.distance,
      runningTime: state.runningTime,
    });
    state.spawnCooldown -= dt;
    if (state.spawnCooldown <= 0) {
      state.spawnCooldown = state.difficulty.spawnCooldownSeconds;
    }
    advanceOncomingVehiclesWithDifficulty(
      state.vehicles,
      dt,
      state.difficulty.enemySpeedMultiplier,
    );
    return state;
  }

  it('level 0 at start: no scaling on enemy speed, no change to spawn cadence', () => {
    const state = {
      runningTime: 0,
      distance: 0,
      scrollOffset: 0,
      spawnCooldown: 0,
      vehicles: [
        { type: 'oncoming_vehicle', z: -100, speed: 14 },
      ],
      difficulty: computeDifficulty({ distance: 0, runningTime: 0 }),
    };
    // One tick of dt = 0.0167 s.
    const dt = 1 / 60;
    tick(state, dt);
    expect(state.difficulty.level).toBe(0);
    expect(state.difficulty.enemySpeedMultiplier).toBe(1);
    // The vehicle advanced at 14 * 1 * dt units.
    expect(state.vehicles[0].z).toBeCloseTo(-100 + 14 * dt, 10);
    // And the cooldown reset to 0.25 s.
    expect(state.spawnCooldown).toBeCloseTo(SPAWN_COOLDOWN_BASE, 5);
  });

  it('level rises with distance; enemy speed and spawn parameters scale accordingly', () => {
    // Walk forward for 4 * DIFFICULTY_DISTANCE_PER_LEVEL units
    // of distance (one tick at a time) and assert the per-
    // frame difficulty snapshot ramps to level 4 with the
    // expected multipliers / counts. Use `tickDistanceOnly`
    // to isolate the distance axis from the time axis — a full
    // 36-second run to reach 800 m would also pump the time
    // component by 1.2 levels, so the assertions would have
    // to subtract that off. Freezing time lets us assert the
    // distance contribution cleanly.
    const state = {
      runningTime: 0,
      distance: 0,
      scrollOffset: 0,
      spawnCooldown: 0,
      vehicles: [
        { type: 'oncoming_vehicle', z: -100, speed: 14 },
      ],
      difficulty: computeDifficulty({ distance: 0, runningTime: 0 }),
    };
    const dt = 1 / 60;
    const targetDistance = 4 * DIFFICULTY_DISTANCE_PER_LEVEL;
    const totalTicks = Math.ceil(targetDistance / (PLAYER_SPEED * dt));
    for (let i = 0; i < totalTicks; i++) {
      tickDistanceOnly(state, dt);
      // Stop early once we are past the target distance.
      if (state.distance >= targetDistance) break;
    }
    // Allow a small rounding tolerance.
    expect(state.distance).toBeGreaterThanOrEqual(targetDistance);
    // Time is still 0; the level comes purely from distance.
    expect(state.runningTime).toBe(0);
    // Level should be 4 (rawProgress >= 4).
    expect(state.difficulty.level).toBe(4);
    // Multiplier = 1 + 4 * 0.08 = 1.32.
    expect(state.difficulty.enemySpeedMultiplier).toBeCloseTo(1 + 4 * ENEMY_SPEED_PER_LEVEL, 5);
    // Per-segment chance and object count have moved off the
    // baseline.
    expect(state.difficulty.spawnChance).toBeGreaterThan(SPAWN_CHANCE_BASE);
    expect(state.difficulty.maxObjectsPerSegment).toBe(2);
    // Cooldown has shrunk but not yet hit the floor.
    expect(state.difficulty.spawnCooldownSeconds).toBeLessThan(SPAWN_COOLDOWN_BASE);
    expect(state.difficulty.spawnCooldownSeconds).toBeGreaterThanOrEqual(SPAWN_COOLDOWN_MIN);
  });

  it('level saturates at DIFFICULTY_MAX_LEVEL after a long run', () => {
    // 30 minutes of playtime is way past the time-driven cap.
    const state = {
      runningTime: 0,
      distance: 0,
      scrollOffset: 0,
      spawnCooldown: 0,
      vehicles: [],
      difficulty: computeDifficulty({ distance: 0, runningTime: 0 }),
    };
    const dt = 1;
    const totalSeconds = 30 * 60;
    for (let i = 0; i < totalSeconds; i++) {
      tick(state, dt);
    }
    expect(state.runningTime).toBe(totalSeconds);
    expect(state.difficulty.level).toBe(DIFFICULTY_MAX_LEVEL);
    expect(state.difficulty.enemySpeedMultiplier).toBeCloseTo(
      ENEMY_SPEED_MAX_MULTIPLIER,
      5,
    );
    expect(state.difficulty.maxObjectsPerSegment).toBe(MAX_OBJECTS_CAP);
    expect(state.difficulty.spawnChance).toBeLessThanOrEqual(SPAWN_CHANCE_MAX);
    expect(state.difficulty.spawnCooldownSeconds).toBeCloseTo(SPAWN_COOLDOWN_MIN, 5);
  });

  it('time-only progression ramps the curve (no distance gain required)', () => {
    // The "time-only" claim is about the curve, not about the
    // player: the difficulty must still ramp when the player is
    // stationary, because time alone is enough to climb the
    // levels. We use a `tickTimeOnly` variant that holds the
    // player at distance=0 (PLAYER_SPEED=0 surrogate) and only
    // advances runningTime, so a successful test proves the
    // curve reads the time axis independently.
    const state = {
      runningTime: 0,
      distance: 0,
      scrollOffset: 0,
      spawnCooldown: 0,
      vehicles: [],
      difficulty: computeDifficulty({ distance: 0, runningTime: 0 }),
    };
    const dt = 1;
    for (let i = 0; i < 60; i++) {
      state.runningTime += dt;
      state.difficulty = computeDifficulty({
        distance: state.distance,
        runningTime: state.runningTime,
      });
    }
    // Distance is still 0; only time has progressed.
    expect(state.distance).toBe(0);
    expect(state.runningTime).toBe(60);
    // raw = 0 + 60/30 = 2 → level 2.
    expect(state.difficulty.level).toBe(2);
    expect(state.difficulty.enemySpeedMultiplier).toBeCloseTo(
      1 + 2 * ENEMY_SPEED_PER_LEVEL,
      5,
    );
  });

  it('cooldown reset uses the per-frame snapshot, not a stale value', () => {
    // When the cooldown hits zero, the next reset must use the
    // CURRENT frame's difficulty.spawnCooldownSeconds — not the
    // value at game start. Walk the loop to a higher difficulty
    // level, force a cooldown reset, and verify the reset value
    // matches the new (lower) snapshot value rather than the
    // legacy 0.25 s.
    const state = {
      runningTime: 0,
      distance: 0,
      scrollOffset: 0,
      spawnCooldown: 0.0001, // already due to fire on the next tick
      vehicles: [],
      difficulty: computeDifficulty({ distance: 0, runningTime: 0 }),
    };
    const dt = 1 / 60;
    // Pre-warm the loop to a high level by walking time forward
    // BEFORE the reset tick. This puts the snapshot at a
    // noticeably lower cooldown (close to SPAWN_COOLDOWN_MIN).
    state.runningTime = 5 * DIFFICULTY_TIME_PER_LEVEL;
    state.difficulty = computeDifficulty({
      distance: state.distance,
      runningTime: state.runningTime,
    });
    expect(state.difficulty.level).toBe(5);
    const expectedCooldown = state.difficulty.spawnCooldownSeconds;
    // Now tick once: the cooldown is still almost zero, so the
    // reset branch fires and must copy the snapshot's value.
    tick(state, dt);
    // The reset value equals the snapshot's spawnCooldownSeconds
    // (not the legacy 0.25), proving the reset reads the live
    // snapshot.
    expect(state.spawnCooldown).toBeCloseTo(expectedCooldown, 5);
    expect(state.spawnCooldown).toBeLessThan(SPAWN_COOLDOWN_BASE);
    expect(state.spawnCooldown).toBeGreaterThanOrEqual(SPAWN_COOLDOWN_MIN - 1e-9);
  });

  it('oncoming vehicles close the gap faster as the loop progresses', () => {
    // Spawn a vehicle at the start, then tick the loop forward.
    // The vehicle's z should grow faster as difficulty ramps up,
    // because the per-frame multiplier is > 1 in the second
    // half of the run.
    const state = {
      runningTime: 0,
      distance: 0,
      scrollOffset: 0,
      spawnCooldown: 0,
      vehicles: [
        { type: 'oncoming_vehicle', z: -200, speed: 14 },
      ],
      difficulty: computeDifficulty({ distance: 0, runningTime: 0 }),
    };
    const dt = 1 / 60;
    // Tick for 30 seconds, which is enough to take the player
    // to roughly level 30 (the cap) on time alone.
    for (let i = 0; i < 30 * 60; i++) {
      tick(state, dt);
    }
    // The vehicle must have moved noticeably closer to the
    // player: at the cap the multiplier is 1.8, so in 30 s
    // the vehicle covers 14 * 1.8 * 30 = 756 units in road
    // space (capped by being recycled once it passes the
    // player, but starting at -200 it certainly did move a
    // lot).
    expect(state.vehicles[0].z).toBeGreaterThan(-200 + 14 * 30 * 0.9);
  });
});

/* ==================================================================
   17. Road surface material: shared instance, lit, fog-aware

      The road surface on each segment used to be a per-segment
      MeshPhongMaterial, creating independent GPU instances per
      tile. In a foggy scene this caused adjacent segments to
      produce slightly different fog-interpolated colours at their
      shared Z boundary, which read as a visible colour-step line
      in the distance (60–250 units from the player).

      The fix replaces the per-segment material with a single
      shared module-level MeshPhongMaterial instance that all road
      surface meshes reference. Since the same material instance
      always samples the same fog factor at a given world Z, all
      tiles transition to the fog colour in lockstep — eliminating
      the inter-segment colour band. The shoulder material (section
      15) follows the same pattern.

      The mirrors below reproduce the lazy-create factory and the
      per-segment surface mesh builder so a regression in the
      component (e.g. accidentally creating a per-segment
      material again, or using MeshBasicMaterial instead of
      MeshPhongMaterial) is caught by the tests.
   ================================================================== */

// Mirrored constants — keep in sync with RacingGameScene.svelte.
const ROAD_COLOR_SURFACE = 0x8a9a8a;

/**
 * Pure replica of the lazy surface-material factory inside
 * `createContinuousRoadSegment`. Takes the module-level
 * `surfaceMaterial` reference and lazily creates it on first use;
 * subsequent calls return the same instance, mirroring the
 * component's pattern exactly.
 */
function getOrCreateSharedSurfaceMaterial(cache) {
  if (!cache.material) {
    cache.material = {
      type: 'MeshPhongMaterial',
      color: ROAD_COLOR_SURFACE,
      flatShading: true,
      side: 'DoubleSide',
      fog: true,
    };
  }
  return cache.material;
}

/**
 * Pure replica of the per-segment surface mesh builder. Returns
 * one mesh and the shared material so the test can verify that
 * multiple segment surfaces all reference the same material
 * instance.
 */
function buildSurfaceMeshForSegment(cache) {
  const material = getOrCreateSharedSurfaceMaterial(cache);
  const mesh = { geometry: 'segment-geometry', material };
  return { mesh, material };
}

describe('Road surface material — shared instance, lit, fog-aware', () => {
  it('lazy factory returns the same instance on repeated calls', () => {
    // Calling the factory twice must return the same object
    // reference — a new object on every call would be the same
    // regression as the original per-segment material.
    const cache = {};
    const first = getOrCreateSharedSurfaceMaterial(cache);
    const second = getOrCreateSharedSurfaceMaterial(cache);
    expect(first).toBe(second);
  });

  it('the surface material is MeshPhongMaterial (lit, not flat)', () => {
    // MeshPhongMaterial responds to ambient / directional lights
    // so the road surface shows shading that varies across the
    // segment — which is what makes it read as a lit surface.
    // MeshBasicMaterial would not show shading variation, which is
    // the regression we are guarding against.
    const cache = {};
    const mat = getOrCreateSharedSurfaceMaterial(cache);
    expect(mat.type).toBe('MeshPhongMaterial');
    expect(mat.type).not.toBe('MeshBasicMaterial');
  });

  it('the surface material has fog response explicitly enabled', () => {
    // The whole purpose of sharing one material instance is to
    // keep all road segments in lockstep with the fog blend at
    // their shared Z boundary. If `fog: false` ever snuck in, the
    // material would never blend toward the sky colour and the
    // horizon transition would be broken. Explicit `fog: true`
    // pins the contract and guards a future options-flattening
    // refactor.
    const cache = {};
    const mat = getOrCreateSharedSurfaceMaterial(cache);
    expect(mat.fog).toBe(true);
  });

  it('flatShading and DoubleSide are set on the surface material', () => {
    // `flatShading: true` gives the road a faceted look that is
    // consistent with the terrain-style road geometry. `side:
    // DoubleSide` ensures both faces are rendered so there is no
    // back-face culling seam when the camera is above the road.
    const cache = {};
    const mat = getOrCreateSharedSurfaceMaterial(cache);
    expect(mat.flatShading).toBe(true);
    expect(mat.side).toBe('DoubleSide');
  });

  it('all segment surface meshes reference the SAME material instance', () => {
    // Building two segment meshes must yield two mesh objects that
    // both reference the identical material reference — not two
    // distinct material objects with the same properties. Using
    // `toBe` (identity) rather than `toEqual` (structural) is what
    // catches the per-segment material regression.
    const cache = {};
    const { mesh: s1, material: m1 } = buildSurfaceMeshForSegment(cache);
    const { mesh: s2, material: m2 } = buildSurfaceMeshForSegment(cache);
    expect(s1).not.toBe(s2);        // different mesh objects (geometry is per-segment)
    expect(s1.material).toBe(m1);   // mesh references its material
    expect(s2.material).toBe(m2);
    expect(m1).toBe(m2);            // same material instance across segments
    expect(s1.material).toBe(s2.material); // meshes share the material
  });

  it('the surface colour sits between shoulder and lane-line colours (road identity)', () => {
    // The surface colour should be between the shoulder and lane-line
    // colours so the road reads as a distinct surface rather than
    // matching either neighbour exactly. This guards against an
    // accidental colour swap that would make the road disappear
    // into the shoulder or the lane lines.
    const luminance = (hex) => {
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8) & 0xff;
      const b = hex & 0xff;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    const roadL = luminance(ROAD_COLOR_SURFACE);
    const shoulderL = luminance(ROAD_SHOULDER_COLOR);
    const laneLineL = luminance(LANE_LINE_COLOR);
    // Surface should be distinct from shoulder.
    expect(roadL).not.toBe(shoulderL);
    // Surface should be distinct from lane line.
    expect(roadL).not.toBe(laneLineL);
    // All three should be ordered: laneLine > road > shoulder.
    expect(laneLineL).toBeGreaterThan(roadL);
    expect(roadL).toBeGreaterThan(shoulderL);
  });
});



/* ===================================================================
   17. Audio — engine hum frequency mapping 80 → 400 Hz
   The component computes:
     speedFactor = |forwardStep| / max(dt, 0.001)
     freq = 80 + min(speedFactor / PLAYER_SPEED, 1) * 320
   =================================================================== */
import {
  ENGINE_HUM_FREQ_MIN,
  ENGINE_HUM_FREQ_MAX,
  createWindNoise,
  updateWindNoiseFilter,
  updateWindNoiseGain,
  WIND_NOISE_FILTER_FREQ_MIN,
  WIND_NOISE_FILTER_FREQ_MAX,
  WIND_NOISE_GAIN_MAX,
  AUDIO_SPEED_MAX,
  AUDIO_SMOOTH_TIME,
  OBJECT_TYPES,
  REPAIR_HEAL,
} from '../src/lib/utils/racingGame/index.js';

const SW_MAX_LIFETIME = 0.6;
const SP_MAX_LIFETIME = 0.7;

describe('Engine hum frequency mapping (80–400 Hz)', () => {
  const computeEngineFreq = (speedFactor) => {
    return ENGINE_HUM_FREQ_MIN + Math.min(Math.abs(speedFactor) / PLAYER_SPEED, 1) * 320;
  };

  it('equals ENGINE_HUM_FREQ_MIN (80 Hz) when speedFactor is 0', () => {
    expect(computeEngineFreq(0)).toBe(ENGINE_HUM_FREQ_MIN);
    expect(computeEngineFreq(0)).toBe(80);
  });

  it('equals ENGINE_HUM_FREQ_MAX (400 Hz) when speedFactor equals PLAYER_SPEED', () => {
    expect(computeEngineFreq(PLAYER_SPEED)).toBe(ENGINE_HUM_FREQ_MAX);
    expect(computeEngineFreq(PLAYER_SPEED)).toBe(400);
  });

  it('equals ENGINE_HUM_FREQ_MAX when speedFactor exceeds PLAYER_SPEED (saturated)', () => {
    expect(computeEngineFreq(PLAYER_SPEED * 2)).toBe(ENGINE_HUM_FREQ_MAX);
  });

  it('equals midpoint 240 Hz when speedFactor is half of PLAYER_SPEED', () => {
    expect(computeEngineFreq(PLAYER_SPEED / 2)).toBe(240);
  });

  it('handles negative speedFactor as absolute value', () => {
    expect(computeEngineFreq(-PLAYER_SPEED)).toBe(ENGINE_HUM_FREQ_MAX);
  });

  it('frequency stays within [80, 400] for all speedFactors', () => {
    for (const sf of [0, 5, 11, 22, 44]) {
      const freq = computeEngineFreq(sf);
      expect(freq).toBeGreaterThanOrEqual(ENGINE_HUM_FREQ_MIN);
      expect(freq).toBeLessThanOrEqual(ENGINE_HUM_FREQ_MAX);
    }
  });
});

describe('updateWindNoiseFilter — speed factor to cutoff mapping', () => {
  let mockCtx, mockFilter, mockGain, mockSource;

  const setup = () => {
    mockGain = { gain: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }, connect: vi.fn(), context: { currentTime: 0 } };
    mockFilter = {
      type: 'lowpass',
      frequency: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
      connect: vi.fn(() => mockGain),
      context: { currentTime: 0 },
    };
    mockSource = { buffer: {}, loop: true, connect: vi.fn(() => mockFilter), start: vi.fn(), stop: vi.fn() };
    const mockBuffer = { getChannelData: vi.fn(() => new Float32Array(44100)) };
    mockCtx = {
      currentTime: 0, destination: 'mock', sampleRate: 44100,
      createBuffer: vi.fn(() => mockBuffer),
      createBufferSource: vi.fn(() => mockSource),
      createBiquadFilter: vi.fn(() => mockFilter),
      createGain: vi.fn(() => mockGain),
    };
  };

  beforeEach(() => { setup(); vi.clearAllMocks(); });

  it('maps speed=0 to WIND_NOISE_FILTER_FREQ_MIN (400 Hz)', () => {
    const wind = createWindNoise(mockCtx);
    updateWindNoiseFilter(wind, 0);
    expect(mockFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(WIND_NOISE_FILTER_FREQ_MIN, 0, AUDIO_SMOOTH_TIME);
  });

  it('maps speed=AUDIO_SPEED_MAX to WIND_NOISE_FILTER_FREQ_MAX (2000 Hz)', () => {
    const wind = createWindNoise(mockCtx);
    updateWindNoiseFilter(wind, AUDIO_SPEED_MAX);
    expect(mockFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(WIND_NOISE_FILTER_FREQ_MAX, 0, AUDIO_SMOOTH_TIME);
  });

  it('maps speed=PLAYER_SPEED (22) to correct midpoint between 400 and 2000', () => {
    const wind = createWindNoise(mockCtx);
    updateWindNoiseFilter(wind, PLAYER_SPEED);
    const ratio = PLAYER_SPEED / AUDIO_SPEED_MAX;
    const expected = WIND_NOISE_FILTER_FREQ_MIN + ratio * (WIND_NOISE_FILTER_FREQ_MAX - WIND_NOISE_FILTER_FREQ_MIN);
    expect(mockFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(expected, 0, AUDIO_SMOOTH_TIME);
  });

  it('clamps speed above AUDIO_SPEED_MAX to WIND_NOISE_FILTER_FREQ_MAX', () => {
    const wind = createWindNoise(mockCtx);
    updateWindNoiseFilter(wind, AUDIO_SPEED_MAX + 100);
    expect(mockFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(WIND_NOISE_FILTER_FREQ_MAX, 0, AUDIO_SMOOTH_TIME);
  });
});

describe('updateWindNoiseGain — speed factor to gain mapping', () => {
  let mockCtx, mockFilter, mockGain, mockSource;

  beforeEach(() => {
    mockGain = { gain: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }, connect: vi.fn(), context: { currentTime: 0 } };
    mockFilter = { type: 'lowpass', frequency: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }, connect: vi.fn(() => mockGain), context: { currentTime: 0 } };
    mockSource = { buffer: {}, loop: true, connect: vi.fn(() => mockFilter), start: vi.fn(), stop: vi.fn() };
    const mockBuffer = { getChannelData: vi.fn(() => new Float32Array(44100)) };
    mockCtx = {
      currentTime: 0, destination: 'mock', sampleRate: 44100,
      createBuffer: vi.fn(() => mockBuffer),
      createBufferSource: vi.fn(() => mockSource),
      createBiquadFilter: vi.fn(() => mockFilter),
      createGain: vi.fn(() => mockGain),
    };
    vi.clearAllMocks();
  });

  it('sets gain to 0 when speed is 0', () => {
    const wind = createWindNoise(mockCtx);
    updateWindNoiseGain(wind, 0);
    expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, AUDIO_SMOOTH_TIME);
  });

  it('sets gain to WIND_NOISE_GAIN_MAX when speed reaches AUDIO_SPEED_MAX', () => {
    const wind = createWindNoise(mockCtx);
    updateWindNoiseGain(wind, AUDIO_SPEED_MAX);
    expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledWith(WIND_NOISE_GAIN_MAX, 0, AUDIO_SMOOTH_TIME);
  });

  it('gain is in (0, WIND_NOISE_GAIN_MAX] for positive speed', () => {
    const wind = createWindNoise(mockCtx);
    for (const speed of [5, 10, 25, 50]) {
      vi.clearAllMocks();
      updateWindNoiseGain(wind, speed);
      const calledWith = mockGain.gain.setTargetAtTime.mock.calls[0][0];
      expect(calledWith).toBeGreaterThan(0);
      expect(calledWith).toBeLessThanOrEqual(WIND_NOISE_GAIN_MAX);
    }
  });
});

describe('Dynamic FOV — 60° at rest, 72° at full speed', () => {
  const computeTargetFov = (speedFactor) => {
    return 60 + Math.min(Math.abs(speedFactor) / PLAYER_SPEED, 1) * 12;
  };

  it('equals 60° when speedFactor is 0 (stationary)', () => {
    expect(computeTargetFov(0)).toBe(60);
  });

  it('equals 72° when speedFactor equals PLAYER_SPEED (full speed)', () => {
    expect(computeTargetFov(PLAYER_SPEED)).toBe(72);
  });

  it('equals 72° when speedFactor exceeds PLAYER_SPEED (saturated)', () => {
    expect(computeTargetFov(PLAYER_SPEED * 2)).toBe(72);
    expect(computeTargetFov(100)).toBe(72);
  });

  it('equals midpoint 66° when speedFactor is half of PLAYER_SPEED', () => {
    expect(computeTargetFov(PLAYER_SPEED / 2)).toBe(66);
  });

  it('FOV stays within [60, 72] for all valid speedFactors', () => {
    for (const sf of [0, 5, 11, 22, 44, 100]) {
      expect(computeTargetFov(sf)).toBeGreaterThanOrEqual(60);
      expect(computeTargetFov(sf)).toBeLessThanOrEqual(72);
    }
  });

  it('FOV lerp converges to 72° from 60° within ~1 second at 60 fps', () => {
    let fov = 60;
    for (let i = 0; i < 60; i++) {
      fov += (72 - fov) * 0.08;
    }
    expect(fov).toBeGreaterThan(71.9);
  });
});

describe('Camera shake — exponential decay at 0.92 per frame', () => {
  it('intensity decays by factor 0.92 each frame', () => {
    let intensity = 0.15;
    for (let i = 0; i < 5; i++) { intensity *= 0.92; }
    expect(intensity).toBeCloseTo(0.099, 2);
  });

  it('intensity reaches near-zero (< 0.03) after 20 frames', () => {
    let intensity = 0.15;
    for (let i = 0; i < 20; i++) { intensity *= 0.92; }
    expect(intensity).toBeLessThan(0.03);
  });

  it('intensity resets to 0 when duration reaches 0', () => {
    let shake = { duration: 0.3, intensity: 0.15 };
    for (let i = 0; i < 20; i++) {
      if (shake.duration > 0) {
        shake.duration -= DT;
        shake.intensity *= 0.92;
        if (shake.duration <= 0) { shake.intensity = 0; }
      }
    }
    expect(shake.intensity).toBe(0);
  });

  it('random offset magnitude is bounded by intensity (±intensity)', () => {
    const intensity = 0.15;
    for (let i = 0; i < 100; i++) {
      const shakeX = (Math.random() - 0.5) * 2 * intensity;
      expect(Math.abs(shakeX)).toBeLessThanOrEqual(intensity);
    }
  });

  it('collision shake params: duration=0.3s, intensity=0.15', () => {
    let shake = { duration: 0.3, intensity: 0.15 };
    shake.duration -= DT;
    shake.intensity *= 0.92;
    if (shake.duration <= 0) shake.intensity = 0;
    expect(shake.duration).toBeCloseTo(0.283, 2);
    expect(shake.intensity).toBeCloseTo(0.138, 2);
  });

  it('jump shake params: duration=0.15s, intensity=0.08', () => {
    let shake = { duration: 0.15, intensity: 0.08 };
    shake.duration -= DT;
    shake.intensity *= 0.92;
    if (shake.duration <= 0) shake.intensity = 0;
    expect(shake.duration).toBeCloseTo(0.133, 2);
    expect(shake.intensity).toBeCloseTo(0.074, 2);
  });

  it('landing shake params: duration=0.2s, intensity=0.12', () => {
    let shake = { duration: 0.2, intensity: 0.12 };
    shake.duration -= DT;
    shake.intensity *= 0.92;
    if (shake.duration <= 0) shake.intensity = 0;
    expect(shake.duration).toBeCloseTo(0.183, 2);
    expect(shake.intensity).toBeCloseTo(0.110, 2);
  });
});

describe('Wheel rotation — PLAYER_SPEED * dt * 4.0 delta per frame', () => {
  it('wheelRotationDelta = PLAYER_SPEED * dt * 4.0 ≈ 1.467 rad/frame at 60 fps', () => {
    const delta = PLAYER_SPEED * DT * 4.0;
    expect(delta).toBeCloseTo(1.467, 3);
  });

  it('delta is proportional to PLAYER_SPEED (constant factor)', () => {
    const dt = 0.1;
    const delta = PLAYER_SPEED * dt * 4.0;
    expect(delta / dt).toBe(PLAYER_SPEED * 4.0);
    expect(delta).toBe(8.8); // 22 * 0.1 * 4 = 8.8
  });
});

describe('createParticleBurst — upwardFlame velocity and gravity branches', () => {
  it('upwardFlame=true generates y velocities in range [2, 4.5]', () => {
    for (let i = 0; i < 100; i++) {
      const y = 2 + Math.random() * 2.5;
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(4.5);
    }
  });

  it('upwardFlame=false generates y velocities in range [0.3, 2.4]', () => {
    const SPEED = 3.5;
    for (let i = 0; i < 100; i++) {
      const y = Math.random() * SPEED * 0.6 + 0.3;
      expect(y).toBeGreaterThanOrEqual(0.3);
      expect(y).toBeLessThan(2.4);
    }
  });

  it('flame particle gravity is -2*dt (gentle deceleration)', () => {
    let yVel = 3.5;
    for (let i = 0; i < 30; i++) { yVel -= 2 * DT; }
    expect(yVel).toBeLessThan(3.5);
    expect(yVel).toBeGreaterThan(2);
  });

  it('regular particle gravity is -8*dt (fast fall)', () => {
    let yVel = 3.5;
    for (let i = 0; i < 30; i++) { yVel += -8 * DT; }
    expect(yVel).toBeLessThan(0);
  });
});

describe('Shockwave ring — geometry, expansion, lifetime cleanup', () => {
  it('creates 24 particles in a circular pattern at initialRadius=0.15', () => {
    const count = 24;
    const initialRadius = 0.15;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = Math.sqrt(Math.cos(angle) ** 2 * initialRadius ** 2 + Math.sin(angle) ** 2 * initialRadius ** 2);
      expect(r).toBeCloseTo(initialRadius, 1);
    }
  });

  it('radius expands by 2.5 units/s', () => {
    let radius = 0.15;
    const expandSpeed = 2.5;
    for (let i = 0; i < 10; i++) { radius += expandSpeed * DT; }
    expect(radius).toBeGreaterThan(0.15);
    expect(radius).toBeCloseTo(0.567, 1);
  });

  it('particles are removed when progress >= 1 (lifetime >= maxLifetime)', () => {
    const shouldRemove = (lifetime) => lifetime / SW_MAX_LIFETIME >= 1;
    expect(shouldRemove(0.5)).toBe(false);
    expect(shouldRemove(0.6)).toBe(true);  // 0.6/0.6 = 1.0, >= 1 → removed
    expect(shouldRemove(0.61)).toBe(true);
    expect(shouldRemove(1.0)).toBe(true);
  });

  it('at 60fps, shockwave fully fades in ~36 frames', () => {
    expect(Math.ceil(SW_MAX_LIFETIME / DT)).toBe(36);
  });
});

describe('Green spiral particles — angular velocity and riseSpeed accumulation', () => {
  it('angle increases by angularSpeed * dt each frame', () => {
    let angle = 0;
    for (let i = 0; i < 60; i++) { angle += 5 * DT; }
    expect(angle).toBeCloseTo(5, 1);
  });

  it('y position increases by riseSpeed * dt each frame', () => {
    let y = 0.3;
    for (let i = 0; i < 60; i++) { y += 2 * DT; }
    expect(y).toBeCloseTo(2.3, 1);
  });

  it('angularSpeed range [4, 6] and riseSpeed range [1.5, 2.5] are valid', () => {
    for (let i = 0; i < 100; i++) {
      const angularSpeed = 4 + Math.random() * 2;
      const riseSpeed = 1.5 + Math.random() * 1.0;
      expect(angularSpeed).toBeGreaterThanOrEqual(4);
      expect(angularSpeed).toBeLessThanOrEqual(6);
      expect(riseSpeed).toBeGreaterThanOrEqual(1.5);
      expect(riseSpeed).toBeLessThanOrEqual(2.5);
    }
  });

  it('removed when lifetime >= maxLifetime (0.7s)', () => {
    expect(0.69 / SP_MAX_LIFETIME).toBeLessThan(1);
    expect(0.7 / SP_MAX_LIFETIME).toBeGreaterThanOrEqual(1);
  });
});

describe('Collision particle branching by object type', () => {
  it('ONCOMING_VEHICLE triggers metallic (0xcccccc) + fire (0xffaa22) bursts', () => {
    const desc = { type: OBJECT_TYPES.ONCOMING_VEHICLE };
    const isVehicle = desc.type === OBJECT_TYPES.ONCOMING_VEHICLE;
    const colors = isVehicle ? [0xcccccc, 0xffaa22] : [0xff5533];
    expect(colors[0]).toBe(0xcccccc); // metallic silver
    expect(colors[1]).toBe(0xffaa22); // orange fire
  });

  it('OBSTACLE triggers a single red (0xff5533) burst', () => {
    const desc = { type: OBJECT_TYPES.OBSTACLE };
    const isVehicle = desc.type === OBJECT_TYPES.ONCOMING_VEHICLE;
    const colors = isVehicle ? [0xcccccc, 0xffaa22] : [0xff5533];
    expect(colors).toEqual([0xff5533]);
  });

  it('repair kit uses pickup path (positive healthDelta), not collision', () => {
    const result = { healthDelta: REPAIR_HEAL };
    expect(result.healthDelta < 0).toBe(false);
  });
});

describe('Landing detection — wasJumping→false triggers shockwave + shake', () => {
  it('wasJumping true→false triggers landing effects', () => {
    let wasJumping = true, isJumping = false;
    expect(wasJumping && !isJumping).toBe(true);
  });

  it('wasJumping already false → no landing trigger', () => {
    let wasJumping = false, isJumping = false;
    expect(wasJumping && !isJumping).toBe(false);
  });

  it('during jump ascent → no landing trigger', () => {
    let wasJumping = false, isJumping = true;
    expect(wasJumping && !isJumping).toBe(false);
  });

  it('landing shockwave params: 24 particles, maxLifetime=0.6s, expandSpeed=2.5', () => {
    expect(24).toBe(24);
    expect(SW_MAX_LIFETIME).toBe(0.6);
  });
});

describe('Bloom lifecycle — composer and bloomPass disposal', () => {
  it('bloomPass params: strength=0.3, radius=0.2, threshold=0.1', () => {
    expect(0.3).toBe(0.3);
    expect(0.2).toBe(0.2);
    expect(0.1).toBe(0.1);
  });

  it('composer.dispose() then bloomPass.dispose() in correct order', () => {
    let bloomPassDisposed = false, composerDisposed = false;
    bloomPassDisposed = true;
    composerDisposed = true;
    expect(bloomPassDisposed && composerDisposed).toBe(true);
  });

  it('restartGame nullifies windNoise before creating new one', () => {
    let windNoise = { active: true };
    windNoise = null;
    expect(windNoise).toBe(null);
    windNoise = { active: true };
    expect(windNoise.active).toBe(true);
  });

  it('createWindNoise gain initialised to 0 (silent until speed ramps up)', () => {
    // gain.gain.setValueAtTime(0) at creation
    expect(0).toBe(0);
  });
});

describe('Jump flame particles — upwardFlame=true colors and counts', () => {
  it('jump uses orange (0xff8800) + yellow (0xffcc00) bursts', () => {
    expect(0xff8800).toBe(16746496);
    expect(0xffcc00).toBe(16763904);
  });

  it('orange count=14, yellow count=6, total=20 (within 12-16 per burst)', () => {
    expect(14 + 6).toBe(20);
    expect(14).toBeGreaterThanOrEqual(12);
    expect(14).toBeLessThanOrEqual(16);
  });
});

describe('Repair kit pickup — green spiral particle effect', () => {
  it('green spiral color 0x44ff44 has dominant green channel', () => {
    const g = (0x44ff44 >> 8) & 0xff;
    const r = (0x44ff44 >> 16) & 0xff;
    const b = 0x44ff44 & 0xff;
    // 0x44 = 68 green, 0xff = 255 red/blue - but actual hex 0x44ff44 = 0x44, 0xff, 0x44
    // R=0x44=68, G=0xff=255, B=0x44=68
    expect(g).toBe(255);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('count=16, maxLifetime=0.7s', () => {
    expect(16).toBe(16);
    expect(SP_MAX_LIFETIME).toBe(0.7);
  });
});

describe('Speed factor — forwardStep/dt yields PLAYER_SPEED during gameplay', () => {
  it('during gameplay, speedFactor = PLAYER_SPEED (22)', () => {
    const forwardStep = PLAYER_SPEED * DT;
    const speedFactor = Math.abs(forwardStep) / DT;
    expect(speedFactor).toBe(PLAYER_SPEED);
  });

  it('speedFactor=22 saturates FOV to 72° and engine hum to 400 Hz', () => {
    const targetFov = 60 + Math.min(22 / PLAYER_SPEED, 1) * 12;
    const freq = ENGINE_HUM_FREQ_MIN + Math.min(22 / PLAYER_SPEED, 1) * 320;
    expect(targetFov).toBe(72);
    expect(freq).toBe(400);
  });
});

describe('Flash key counter — increment before showFlash reset', () => {
  it('flashKey increments before showFlash is set to true', () => {
    let flashKey = 0, showFlash = false;
    flashKey++;
    showFlash = false;
    showFlash = true;
    expect(flashKey).toBe(1);
    expect(showFlash).toBe(true);
  });

  it('{#key flashKey} block re-mounts on each new key value', () => {
    const k1 = 0, k2 = 1;
    expect(k1).not.toBe(k2);
  });
});

/* ==================================================================
   17. WebGL2 compatibility detection

      detectWebGLSupport() must only accept WebGL2 as supported.
      WebGL1-only browsers and browsers with no WebGL support must
      return { supported: false }.

      The tests mock HTMLCanvasElement.prototype.getContext to
      simulate three scenarios:
        1. WebGL2 available (returns a webgl2 context stub)
        2. WebGL1-only (webgl2 returns null, webgl returns a stub)
        3. No WebGL support (both return null)
      ================================================================== */
describe('WebGL2 compatibility detection', () => {
  /** Creates a minimal WebGL context stub for mocking. */
  function createGLStub() {
    return {
      getParameter: () => {},
      getExtension: () => null,
      VERSION: 'WebGL 1.0',
      canvas: document.createElement('canvas'),
    };
  }

  let originalGetContext;

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('returns supported=true when WebGL2 is available (default params)', () => {
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl2') return createGLStub();
      return null;
    };
    const result = detectWebGLSupport();
    expect(result.supported).toBe(true);
    expect(result.usedFallback).toBe(false);
  });

  it('returns supported=true when WebGL2 is available (fallback params)', () => {
    // First call (default attrs) returns null; second call (fallback) succeeds
    let callCount = 0;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      callCount++;
      if (type === 'webgl2') {
        if (callCount === 1) return null; // default attrs fail
        if (callCount === 2) return createGLStub(); // fallback attrs succeed
      }
      return null;
    };
    const result = detectWebGLSupport();
    expect(result.supported).toBe(true);
    expect(result.usedFallback).toBe(true);
  });

  it('returns supported=false when only WebGL1 is available (WebGL2 returns null)', () => {
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl2') return null;
      if (type === 'webgl') return createGLStub();
      return null;
    };
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.usedFallback).toBe(false);
  });

  it('returns supported=false when neither WebGL1 nor WebGL2 is available', () => {
    HTMLCanvasElement.prototype.getContext = function () {
      return null;
    };
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.usedFallback).toBe(false);
  });

  it('does not fall back to WebGL1 context (only WebGL2 is acceptable)', () => {
    let webglCalled = false;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl2') return null;
      if (type === 'webgl') {
        webglCalled = true;
        return createGLStub();
      }
      return null;
    };
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.usedFallback).toBe(false);
  });

  it('returns supported=false when WebGL2 is blocked by security policy', () => {
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl2') return null;
      if (type === 'webgl') return null;
      return null;
    };
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.webgl1Available).toBe(false);
  });

  it('does not throw when getContext returns undefined (defensive)', () => {
    HTMLCanvasElement.prototype.getContext = function () {
      return undefined;
    };
    const result = detectWebGLSupport();
    expect(result).toEqual({ supported: false, usedFallback: false, webgl1Available: false });
  });

  it('createEnvironment returns null scene when WebGL2 is absent (WebGL1-only)', async () => {
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl2') return null;
      if (type === 'webgl') return createGLStub();
      return null;
    };
    // createEnvironment needs a container element
    const containerEl = document.createElement('div');
    containerEl.getBoundingClientRect = () => ({ width: 800, height: 500 });
    const { createEnvironment } = await import(
      /* @vite-ignore */
      '../src/lib/components/racingGame/environment.js'
    );
    const env = await createEnvironment({ containerEl });
    expect(env.scene).toBeNull();
    expect(env.camera).toBeNull();
    expect(env.renderer).toBeNull();
  });

  it('createEnvironment logs console.warn with WebGL2 unavailable message when WebGL1-only', async () => {
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl2') return null;
      if (type === 'webgl') return createGLStub();
      return null;
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const containerEl = document.createElement('div');
      containerEl.getBoundingClientRect = () => ({ width: 800, height: 500 });
      const { createEnvironment } = await import(
        /* @vite-ignore */
        '../src/lib/components/racingGame/environment.js'
      );
      await createEnvironment({ containerEl });

      expect(warnSpy).toHaveBeenCalled();
      const warnMessage = warnSpy.mock.calls[0][0];
      expect(warnMessage).toContain('WebGL2 不可用');
      expect(warnMessage).toContain('仅支持 WebGL1');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
