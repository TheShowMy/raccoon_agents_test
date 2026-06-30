import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ===================================================================
   Helper mocks for Three.js / Web Audio / DOM
   =================================================================== */

beforeEach(() => {
  vi.stubGlobal('window', {
    devicePixelRatio: 2,
    AudioContext: vi.fn(() => ({
      currentTime: 0,
      destination: 'mock-dest',
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(() => ({
          gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        })),
        start: vi.fn(),
        stop: vi.fn(),
        context: { currentTime: 0 },
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      close: vi.fn(),
    })),
    webkitAudioContext: undefined,
    cancelAnimationFrame: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Import only the integration-level paths used by RacingGameScene
import {
  MAX_HEALTH,
  OBSTACLE_DAMAGE,
  VEHICLE_DAMAGE,
  REPAIR_HEAL,
  checkCollision,
  applyCollision,
  calculateScore,
  ROAD_Y,
  JUMP_IMMUNITY_HEIGHT,
  OBJECT_TYPES,
} from '../src/lib/utils/racingGame.js';

/* ===================================================================
   Integration: Collision detection — component's game loop reuses
   checkCollision + applyCollision with the same coordinate model.
   Focus on combined / contrast scenarios not tested individually
   in racingGame.test.js.
   =================================================================== */

describe('Collision integration (component game loop patterns)', () => {
  it('obstacle hit on ground: -1 HP; obstacle jumped above threshold: no hit', () => {
    const obstacle = { type: OBJECT_TYPES.OBSTACLE, active: true, lane: 0, z: 0, zWidth: 1, height: 0.8 };

    // On ground → collision
    expect(checkCollision({ lane: 0, z: 0, y: 0 }, obstacle)).toBe(true);

    // Jumping above immunity height → no collision
    expect(checkCollision({ lane: 0, z: 0, y: JUMP_IMMUNITY_HEIGHT + 0.1 }, obstacle)).toBe(false);

    // Apply damage when on ground
    const result = applyCollision(MAX_HEALTH, obstacle);
    expect(result.healthDelta).toBe(-OBSTACLE_DAMAGE);
    expect(result.health).toBe(MAX_HEALTH - 1);
  });

  it('oncoming vehicle always collides regardless of jump height — contrast with obstacle', () => {
    const vehicle = { type: OBJECT_TYPES.ONCOMING_VEHICLE, active: true, lane: 0, z: 0, zWidth: 1, height: 2.0 };

    // Jumping high → vehicle still collides (obstacles would not)
    expect(checkCollision({ lane: 0, z: 0, y: 5.0 }, vehicle)).toBe(true);

    // Apply damage
    const result = applyCollision(MAX_HEALTH, vehicle);
    expect(result.healthDelta).toBe(-VEHICLE_DAMAGE);
    expect(result.health).toBe(MAX_HEALTH - 2);
  });

  it('repair kit heals but never exceeds MAX_HEALTH', () => {
    // Heal from below max
    const fromBelow = applyCollision(3, { type: OBJECT_TYPES.REPAIR_KIT });
    expect(fromBelow.healthDelta).toBe(REPAIR_HEAL);
    expect(fromBelow.health).toBe(4);

    // Heal at max → capped
    const atMax = applyCollision(MAX_HEALTH, { type: OBJECT_TYPES.REPAIR_KIT });
    expect(atMax.healthDelta).toBe(0);
    expect(atMax.health).toBe(MAX_HEALTH);
  });

  it('multi-step damage accumulation leads to game over (playing → gameover simulation)', () => {
    let health = MAX_HEALTH; // 5

    // 3 obstacle hits: 5 → 4 → 3 → 2
    for (let i = 0; i < 3; i++) {
      health = applyCollision(health, { type: OBJECT_TYPES.OBSTACLE }).health;
    }
    expect(health).toBe(2);

    // 1 vehicle hit: 2 → 0 (game over)
    health = applyCollision(health, { type: OBJECT_TYPES.ONCOMING_VEHICLE }).health;
    expect(health).toBe(0);
  });

  it('partial damage + repair kit mid-game recovery', () => {
    let health = MAX_HEALTH;
    health = applyCollision(health, { type: OBJECT_TYPES.OBSTACLE }).health; // 5→4
    health = applyCollision(health, { type: OBJECT_TYPES.OBSTACLE }).health; // 4→3
    health = applyCollision(health, { type: OBJECT_TYPES.REPAIR_KIT }).health; // 3→4
    expect(health).toBe(4);
  });
});

/* ===================================================================
   Integration: Score calculation (component calls calculateScore)
   =================================================================== */

describe('Score calculation (used by component)', () => {
  it('score increases proportionally with distance', () => {
    expect(calculateScore(0)).toBe(0);
    expect(calculateScore(100)).toBe(100);
    expect(calculateScore(500)).toBe(500);
  });

  it('score floors fractional distance', () => {
    expect(calculateScore(99.7)).toBe(99);
  });

  it('negative distance (forward Z travel) yields positive score', () => {
    expect(calculateScore(-150)).toBe(150);
  });
});

/* ===================================================================
   Integration: ROAD_Y consistency (shared constant)
   =================================================================== */

describe('ROAD_Y consistency', () => {
  it('racingGame.js exports ROAD_Y = 0', () => {
    expect(ROAD_Y).toBe(0);
  });
});


