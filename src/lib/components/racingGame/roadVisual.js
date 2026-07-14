/**
 * Road System Module for RacingGameScene.
 *
 * Extracts road tile generation, visual rendering, and recycling logic
 * from RacingGameScene.svelte into a self-contained module.
 */

import * as THREE from 'three';
import {
  LANE_COUNT,
  LANE_WIDTH,
  SEGMENT_LENGTH,
  generateSegment,
  generateSegments,
  getRoadOffsetAt,
  ROAD_Y,
} from '../../utils/racingGame/index.js';

/* ===================================================================
   Module-level state (owned externally, accessed via externalRefs)
   =================================================================== */

/**
 * @typedef {Object} RoadExternalRefs
 * @property {THREE.Group} roadGroup
 * @property {Array} roadSegments
 * @property {Array} roadTileData
 * @property {number} scrollOffset
 * @property {THREE.Material|null} shoulderMaterial
 * @property {THREE.Material|null} surfaceMaterial
 * @property {THREE.WebGLRenderer|null} renderer
 * @property {function(): Array} getRoadSegments
 * @property {function(Array)} setRoadSegments
 * @property {function(): number} getScrollOffset
 * @property {function(number)} setScrollOffset
 */

/** @type {RoadExternalRefs|null} */
let refs = null;

/* ===================================================================
   Constants (road geometry / visual parameters)
   =================================================================== */

export const ROAD_VISUAL_WIDTH = LANE_COUNT * LANE_WIDTH * 1.6;
export const ROAD_TILE_HEIGHT = 0.2;
export const ROAD_SUBDIVISIONS = 6;
export const ROAD_COLOR = 0x8a9a8a;
export const ROAD_SHOULDER_COLOR = 0x6a7a6a;
export const LANE_LINE_COLOR = 0xd8e8d8;
export const ROAD_TEXTURE_REPEAT_X = 4;
export const ROAD_TEXTURE_REPEAT_Z = 2;
export const SEGMENTS_AHEAD = 40;
export const CAMERA_RECYCLE_Z = 12;

/** Objects with worldZ > this are recycled (behind the player) */
export const RECYCLE_WORLD_Z = 5;

/* ===================================================================
   Shared materials (created once, disposed once)
   =================================================================== */

/** @type {THREE.Material|null} */
let shoulderMaterial = null;
/** @type {THREE.Material|null} */
let surfaceMaterial = null;

/* ===================================================================
   Factory functions
   =================================================================== */

/**
 * Creates the shared shoulder material.
 * @returns {THREE.Material}
 */
export function createShoulderMaterial() {
  if (!shoulderMaterial) {
    shoulderMaterial = new THREE.MeshLambertMaterial({
      color: ROAD_SHOULDER_COLOR,
      fog: true,
    });
  }
  return shoulderMaterial;
}

/**
 * Creates the shared surface material with asphalt textures.
 * @param {object} asphaltTextures
 * @returns {THREE.Material}
 */
export function createSurfaceMaterial(asphaltTextures) {
  if (!surfaceMaterial) {
    surfaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a5a5a,
      map: asphaltTextures.map,
      normalMap: asphaltTextures.normalMap,
      roughnessMap: asphaltTextures.roughnessMap,
      roughness: 0.85,
      metalness: 0.0,
      flatShading: false,
      side: THREE.DoubleSide,
      fog: true,
    });
  }
  return surfaceMaterial;
}

/**
 * Creates lane line material.
 * @returns {THREE.Material}
 */
export function createLaneLineMaterial() {
  return new THREE.MeshBasicMaterial({ color: LANE_LINE_COLOR, fog: true });
}

/* ===================================================================
   Core API
   =================================================================== */

/**
 * Initialise the road system and generate initial road segments.
 *
 * @param {object} params
 * @param {THREE.Scene} params.scene
 * @param {THREE.Group} params.roadGroup
 * @param {object} params.asphaltTextures
 * @param {RoadExternalRefs} params.externalRefs
 */
export function createRoadSystem({ scene, roadGroup, asphaltTextures, externalRefs }) {
  refs = externalRefs;

  // Initialise shared materials
  const shoulderMat = createShoulderMaterial();
  const surfaceMat = createSurfaceMaterial(asphaltTextures);

  // Generate initial road segments (ahead of player, in road-space)
  const initialSegments = generateSegments(0, SEGMENTS_AHEAD);
  refs.setRoadSegments(initialSegments);

  // Create visuals for each segment
  for (const seg of initialSegments) {
    createContinuousRoadSegment(seg, asphaltTextures);
  }
}

/**
 * Create continuous smooth road geometry for a single road segment.
 * Uses a custom BufferGeometry with vertices sampled from the Perlin noise
 * centre‑line at multiple Z positions, ensuring seamless connection with
 * adjacent segments.
 *
 * @param {object} segment
 * @param {object} asphaltTextures
 */
