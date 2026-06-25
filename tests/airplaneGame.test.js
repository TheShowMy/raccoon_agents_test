import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncRendererSize, mapMouseToPlayArea } from '../src/lib/utils/airplaneGame.js';

// Vitest runs in Node by default; provide a minimal window mock so
// the implementation can read devicePixelRatio.
beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 2 });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/* ===================================================================
   syncRendererSize — null / edge-case guards
   =================================================================== */
describe('syncRendererSize — guards', () => {
  it('does nothing when container is null', () => {
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(null, camera, renderer);
    expect(camera.updateProjectionMatrix).not.toHaveBeenCalled();
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
  });

  it('does nothing when camera is null', () => {
    const container = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, null, renderer);
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
  });

  it('does nothing when renderer is null', () => {
    const container = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    syncRendererSize(container, camera, null);
    expect(camera.updateProjectionMatrix).not.toHaveBeenCalled();
  });

  it('does nothing when all arguments are null', () => {
    syncRendererSize(null, null, null);
    // No error should be thrown
  });
});

/* ===================================================================
   syncRendererSize — dimension mapping
   =================================================================== */
describe('syncRendererSize — dimension mapping', () => {
  it('updates camera.aspect from container width/height ratio', () => {
    const container = { getBoundingClientRect: () => ({ width: 1024, height: 768 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(camera.aspect).toBeCloseTo(1024 / 768);
  });

  it('calls camera.updateProjectionMatrix once', () => {
    const container = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
  });

  it('calls renderer.setSize with container width and height', () => {
    const container = { getBoundingClientRect: () => ({ width: 640, height: 480 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(renderer.setSize).toHaveBeenCalledWith(640, 480);
  });

  it('calls renderer.setPixelRatio with capped devicePixelRatio', () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 });

    const container = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2); // capped at 2
  });

  it('uses devicePixelRatio as-is when below cap of 2', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1.25 });

    const container = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.25);
  });

  it('calls setPixelRatio before setSize', () => {
    const container = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const callOrder = [];
    const renderer = {
      setSize: vi.fn(() => callOrder.push('setSize')),
      setPixelRatio: vi.fn(() => callOrder.push('setPixelRatio')),
    };
    syncRendererSize(container, camera, renderer);
    expect(callOrder).toEqual(['setPixelRatio', 'setSize']);
  });
});

/* ===================================================================
   syncRendererSize — zero / degenerate dimensions
   =================================================================== */
