/**
 * Racing Game — road module
 *
 * Pure functions for lane coordinate mapping, road segment generation,
 * and continuous noise-based road offset sampling.
 */

import { fbm1D } from '../noise.js';

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
