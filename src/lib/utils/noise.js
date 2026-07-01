/**
 * Perlin noise — self-contained 1D/2D implementation.
 *
 * No third-party runtime dependencies.  Uses a seeded permutation table for
 * reproducibility.
 *
 * Provides:
 *   - noise1D(x)             → [-1, 1]
 *   - noise2D(x, y)          → [-1, 1]
 *   - fbm1D(x, octaves)      → [-1, 1]  (fractal Brownian motion)
 *   - fbm2D(x, y, octaves)   → [-1, 1]
 *   - setSeed(seed)          → re‑initialise the permutation table
 */

/* ─── Permutation table ─────────────────────────────────────────── */

const TABLE_SIZE = 256;

/**
 * Generate a permutation table from a numeric seed using a simple LCG.
 *
 * @param {number} seed
 * @returns {Uint8Array} Length‑TABLE_SIZE permutation of [0, 255].
 */
function makePerm(seed) {
  const state = { s: seed | 0 };
  // LCG constants (Numerical Recipes)
  const lcg = () => {
    state.s = (state.s * 1664525 + 1013904223) | 0;
    return (state.s >>> 0) & 0xffffffff;
  };

  const arr = new Uint8Array(TABLE_SIZE);
  const values = new Uint8Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) values[i] = i;

  // Fisher‑Yates shuffle using LCG
  for (let i = TABLE_SIZE - 1; i > 0; i--) {
    const j = lcg() % (i + 1);
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }

  for (let i = 0; i < TABLE_SIZE; i++) arr[i] = values[i];
  return arr;
}

/** Shared permutation table (initialised with a default seed). */
let perm = makePerm(42);

/**
 * Set a new seed for the permutation table.
 *
 * Calling this function re‑initialises the internal gradient table, so all
 * subsequent noise calls will produce different results.
 *
 * @param {number} seed - Integer seed.
 */
export function setSeed(seed) {
  perm = makePerm(seed);
}

/* ─── Gradient tables ────────────────────────────────────────────── */

/**
 * 1‑D gradient: returns either +1 or -1 based on hash.
 *
 * @param {number} hash - Integer in [0, 255].
 * @returns {number} 1 or -1.
 */
function grad1D(hash) {
  return (hash & 1) === 0 ? 1 : -1;
}

/**
 * 2‑D gradient directions (8 evenly‑spaced unit vectors).
 *
 * @param {number} hash - Integer in [0, 255].
 * @param {number} x
 * @param {number} y
 * @returns {number} Dot product of (x, y) with the selected gradient.
 */
function grad2D(hash, x, y) {
  // Use the lower 3 bits to pick one of 8 directions
  switch (hash & 7) {
    case 0: return  x + y;   // ( 1,  1)
    case 1: return -x + y;   // (-1,  1)
    case 2: return  x - y;   // ( 1, -1)
    case 3: return -x - y;   // (-1, -1)
    case 4: return  x;       // ( 1,  0)
    case 5: return -x;       // (-1,  0)
    case 6: return  y;       // ( 0,  1)
    case 7: return -y;       // ( 0, -1)
    default: return 0;       // unreachable
  }
}

/* ─── Fade & lerp helpers ────────────────────────────────────────── */

/**
 * Ken Perlin's fade curve: 6t⁵ − 15t⁴ + 10t³.
 *
 * @param {number} t
 * @returns {number}
 */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation.
 *
 * @param {number} t - Interpolation parameter.
 * @param {number} a - Value at t = 0.
 * @param {number} b - Value at t = 1.
 * @returns {number}
 */
function lerp(t, a, b) {
  return a + t * (b - a);
}

/* ─── Public noise functions ─────────────────────────────────────── */

/**
 * 1‑D Perlin noise at coordinate x.
 *
 * @param {number} x
 * @returns {number} Value in [-1, 1].
 */
export function noise1D(x) {
  if (!Number.isFinite(x)) return 0;
  const X = Math.floor(x) & (TABLE_SIZE - 1);
  const xf = x - Math.floor(x);
  const u = fade(xf);

  const a = perm[X];
  const b = perm[(X + 1) & (TABLE_SIZE - 1)];

  const g1 = grad1D(a);
  const g2 = grad1D(b);

  const n0 = g1 * xf;
  const n1 = g2 * (xf - 1);

  return lerp(u, n0, n1);
}

/**
 * 2‑D Perlin noise at coordinates (x, y).
 *
 * @param {number} x
 * @param {number} y
 * @returns {number} Value in [-1, 1].
 */
export function noise2D(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const X = Math.floor(x) & (TABLE_SIZE - 1);
  const Y = Math.floor(y) & (TABLE_SIZE - 1);

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[(perm[X] + Y) & (TABLE_SIZE - 1)];
  const ab = perm[(perm[X] + Y + 1) & (TABLE_SIZE - 1)];
  const ba = perm[(perm[X + 1] + Y) & (TABLE_SIZE - 1)];
  const bb = perm[(perm[X + 1] + Y + 1) & (TABLE_SIZE - 1)];

  const n00 = grad2D(aa, xf, yf);
  const n10 = grad2D(ba, xf - 1, yf);
  const n01 = grad2D(ab, xf, yf - 1);
  const n11 = grad2D(bb, xf - 1, yf - 1);

  const nx0 = lerp(u, n00, n10);
  const nx1 = lerp(u, n01, n11);

  return lerp(v, nx0, nx1);
}

/* ─── Fractal Brownian Motion (fBm) ──────────────────────────────── */

/**
 * 1‑D fractal Brownian motion.
 *
 * Combines multiple octaves of noise1D with decreasing amplitude and
 * increasing frequency.
 *
 * @param {number} x
 * @param {number} [octaves=4] - Number of octaves (>= 1).
 * @param {number} [lacunarity=2.0] - Frequency multiplier per octave.
 * @param {number} [gain=0.5] - Amplitude multiplier per octave.
 * @returns {number} Value in approximately [-1, 1] (may clip slightly with
 *   many octaves and gain < 0.5; using gain = 0.5 and octaves = 4 keeps
 *   the output well within [-1, 1]).
 */
export function fbm1D(x, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  if (octaves < 1) return 0;
  octaves = Math.min(octaves, 12);
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise1D(x * frequency);
    maxAmplitude += Math.abs(amplitude);
    amplitude *= gain;
    frequency *= lacunarity;
  }

  // Normalise to [-1, 1]
  return value / maxAmplitude;
}

/**
 * 2‑D fractal Brownian motion.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} [octaves=4]
 * @param {number} [lacunarity=2.0]
 * @param {number} [gain=0.5]
 * @returns {number} Value in approximately [-1, 1].
 */
export function fbm2D(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  if (octaves < 1) return 0;
  octaves = Math.min(octaves, 12);
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency);
    maxAmplitude += Math.abs(amplitude);
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxAmplitude;
}
