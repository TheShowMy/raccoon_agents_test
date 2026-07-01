import { describe, it, expect } from 'vitest';
import { noise1D, noise2D, fbm1D, fbm2D, setSeed } from '../src/lib/utils/noise.js';

/* ===================================================================
   Output range — all raw noise values should be within [-1, 1]
   =================================================================== */
describe('noise1D — output range', () => {
  it('returns values between -1 and 1', () => {
    for (let i = 0; i < 500; i++) {
      const v = noise1D(i * 0.1);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('returns values between -1 and 1 for fractional inputs', () => {
    for (let i = 0; i < 500; i++) {
      const v = noise1D(i * 0.317 + 0.573);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('never returns NaN or Infinity', () => {
    for (let i = -200; i <= 200; i++) {
      const v = noise1D(i * 0.07);
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('noise2D — output range', () => {
  it('returns values between -1 and 1', () => {
    for (let i = 0; i < 500; i++) {
      const v = noise2D(i * 0.1, i * 0.13);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('returns values between -1 and 1 for arbitrary coords', () => {
    for (let i = 0; i < 500; i++) {
      const v = noise2D(i * 0.271, i * 0.319 + 0.5);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('never returns NaN or Infinity', () => {
    for (let x = -100; x <= 100; x += 3) {
      for (let y = -100; y <= 100; y += 3) {
        const v = noise2D(x * 0.05, y * 0.05);
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

/* ===================================================================
   Determinism — same input always yields same output
   =================================================================== */
describe('determinism', () => {
  it('noise1D returns identical values for repeated calls', () => {
    const inputs = [0, 0.5, 1.0, 3.14159, -2.718, 42.0, -0.001, 999.999];
    const first = inputs.map((x) => noise1D(x));
    const second = inputs.map((x) => noise1D(x));
    expect(second).toEqual(first);
  });

  it('noise2D returns identical values for repeated calls', () => {
    const coords = [
      [0, 0],
      [0.5, 0.3],
      [1.0, 2.0],
      [3.14159, 2.71828],
      [-1.0, -1.0],
      [42.0, -0.001],
    ];
    const first = coords.map(([x, y]) => noise2D(x, y));
    const second = coords.map(([x, y]) => noise2D(x, y));
    expect(second).toEqual(first);
  });

  it('fbm1D returns identical values for repeated calls', () => {
    const x = 1.234;
    const a = fbm1D(x, 4);
    const b = fbm1D(x, 4);
    expect(b).toBe(a);
  });

  it('fbm2D returns identical values for repeated calls', () => {
    const v1 = fbm2D(0.5, 0.3, 4);
    const v2 = fbm2D(0.5, 0.3, 4);
    expect(v2).toBe(v1);
  });
});

/* ===================================================================
   setSeed changes output
   =================================================================== */
describe('setSeed', () => {
  it('produces different output after reseeding', () => {
    const seed1 = 42;
    const seed2 = 9999;

    // Capture output with default seed (42)
    const orig1 = noise1D(0.5);
    const orig2 = noise2D(0.5, 0.3);

    // Re-seed with same value — should match (deterministic)
    setSeed(42);
    expect(noise1D(0.5)).toBe(orig1);
    expect(noise2D(0.5, 0.3)).toBe(orig2);

    // Re-seed with different value — should differ
    setSeed(seed2);
    // Check at multiple points to avoid accidental collision
    let differ1D = false;
    let differ2D = false;
    for (let i = 0; i < 10; i++) {
      if (noise1D(i * 0.1) !== orig1) differ1D = true;
      if (noise2D(i * 0.1, i * 0.1) !== orig2) differ2D = true;
    }
    expect(differ1D).toBe(true);
    expect(differ2D).toBe(true);

    // Restore default seed for subsequent tests
    setSeed(42);
  });
});

/* ===================================================================
   Smooth continuity — adjacent inputs produce similar outputs
   =================================================================== */
describe('smooth continuity', () => {
  it('noise1D changes smoothly with small input deltas', () => {
    const step = 0.001;
    let maxDelta = 0;
    for (let x = 0; x < 2; x += step) {
      const v1 = noise1D(x);
      const v2 = noise1D(x + step);
      maxDelta = Math.max(maxDelta, Math.abs(v2 - v1));
    }
    // With step = 0.001, the max delta should be much less than 1
    // (Perlin noise is C² continuous — maximum slope is sqrt(2)/2 ≈ 0.707,
    // so for 0.001 step, max ~0.0007.  Allow 0.05 as a generous bound.)
    expect(maxDelta).toBeLessThan(0.05);
  });

  it('noise2D changes smoothly with small input deltas', () => {
    const step = 0.001;
    let maxDelta = 0;
    for (let t = 0; t < 2; t += step) {
      const v1 = noise2D(t, t);
      const v2 = noise2D(t + step, t + step);
      maxDelta = Math.max(maxDelta, Math.abs(v2 - v1));
    }
    expect(maxDelta).toBeLessThan(0.05);
  });

  it('noise1D at integer boundaries has no discontinuity', () => {
    // Perlin noise is C¹ continuous at integer boundaries, so adjacent
    // values across an integer boundary should not jump.
    const eps = 1e-7;
    for (let n = -5; n < 5; n++) {
      const left = noise1D(n - eps);
      const right = noise1D(n + eps);
      const gap = Math.abs(right - left);
      // Should be very small because noise is continuous
      expect(gap).toBeLessThan(0.01);
    }
  });
});

/* ===================================================================
   Zero at integer lattice points (Perlin noise zero‑crossing)
   =================================================================== */
describe('integer lattice points', () => {
  it('noise2D is near zero at integer coords', () => {
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        // Perlin noise evaluates to 0 at lattice points with
        // the standard gradient selection
        expect(Math.abs(noise2D(x, y))).toBeLessThan(1e-10);
      }
    }
  });

  it('noise1D is near zero at integer coords', () => {
    for (let n = -10; n <= 10; n++) {
      expect(Math.abs(noise1D(n))).toBeLessThan(1e-10);
    }
  });
});

/* ===================================================================
   fBm — range and structure
   =================================================================== */
describe('fbm1D', () => {
  it('returns values within [-1, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm1D(i * 0.1, 4);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    const v1 = fbm1D(0.5, 4);
    const v2 = fbm1D(0.5, 4);
    expect(v2).toBe(v1);
  });

  it('works with 1 octave (equivalent to raw noise)', () => {
    const raw = noise1D(1.23);
    const f = fbm1D(1.23, 1);
    expect(f).toBeCloseTo(raw, 10);
  });

  it('is smooth across inputs', () => {
    const step = 0.001;
    let maxDelta = 0;
    for (let x = 0; x < 1; x += step) {
      const d = Math.abs(fbm1D(x, 4) - fbm1D(x + step, 4));
      maxDelta = Math.max(maxDelta, d);
    }
    expect(maxDelta).toBeLessThan(0.1);
  });

  it('never returns NaN or Infinity', () => {
    for (let i = 0; i < 200; i++) {
      expect(Number.isFinite(fbm1D(i * 0.07, 4))).toBe(true);
    }
  });
});

describe('fbm2D', () => {
  it('returns values within [-1, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm2D(i * 0.1, i * 0.13, 4);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    const v1 = fbm2D(0.5, 0.3, 4);
    const v2 = fbm2D(0.5, 0.3, 4);
    expect(v2).toBe(v1);
  });

  it('works with 1 octave (equivalent to raw noise)', () => {
    const raw = noise2D(1.23, 4.56);
    const f = fbm2D(1.23, 4.56, 1);
    expect(f).toBeCloseTo(raw, 10);
  });

  it('never returns NaN or Infinity', () => {
    for (let i = 0; i < 200; i++) {
      expect(Number.isFinite(fbm2D(i * 0.05, i * 0.07, 4))).toBe(true);
    }
  });
});

/* ===================================================================
   NaN / Infinity input guards
   =================================================================== */
describe('NaN / Infinity input guards', () => {
  it('noise1D returns 0 for NaN', () => {
    expect(noise1D(NaN)).toBe(0);
  });

  it('noise1D returns 0 for Infinity', () => {
    expect(noise1D(Infinity)).toBe(0);
    expect(noise1D(-Infinity)).toBe(0);
  });

  it('noise2D returns 0 for NaN in any argument', () => {
    expect(noise2D(NaN, 0)).toBe(0);
    expect(noise2D(0, NaN)).toBe(0);
    expect(noise2D(NaN, NaN)).toBe(0);
  });

  it('noise2D returns 0 for Infinity in any argument', () => {
    expect(noise2D(Infinity, 0)).toBe(0);
    expect(noise2D(0, Infinity)).toBe(0);
    expect(noise2D(-Infinity, 0)).toBe(0);
    expect(noise2D(0, -Infinity)).toBe(0);
  });

  it('fbm1D returns 0 for NaN input', () => {
    expect(fbm1D(NaN, 4)).toBe(0);
  });

  it('fbm2D returns 0 for NaN input', () => {
    expect(fbm2D(NaN, 0, 4)).toBe(0);
    expect(fbm2D(0, NaN, 4)).toBe(0);
  });
});

/* ===================================================================
   fBm negative gain — output must stay in [-1, 1]
   =================================================================== */
describe('fbm1D — negative gain', () => {
  it('output stays within [-1, 1] when gain < 0', () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm1D(i * 0.07, 4, 2.0, -0.5);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic with negative gain', () => {
    const v1 = fbm1D(0.5, 4, 2.0, -0.5);
    const v2 = fbm1D(0.5, 4, 2.0, -0.5);
    expect(v2).toBe(v1);
  });
});

describe('fbm2D — negative gain', () => {
  it('output stays within [-1, 1] when gain < 0', () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm2D(i * 0.07, i * 0.09, 4, 2.0, -0.5);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic with negative gain', () => {
    const v1 = fbm2D(0.5, 0.3, 4, 2.0, -0.5);
    const v2 = fbm2D(0.5, 0.3, 4, 2.0, -0.5);
    expect(v2).toBe(v1);
  });
});

/* ===================================================================
   fBm large octaves — verifies cap and performance safety
   =================================================================== */
describe('fbm1D — large octaves', () => {
  it('returns within [-1, 1] for very large octaves (capped internally)', () => {
    const v = fbm1D(0.5, 1e7);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('completes quickly for large octaves (capped to 12)', () => {
    // This should not block — if it's not capped, 1e7 iterations would take forever
    const start = performance.now();
    fbm1D(0.5, 1e7);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500); // 500ms generous upper bound
  });
});

describe('fbm2D — large octaves', () => {
  it('returns within [-1, 1] for very large octaves (capped internally)', () => {
    const v = fbm2D(0.5, 0.3, 1e7);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('completes quickly for large octaves (capped to 12)', () => {
    const start = performance.now();
    fbm2D(0.5, 0.3, 1e7);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

/* ===================================================================
   fBm — octaves = 0 guard
   =================================================================== */
describe('fbm1D — octaves = 0', () => {
  it('returns 0 when octaves is 0', () => {
    expect(fbm1D(0.5, 0)).toBe(0);
  });

  it('returns 0 when octaves is negative', () => {
    expect(fbm1D(0.5, -1)).toBe(0);
    expect(fbm1D(0.5, -100)).toBe(0);
  });
});

describe('fbm2D — octaves = 0', () => {
  it('returns 0 when octaves is 0', () => {
    expect(fbm2D(0.5, 0.3, 0)).toBe(0);
  });

  it('returns 0 when octaves is negative', () => {
    expect(fbm2D(0.5, 0.3, -1)).toBe(0);
    expect(fbm2D(0.5, 0.3, -100)).toBe(0);
  });
});

/* ===================================================================
   Edge cases (existing)
   =================================================================== */
describe('edge cases', () => {
  it('noise1D handles negative values', () => {
    for (let i = 0; i < 100; i++) {
      const v = noise1D(-i * 0.3);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('noise2D handles negative values', () => {
    for (let i = 0; i < 100; i++) {
      const v = noise2D(-i * 0.3, -i * 0.5);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('noise1D handles very large magnitude inputs', () => {
    const large = 1e6;
    const v = noise1D(large);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('noise2D handles very large magnitude inputs', () => {
    const large = 1e6;
    const v = noise2D(large, large + 0.5);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });
});
