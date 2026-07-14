/**
 * Roadside Decorations Module for RacingGameScene.
 *
 * Extracts InstancedMesh tree, lamp, pole, and fence generation and recycling
 * logic from RacingGameScene.svelte into a self-contained module.
 */

import * as THREE from 'three';
import { GRASS_Y } from './environment.js';
import { ROAD_VISUAL_WIDTH } from './roadVisual.js';
import { getRoadOffsetAt } from '../../utils/racingGame/index.js';

/* ===================================================================
   Constants (tree / decoration geometry / material parameters)
   =================================================================== */

export const TREE_COUNT = 60;
export const DECO_COUNT = 30;

/** Recycle threshold constant */
export const RECYCLE_WORLD_Z = 5;

/* ===================================================================
   Module-level state
   =================================================================== */

/** @type {THREE.Group|null} */
let roadGroup = null;

/** Tree InstancedMesh references */
let trunkMesh = null;
let foliageMesh = null;
let treesData = [];

/** Decoration InstancedMesh references */
let decoPoleMesh = null;
let decoHeadMesh = null;
let decoUtilityPoleMesh = null;
let decoFencePostMesh = null;
let decoFenceBarMesh = null;
let decoData = [];

/** External refs for road state access */
let externalRefs = null;

/** Disposables registry */
const disposables = { geometries: [], materials: [] };

/* ===================================================================
   Factory functions
   =================================================================== */

/**
 * Creates tree trunk InstancedMesh with geometry and material.
 * @returns {{ mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry, material: THREE.Material }}
 */
export function createTreeTrunkMesh() {
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1, 4);
  disposables.geometries.push(trunkGeo);
  const trunkMat = new THREE.MeshPhongMaterial({ color: 0x6a4a2a });
  disposables.materials.push(trunkMat);
  const mesh = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  mesh.castShadow = true;
  return { mesh, geometry: trunkGeo, material: trunkMat };
}

/**
 * Creates tree foliage InstancedMesh with geometry and material.
 * @returns {{ mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry, material: THREE.Material }}
 */
export function createTreeFoliageMesh() {
  const foliageGeo = new THREE.ConeGeometry(1, 1, 5);
  disposables.geometries.push(foliageGeo);
  const foliageMat = new THREE.MeshPhongMaterial({
    color: 0x5a9a5a,
    flatShading: true,
  });
  disposables.materials.push(foliageMat);
  // Max 2 foliage cones per tree
  const mesh = new THREE.InstancedMesh(foliageGeo, foliageMat, TREE_COUNT * 2);
  mesh.castShadow = true;
  return { mesh, geometry: foliageGeo, material: foliageMat };
}

/**
 * Creates street lamp InstancedMeshes (pole + head).
 * @returns {{ poleMesh: THREE.InstancedMesh, headMesh: THREE.InstancedMesh, geometries: Array, materials: Array }}
 */
export function createLampInstances() {
  const lampPoleGeo = new THREE.CylinderGeometry(0.05, 0.08, 3, 6);
  disposables.geometries.push(lampPoleGeo);
  const lampHeadGeo = new THREE.SphereGeometry(0.3, 8, 8);
  disposables.geometries.push(lampHeadGeo);
  const lampMat = new THREE.MeshPhongMaterial({
    color: 0x444444,
    flatShading: true,
  });
  disposables.materials.push(lampMat);
  const lampGlowMat = new THREE.MeshPhongMaterial({
    color: 0xffff88,
    emissive: 0xffaa00,
    emissiveIntensity: 0.8,
  });
  disposables.materials.push(lampGlowMat);

  const poleMesh = new THREE.InstancedMesh(lampPoleGeo, lampMat, DECO_COUNT);
  poleMesh.castShadow = true;
  const headMesh = new THREE.InstancedMesh(lampHeadGeo, lampGlowMat, DECO_COUNT);
  headMesh.castShadow = true;

  return {
    poleMesh,
    headMesh,
    geometries: [lampPoleGeo, lampHeadGeo],
    materials: [lampMat, lampGlowMat],
  };
}

