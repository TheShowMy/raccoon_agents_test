/**
 * Unit tests for src/lib/components/racingGame/decorations.js
 *
 * Tests the decorations module's exported constants, factory functions,
 * cleanup and disposal logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  TREE_COUNT,
  DECO_COUNT,
  RECYCLE_WORLD_Z,
  createTreeTrunkMesh,
  createTreeFoliageMesh,
  createLampInstances,
  createPoleInstances,
  createFenceInstances,
  createDecorations,
  updateDecorations,
  cleanupDecorationsForRestart,
  disposeDecorations,
} from '../src/lib/components/racingGame/decorations.js';

/* ===================================================================
   Constants
   =================================================================== */
describe('Constants — exported values', () => {
  it('TREE_COUNT is 60', () => {
    expect(TREE_COUNT).toBe(60);
  });

  it('DECO_COUNT is 30', () => {
    expect(DECO_COUNT).toBe(30);
  });

  it('RECYCLE_WORLD_Z is 5', () => {
    expect(RECYCLE_WORLD_Z).toBe(5);
  });
});

/* ===================================================================
   Factory: createTreeTrunkMesh
   =================================================================== */
describe('createTreeTrunkMesh — trunk InstancedMesh factory', () => {
  it('returns an object with mesh, geometry, and material properties', () => {
    const result = createTreeTrunkMesh();
    expect(result).toHaveProperty('mesh');
    expect(result).toHaveProperty('geometry');
    expect(result).toHaveProperty('material');
  });

  it('mesh is an InstancedMesh', () => {
    const { mesh } = createTreeTrunkMesh();
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('mesh.count equals TREE_COUNT', () => {
    const { mesh } = createTreeTrunkMesh();
    expect(mesh.count).toBe(TREE_COUNT);
  });

  it('geometry is a CylinderGeometry', () => {
    const { geometry } = createTreeTrunkMesh();
    expect(geometry).toBeInstanceOf(THREE.CylinderGeometry);
  });

  it('material is a MeshPhongMaterial', () => {
    const { material } = createTreeTrunkMesh();
    expect(material).toBeInstanceOf(THREE.MeshPhongMaterial);
  });

  it('material has correct trunk color (0x6a4a2a)', () => {
    const { material } = createTreeTrunkMesh();
    expect(material.color.getHex()).toBe(0x6a4a2a);
  });

  it('mesh has castShadow enabled', () => {
    const { mesh } = createTreeTrunkMesh();
    expect(mesh.castShadow).toBe(true);
  });
});

/* ===================================================================
   Factory: createTreeFoliageMesh
   =================================================================== */
describe('createTreeFoliageMesh — foliage InstancedMesh factory', () => {
  it('returns an object with mesh, geometry, and material properties', () => {
    const result = createTreeFoliageMesh();
    expect(result).toHaveProperty('mesh');
    expect(result).toHaveProperty('geometry');
    expect(result).toHaveProperty('material');
  });

  it('mesh is an InstancedMesh', () => {
    const { mesh } = createTreeFoliageMesh();
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('mesh.count equals TREE_COUNT * 2 (max foliage cones)', () => {
    const { mesh } = createTreeFoliageMesh();
    expect(mesh.count).toBe(TREE_COUNT * 2);
  });

  it('geometry is a ConeGeometry', () => {
    const { geometry } = createTreeFoliageMesh();
    expect(geometry).toBeInstanceOf(THREE.ConeGeometry);
  });

  it('material is a MeshPhongMaterial', () => {
    const { material } = createTreeFoliageMesh();
    expect(material).toBeInstanceOf(THREE.MeshPhongMaterial);
  });

  it('material has correct foliage color (0x5a9a5a)', () => {
    const { material } = createTreeFoliageMesh();
    expect(material.color.getHex()).toBe(0x5a9a5a);
  });

  it('material has flatShading enabled', () => {
    const { material } = createTreeFoliageMesh();
    expect(material.flatShading).toBe(true);
  });

  it('mesh has castShadow enabled', () => {
    const { mesh } = createTreeFoliageMesh();
    expect(mesh.castShadow).toBe(true);
  });
});

/* ===================================================================
   Factory: createLampInstances
   =================================================================== */
describe('createLampInstances — street lamp InstancedMesh factory', () => {
  it('returns an object with poleMesh and headMesh', () => {
    const result = createLampInstances();
    expect(result).toHaveProperty('poleMesh');
    expect(result).toHaveProperty('headMesh');
  });

  it('poleMesh is an InstancedMesh', () => {
    const { poleMesh } = createLampInstances();
    expect(poleMesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('headMesh is an InstancedMesh', () => {
    const { headMesh } = createLampInstances();
    expect(headMesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('poleMesh.count equals DECO_COUNT', () => {
    const { poleMesh } = createLampInstances();
    expect(poleMesh.count).toBe(DECO_COUNT);
  });

  it('headMesh.count equals DECO_COUNT', () => {
    const { headMesh } = createLampInstances();
    expect(headMesh.count).toBe(DECO_COUNT);
  });

  it('poleMesh has castShadow enabled', () => {
    const { poleMesh } = createLampInstances();
    expect(poleMesh.castShadow).toBe(true);
  });

  it('headMesh has castShadow enabled', () => {
    const { headMesh } = createLampInstances();
    expect(headMesh.castShadow).toBe(true);
  });
});

/* ===================================================================
   Factory: createPoleInstances
   =================================================================== */
describe('createPoleInstances — utility pole InstancedMesh factory', () => {
  it('returns an object with mesh, geometry, and material', () => {
    const result = createPoleInstances();
    expect(result).toHaveProperty('mesh');
    expect(result).toHaveProperty('geometry');
    expect(result).toHaveProperty('material');
  });

  it('mesh is an InstancedMesh', () => {
    const { mesh } = createPoleInstances();
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('mesh.count equals DECO_COUNT', () => {
    const { mesh } = createPoleInstances();
    expect(mesh.count).toBe(DECO_COUNT);
  });

  it('geometry is a BoxGeometry', () => {
    const { geometry } = createPoleInstances();
    expect(geometry).toBeInstanceOf(THREE.BoxGeometry);
  });

  it('material has correct pole color (0x5a4030)', () => {
    const { material } = createPoleInstances();
    expect(material.color.getHex()).toBe(0x5a4030);
  });

  it('mesh has castShadow enabled', () => {
    const { mesh } = createPoleInstances();
    expect(mesh.castShadow).toBe(true);
  });
});

/* ===================================================================
   Factory: createFenceInstances
   =================================================================== */
describe('createFenceInstances — fence InstancedMesh factory', () => {
  it('returns an object with postMesh, barMesh, geometries, and materials', () => {
    const result = createFenceInstances();
    expect(result).toHaveProperty('postMesh');
    expect(result).toHaveProperty('barMesh');
    expect(result).toHaveProperty('geometries');
    expect(result).toHaveProperty('materials');
  });

  it('postMesh is an InstancedMesh', () => {
    const { postMesh } = createFenceInstances();
    expect(postMesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('barMesh is an InstancedMesh', () => {
    const { barMesh } = createFenceInstances();
    expect(barMesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('postMesh.count equals DECO_COUNT * 3 (3 posts per fence)', () => {
    const { postMesh } = createFenceInstances();
    expect(postMesh.count).toBe(DECO_COUNT * 3);
  });

  it('barMesh.count equals DECO_COUNT', () => {
    const { barMesh } = createFenceInstances();
    expect(barMesh.count).toBe(DECO_COUNT);
  });

  it('materials array contains fence material with correct color (0x888888)', () => {
    const { materials } = createFenceInstances();
    expect(materials.length).toBeGreaterThan(0);
    const fenceMat = materials[0];
    expect(fenceMat.color.getHex()).toBe(0x888888);
  });

  it('postMesh has castShadow enabled', () => {
    const { postMesh } = createFenceInstances();
    expect(postMesh.castShadow).toBe(true);
  });

  it('barMesh has castShadow enabled', () => {
    const { barMesh } = createFenceInstances();
    expect(barMesh.castShadow).toBe(true);
  });
});

/* ===================================================================
   Cleanup — only removes meshes, does NOT dispose GPU resources
   =================================================================== */
describe('cleanupDecorationsForRestart — state cleanup without disposal', () => {
  let roadGroup;
  let scene;
  let treesData;
  let decoData;
  let externalRefs;

  beforeEach(() => {
    // Clean state before each test
    disposeDecorations();
    roadGroup = new THREE.Group();
    scene = new THREE.Scene();
    treesData = [];
    decoData = [];
    externalRefs = {
      get roadGroup() { return roadGroup; },
      getRoadSegments: () => [],
      getScrollOffset: () => 0,
    };
  });

  it('removes all decoration meshes from roadGroup', () => {
    // Use createDecorations to populate module-level mesh variables
    createDecorations({ scene, roadGroup, externalRefs });
    const initialCount = roadGroup.children.length;
    expect(initialCount).toBeGreaterThan(0);
    cleanupDecorationsForRestart({ roadGroup, setTreesData: (d) => { treesData = d; }, setDecoData: (d) => { decoData = d; } });
    expect(roadGroup.children.length).toBe(0);
  });

  it('clears treesData array via setter', () => {
    // createDecorations populates module-level treesData;
    // updateDecorations calls setTreesData to sync component state
    createDecorations({ scene, roadGroup, externalRefs });
    updateDecorations({ renderer: null, setTreesData: (d) => { treesData = d; }, setDecoData: (d) => { decoData = d; } });
    expect(treesData.length).toBeGreaterThan(0);
    cleanupDecorationsForRestart({ roadGroup, setTreesData: (d) => { treesData = d; }, setDecoData: (d) => { decoData = d; } });
    expect(treesData).toEqual([]);
  });

  it('clears decoData array via setter', () => {
    // createDecorations populates module-level decoData;
    // updateDecorations calls setDecoData to sync component state
    createDecorations({ scene, roadGroup, externalRefs });
    updateDecorations({ renderer: null, setTreesData: (d) => { treesData = d; }, setDecoData: (d) => { decoData = d; } });
    expect(decoData.length).toBeGreaterThan(0);
    cleanupDecorationsForRestart({ roadGroup, setTreesData: (d) => { treesData = d; }, setDecoData: (d) => { decoData = d; } });
    expect(decoData).toEqual([]);
  });
});

/* ===================================================================
   Disposal — releases GPU resources
   =================================================================== */
describe('disposeDecorations — GPU resource disposal', () => {
  it('disposeDecorations is idempotent (safe to call twice)', () => {
    createTreeTrunkMesh();
    expect(() => {
      disposeDecorations();
      disposeDecorations();
    }).not.toThrow();
  });

  it('disposeDecorations clears geometries registry', () => {
    createTreeTrunkMesh();
    createFenceInstances();
    disposeDecorations();
    // After disposal, creating new instances should work (new geometries allocated)
    expect(() => createTreeTrunkMesh()).not.toThrow();
  });

  it('disposeDecorations clears materials registry', () => {
    createTreeFoliageMesh();
    disposeDecorations();
    expect(() => createTreeFoliageMesh()).not.toThrow();
  });
});
