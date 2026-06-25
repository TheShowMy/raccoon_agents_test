import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncRendererSize } from '../src/lib/utils/airplaneGame.js';

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
