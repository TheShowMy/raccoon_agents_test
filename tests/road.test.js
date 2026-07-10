/**
 * Unit tests for src/lib/components/racingGame/road.js
 *
 * Tests the road system module's exported constants, factory functions,
 * disposal logic, and integration with Three.js scene.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  ROAD_VISUAL_WIDTH,
  ROAD_TILE_HEIGHT,
  ROAD_SUBDIVISIONS,
  ROAD_COLOR,
  ROAD_SHOULDER_COLOR,
  LANE_LINE_COLOR,
  ROAD_TEXTURE_REPEAT_X,
  ROAD_TEXTURE_REPEAT_Z,
  SEGMENTS_AHEAD,
  CAMERA_RECYCLE_Z,
  RECYCLE_WORLD_Z,
  createShoulderMaterial,
  createSurfaceMaterial,
  createLaneLineMaterial,
  getShoulderMaterial,
  getSurfaceMaterial,
  disposeRoadMaterials,
} from '../src/lib/components/racingGame/road.js';

/* ===================================================================
   Constants
   =================================================================== */
describe('Constants — exported values', () => {
  it('ROAD_VISUAL_WIDTH equals LANE_COUNT * LANE_WIDTH * 1.6', () => {
    // LANE_COUNT = 3, LANE_WIDTH = 3.5 → 3 * 3.5 * 1.6 = 16.8
    expect(ROAD_VISUAL_WIDTH).toBeCloseTo(16.8, 1);
  });

  it('ROAD_TILE_HEIGHT is 0.2', () => {
    expect(ROAD_TILE_HEIGHT).toBe(0.2);
  });

  it('ROAD_SUBDIVISIONS is 6', () => {
    expect(ROAD_SUBDIVISIONS).toBe(6);
  });

  it('ROAD_COLOR is 0x8a9a8a', () => {
    expect(ROAD_COLOR).toBe(0x8a9a8a);
  });

  it('ROAD_SHOULDER_COLOR is 0x6a7a6a', () => {
    expect(ROAD_SHOULDER_COLOR).toBe(0x6a7a6a);
  });

  it('LANE_LINE_COLOR is 0xd8e8d8', () => {
    expect(LANE_LINE_COLOR).toBe(0xd8e8d8);
  });

  it('ROAD_TEXTURE_REPEAT_X is 4', () => {
    expect(ROAD_TEXTURE_REPEAT_X).toBe(4);
  });

  it('ROAD_TEXTURE_REPEAT_Z is 2', () => {
    expect(ROAD_TEXTURE_REPEAT_Z).toBe(2);
  });

  it('SEGMENTS_AHEAD is 40', () => {
    expect(SEGMENTS_AHEAD).toBe(40);
  });

  it('CAMERA_RECYCLE_Z is 12', () => {
    expect(CAMERA_RECYCLE_Z).toBe(12);
  });

  it('RECYCLE_WORLD_Z is 5', () => {
    expect(RECYCLE_WORLD_Z).toBe(5);
  });
});

/* ===================================================================
   Factory functions
   =================================================================== */
describe('Factory functions — return types and material types', () => {
  afterEach(() => {
    // Clean up shared materials between tests
    disposeRoadMaterials();
  });

  it('createShoulderMaterial returns a MeshLambertMaterial', () => {
    const mat = createShoulderMaterial();
    expect(mat).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('createShoulderMaterial returns material with correct color', () => {
    const mat = createShoulderMaterial();
    expect(mat.color.getHex()).toBe(ROAD_SHOULDER_COLOR);
  });

  it('createShoulderMaterial has fog enabled', () => {
    const mat = createShoulderMaterial();
    expect(mat.fog).toBe(true);
  });

  it('createLaneLineMaterial returns a MeshBasicMaterial', () => {
    const mat = createLaneLineMaterial();
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('createLaneLineMaterial returns material with correct color', () => {
    const mat = createLaneLineMaterial();
    expect(mat.color.getHex()).toBe(LANE_LINE_COLOR);
  });

  it('createSurfaceMaterial returns a MeshStandardMaterial', () => {
    // Mock asphalt textures
    const mockTextures = {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    };
    const mat = createSurfaceMaterial(mockTextures);
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('createSurfaceMaterial uses provided asphalt textures', () => {
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const roughnessMap = new THREE.Texture();
    const mockTextures = { map, normalMap, roughnessMap };
    const mat = createSurfaceMaterial(mockTextures);
    expect(mat.map).toBe(map);
    expect(mat.normalMap).toBe(normalMap);
    expect(mat.roughnessMap).toBe(roughnessMap);
  });

  it('createSurfaceMaterial has correct roughness', () => {
    const mockTextures = {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    };
    const mat = createSurfaceMaterial(mockTextures);
    expect(mat.roughness).toBe(0.85);
  });

  it('createSurfaceMaterial is double-sided', () => {
    const mockTextures = {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    };
    const mat = createSurfaceMaterial(mockTextures);
    expect(mat.side).toBe(THREE.DoubleSide);
  });
});

/* ===================================================================
   Singleton pattern — shared materials
   =================================================================== */
describe('Shared material singleton pattern', () => {
  afterEach(() => {
    disposeRoadMaterials();
  });

  it('createShoulderMaterial returns the same instance on multiple calls', () => {
    const mat1 = createShoulderMaterial();
    const mat2 = createShoulderMaterial();
    expect(mat1).toBe(mat2);
  });

  it('createSurfaceMaterial returns the same instance on multiple calls', () => {
    const mockTextures = {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    };
    const mat1 = createSurfaceMaterial(mockTextures);
    const mat2 = createSurfaceMaterial(mockTextures);
    expect(mat1).toBe(mat2);
  });

  it('getShoulderMaterial returns null before first creation', () => {
    // Ensure clean state
    disposeRoadMaterials();
    expect(getShoulderMaterial()).toBeNull();
  });

  it('getShoulderMaterial returns the shared instance after creation', () => {
    disposeRoadMaterials();
    const created = createShoulderMaterial();
    expect(getShoulderMaterial()).toBe(created);
  });

  it('getSurfaceMaterial returns null before first creation', () => {
    disposeRoadMaterials();
    expect(getSurfaceMaterial()).toBeNull();
  });

  it('getSurfaceMaterial returns the shared instance after creation', () => {
    disposeRoadMaterials();
    const mockTextures = {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    };
    const created = createSurfaceMaterial(mockTextures);
    expect(getSurfaceMaterial()).toBe(created);
  });
});

/* ===================================================================
   Disposal
   =================================================================== */
describe('disposeRoadMaterials — cleanup', () => {
  beforeEach(() => {
    disposeRoadMaterials();
  });

  it('disposeRoadMaterials sets shoulder material to null', () => {
    createShoulderMaterial();
    disposeRoadMaterials();
    expect(getShoulderMaterial()).toBeNull();
  });

  it('disposeRoadMaterials sets surface material to null', () => {
    const mockTextures = {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    };
    createSurfaceMaterial(mockTextures);
    disposeRoadMaterials();
    expect(getSurfaceMaterial()).toBeNull();
  });

  it('disposeRoadMaterials is idempotent (safe to call twice)', () => {
    createShoulderMaterial();
    expect(() => disposeRoadMaterials()).not.toThrow();
    expect(() => disposeRoadMaterials()).not.toThrow();
  });
});
