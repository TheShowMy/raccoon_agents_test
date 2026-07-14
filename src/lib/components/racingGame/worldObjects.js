/**
 * Racing Game — World Objects Module
 *
 * Encapsulates creation, visual updates, spawning, recycling, and
 * advancement of world objects (obstacles, oncoming vehicles, repair kits).
 */

import * as THREE from 'three';

import {
  ROAD_Y,
  OBJECT_TYPES,
  ENEMY_VEHICLE_MODEL_MAP,
  getEnemyModelById,
  ONCOMING_VEHICLE_SPEED,
  generateObjectsForSegment,
  computeDifficulty,
} from '../../utils/racingGame/index.js';

/* ===================================================================
   Constants
   =================================================================== */

/** Collision check interval (every N frames) */
const COLLISION_CHECK_MOD = 4;

/** Objects with worldZ > this are recycled (behind the player) */
const RECYCLE_WORLD_Z = 5;

/* ===================================================================
   Module state
   =================================================================== */

/**
 * Create and return the world objects module API.
 *
 * @param {object} params
 * @param {THREE.Scene} params.scene
 * @param {THREE.Group} params.objectsGroup
 * @returns {object} Module API
 */
export function createWorldObjects({ scene, objectsGroup }) {
  /** Object descriptors (active objects) */
  let objectDescriptors = [];

  /** Mesh map: descriptor -> { mesh } */
  let objectMeshMap = new Map();

  /** Frame counter */
  let frameCount = 0;

  /** Spawn cooldown timer */
  let spawnCooldown = 0;

  /** Current difficulty snapshot */
  let currentDifficulty = computeDifficulty({ distance: 0, runningTime: 0 });

  /** Running time for visual effects */
  let runningTime = 0;

  /* ===================================================================
     Object visual creation
     =================================================================== */
  function createObjectVisual(desc) {
    const worldX = desc.x;
    const worldY = ROAD_Y;
    const worldZ = desc.z;

    let mesh;

    switch (desc.type) {
      case OBJECT_TYPES.OBSTACLE: {
        const geo = new THREE.BoxGeometry(1.2, 0.8, 1.2);
        const mat = new THREE.MeshPhongMaterial({
          color: 0xff6633,
          emissive: 0x883311,
          emissiveIntensity: 0.2,
          flatShading: true,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(worldX, worldY + 0.4, worldZ);
        mesh.castShadow = true;
        break;
      }

      case OBJECT_TYPES.ONCOMING_VEHICLE: {
        const model = getEnemyModelById(desc.modelId)
          || ENEMY_VEHICLE_MODEL_MAP[Object.keys(ENEMY_VEHICLE_MODEL_MAP)[0]];
        const bodyDims = model.body;
        const cabinDims = model.cabin;
        const bodyColor = model.color;
        const emissiveColor = bodyColor & 0xfefefe;
        const wheelCount = model.wheelCount;
        const headlightCount = model.headlightCount;
        const hasRoof = model.hasRoof;
        const hasSpoiler = model.hasSpoiler;

        const group = new THREE.Group();
        const bodyMat = new THREE.MeshPhongMaterial({
          color: bodyColor,
          emissive: emissiveColor,
          emissiveIntensity: 0.15,
          shininess: 30,
        });
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(bodyDims.width, bodyDims.height, bodyDims.length),
          bodyMat
        );
        body.position.y = bodyDims.height / 2;
        body.castShadow = true;
        group.add(body);

        if (hasRoof) {
          const cabinMat = new THREE.MeshPhongMaterial({
            color: bodyColor,
            emissive: emissiveColor,
            emissiveIntensity: 0.1,
            transparent: true,
            opacity: 0.8,
          });
          const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(cabinDims.width, cabinDims.height, cabinDims.length),
            cabinMat
          );
          cabin.position.set(0, bodyDims.height + cabinDims.height / 2, 0);
          group.add(cabin);
        }

        if (hasSpoiler) {
          const spoilerMat = new THREE.MeshPhongMaterial({ color: bodyColor });
          const spoilerWing = new THREE.Mesh(
            new THREE.BoxGeometry(bodyDims.width * 0.9, 0.05, 0.2),
            spoilerMat
          );
          spoilerWing.position.set(
            0,
            bodyDims.height + 0.18,
            bodyDims.length / 2 - 0.15,
          );
          const strutGeo = new THREE.BoxGeometry(0.05, 0.18, 0.05);
          for (const sx of [-bodyDims.width * 0.3, bodyDims.width * 0.3]) {
            const strut = new THREE.Mesh(strutGeo, spoilerMat);
            strut.position.set(
              sx,
              bodyDims.height + 0.09,
              bodyDims.length / 2 - 0.15,
            );
            group.add(strut);
          }
          group.add(spoilerWing);
        }

        const wheelMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 6);
        const axles = wheelCount / 2;
        const lengthSpan = bodyDims.length * 0.7;
        for (let a = 0; a < axles; a++) {
          const z = (a / Math.max(axles - 1, 1)) * lengthSpan;
          for (const sx of [-bodyDims.width / 2 + 0.1, bodyDims.width / 2 - 0.1]) {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.rotation.x = Math.PI / 2;
            w.position.set(sx, 0.15, z);
            group.add(w);
          }
        }

        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
        const frontZ = -bodyDims.length / 2 - 0.05;
        for (let h = 0; h < headlightCount; h++) {
          const t = headlightCount === 1
            ? 0
            : (h / (headlightCount - 1)) - 0.5;
          const hx = t * (bodyDims.width * 0.6);
          const hl = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 6, 6),
            hlMat,
          );
          hl.position.set(hx, 0.3, frontZ);
          group.add(hl);
        }

        group.position.set(worldX, worldY, worldZ);
        group.rotation.y = Math.PI;
        mesh = group;
        break;
      }

      case OBJECT_TYPES.REPAIR_KIT: {
        const group = new THREE.Group();

        const kitMat = new THREE.MeshPhongMaterial({
          color: 0x44dd44,
          emissive: 0x22aa22,
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: 0.9,
        });
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.6, 0.6),
          kitMat
        );
        box.position.y = 0.3;
        box.castShadow = true;
        group.add(box);

        const glowMat = new THREE.MeshBasicMaterial({
          color: 0x44ff44,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
        });
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 8, 8),
          glowMat
        );
        glow.position.y = 0.3;
        group.add(glow);

        group.position.set(worldX, worldY, worldZ);
        mesh = group;
        break;
      }

      default:
        return null;
    }

    if (mesh) {
      mesh.userData.descriptor = desc;
      objectsGroup.add(mesh);
    }
    return mesh;
  }

  /* ===================================================================
     Visual update
     =================================================================== */
  function updateObjectVisuals() {
    // Remove visuals for recycled descriptors
    const validDescs = new Set(objectDescriptors);
    const toRemove = [];
    objectMeshMap.forEach((entry, desc) => {
      if (!validDescs.has(desc)) {
        toRemove.push(desc);
      }
    });
    for (const desc of toRemove) {
      const entry = objectMeshMap.get(desc);
      if (entry) {
        objectsGroup.remove(entry.mesh);
        disposeMeshTree(entry.mesh);
      }
      objectMeshMap.delete(desc);
    }

    // Create visuals for new descriptors
    for (const desc of objectDescriptors) {
      if (!objectMeshMap.has(desc)) {
        const visual = createObjectVisual(desc);
        if (visual) objectMeshMap.set(desc, { mesh: visual });
      }
    }

    // Reposition existing visuals based on scrollOffset
    objectMeshMap.forEach((entry, desc) => {
      entry.mesh.position.set(desc.x, ROAD_Y, desc.z);

      // Bob repair kits
      if (desc.type === OBJECT_TYPES.REPAIR_KIT) {
        entry.mesh.children.forEach((child) => {
          if (child.isMesh && child.geometry && child.geometry.type === 'SphereGeometry') {
            child.material.opacity = 0.1 + 0.08 * Math.sin(runningTime * 3 + desc.z);
          }
        });
      }
    });
  }

  /* ===================================================================
     Mesh disposal
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

  /* ===================================================================
     Object spawning
     =================================================================== */
  function spawnObjects(roadSegments, roadTileData, scrollOffset, difficulty) {
    if (!roadSegments.length) return;

    const spawnChance = difficulty.spawnChance;
    const maxObjectsPerSegment = difficulty.maxObjectsPerSegment;

    for (let i = 0; i < roadSegments.length; i++) {
      const seg = roadSegments[i];
      const tileData = roadTileData[i];
      const roadZ = seg.zStart - seg.length / 2;
      const worldZ = roadZ + scrollOffset;

      if (worldZ < -120 || worldZ > -5) continue;
      if (tileData && tileData.spawned) continue;

      const segStart = seg.zStart;
      const segEnd = seg.zStart - seg.length;
      const hasObjects = objectDescriptors.some(
        (o) => o.z >= segEnd && o.z <= segStart
      );
      if (hasObjects) continue;

      if (Math.random() > spawnChance) continue;

      const objects = generateObjectsForSegment(seg, maxObjectsPerSegment);
      objectDescriptors.push(...objects);
      if (tileData) tileData.spawned = true;
    }

    spawnCooldown = difficulty.spawnCooldownSeconds;
  }

  /* ===================================================================
     Object recycling
     =================================================================== */
  function recycleWorldObjects(scrollOffset) {
    for (let i = objectDescriptors.length - 1; i >= 0; i--) {
      const obj = objectDescriptors[i];
      const worldZ = obj.z + scrollOffset;
      if (worldZ > RECYCLE_WORLD_Z) {
        const entry = objectMeshMap.get(obj);
        if (entry) {
          objectsGroup.remove(entry.mesh);
          disposeMeshTree(entry.mesh);
          objectMeshMap.delete(obj);
        }
        objectDescriptors.splice(i, 1);
      }
    }
  }

  /* ===================================================================
     Oncoming vehicle advancement
     =================================================================== */
  function advanceOncomingVehicles(dt, speedMultiplier) {
    const safeMultiplier = typeof speedMultiplier === 'number'
      && Number.isFinite(speedMultiplier)
      && speedMultiplier > 0
      ? speedMultiplier
      : 1;

    for (let i = 0; i < objectDescriptors.length; i++) {
      const obj = objectDescriptors[i];
      if (!obj || obj.type !== OBJECT_TYPES.ONCOMING_VEHICLE) continue;

      const speed = typeof obj.speed === 'number'
        && Number.isFinite(obj.speed)
        && obj.speed > 0
        ? obj.speed
        : ONCOMING_VEHICLE_SPEED;

      obj.z += speed * safeMultiplier * dt;
    }
  }

  /* ===================================================================
     Update (coordinates spawn, recycle, advance, visuals)
     =================================================================== */
  function update(dt, scrollOffset, roadSegments, roadTileData, difficulty, collectedDescriptors) {
    runningTime += dt;
    currentDifficulty = difficulty;

    // Decrement spawn cooldown
    spawnCooldown -= dt;

    // Remove collected (collided) descriptors from internal state
    if (collectedDescriptors && collectedDescriptors.length > 0) {
      for (const desc of collectedDescriptors) {
        const idx = objectDescriptors.indexOf(desc);
        if (idx !== -1) objectDescriptors.splice(idx, 1);
        objectMeshMap.delete(desc);
      }
    }

    // Spawn objects
    if (spawnCooldown <= 0) {
      spawnObjects(roadSegments, roadTileData, scrollOffset, difficulty);
    }

    // Advance oncoming vehicles
    advanceOncomingVehicles(dt, difficulty.enemySpeedMultiplier);

    // Recycle behind player
    recycleWorldObjects(scrollOffset);

    // Update visuals
    updateObjectVisuals();

    // Track frame count
    frameCount++;

    return {
      frameCount,
      spawnCooldown,
    };
  }

  /* ===================================================================
     Deferred init (allows gameLoop to pass scene/objectsGroup after environment setup)
     =================================================================== */
  function init({ scene: s, objectsGroup: og }) {
    // Re-assign module-level vars if deferred init is used
    // (in practice these are set at construction time, this is for flexibility)
    if (s) scene = s;
    if (og) objectsGroup = og;
  }

  /* ===================================================================
     Public API
     =================================================================== */
  return {
    init,
    update,
    // Return shallow copy to preserve encapsulation
    getObjectDescriptors: () => [...objectDescriptors],
    // Return shallow copy to preserve encapsulation
    getObjectMeshMap: () => new Map(objectMeshMap),
    getFrameCount: () => frameCount,
    getSpawnCooldown: () => spawnCooldown,
    getDifficulty: () => currentDifficulty,
    reset: function () {
      objectDescriptors = [];
      objectMeshMap = new Map();
      frameCount = 0;
      spawnCooldown = 0;
      currentDifficulty = computeDifficulty({ distance: 0, runningTime: 0 });
    },
  };
}