/**
 * Creates utility pole InstancedMesh.
 * @returns {{ mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry, material: THREE.Material }}
 */
export function createPoleInstances() {
  const poleGeo = new THREE.BoxGeometry(0.15, 4, 0.15);
  disposables.geometries.push(poleGeo);
  const poleColorMat = new THREE.MeshPhongMaterial({ color: 0x5a4030 });
  disposables.materials.push(poleColorMat);
  const mesh = new THREE.InstancedMesh(poleGeo, poleColorMat, DECO_COUNT);
  mesh.castShadow = true;
  return { mesh, geometry: poleGeo, material: poleColorMat };
}

/**
 * Creates fence InstancedMeshes (posts + horizontal bars).
 * @returns {{ postMesh: THREE.InstancedMesh, barMesh: THREE.InstancedMesh, geometries: Array, materials: Array }}
 */
export function createFenceInstances() {
  const fencePostGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
  disposables.geometries.push(fencePostGeo);
  const fenceBarGeo = new THREE.BoxGeometry(0.08, 0.08, 2);
  disposables.geometries.push(fenceBarGeo);
  const fenceMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  disposables.materials.push(fenceMat);

  const postMesh = new THREE.InstancedMesh(fencePostGeo, fenceMat, DECO_COUNT * 3);
  postMesh.castShadow = true;
  const barMesh = new THREE.InstancedMesh(fenceBarGeo, fenceMat, DECO_COUNT);
  barMesh.castShadow = true;

  return {
    postMesh,
    barMesh,
    geometries: [fencePostGeo, fenceBarGeo],
    materials: [fenceMat],
  };
}

/* ===================================================================
   Core API
   =================================================================== */

/**
 * Initialise the decorations system and create initial roadside decorations.
 *
 * @param {object} params
 * @param {THREE.Scene} params.scene
 * @param {THREE.Group} params.roadGroup
 * @param {object} params.externalRefs
 */
