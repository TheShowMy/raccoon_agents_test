/**
 * Racing Game — Game Loop Module
 *
 * Encapsulates the RAF animation loop, start/restart/game-over transitions,
 * and the per-frame update tick. Module initialization (environment setup,
 * road, decorations, vehicle, effects) is owned by the scene component;
 * gameLoop only orchestrates the loop and the game state machine.
 *
 * The scene component wires all module APIs and passes them here via
 * `createGameLoop({ modules, callbacks })`, then calls `init()` to start
 * the RAF loop.
 */

import * as THREE from 'three';

import { PLAYER_SPEED } from './playerVehicle.js';
import {
  calculateScore,
  computeDifficulty,
  getRoadOffsetAt,
  OBJECT_TYPES,
  ROAD_Y,
} from '../../utils/racingGame.js';
import {
  createAudioController,
  updateAudioSpeed,
  stopEngineHumAudio,
  stopWindNoiseAudio,
  closeAudioContext,
  playSoundEffect,
} from './audio.js';
import { SHAKE_DURATION_COLLISION, SHAKE_INTENSITY_COLLISION } from './effects.js';

/* ===================================================================
   Camera / loop constants
   =================================================================== */

/**
 * Camera following interpolation factor — gentle enough to glide
 * smoothly into curves, fast enough to avoid perceptible lag.
 */
export const CAMERA_SMOOTH = 0.15;

/**
 * Fraction of the lane offset visible in the camera target position.
 */
export const CAMERA_LANE_FACTOR = 0.7;

/**
 * Curve-banking: look-ahead distance (road units) for computing
 * lateral curve delta that drives camera Z-axis tilt.
 */
export const CAMERA_BANK_LOOK_AHEAD = 8;

/**
 * Controls how dramatically the camera leans into a curve.
 */
export const CAMERA_BANK_FACTOR = 0.3;

/**
 * Shadow map is refreshed every N frames for performance.
 */
export const SHADOW_UPDATE_INTERVAL = 3;

/* ===================================================================
   Public API factory
   =================================================================== */

/**
 * Create the game loop controller.
 *
 * @param {object} params
 * @param {HTMLDivElement} params.containerEl
 * @param {object} params.modules - All scene-level module APIs
 * @param {object} params.modules.environment   - { scene, camera, renderer, staticGroup, grassGroup }
 * @param {object} params.modules.road           - { updateRoad, cleanupRoadForRestart }
 * @param {object} params.modules.decorations    - { updateDecorations, cleanupDecorationsForRestart }
 * @param {object} params.modules.vehicle        - PlayerVehicle API
 * @param {object} params.modules.worldObjects   - WorldObjects API
 * @param {object} params.modules.effects         - Effects API
 * @param {object} params.modules.input           - Input controller API
 * @param {object} params.modules.hud            - HUD API
 * @param {object} params.modules._roadGroup     - THREE.Group (road root)
 * @param {object} params.modules._objectsGroup  - THREE.Group (objects root)
 * @param {object} params.callbacks - Scene-level reactive state setters
 * @param {Function} params.callbacks.onGameStateChange    - (state: string) => void
 * @param {Function} params.callbacks.onGameOverHandled    - () => void
 * @param {Function} params.callbacks.onHealthChange        - (h: number) => void
 * @param {Function} params.callbacks.onDistanceChange      - (d: number) => void
 * @param {Function} params.callbacks.onScrollOffsetChange   - (s: number) => void
 * @param {Function} params.callbacks.onRunningTimeChange    - (t: number) => void
 * @param {Function} params.callbacks.onCameraShakeChange    - (s: object) => void
 * @param {Function} params.callbacks.onRoadSegmentsChange  - (segs: Array) => void
 * @param {Function} params.callbacks.onRoadTileDataChange  - (data: Array) => void
 * @param {Function} params.callbacks.onTreesDataChange      - (d: Array) => void
 * @param {Function} params.callbacks.onDecoDataChange       - (d: Array) => void
 * @param {Function} params.callbacks.onStaticGroupChange   - (g: THREE.Group|null) => void
 * @param {Function} params.callbacks.onLoadingChange       - (v: boolean) => void
 * @param {Function} params.callbacks.onWebglErrorChange     - (v: boolean) => void
 * @param {Function} params.callbacks.onFrameCountChange     - (c: number) => void
 * @returns {{ init, start, restart }}
 */
