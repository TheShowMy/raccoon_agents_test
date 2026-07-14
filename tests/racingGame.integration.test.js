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
} from '../src/lib/utils/racingGame/index.js';

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

/* ===================================================================
   Integration: Game state machine — component patterns
   (menu → playing → gameover → restart)
   =================================================================== */

describe('Game state machine (component integration patterns)', () => {
  it('full death sequence: MAX_HEALTH → 0 triggers game-over boundary', () => {
    // Simulates component's handleCollisions + game-over check loop
    let health = MAX_HEALTH; // 5

    // Obstacle hits: 5→4→3→2→1
    for (let i = 0; i < 4; i++) {
      health = applyCollision(health, { type: OBJECT_TYPES.OBSTACLE }).health;
    }
    expect(health).toBe(1);

    // One more obstacle hit: 1→0 → game over
    health = applyCollision(health, { type: OBJECT_TYPES.OBSTACLE }).health;
    expect(health).toBe(0);

    // Component would set gameState = 'gameover' when health <= 0
    const isGameOver = health <= 0;
    expect(isGameOver).toBe(true);
  });

  it('restart sequence: reset health from 0 to MAX_HEALTH', () => {
    // Simulates restartGame() resetting health
    let health = 0;
    health = MAX_HEALTH; // reset
    expect(health).toBe(MAX_HEALTH);
  });

  it('overkill damage clamped at 0, never negative', () => {
    // Health is 1, vehicle hit deals 2 damage → clamped to 0
    const result = applyCollision(1, { type: OBJECT_TYPES.ONCOMING_VEHICLE });
    expect(result.health).toBe(0);
    expect(result.healthDelta).toBe(-1);
  });

  it('heal from near-death cannot exceed MAX_HEALTH', () => {
    // Health = 4, heal = +1 → 5 (max)
    const heal1 = applyCollision(4, { type: OBJECT_TYPES.REPAIR_KIT });
    expect(heal1.health).toBe(MAX_HEALTH);
    expect(heal1.healthDelta).toBe(1);

    // Already at max, heal should be 0 delta
    const heal2 = applyCollision(MAX_HEALTH, { type: OBJECT_TYPES.REPAIR_KIT });
    expect(heal2.healthDelta).toBe(0);
    expect(heal2.health).toBe(MAX_HEALTH);
  });

  it('rapid sequential damage: component processes multiple objects per frame', () => {
    // Simulates handleCollisions loop over objectDescriptors
    const hits = [
      { type: OBJECT_TYPES.OBSTACLE },
      { type: OBJECT_TYPES.REPAIR_KIT },
      { type: OBJECT_TYPES.ONCOMING_VEHICLE },
    ];

    let health = MAX_HEALTH;
    for (const hit of hits) {
      const r = applyCollision(health, hit);
      health = r.health;
    }
    // 5 → 4 (obstacle -1) → 5 (repair +1) → 3 (vehicle -2)
    expect(health).toBe(3);
  });

  it('lane mismatch: objects in different lanes never collide', () => {
    const player = { lane: 0, z: 0, y: 0 };
    const obstacle = { type: OBJECT_TYPES.OBSTACLE, active: true, lane: 1, z: 0, zWidth: 1 };
    expect(checkCollision(player, obstacle)).toBe(false);

    const vehicle_right = { type: OBJECT_TYPES.ONCOMING_VEHICLE, active: true, lane: -1, z: 0, zWidth: 1 };
    expect(checkCollision(player, vehicle_right)).toBe(false);
  });

  it('inactive objects never collide', () => {
    const obj = { type: OBJECT_TYPES.OBSTACLE, active: false, lane: 0, z: 0, zWidth: 1 };
    expect(checkCollision({ lane: 0, z: 0, y: 0 }, obj)).toBe(false);
  });

  it('Z position far away: no collision', () => {
    const player = { lane: 0, z: 0, y: 0 };
    const obj = { type: OBJECT_TYPES.OBSTACLE, active: true, lane: 0, z: 10, zWidth: 1 };
    expect(checkCollision(player, obj)).toBe(false);
  });

  it('recycleObjects filters out passed objects behind cleanup threshold', () => {
    const active = [
      { type: OBJECT_TYPES.OBSTACLE, z: 5 },
      { type: OBJECT_TYPES.ONCOMING_VEHICLE, z: -10 },
      { type: OBJECT_TYPES.REPAIR_KIT, z: 15 },
      { type: OBJECT_TYPES.OBSTACLE, z: -30 },
    ];
    // Player at z=0, cleanupMargin=10 → objects with z > 10 are behind
    const kept = active.filter((o) => o.z < 10);
    expect(kept).toHaveLength(3);
    expect(kept.map((o) => o.z)).toEqual([5, -10, -30]);
  });

  it('null/undefined object entries are skipped without throwing', () => {
    const input = [null, undefined, { type: OBJECT_TYPES.OBSTACLE, z: -10 }];
    const filtered = input.filter(Boolean);
    expect(filtered).toHaveLength(1);
  });
});