describe('syncRendererSize — degenerate dimensions', () => {
  it('clamps zero width to 1 to avoid zero aspect and zero canvas', () => {
    const container = { getBoundingClientRect: () => ({ width: 0, height: 600 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(camera.aspect).toBeCloseTo(1 / 600);
    expect(renderer.setSize).toHaveBeenCalledWith(1, 600);
  });

  it('clamps zero height to 1 to avoid zero aspect and zero canvas', () => {
    const container = { getBoundingClientRect: () => ({ width: 800, height: 0 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(camera.aspect).toBeCloseTo(800 / 1);
    expect(renderer.setSize).toHaveBeenCalledWith(800, 1);
  });

  it('clamps both zero dimensions to 1', () => {
    const container = { getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(camera.aspect).toBeCloseTo(1);
    expect(renderer.setSize).toHaveBeenCalledWith(1, 1);
  });
});

/* ===================================================================
   syncRendererSize — negative dimensions
   =================================================================== */
describe('syncRendererSize — negative dimensions', () => {
  it('clamps negative width to 1', () => {
    const container = { getBoundingClientRect: () => ({ width: -50, height: 400 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(camera.aspect).toBeCloseTo(1 / 400);
    expect(renderer.setSize).toHaveBeenCalledWith(1, 400);
  });

  it('clamps negative height to 1', () => {
    const container = { getBoundingClientRect: () => ({ width: 1024, height: -30 }) };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    syncRendererSize(container, camera, renderer);
    expect(camera.aspect).toBeCloseTo(1024 / 1);
    expect(renderer.setSize).toHaveBeenCalledWith(1024, 1);
  });
});

/* ===================================================================
   mapMouseToPlayArea — degenerate rect guards
   =================================================================== */
describe('mapMouseToPlayArea — degenerate rect guards', () => {
  it('returns origin when rect is null', () => {
    const result = mapMouseToPlayArea(100, 200, null, 50, 12);
    expect(result).toEqual({ x: 0, z: 0 });
  });

  it('returns origin when rect is undefined', () => {
    const result = mapMouseToPlayArea(100, 200, undefined, 50, 12);
    expect(result).toEqual({ x: 0, z: 0 });
  });

  it('returns origin when rect.width is zero', () => {
    const rect = { left: 0, top: 0, width: 0, height: 600 };
    const result = mapMouseToPlayArea(400, 300, rect, 50, 12);
    expect(result).toEqual({ x: 0, z: 0 });
  });

  it('returns origin when rect.height is zero', () => {
    const rect = { left: 0, top: 0, width: 800, height: 0 };
    const result = mapMouseToPlayArea(400, 300, rect, 50, 12);
    expect(result).toEqual({ x: 0, z: 0 });
  });

  it('returns origin when rect.width is negative', () => {
    const rect = { left: 0, top: 0, width: -10, height: 600 };
    const result = mapMouseToPlayArea(400, 300, rect, 50, 12);
    expect(result).toEqual({ x: 0, z: 0 });
  });

  it('returns origin when rect.height is negative', () => {
    const rect = { left: 0, top: 0, width: 800, height: -20 };
    const result = mapMouseToPlayArea(400, 300, rect, 50, 12);
    expect(result).toEqual({ x: 0, z: 0 });
  });
});

/* ===================================================================
   mapMouseToPlayArea — normalized mapping
   =================================================================== */
describe('mapMouseToPlayArea — normalized mapping', () => {
  const rect = { left: 10, top: 20, width: 800, height: 600 };
  const playAreaWidth = 50;
  const zRange = 12;

  it('maps center of container to origin', () => {
    const result = mapMouseToPlayArea(410, 320, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it('maps top-left corner to (-halfW, +halfZ)', () => {
    const result = mapMouseToPlayArea(10, 20, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(-25);
    expect(result.z).toBeCloseTo(6);
  });

  it('maps bottom-right corner to (+halfW, -halfZ)', () => {
    const result = mapMouseToPlayArea(810, 620, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(25);
    expect(result.z).toBeCloseTo(-6);
  });

  it('maps center-right edge to (+halfW, 0)', () => {
    const result = mapMouseToPlayArea(810, 320, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(25);
    expect(result.z).toBeCloseTo(0);
  });

  it('maps center-top edge to (0, +halfZ)', () => {
    const result = mapMouseToPlayArea(410, 20, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(6);
  });

  it('maps x increasing when mouse moves right within container', () => {
    const left = mapMouseToPlayArea(210, 320, rect, playAreaWidth, zRange);
    const right = mapMouseToPlayArea(610, 320, rect, playAreaWidth, zRange);
    expect(right.x).toBeGreaterThan(left.x);
  });

  it('maps z decreasing when mouse moves down within container (Y inversion)', () => {
    const top = mapMouseToPlayArea(410, 120, rect, playAreaWidth, zRange);
    const bottom = mapMouseToPlayArea(410, 520, rect, playAreaWidth, zRange);
    expect(bottom.z).toBeLessThan(top.z);
  });
});

/* ===================================================================
   mapMouseToPlayArea — boundary clamping
   =================================================================== */
describe('mapMouseToPlayArea — boundary clamping', () => {
  const rect = { left: 10, top: 20, width: 800, height: 600 };
  const playAreaWidth = 50;
  const zRange = 12;

  it('clamps x to -halfW when mouse is far left of container', () => {
    const result = mapMouseToPlayArea(0, 320, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(-25);
  });

  it('clamps x to +halfW when mouse is far right of container', () => {
    const result = mapMouseToPlayArea(900, 320, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(25);
  });

  it('clamps z to +halfZ when mouse is far above container', () => {
    const result = mapMouseToPlayArea(410, 0, rect, playAreaWidth, zRange);
    expect(result.z).toBeCloseTo(6);
  });

  it('clamps z to -halfZ when mouse is far below container', () => {
    const result = mapMouseToPlayArea(410, 700, rect, playAreaWidth, zRange);
    expect(result.z).toBeCloseTo(-6);
  });

  it('clamps both x and z when mouse is far outside top-left', () => {
    const result = mapMouseToPlayArea(0, 0, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(-25);
    expect(result.z).toBeCloseTo(6);
  });

  it('clamps both x and z when mouse is far outside bottom-right', () => {
    const result = mapMouseToPlayArea(900, 700, rect, playAreaWidth, zRange);
    expect(result.x).toBeCloseTo(25);
    expect(result.z).toBeCloseTo(-6);
  });
});

/* ===================================================================
   mapMouseToPlayArea — custom playAreaWidth / zRange
   =================================================================== */
describe('mapMouseToPlayArea — custom dimensions', () => {
  it('respects a different playAreaWidth', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    const result = mapMouseToPlayArea(0, 50, rect, 100, 12);
    expect(result.x).toBeCloseTo(-50);
  });

  it('respects a different zRange', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    const result = mapMouseToPlayArea(50, 0, rect, 50, 20);
    expect(result.z).toBeCloseTo(10);
  });

  it('uses zRange=0 -> both halves are 0, output always 0', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    const result = mapMouseToPlayArea(50, 0, rect, 50, 0);
    expect(result.z).toBeCloseTo(0);
  });
});