export function createGameLoop({ containerEl, modules, callbacks }) {
  const {
    environment,
    road,
    decorations,
    vehicle,
    worldObjects,
    effects,
    input,
    hud,
    _roadGroup,
    _objectsGroup,
  } = modules;

  const {
    onGameStateChange,
    onGameOverHandled,
    onHealthChange,
    onDistanceChange,
    onScrollOffsetChange,
    onRunningTimeChange,
    onCameraShakeChange,
    onRoadSegmentsChange,
    onRoadTileDataChange,
    onTreesDataChange,
    onDecoDataChange,
    onStaticGroupChange,
    onLoadingChange,
    onWebglErrorChange,
    onFrameCountChange,
  } = callbacks;

  /* ===================================================================
     Local mutable state (game-scope variables previously in scene)
     =================================================================== */
  let gameState = 'menu';
  let gameOverHandled = false;
  let health = 100;
  let distance = 0;
  let scrollOffset = 0;
  let runningTime = 0;
  let laneVisualX = 0;
  let cameraShake = { duration: 0, intensity: 0 };
  let frameCount = 0;
  let prevTime = 0;
  let animationId = null;

  // Road/decorations data — read from scene module refs, updated via callbacks
  // We track them here so updateRoad/updateDecorations can read them
  let roadSegments = [];
  let roadTileData = [];
  let treesData = [];
  let decoData = [];

  // Audio handles
  let audioCtx = null;
  let engineHum = null;
  let windNoise = null;

  // Asynchronous callback wiring for input controller (Enter from menu)
  input.onEnter(() => {
    if (gameState === 'menu') {
      doStartGame();
    }
  });

  /* ===================================================================
     Camera shake trigger
     =================================================================== */
  function triggerShake(duration, intensity) {
    cameraShake = { duration, intensity };
    onCameraShakeChange({ ...cameraShake });
  }

  /* ===================================================================
     Camera update
     =================================================================== */
  function updateCamera(forwardStep, dt) {
    if (!environment.camera) return;

    const lookRoadZ = -scrollOffset - 15;
    const lookOffset = getRoadOffsetAt(roadSegments, lookRoadZ);

    const targetCamX = lookOffset.curveOffset + laneVisualX * CAMERA_LANE_FACTOR;
    const targetCamY = ROAD_Y + lookOffset.heightOffset + 6;

    environment.camera.position.x += (targetCamX - environment.camera.position.x) * CAMERA_SMOOTH;
    environment.camera.position.y += (targetCamY - environment.camera.position.y) * CAMERA_SMOOTH;
    environment.camera.position.z = 12;

    const lookTarget = new THREE.Vector3(
      lookOffset.curveOffset,
      ROAD_Y + lookOffset.heightOffset + 1,
      -10
    );
    environment.camera.lookAt(lookTarget);

    // Dynamic FOV based on speed
    const speedFactor = forwardStep / Math.max(dt, 0.001);
    const targetFov = 60 + Math.min(Math.abs(speedFactor) / PLAYER_SPEED, 1) * 12;
    environment.camera.fov += (targetFov - environment.camera.fov) * 0.08;
    environment.camera.updateProjectionMatrix();

    // Camera shake
    if (cameraShake.duration > 0) {
      cameraShake.duration -= dt;
      const shakeX = (Math.random() - 0.5) * 2 * cameraShake.intensity;
      const shakeY = (Math.random() - 0.5) * 2 * cameraShake.intensity;
      environment.camera.position.x += shakeX;
      environment.camera.position.y += shakeY;
      cameraShake.intensity *= 0.92;
      if (cameraShake.duration <= 0) {
        cameraShake.intensity = 0;
      }
      onCameraShakeChange({ ...cameraShake });
    }

    // Curve banking
    const playerRoadZ = -scrollOffset;
    const aheadRoadZ = playerRoadZ - CAMERA_BANK_LOOK_AHEAD;
    const playerOffset = getRoadOffsetAt(roadSegments, playerRoadZ);
    const aheadOffset = getRoadOffsetAt(roadSegments, aheadRoadZ);
    const curveDelta = aheadOffset.curveOffset - playerOffset.curveOffset;
    environment.camera.rotateZ(-curveDelta * CAMERA_BANK_FACTOR);
  }

  /* ===================================================================
     Main game update tick
     =================================================================== */
  function updateGame(deltaTime) {
    if (gameState === 'gameover') return;

    const dt = Math.min(deltaTime, 0.05);
    runningTime += dt;
    onRunningTimeChange(runningTime);

    // Forward progress
    const forwardStep = PLAYER_SPEED * dt;
    distance += forwardStep;
    scrollOffset += forwardStep;
    onDistanceChange(distance);
    onScrollOffsetChange(scrollOffset);

    // HUD display values
    const currentDifficulty = computeDifficulty({ distance, runningTime });
    const score = calculateScore(distance, 1);
    const speedMps = forwardStep / Math.max(dt, 0.001);
    hud.updateDisplay({ health, distance, score, speedMps, dt });

    // Get vehicle state for camera lane offset
    const vehicleState = vehicle.getState();
    laneVisualX = vehicleState.laneVisualX ?? 0;

    // Oncoming warning
    const objectDescriptors = worldObjects.getObjectDescriptors();
    const hasOncoming = objectDescriptors.some((obj) => {
      if (!obj || obj.type !== OBJECT_TYPES.ONCOMING_VEHICLE) return false;
      const worldZ = obj.z + scrollOffset;
      return worldZ >= -60 && worldZ <= 0;
    });
    hud.updateOncomingWarning(hasOncoming);

    // Update vehicle (handles collisions, returns updated health + collected)
    const objectMeshMap = worldObjects.getObjectMeshMap();
    const updatedState = vehicle.updateVehicle(
      dt, scrollOffset, roadSegments, objectDescriptors,
      objectMeshMap, _objectsGroup, health, runningTime
    );
    health = updatedState.health;
    const collectedDescriptors = updatedState.collectedDescriptors || [];
    onHealthChange(health);

    // Update world objects (spawn, recycle, advance, visuals)
    worldObjects.update(
      dt, scrollOffset, roadSegments, roadTileData, currentDifficulty, collectedDescriptors
    );

    // Update road
    road.updateRoad({
      roadSegments,
      roadTileData,
      scrollOffset,
      asphaltTextures: null, // provided by scene; not needed here
      roadGroup: _roadGroup,
      grassGroup: environment.grassGroup,
      renderer: environment.renderer,
      setRoadSegments: (s) => { roadSegments = s; onRoadSegmentsChange(s); },
      setScrollOffset: (s) => { scrollOffset = s; onScrollOffsetChange(s); },
      setRoadTileData: (d) => { roadTileData = d; onRoadTileDataChange(d); },
    });

    // Update decorations
    decorations.updateDecorations({
      renderer: environment.renderer,
      setTreesData: (d) => { treesData = d; onTreesDataChange(d); },
      setDecoData: (d) => { decoData = d; onDecoDataChange(d); },
    });

    // Update camera
    updateCamera(forwardStep, dt);

    // Update effects
    effects.update(dt);

    // Scenery parallax
    if (environment.staticGroup) {
      environment.staticGroup.position.z = scrollOffset * 0.15;
    }

    // Audio speed update
    updateAudioSpeed(Math.abs(speedMps));

    // Game over check
    if (health <= 0 && !gameOverHandled) {
      gameState = 'gameover';
      gameOverHandled = true;
      onGameStateChange(gameState);
      onGameOverHandled();
      stopEngineHumAudio(0.5);
      playSoundEffect('gameOver');
    }
  }

  /* ===================================================================
     RAF animation loop
     =================================================================== */
  function animate(time) {
    animationId = requestAnimationFrame(animate);

    if (!prevTime) {
      prevTime = time;
      return;
    }

    const deltaTime = (time - prevTime) / 1000;
    prevTime = time;
    frameCount++;
    onFrameCountChange(frameCount);

    if (gameState === 'playing') {
      updateGame(deltaTime);
    }

    if (environment.renderer && environment.scene && environment.camera) {
      // Shadow map throttled for performance
      if (frameCount % SHADOW_UPDATE_INTERVAL === 0) {
        environment.renderer.shadowMap.needsUpdate = true;
      }
      // Post-processing render
      if (modules._composer) {
        modules._composer.render();
      } else {
        environment.renderer.render(environment.scene, environment.camera);
      }
    }
  }

  /* ===================================================================
     Internal start (called from button click or Enter key)
     =================================================================== */
  function doStartGame() {
    const handles = createAudioController();
    audioCtx = handles.audioCtx;
    engineHum = handles.engineHum;
    windNoise = handles.windNoise;
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    gameState = 'playing';
    onGameStateChange('playing');
  }

  /* ===================================================================
     start — exposed for scene component Start button click
     =================================================================== */
  function start() {
    doStartGame();
  }

  /* ===================================================================
     restart — reset all game state and re-create dynamic objects
     =================================================================== */
  function restart() {
    health = 100;
    distance = 0;
    scrollOffset = 0;
    runningTime = 0;
    gameState = 'playing';
    gameOverHandled = false;
    cameraShake = { duration: 0, intensity: 0 };
    laneVisualX = 0;

    onHealthChange(health);
    onDistanceChange(distance);
    onScrollOffsetChange(scrollOffset);
    onRunningTimeChange(runningTime);
    onGameStateChange(gameState);
    onCameraShakeChange({ ...cameraShake });

    // Reset vehicle
    vehicle.reset();

    // Reset world objects
    worldObjects.reset();

    // Clean up and re-create road visuals
    road.cleanupRoadForRestart({
      roadGroup: _roadGroup,
      roadTileData,
      setRoadSegments: (s) => { roadSegments = s; onRoadSegmentsChange(s); },
      setRoadTileData: (d) => { roadTileData = d; onRoadTileDataChange(d); },
    });

    // Clean up effects
    effects.cleanup();

    // Clean up decorations
    decorations.cleanupDecorationsForRestart({
      roadGroup: _roadGroup,
      setTreesData: (d) => { treesData = d; onTreesDataChange(d); },
      setDecoData: (d) => { decoData = d; onDecoDataChange(d); },
    });

    // Re-create vehicle mesh
    vehicle.createVehicle();

    // Restart audio
    stopWindNoiseAudio(0.1);
    stopEngineHumAudio(0.1);
    const handles = createAudioController();
    audioCtx = handles.audioCtx;
    engineHum = handles.engineHum;
    windNoise = handles.windNoise;
  }

  /* ===================================================================
     init — start the RAF animation loop
     =================================================================== */
  function init() {
    animate(0);
  }

  /* ===================================================================
     Public API
     =================================================================== */
  return {
    init,
    start,
    restart,
    triggerShake,
  };
}
