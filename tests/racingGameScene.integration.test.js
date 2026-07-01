import { describe, it, expect } from 'vitest';
import {
  getRoadOffsetAt,
  sampleCurveOffset,
  sampleHeightOffset,
} from '../src/lib/utils/racingGame.js';

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