export function createContinuousRoadSegment(segment, asphaltTextures) {
  const zStart = segment.zStart;
  const step = segment.length / ROAD_SUBDIVISIONS;
  const rows = ROAD_SUBDIVISIONS + 1;
  const halfW = ROAD_VISUAL_WIDTH / 2;

  const data = { segment, surface: null, lines: [], shoulders: [], spawned: false, lineMat: null };

  // ---- Road surface ----
  const surfacePositions = [];
  const surfaceIndices = [];

  for (let i = 0; i < rows; i++) {
    const z = zStart - i * step;
    const offset = getRoadOffsetAt(refs.getRoadSegments(), z);
    surfacePositions.push(offset.curveOffset - halfW, offset.heightOffset, z);
    surfacePositions.push(offset.curveOffset + halfW, offset.heightOffset, z);
  }

  for (let i = 0; i < ROAD_SUBDIVISIONS; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    surfaceIndices.push(a, c, b, b, c, d);
  }

  const surfaceGeo = new THREE.BufferGeometry();
  surfaceGeo.setAttribute('position', new THREE.Float32BufferAttribute(surfacePositions, 3));
  surfaceGeo.setIndex(surfaceIndices);
  surfaceGeo.computeVertexNormals();

  const surfaceMat = surfaceMaterial;
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.position.set(0, ROAD_Y, 0);
  surface.receiveShadow = true;
  surface.castShadow = true;
  refs.roadGroup.add(surface);
  data.surface = surface;

  // ---- Lane divider lines (dashed) ----
  const lineMat = createLaneLineMaterial();
  data.lineMat = lineMat;
  const lineHalfW = 0.075;
  const DASH_PATTERN_SUBDIVS = 3;
  const DASH_LENGTH_SUBDIVS = 2;

  for (let li = 0; li < LANE_COUNT - 1; li++) {
    const lineCenterX = (li - (LANE_COUNT - 2) / 2) * LANE_WIDTH;
    let dashPositions = [];
    let dashIndices = [];

    const flushDash = () => {
      if (dashIndices.length === 0) {
        dashPositions = [];
        dashIndices = [];
        return;
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(dashPositions, 3),
      );
      lineGeo.setIndex(dashIndices);
      lineGeo.computeVertexNormals();

      const lineMesh = new THREE.Mesh(lineGeo, lineMat);
      lineMesh.position.set(0, ROAD_Y, 0);
      refs.roadGroup.add(lineMesh);
      data.lines.push(lineMesh);
      dashPositions = [];
      dashIndices = [];
    };

    for (let i = 0; i < rows; i++) {
      const z = zStart - i * step;
      const offset = getRoadOffsetAt(refs.getRoadSegments(), z);
      const cx = offset.curveOffset;
      const cy = offset.heightOffset;
      const inDash = (i % DASH_PATTERN_SUBDIVS) < DASH_LENGTH_SUBDIVS;

      if (inDash) {
        const v0 = dashPositions.length / 3;
        dashPositions.push(cx + lineCenterX - lineHalfW, cy + 0.12, z);
        dashPositions.push(cx + lineCenterX + lineHalfW, cy + 0.12, z);
        if (v0 >= 2) {
          const a = v0 - 2;
          const b = v0 - 1;
          const c = v0;
          const d = v0 + 1;
          dashIndices.push(a, c, b, b, c, d);
        }
      } else {
        flushDash();
      }
    }

    flushDash();
  }

  // ---- Road shoulders ----
  const shoulderMat = shoulderMaterial;
  const shoulderHalfW = 0.3;

  for (let si = 0; si < 2; si++) {
    const side = si === 0 ? -1 : 1;
    const shoulderPositions = [];
    const shoulderIndices = [];

    for (let i = 0; i < rows; i++) {
      const z = zStart - i * step;
      const offset = getRoadOffsetAt(refs.getRoadSegments(), z);
      const cx = offset.curveOffset;
      const cy = offset.heightOffset;

      const innerEdge = side * halfW - side * shoulderHalfW;
      const outerEdge = side * halfW + side * shoulderHalfW;
      shoulderPositions.push(cx + innerEdge, cy + 0.12, z);
      shoulderPositions.push(cx + outerEdge, cy + 0.12, z);
    }

    for (let i = 0; i < ROAD_SUBDIVISIONS; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      shoulderIndices.push(a, c, b, b, c, d);
    }

    const shoulderGeo = new THREE.BufferGeometry();
    shoulderGeo.setAttribute('position', new THREE.Float32BufferAttribute(shoulderPositions, 3));
    shoulderGeo.setIndex(shoulderIndices);
    shoulderGeo.computeVertexNormals();

    const shoulderMesh = new THREE.Mesh(shoulderGeo, shoulderMat);
    shoulderMesh.position.set(0, ROAD_Y, 0);
    refs.roadGroup.add(shoulderMesh);
    data.shoulders.push(shoulderMesh);
  }

  refs.roadTileData.push(data);
}

/**
 * Reposition all road tile visuals based on current scrollOffset.
 * @param {Array} roadTileData
 * @param {number} scrollOffset
 * @param {THREE.Group} grassGroup
 */
