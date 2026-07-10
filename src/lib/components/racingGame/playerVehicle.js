/**
 * Racing Game — Player Vehicle Module
 *
 * Encapsulates player vehicle creation, transform updates, lane switching,
 * jump physics, and collision detection with world objects.
 */

import * as THREE from 'three';

import {
  ROAD_Y,
  getLaneX,
  clampLane,
  getRoadOffsetAt,
  checkCollision,
  applyCollision,
} from '../../utils/racingGame.js';

/* ===================================================================
   Constants
   =================================================================== */

export const PLAYER_SPEED = 22;
const LANE_SWITCH_DURATION = 0.18;
const JUMP_FORCE = 7.5;
const GRAVITY = -22;

// Vehicle transform smoothing factors
const VEHICLE_SMOOTH_X = 0.35;
const VEHICLE_SMOOTH_Y = 0.25;

// Curve-banking factors
const VEHICLE_BANK_LOOK_AHEAD = 6;
const VEHICLE_BANK_FACTOR = 0.04;
const VEHICLE_BANK_SMOOTH = 0.15;

/* ===================================================================
   Module state
   =================================================================== */

/**
 * Create and return the player vehicle module API.
 *
 * @param {object} params
 * @param {THREE.Scene} params.scene
 * @param {Function} [params.createParticleBurst] - Particle burst effect
 * @param {Function} [params.createShockwaveRing] - Landing shockwave effect
 * @param {Function} [params.triggerShake] - Camera shake effect
 * @param {Function} [params.onCollisionEffect] - Called on collision damage
 * @param {Function} [params.onPickupEffect] - Called on repair pickup
 * @returns {object} Module API
 */
