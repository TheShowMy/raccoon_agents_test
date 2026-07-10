/**
 * Racing Game — barrel module
 *
 * Re-exports all symbols from the sub-modules:
 *   road.js       — lane constants, road segment generation, noise-based offset sampling
 *   objects.js    — road objects, collision detection, scoring, recycling
 *   audio.js      — Web Audio API sound synthesis
 *   difficulty.js — dynamic difficulty computation
 */

export * from './road.js';
export * from './objects.js';
export * from './audio.js';
export * from './difficulty.js';