export function repositionRoadTiles(roadTileData, scrollOffset, grassGroup) {
  for (const data of roadTileData) {
    if (data.surface) {
      data.surface.position.z = scrollOffset;
    }
    for (const line of data.lines) {
      line.position.z = scrollOffset;
    }
    for (const s of data.shoulders) {
      s.position.z = scrollOffset;
    }
  }

  // Anchor the grass plane at world Z=0
  if (grassGroup) {
    grassGroup.position.z = 0;
  }
}

/**
 * Remove mesh visuals for a road tile segment.
 * @param {object} data
 * @param {THREE.Group} roadGroup
 * @param {THREE.Material|null} shoulderMat
 * @param {THREE.Material|null} surfaceMat
 */
export function removeTileVisuals(data, roadGroup, shoulderMat, surfaceMat) {
  const removeMesh = (mesh, skipMaterialDispose = false) => {
    if (!mesh) return;
    roadGroup.remove(mesh);
    if (mesh.isMesh || mesh.isPoints) {
      mesh.geometry.dispose();
      if (!skipMaterialDispose) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
    }
  };

  if (data.surface) removeMesh(data.surface, true);
  for (const line of data.lines) removeMesh(line);
  if (data.lineMat) {
    try { data.lineMat.dispose(); } catch {}
    data.lineMat = null;
  }
  for (const s of data.shoulders) removeMesh(s, true);
}

/**
 * Update road: recycle old segments, extend new ones ahead,
 * reposition all road tile visuals.
 *
 * @param {object} params
 * @param {Array} params.roadSegments
 * @param {Array} params.roadTileData
 * @param {number} params.scrollOffset
 * @param {object} params.asphaltTextures
 * @param {THREE.Group} params.roadGroup
 * @param {THREE.Group} params.grassGroup
 * @param {THREE.WebGLRenderer|null} params.renderer
 * @param {function(Array)} params.setRoadSegments
 * @param {function(number)} params.setScrollOffset
 * @param {function(Array)} params.setRoadTileData
 */
export function updateRoad({ roadSegments, roadTileData, scrollOffset, asphaltTextures, roadGroup, grassGroup, renderer, setRoadSegments, setScrollOffset, setRoadTileData }) {
  if (!roadGroup) return;

  // -- Recycle old segments that are fully past the camera --
  let newTileData = [...roadTileData];
  while (newTileData.length > 0) {
    const data = newTileData[0];
    const seg = data.segment;
    const roadFarZ = seg.zStart - seg.length;
    const worldZ = roadFarZ + scrollOffset;
    if (worldZ < CAMERA_RECYCLE_Z) break;

    roadSegments = roadSegments.slice(1);

    removeTileVisuals(data, roadGroup, shoulderMaterial, surfaceMaterial);
    newTileData = newTileData.slice(1);
  }

  // -- Extend new segments at the front (ahead) --
  let needNew = true;
  while (needNew) {
    const lastSeg = roadSegments.length > 0 ? roadSegments[roadSegments.length - 1] : null;
    const newRoadZ = lastSeg ? lastSeg.zStart - SEGMENT_LENGTH : -SEGMENT_LENGTH;
    const newWorldZ = newRoadZ + scrollOffset;
    if (newWorldZ < -260) {
      needNew = false;
      break;
    }

    const newSeg = generateSegment(newRoadZ);
    roadSegments = [...roadSegments, newSeg];
    createContinuousRoadSegment(newSeg, asphaltTextures);
  }

  // -- Reposition all road tiles --
  repositionRoadTiles(newTileData, scrollOffset, grassGroup);

  setRoadSegments(roadSegments);
  setRoadTileData(newTileData);
}

/**
 * Clean up road system state for restart (keep shared materials).
 * @param {object} params
 * @param {THREE.Group} params.roadGroup
 * @param {Array} params.roadTileData
 * @param {function(Array)} params.setRoadSegments
 * @param {function(Array)} params.setRoadTileData
 */
export function cleanupRoadForRestart({ roadGroup, roadTileData, setRoadSegments, setRoadTileData }) {
  // Only remove meshes from scene - do NOT dispose GPU resources
  // Shared materials (shoulderMaterial, surfaceMaterial) are kept alive for restart
  // GPU resources will be disposed by disposeRoadMaterials() during component destroy
  while (roadGroup.children.length > 0) {
    const child = roadGroup.children[0];
    roadGroup.remove(child);
  }
  setRoadTileData([]);
}

/* ===================================================================
   Getters / Setters for shared materials (disposal)
   =================================================================== */

/**
 * Get the shared shoulder material.
 * @returns {THREE.Material|null}
 */
export function getShoulderMaterial() {
  return shoulderMaterial;
}

/**
 * Get the shared surface material.
 * @returns {THREE.Material|null}
 */
export function getSurfaceMaterial() {
  return surfaceMaterial;
}

/**
 * Dispose shared road materials.
 * Call once during component destroy.
 */
export function disposeRoadMaterials() {
  if (shoulderMaterial) {
    try { shoulderMaterial.dispose(); } catch {}
    shoulderMaterial = null;
  }
  if (surfaceMaterial) {
    try { surfaceMaterial.dispose(); } catch {}
    surfaceMaterial = null;
  }
}