export function createDecorations({ scene, roadGroup: group, externalRefs: refs }) {
  roadGroup = group;
  externalRefs = refs;

  // Create tree InstancedMeshes
  const { mesh: tMesh, geometry: tGeo, material: tMat } = createTreeTrunkMesh();
  const { mesh: fMesh, geometry: fGeo, material: fMat } = createTreeFoliageMesh();
  trunkMesh = tMesh;
  foliageMesh = fMesh;

  // Collect tree data
  treesData = [];
  const roadSegments = externalRefs.getRoadSegments();
  for (let i = 0; i < TREE_COUNT; i++) {
    const roadZ = -5 - Math.random() * 200;
    const side = Math.random() > 0.5 ? -1 : 1;
    const distFromCenter = ROAD_VISUAL_WIDTH / 2 + 2 + Math.random() * 5;
    const offset = getRoadOffsetAt(roadSegments, roadZ);
    const trunkH = 0.5 + Math.random() * 0.5;
    const foliageH = 0.8 + Math.random() * 0.6;
    const foliageR = 0.5 + Math.random() * 0.4;
    const foliageCount = 1 + Math.floor(Math.random() * 2);
    treesData.push({
      roadZ,
      x: offset.curveOffset + side * distFromCenter,
      trunkH,
      foliageH,
      foliageR,
      foliageCount,
      side,
      distFromCenter,
      foliageBaseIdx: 0,
    });
  }

  // Position tree instances
  const dummy = new THREE.Object3D();
  let foliageIdx = 0;

  for (let i = 0; i < TREE_COUNT; i++) {
    const td = treesData[i];
    td.foliageBaseIdx = foliageIdx;

    // Trunk
    dummy.position.set(td.x, GRASS_Y + td.trunkH / 2, td.roadZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, td.trunkH, 1);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);

    // Foliage cones
    for (let f = 0; f < td.foliageCount && foliageIdx < TREE_COUNT * 2; f++) {
      dummy.position.set(td.x, GRASS_Y + td.trunkH + f * td.foliageH * 0.5, td.roadZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(td.foliageR, td.foliageH, td.foliageR);
      dummy.updateMatrix();
      foliageMesh.setMatrixAt(foliageIdx, dummy.matrix);
      foliageIdx++;
    }
  }

  // Hide unused foliage instances
  for (let i = foliageIdx; i < TREE_COUNT * 2; i++) {
    dummy.position.set(0, -1000, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    foliageMesh.setMatrixAt(i, dummy.matrix);
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  foliageMesh.instanceMatrix.needsUpdate = true;

  roadGroup.add(trunkMesh);
  roadGroup.add(foliageMesh);

  // Create decoration InstancedMeshes
  const { poleMesh, headMesh } = createLampInstances();
  const { mesh: utilityPoleMesh } = createPoleInstances();
  const { postMesh, barMesh } = createFenceInstances();

  decoPoleMesh = poleMesh;
  decoHeadMesh = headMesh;
  decoUtilityPoleMesh = utilityPoleMesh;
  decoFencePostMesh = postMesh;
  decoFenceBarMesh = barMesh;

  // Collect decoration data
  decoData = [];

  for (let i = 0; i < DECO_COUNT; i++) {
    const roadZ = -10 - i * 8 + Math.random() * 4;
    const side = i % 2 === 0 ? -1 : 1;
    const distFromCenter = ROAD_VISUAL_WIDTH / 2 + 1.5 + Math.random() * 2;
    const offset = getRoadOffsetAt(roadSegments, roadZ);
    decoData.push({
      roadZ,
      x: offset.curveOffset + side * distFromCenter,
      type: i % 3,
      side,
      distFromCenter,
      lampIdx: -1,
      poleIdx: -1,
      fencePostBaseIdx: -1,
      fenceBarIdx: -1,
    });
  }

  // Position decoration instances
  let lampIdx = 0;
  let poleIdx = 0;
  let fencePostIdx = 0;
  let fenceBarIdx = 0;

  for (let i = 0; i < DECO_COUNT; i++) {
    const deco = decoData[i];
    const worldZ = deco.roadZ;

    if (deco.type === 0 && lampIdx < DECO_COUNT) {
      deco.lampIdx = lampIdx;
      dummy.position.set(deco.x, GRASS_Y + 1.5, worldZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      decoPoleMesh.setMatrixAt(lampIdx, dummy.matrix);
      dummy.position.set(deco.x, GRASS_Y + 3.2, worldZ);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      decoHeadMesh.setMatrixAt(lampIdx, dummy.matrix);
      lampIdx++;
    } else if (deco.type === 1 && poleIdx < DECO_COUNT) {
      deco.poleIdx = poleIdx;
      dummy.position.set(deco.x, GRASS_Y + 2, worldZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      decoUtilityPoleMesh.setMatrixAt(poleIdx, dummy.matrix);
      poleIdx++;
    } else if (deco.type === 2) {
      deco.fencePostBaseIdx = fencePostIdx;
      for (let p = 0; p < 3; p++) {
        dummy.position.set(deco.x, GRASS_Y + 0.4, worldZ - 1 + p);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        decoFencePostMesh.setMatrixAt(fencePostIdx, dummy.matrix);
        fencePostIdx++;
      }
      if (fenceBarIdx < DECO_COUNT) {
        deco.fenceBarIdx = fenceBarIdx;
        dummy.position.set(deco.x, GRASS_Y + 0.6, worldZ);
        dummy.updateMatrix();
        decoFenceBarMesh.setMatrixAt(fenceBarIdx, dummy.matrix);
        fenceBarIdx++;
      }
    }
  }

  // Hide unused instances
  const hideInstance = (mesh, idx) => {
    dummy.position.set(0, -1000, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
  };
  for (let i = lampIdx; i < DECO_COUNT; i++) {
    hideInstance(decoPoleMesh, i);
    hideInstance(decoHeadMesh, i);
  }
  for (let i = poleIdx; i < DECO_COUNT; i++) {
    hideInstance(decoUtilityPoleMesh, i);
  }
  for (let i = fencePostIdx; i < DECO_COUNT * 3; i++) {
    hideInstance(decoFencePostMesh, i);
  }
  for (let i = fenceBarIdx; i < DECO_COUNT; i++) {
    hideInstance(decoFenceBarMesh, i);
  }

  decoPoleMesh.instanceMatrix.needsUpdate = true;
  decoHeadMesh.instanceMatrix.needsUpdate = true;
  decoUtilityPoleMesh.instanceMatrix.needsUpdate = true;
  decoFencePostMesh.instanceMatrix.needsUpdate = true;
  decoFenceBarMesh.instanceMatrix.needsUpdate = true;

  roadGroup.add(decoPoleMesh);
  roadGroup.add(decoHeadMesh);
  roadGroup.add(decoUtilityPoleMesh);
  roadGroup.add(decoFencePostMesh);
  roadGroup.add(decoFenceBarMesh);
}

/**
 * Update decorations: recycle old instances, reposition active ones.
 *
 * @param {object} params
 * @param {THREE.WebGLRenderer|null} params.renderer
 * @param {function(Array)} params.setTreesData
 * @param {function(Array)} params.setDecoData
 */
export function updateDecorations({ renderer, setTreesData, setDecoData }) {
  const scrollOffset = externalRefs.getScrollOffset();
  const roadSegments = externalRefs.getRoadSegments();

  // -- Reposition trees (InstancedMesh per-instance recycling) --
  if (trunkMesh && foliageMesh && treesData.length > 0) {
    const dummy = new THREE.Object3D();
    let needsTreeUpdate = false;

    for (let i = 0; i < treesData.length; i++) {
      const td = treesData[i];
      const worldZ = td.roadZ + scrollOffset;

      if (worldZ > RECYCLE_WORLD_Z + 20) {
        const lastSeg = roadSegments.length > 0 ? roadSegments[roadSegments.length - 1] : null;
        td.roadZ = lastSeg ? lastSeg.zStart - Math.random() * 200 : -200;
        td.side = Math.random() > 0.5 ? -1 : 1;
        td.distFromCenter = ROAD_VISUAL_WIDTH / 2 + 2 + Math.random() * 5;
        needsTreeUpdate = true;
      }

      const offset = getRoadOffsetAt(roadSegments, td.roadZ);
      td.x = offset.curveOffset + td.side * td.distFromCenter;

      dummy.position.set(td.x, GRASS_Y + td.trunkH / 2, td.roadZ + scrollOffset);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, td.trunkH, 1);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      for (let f = 0; f < td.foliageCount; f++) {
        const foliageIdx = td.foliageBaseIdx + f;
        dummy.position.set(td.x, GRASS_Y + td.trunkH + f * td.foliageH * 0.5, td.roadZ + scrollOffset);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(td.foliageR, td.foliageH, td.foliageR);
        dummy.updateMatrix();
        foliageMesh.setMatrixAt(foliageIdx, dummy.matrix);
      }
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;

    if (needsTreeUpdate && renderer) {
      renderer.shadowMap.needsUpdate = true;
    }

    setTreesData([...treesData]);
  }

  // -- Reposition decorations (InstancedMesh per-instance recycling) --
  if (decoPoleMesh && decoData.length > 0) {
    const dummy = new THREE.Object3D();
    let needsDecoUpdate = false;

    for (let i = 0; i < decoData.length; i++) {
      const deco = decoData[i];
      const worldZ = deco.roadZ + scrollOffset;

      if (worldZ > RECYCLE_WORLD_Z + 20) {
        const lastSeg = roadSegments.length > 0 ? roadSegments[roadSegments.length - 1] : null;
        deco.roadZ = lastSeg ? lastSeg.zStart - Math.random() * 240 : -240;
        deco.side = Math.random() > 0.5 ? -1 : 1;
        deco.distFromCenter = ROAD_VISUAL_WIDTH / 2 + 1.5 + Math.random() * 2;
        needsDecoUpdate = true;
      }

      const offset = getRoadOffsetAt(roadSegments, deco.roadZ);
      deco.x = offset.curveOffset + deco.side * deco.distFromCenter;
      const currentWorldZ = deco.roadZ + scrollOffset;

      if (deco.lampIdx >= 0) {
        dummy.position.set(deco.x, GRASS_Y + 1.5, currentWorldZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        decoPoleMesh.setMatrixAt(deco.lampIdx, dummy.matrix);

        dummy.position.set(deco.x, GRASS_Y + 3.2, currentWorldZ);
        dummy.updateMatrix();
        decoHeadMesh.setMatrixAt(deco.lampIdx, dummy.matrix);
      }

      if (deco.poleIdx >= 0) {
        dummy.position.set(deco.x, GRASS_Y + 2, currentWorldZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        decoUtilityPoleMesh.setMatrixAt(deco.poleIdx, dummy.matrix);
      }

      if (deco.fencePostBaseIdx >= 0) {
        for (let p = 0; p < 3; p++) {
          dummy.position.set(deco.x, GRASS_Y + 0.4, currentWorldZ - 1 + p);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          decoFencePostMesh.setMatrixAt(deco.fencePostBaseIdx + p, dummy.matrix);
        }
        if (deco.fenceBarIdx >= 0) {
          dummy.position.set(deco.x, GRASS_Y + 0.6, currentWorldZ);
          dummy.updateMatrix();
          decoFenceBarMesh.setMatrixAt(deco.fenceBarIdx, dummy.matrix);
        }
      }
    }

    decoPoleMesh.instanceMatrix.needsUpdate = true;
    decoHeadMesh.instanceMatrix.needsUpdate = true;
    decoUtilityPoleMesh.instanceMatrix.needsUpdate = true;
    decoFencePostMesh.instanceMatrix.needsUpdate = true;
    decoFenceBarMesh.instanceMatrix.needsUpdate = true;

    if (needsDecoUpdate && renderer) {
      renderer.shadowMap.needsUpdate = true;
    }

    setDecoData([...decoData]);
  }
}

/**
 * Clean up decoration state for restart.
 * @param {THREE.Group} roadGroup
 * @param {function(Array)} params.setTreesData
 * @param {function(Array)} params.setDecoData
 */
export function cleanupDecorationsForRestart({ roadGroup: group, setTreesData, setDecoData }) {
  // Only remove meshes from scene - do NOT dispose GPU resources
  // Resources will be disposed by disposeDecorations() during component destroy
  // Note: uses passed `group` parameter, NOT module-level roadGroup (which may be null in tests)
  if (trunkMesh) group.remove(trunkMesh);
  if (foliageMesh) group.remove(foliageMesh);
  if (decoPoleMesh) group.remove(decoPoleMesh);
  if (decoHeadMesh) group.remove(decoHeadMesh);
  if (decoUtilityPoleMesh) group.remove(decoUtilityPoleMesh);
  if (decoFencePostMesh) group.remove(decoFencePostMesh);
  if (decoFenceBarMesh) group.remove(decoFenceBarMesh);

  // Clear state arrays - geometries/materials kept for reuse during restart
  // They will be disposed by disposeDecorations() when component is destroyed

  // Null InstancedMesh references
  trunkMesh = null;
  foliageMesh = null;
  decoPoleMesh = null;
  decoHeadMesh = null;
  decoUtilityPoleMesh = null;
  decoFencePostMesh = null;
  decoFenceBarMesh = null;
  treesData = [];
  decoData = [];

  setTreesData([]);
  setDecoData([]);
}

/**
 * Dispose all decoration resources.
 */
export function disposeDecorations() {
  for (const g of disposables.geometries) {
    try { g.dispose(); } catch {}
  }
  disposables.geometries = [];

  for (const m of disposables.materials) {
    try { m.dispose(); } catch {}
  }
  disposables.materials = [];

  trunkMesh = null;
  foliageMesh = null;
  decoPoleMesh = null;
  decoHeadMesh = null;
  decoUtilityPoleMesh = null;
  decoFencePostMesh = null;
  decoFenceBarMesh = null;
  treesData = [];
  decoData = [];
  externalRefs = null;
}