export function createPlayerVehicle({ scene, createParticleBurst, createShockwaveRing, triggerShake, onCollisionEffect, onPickupEffect }) {
  /* ---- Vehicle mesh ---- */
  let vehicle = null;
  let wheels = [];

  /* ---- Lane-switch state ---- */
  let currentLane = 0;
  let targetLane = 0;
  let laneVisualX = 0;
  let laneSwitchProgress = 1;
  let laneSwitchStartX = 0;
  let laneSwitchEndX = 0;
  let currentLaneSwitchTilt = 0;
  let currentCurveBank = 0;

  /* ---- Jump state ---- */
  let playerY = 0;
  let isJumping = false;
  let jumpVelocity = 0;
  let wasJumping = false;

  /* ===================================================================
     Vehicle mesh creation
     =================================================================== */
  function createVehicle() {
    vehicle = new THREE.Group();

    // Main body — off-road SUV
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x3a9ad9,
      emissive: 0x1a5a8a,
      emissiveIntensity: 0.15,
      shininess: 40,
    });
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.6, 2.8);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    vehicle.add(body);

    // Cabin
    const cabinMat = new THREE.MeshPhongMaterial({
      color: 0x2a7ab9,
      emissive: 0x1a4a7a,
      emissiveIntensity: 0.1,
      shininess: 30,
      transparent: true,
      opacity: 0.85,
    });
    const cabinGeo = new THREE.BoxGeometry(1.3, 0.45, 1.6);
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.75, -0.2);
    cabin.castShadow = true;
    vehicle.add(cabin);

    // Windshield glow
    const glassMat = new THREE.MeshPhongMaterial({
      color: 0x88ccff,
      emissive: 0x4488cc,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.4,
    });
    const glassGeo = new THREE.BoxGeometry(1.1, 0.25, 0.08);
    const windshield = new THREE.Mesh(glassGeo, glassMat);
    windshield.position.set(0, 0.75, -1.0);
    vehicle.add(windshield);
    const rearGlass = new THREE.Mesh(glassGeo, glassMat);
    rearGlass.position.set(0, 0.75, 0.6);
    vehicle.add(rearGlass);

    // Bumpers
    const bumperMat = new THREE.MeshPhongMaterial({ color: 0x4a4a4a, shininess: 20 });
    const bumperGeo = new THREE.BoxGeometry(1.7, 0.15, 0.2);
    const frontBumper = new THREE.Mesh(bumperGeo, bumperMat);
    frontBumper.position.set(0, 0.15, -1.5);
    vehicle.add(frontBumper);
    const rearBumper = new THREE.Mesh(bumperGeo, bumperMat);
    rearBumper.position.set(0, 0.15, 1.5);
    vehicle.add(rearBumper);

    // Wheels (4)
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, shininess: 10 });
    const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8);
    const wheelPositions = [
      [-0.6, 0.15, -0.9],
      [0.6, 0.15, -0.9],
      [-0.6, 0.15, 0.9],
      [0.6, 0.15, 0.9],
    ];
    wheels = [];
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      vehicle.add(wheel);
      wheels.push(wheel);
    }

    // Roof lights
    const lightMat = new THREE.MeshPhongMaterial({
      color: 0xffcc44,
      emissive: 0xff8800,
      emissiveIntensity: 0.5,
    });
    for (let lx = -0.4; lx <= 0.4; lx += 0.8) {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        lightMat
      );
      light.position.set(lx, 0.98, -1.3);
      vehicle.add(light);
    }

    vehicle.position.set(0, ROAD_Y, 0);
    scene.add(vehicle);

    return { vehicle, wheels };
  }

  /* ===================================================================
     Vehicle transform update (road following, lane interpolation, banking)
     =================================================================== */
  function updateVehicleTransform(dt, scrollOffset, roadSegments) {
    if (!vehicle) return;

    const playerRoadZ = -scrollOffset;
    const offset = getRoadOffsetAt(roadSegments, playerRoadZ);

    const targetX = offset.curveOffset + laneVisualX;
    const targetY = ROAD_Y + offset.heightOffset + playerY;

    vehicle.position.x += (targetX - vehicle.position.x) * VEHICLE_SMOOTH_X;
    vehicle.position.y += (targetY - vehicle.position.y) * VEHICLE_SMOOTH_Y;
    vehicle.position.z = 0;

    // Z-axis tilt: lane-switch component
    let targetLaneSwitchTilt = 0;
    if (laneSwitchProgress < 1) {
      const laneDelta = targetLane - currentLane;
      targetLaneSwitchTilt = -laneDelta * 0.12 * (1 - Math.abs(laneSwitchProgress - 0.5) * 2);
      currentLaneSwitchTilt = targetLaneSwitchTilt;
    } else {
      currentLaneSwitchTilt += (0 - currentLaneSwitchTilt) * 0.1;
    }

    // Z-axis tilt: curve-bank component
    const aheadRoadZ = playerRoadZ - VEHICLE_BANK_LOOK_AHEAD;
    const aheadOffset = getRoadOffsetAt(roadSegments, aheadRoadZ);
    const curveDelta = aheadOffset.curveOffset - offset.curveOffset;
    const targetCurveBank = -curveDelta * VEHICLE_BANK_FACTOR;
    currentCurveBank += (targetCurveBank - currentCurveBank) * VEHICLE_BANK_SMOOTH;

    // Compose tilts
    vehicle.rotation.z = currentLaneSwitchTilt + currentCurveBank;

    // Tilt during jump
    if (isJumping) {
      vehicle.rotation.x = Math.max(-0.3, Math.min(0.3, jumpVelocity * 0.02));
    } else {
      vehicle.rotation.x *= 0.9;
    }

    // Wheel rotation
    const wheelRotationDelta = PLAYER_SPEED * dt * 4.0;
    for (const wheel of wheels) {
      wheel.rotation.z += wheelRotationDelta;
    }
  }

  /* ===================================================================
     Lane switching
     =================================================================== */
  function handleLaneSwitch(dt) {
    if (laneSwitchProgress < 1) {
      laneSwitchProgress += dt / LANE_SWITCH_DURATION;
      if (laneSwitchProgress >= 1) {
        laneSwitchProgress = 1;
        currentLane = targetLane;
      }
      const t = laneSwitchProgress;
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      laneVisualX = laneSwitchStartX + (laneSwitchEndX - laneSwitchStartX) * eased;
    }
  }

  function startLaneSwitch(direction) {
    const newLane = clampLane(currentLane + direction);
    if (newLane === currentLane) return;

    targetLane = newLane;
    laneSwitchStartX = laneVisualX;
    laneSwitchEndX = getLaneX(targetLane);
    laneSwitchProgress = 0;

    if (scene && vehicle && createParticleBurst) {
      createParticleBurst(vehicle.position.clone(), 0x88ccff, 8);
    }
  }

  /* ===================================================================
     Jump physics
     =================================================================== */
  function handleJump(dt) {
    if (isJumping) {
      jumpVelocity += GRAVITY * dt;
      playerY += jumpVelocity * dt;
      if (playerY <= 0) {
        const justLanded = wasJumping;
        playerY = 0;
        isJumping = false;
        jumpVelocity = 0;
        if (justLanded) {
          if (scene && vehicle) {
            const pos = vehicle.position.clone();
            pos.y = ROAD_Y;
            if (createShockwaveRing) createShockwaveRing(pos);
            if (triggerShake) triggerShake(0.2, 0.12);
          }
        }
      }
    }
    wasJumping = isJumping;
  }

  function startJump() {
    if (isJumping) return;
    isJumping = true;
    jumpVelocity = JUMP_FORCE;
    if (scene && vehicle && createParticleBurst) {
      const pos = vehicle.position.clone();
      pos.y = ROAD_Y;
      createParticleBurst(pos, 0xff8800, 14, true);
      createParticleBurst(pos, 0xffcc00, 6, true);
    }
    if (triggerShake) triggerShake(0.15, 0.08);
  }

  /* ===================================================================
     Collision detection
     =================================================================== */
  function handleCollisions(objectDescriptors, objectMeshMap, objectsGroup, health, runningTime, scrollOffset) {
    let newHealth = health;
    // Return list of collected descriptors for caller to handle deletion
    const collectedDescriptors = [];

    for (let i = objectDescriptors.length - 1; i >= 0; i--) {
      const obj = objectDescriptors[i];
      if (!obj.active) continue;

      // Convert road-space Z to world Z for collision detection
      const worldZ = obj.z + scrollOffset;
      if (worldZ < -80 || worldZ > 80) continue;

      const collisionPlayer = { lane: currentLane, z: 0, y: playerY };
      const collisionObj = { ...obj, z: worldZ };

      if (checkCollision(collisionPlayer, collisionObj)) {
        obj.active = false;
        const result = applyCollision(newHealth, obj);
        newHealth = result.health;

        if (result.healthDelta < 0) {
          if (onCollisionEffect && vehicle) {
            onCollisionEffect(vehicle.position.clone(), obj);
          }
        } else if (result.healthDelta > 0) {
          if (onPickupEffect && vehicle) {
            onPickupEffect(vehicle.position.clone());
          }
        }

        const entry = objectMeshMap.get(obj);
        if (entry) {
          objectsGroup.remove(entry.mesh);
          disposeMeshTree(entry.mesh);
        }
        // Mark for collection instead of directly modifying
        collectedDescriptors.push(obj);

        if (newHealth <= 0) break;
      }
    }

    return {
      health: newHealth,
      collectedDescriptors,
    };
  }

  /* ===================================================================
     Cleanup
     =================================================================== */
  function disposeMeshTree(obj) {
    if (!obj) return;
    if (obj.isMesh || obj.isPoints) {
      try { obj.geometry.dispose(); } catch {}
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => { try { m.dispose(); } catch {} });
      } else if (obj.material) {
        try { obj.material.dispose(); } catch {}
      }
    }
    if (obj.children) {
      for (let i = obj.children.length - 1; i >= 0; i--) {
        disposeMeshTree(obj.children[i]);
      }
    }
  }

  function dispose() {
    if (vehicle) {
      disposeMeshTree(vehicle);
      scene.remove(vehicle);
    }
    vehicle = null;
    wheels = [];
  }

  function reset() {
    if (vehicle) {
      vehicle.position.set(0, ROAD_Y, 0);
      vehicle.rotation.set(0, 0, 0);
    }
    currentLane = 0;
    targetLane = 0;
    laneVisualX = 0;
    laneSwitchProgress = 1;
    currentLaneSwitchTilt = 0;
    currentCurveBank = 0;
    playerY = 0;
    isJumping = false;
    jumpVelocity = 0;
    wasJumping = false;
  }

  /* ===================================================================
     Public API
     =================================================================== */
  return {
    createVehicle,
    updateVehicle: function (dt, scrollOffset, roadSegments, objectDescriptors, objectMeshMap, objectsGroup, health, runningTime) {
      handleLaneSwitch(dt);
      handleJump(dt);
      updateVehicleTransform(dt, scrollOffset, roadSegments);
      return handleCollisions(objectDescriptors, objectMeshMap, objectsGroup, health, runningTime, scrollOffset);
    },
    startLaneSwitch,
    startJump,
    getVehicle: () => vehicle,
    getWheels: () => wheels,
    getState: () => ({
      currentLane,
      targetLane,
      laneVisualX,
      laneSwitchProgress,
      playerY,
      isJumping,
      jumpVelocity,
    }),
    dispose,
    reset,
  };
}
