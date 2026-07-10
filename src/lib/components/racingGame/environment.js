/**
 * Environment module for RacingGameScene.
 * Extracts scene setup, lighting, sky, grass, mountains, and asphalt textures.
 */

import * as THREE from 'three';

// =============================================================================
// Constants (module-private)
// =============================================================================
const FOG_COLOR = 0x87CEEB;
const FOG_NEAR = 60;
const FOG_FAR = 250;

const AMBIENT_LIGHT_COLOR = 0x8899bb;
const AMBIENT_LIGHT_INTENSITY = 0.5;

const HEMISPHERE_SKY_COLOR = 0x87CEEB;
const HEMISPHERE_GROUND_COLOR = 0x3a5a3a;
const HEMISPHERE_INTENSITY = 0.6;

const DIRECTIONAL_LIGHT_COLOR = 0xffeedd;
const DIRECTIONAL_LIGHT_INTENSITY = 1.0;
const DIRECTIONAL_LIGHT_POSITION = { x: 20, y: 30, z: 10 };
const SHADOW_MAP_SIZE = 1024;
const SHADOW_CAMERA_D = 30;
const SHADOW_CAMERA_NEAR = 1;
const SHADOW_CAMERA_FAR = 60;

const FILL_LIGHT_COLOR = 0xaaaaee;
const FILL_LIGHT_INTENSITY = 0.3;
const FILL_LIGHT_POSITION = { x: -15, y: 10, z: -20 };

const MOUNTAIN_COUNT = 12;
const MOUNTAIN_MIN_HEIGHT = 8;
const MOUNTAIN_MAX_HEIGHT = 24; // 8 + 16
const MOUNTAIN_MIN_RADIUS = 5;
const MOUNTAIN_MAX_RADIUS = 15; // 5 + 10
const MOUNTAIN_COLOR = 0x6a8a6a;
const MOUNTAIN_MIN_DIST = 60;
const MOUNTAIN_MAX_DIST = 100; // 60 + 40
const MOUNTAIN_BASE_Y = -2;

const HILL_COUNT = 8;
const HILL_MIN_RADIUS = 15;
const HILL_MAX_RADIUS = 35; // 15 + 20
const HILL_COLOR = 0x7a9a7a;
const HILL_SIDE_MIN_DIST = 40;
const HILL_SIDE_MAX_DIST = 70; // 40 + 30

export const GRASS_Y = -3.2; // ROAD_Y(-1) - MAX_HEIGHT_DELTA(2) - 0.2
const GRASS_WIDTH = 600;
const GRASS_LENGTH = 4000;
const GRASS_COLOR = 0x4a7a3a;

const SKY_COLOR_HORIZON = '#a0c4e8';
const SKY_COLOR_MID = '#87CEEB';
const SKY_COLOR_PALE = '#b8d4e8';
const SKY_COLOR_WARM = '#f5e6d0';
const SKY_COLOR_SUNSET = '#ff9966';
const SKY_COLOR_DEEP = '#ff6600';
const SKY_SIZE = 512;
const SKY_SUN_X = 380;
const SKY_SUN_Y = 100;
const SKY_SUN_RADIUS = 25;
const SKY_SUN_GLOW_RADIUS = 80;

const ASPHALT_COLOR = '#7a7a7a';
const ASPHALT_NOISE_INTENSITY = 30;
const ASPHALT_NORMAL_PERTURB = 40;
const ASPHALT_ROUGHNESS_BASE = 180;
const ASPHALT_ROUGHNESS_RANGE = 40;
const ASPHALT_TEXTURE_SIZE = 256;

const CAMERA_FOV = 60;
const CAMERA_FAR = 300;
const CAMERA_POSITION = { x: 0, y: 6, z: 12 };
const CAMERA_LOOK_AT = { x: 0, y: 0, z: -10 };

const TONE_MAPPING = THREE.ACESFilmicToneMapping;
const TONE_MAPPING_EXPOSURE = 1.2;

// =============================================================================
// Disposables registry (module-private, shared)
// =============================================================================
const disposables = { geometries: [], materials: [], textures: [] };

// =============================================================================
// Factory functions
// =============================================================================

/**
 * Creates the lighting setup and adds lights to the scene.
 * @param {THREE.Scene} scene
 * @returns {object} Cleanup references if needed
 */
export function createLighting(scene) {
  const ambient = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(HEMISPHERE_SKY_COLOR, HEMISPHERE_GROUND_COLOR, HEMISPHERE_INTENSITY);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(DIRECTIONAL_LIGHT_COLOR, DIRECTIONAL_LIGHT_INTENSITY);
  dirLight.position.set(DIRECTIONAL_LIGHT_POSITION.x, DIRECTIONAL_LIGHT_POSITION.y, DIRECTIONAL_LIGHT_POSITION.z);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
  dirLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
  dirLight.shadow.camera.left = -SHADOW_CAMERA_D;
  dirLight.shadow.camera.right = SHADOW_CAMERA_D;
  dirLight.shadow.camera.top = SHADOW_CAMERA_D;
  dirLight.shadow.camera.bottom = -SHADOW_CAMERA_D;
  dirLight.shadow.camera.near = SHADOW_CAMERA_NEAR;
  dirLight.shadow.camera.far = SHADOW_CAMERA_FAR;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(FILL_LIGHT_COLOR, FILL_LIGHT_INTENSITY);
  fillLight.position.set(FILL_LIGHT_POSITION.x, FILL_LIGHT_POSITION.y, FILL_LIGHT_POSITION.z);
  scene.add(fillLight);

  return { ambient, hemi, dirLight, fillLight };
}

/**
 * Creates the procedural sky sphere and sets it as scene.background.
 * @param {THREE.Scene} scene
 * @returns {{ skyMesh: THREE.Mesh, texture: THREE.CanvasTexture }}
 */
export function createSky(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = SKY_SIZE;
  canvas.height = SKY_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('[RacingGame] Canvas 2D not supported, skipping sky creation');
    const dummyGeo = new THREE.SphereGeometry(150, 32, 32);
    disposables.geometries.push(dummyGeo);
    const dummyMat = new THREE.MeshBasicMaterial({ color: FOG_COLOR, side: THREE.BackSide });
    disposables.materials.push(dummyMat);
    const skyMesh = new THREE.Mesh(dummyGeo, dummyMat);
    skyMesh.renderOrder = -1;
    return { skyMesh, texture: null };
  }

  // Gradient from horizon to zenith
  const gradient = ctx.createLinearGradient(0, 0, 0, SKY_SIZE);
  gradient.addColorStop(0, SKY_COLOR_HORIZON);
  gradient.addColorStop(0.3, SKY_COLOR_MID);
  gradient.addColorStop(0.5, SKY_COLOR_PALE);
  gradient.addColorStop(0.7, SKY_COLOR_WARM);
  gradient.addColorStop(0.85, SKY_COLOR_SUNSET);
  gradient.addColorStop(1.0, SKY_COLOR_DEEP);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SKY_SIZE, SKY_SIZE);

  // Sun glow
  const sunGlow = ctx.createRadialGradient(SKY_SUN_X, SKY_SUN_Y, 0, SKY_SUN_X, SKY_SUN_Y, SKY_SUN_GLOW_RADIUS);
  sunGlow.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
  sunGlow.addColorStop(0.2, 'rgba(255, 220, 150, 0.6)');
  sunGlow.addColorStop(0.5, 'rgba(255, 180, 100, 0.2)');
  sunGlow.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, SKY_SIZE, SKY_SIZE);

  // Sun disc
  ctx.beginPath();
  ctx.arc(SKY_SUN_X, SKY_SUN_Y, SKY_SUN_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 230, 1)';
  ctx.fill();

  // Helper to draw cloud
  const drawCloud = (cx, cy, r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - r * 0.6, cy + r * 0.2, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.5, cy + r * 0.3, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  };

  drawCloud(120, 150, 30);
  drawCloud(200, 200, 25);
  drawCloud(280, 170, 35);
  drawCloud(350, 220, 20);
  drawCloud(80, 250, 22);
  drawCloud(450, 180, 28);
  drawCloud(160, 280, 18);
  drawCloud(320, 260, 24);

  const skyTexture = new THREE.CanvasTexture(canvas);
  skyTexture.wrapS = THREE.RepeatWrapping;
  skyTexture.wrapT = THREE.ClampToEdgeWrapping;
  disposables.textures.push(skyTexture);

  // Set sky texture as scene background (matches original behavior)
  scene.background = skyTexture;

  // Sky sphere (depth sphere for fog interaction)
  const skyGeo = new THREE.SphereGeometry(150, 32, 32);
  disposables.geometries.push(skyGeo);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    fog: false,
  });
  disposables.materials.push(skyMat);
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.renderOrder = -1; // Render behind everything

  return { skyMesh, texture: skyTexture };
}

/**
 * Creates grass/ground plane.
 * @param {THREE.Group} parentGroup - Group to add the grass to
 * @returns {{ mesh: THREE.Mesh, geometry: THREE.PlaneGeometry, material: THREE.MeshPhongMaterial }}
 */
export function createGrass(parentGroup) {
  const grassMaterial = new THREE.MeshPhongMaterial({
    color: GRASS_COLOR,
    flatShading: true,
    fog: true,
  });
  disposables.materials.push(grassMaterial);

  const grassGeometry = new THREE.PlaneGeometry(GRASS_WIDTH, GRASS_LENGTH);
  disposables.geometries.push(grassGeometry);

  const grass = new THREE.Mesh(grassGeometry, grassMaterial);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = GRASS_Y;
  grass.receiveShadow = true;
  parentGroup.add(grass);

  return { mesh: grass, geometry: grassGeometry, material: grassMaterial };
}

/**
 * Creates background scenery: mountains and hills using InstancedMesh.
 * @param {THREE.Group} parentGroup - Group to add scenery to
 * @returns {{ mountains: THREE.InstancedMesh, hills: THREE.InstancedMesh }}
 */
export function createMountains(parentGroup) {
  const mountainGeo = new THREE.ConeGeometry(1, 1, 6);
  disposables.geometries.push(mountainGeo);
  const mountainMat = new THREE.MeshLambertMaterial({
    color: MOUNTAIN_COLOR,
    flatShading: true,
    fog: true,
  });
  disposables.materials.push(mountainMat);

  const mountainMesh = new THREE.InstancedMesh(mountainGeo, mountainMat, MOUNTAIN_COUNT);
  const mountainDummy = new THREE.Object3D();

  for (let i = 0; i < MOUNTAIN_COUNT; i++) {
    const height = MOUNTAIN_MIN_HEIGHT + Math.random() * (MOUNTAIN_MAX_HEIGHT - MOUNTAIN_MIN_HEIGHT);
    const radius = MOUNTAIN_MIN_RADIUS + Math.random() * (MOUNTAIN_MAX_RADIUS - MOUNTAIN_MIN_RADIUS);
    const angle = Math.random() * Math.PI * 2;
    const dist = MOUNTAIN_MIN_DIST + Math.random() * (MOUNTAIN_MAX_DIST - MOUNTAIN_MIN_DIST);
    const scaleX = 0.8 + Math.random() * 0.6;

    mountainDummy.position.set(
      Math.cos(angle) * dist,
      MOUNTAIN_BASE_Y + height / 2,
      -30 - Math.random() * 50
    );
    mountainDummy.rotation.set(0, Math.random() * Math.PI, 0);
    mountainDummy.scale.set(radius * scaleX, height, radius);
    mountainDummy.updateMatrix();
    mountainMesh.setMatrixAt(i, mountainDummy.matrix);
  }
  mountainMesh.instanceMatrix.needsUpdate = true;
  parentGroup.add(mountainMesh);

  // Hills
  const hillGeo = new THREE.SphereGeometry(1, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  disposables.geometries.push(hillGeo);
  const hillMat = new THREE.MeshLambertMaterial({
    color: HILL_COLOR,
    flatShading: true,
    fog: true,
  });
  disposables.materials.push(hillMat);

  const hillMesh = new THREE.InstancedMesh(hillGeo, hillMat, HILL_COUNT);
  const hillDummy = new THREE.Object3D();

  for (let i = 0; i < HILL_COUNT; i++) {
    const radius = HILL_MIN_RADIUS + Math.random() * (HILL_MAX_RADIUS - HILL_MIN_RADIUS);
    const side = Math.random() > 0.5 ? -1 : 1;
    const dist = HILL_SIDE_MIN_DIST + Math.random() * (HILL_SIDE_MAX_DIST - HILL_SIDE_MIN_DIST);

    hillDummy.position.set(
      dist * side,
      MOUNTAIN_BASE_Y,
      -20 - Math.random() * 40
    );
    hillDummy.rotation.set(0, 0, 0);
    hillDummy.scale.set(radius, radius, radius);
    hillDummy.updateMatrix();
    hillMesh.setMatrixAt(i, hillDummy.matrix);
  }
  hillMesh.instanceMatrix.needsUpdate = true;
  parentGroup.add(hillMesh);

  return { mountains: mountainMesh, hills: hillMesh };
}

/**
 * Creates procedural asphalt textures (color map, normal map, roughness map).
 * @param {number} repeatX
 * @param {number} repeatZ
 * @returns {{ map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture }}
 */
export function createAsphaltTextures(repeatX = 4, repeatZ = 2) {
  const textureSize = ASPHALT_TEXTURE_SIZE;

  // Color map
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = textureSize;
  colorCanvas.height = textureSize;
  const colorCtx = colorCanvas.getContext('2d');

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.wrapS = THREE.RepeatWrapping;
  colorTexture.wrapT = THREE.RepeatWrapping;
  colorTexture.repeat.set(repeatX, repeatZ);
  colorTexture.needsUpdate = true;

  if (colorCtx) {
    colorCtx.fillStyle = ASPHALT_COLOR;
    colorCtx.fillRect(0, 0, textureSize, textureSize);

    const imageData = colorCtx.getImageData(0, 0, textureSize, textureSize);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * ASPHALT_NOISE_INTENSITY;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    colorCtx.putImageData(imageData, 0, 0);
  }

  // Normal map
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = textureSize;
  normalCanvas.height = textureSize;
  const normalCtx = normalCanvas.getContext('2d');

  const normalTexture = new THREE.CanvasTexture(normalCanvas);
  normalTexture.wrapS = THREE.RepeatWrapping;
  normalTexture.wrapT = THREE.RepeatWrapping;
  normalTexture.repeat.set(repeatX, repeatZ);
  normalTexture.needsUpdate = true;

  if (normalCtx) {
    normalCtx.fillStyle = 'rgb(128, 128, 255)';
    normalCtx.fillRect(0, 0, textureSize, textureSize);

    const normalImageData = normalCtx.getImageData(0, 0, textureSize, textureSize);
    const normalData = normalImageData.data;
    for (let i = 0; i < normalData.length; i += 4) {
      const perturb = (Math.random() - 0.5) * ASPHALT_NORMAL_PERTURB;
      normalData[i] = Math.max(0, Math.min(255, 128 + perturb));
      normalData[i + 1] = Math.max(0, Math.min(255, 128 + perturb));
    }
    normalCtx.putImageData(normalImageData, 0, 0);
  }

  // Roughness map
  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = textureSize;
  roughnessCanvas.height = textureSize;
  const roughnessCtx = roughnessCanvas.getContext('2d');

  const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
  roughnessTexture.wrapS = THREE.RepeatWrapping;
  roughnessTexture.wrapT = THREE.RepeatWrapping;
  roughnessTexture.repeat.set(repeatX, repeatZ);
  roughnessTexture.needsUpdate = true;

  if (roughnessCtx) {
    const roughnessImageData = roughnessCtx.createImageData(textureSize, textureSize);
    const roughnessData = roughnessImageData.data;
    for (let i = 0; i < roughnessData.length; i += 4) {
      const roughness = ASPHALT_ROUGHNESS_BASE + Math.random() * ASPHALT_ROUGHNESS_RANGE;
      roughnessData[i] = roughness;
      roughnessData[i + 1] = roughness;
      roughnessData[i + 2] = roughness;
      roughnessData[i + 3] = 255;
    }
    roughnessCtx.putImageData(roughnessImageData, 0, 0);
  }

  disposables.textures.push(colorTexture, normalTexture, roughnessTexture);

  return { map: colorTexture, normalMap: normalTexture, roughnessMap: roughnessTexture };
}

// =============================================================================
// Main factory
// =============================================================================

/**
 * Creates and initialises the Three.js scene, camera, renderer, and
 * environment (sky, lighting, grass, mountains).
 *
 * @param {object} options
 * @param {HTMLDivElement} options.containerEl - DOM container element
 * @returns {Promise<{
 *   scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   staticGroup: THREE.Group,
 *   grassGroup: THREE.Group,
 *   grassMesh: THREE.Mesh,
 *   grassGeometry: THREE.PlaneGeometry,
 *   grassMaterial: THREE.MeshPhongMaterial,
 *   dispose: function,
 *   onWebGLError: function
 * }>}
 */
export async function createEnvironment({ containerEl }) {
  const container = containerEl;
  const rect = container.getBoundingClientRect();
  const w = rect.width || 800;
  const h = rect.height || 500;

  // Renderer (create first so we can bail out before scene/camera if WebGL fails)
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    console.warn('[RacingGame] WebGL not supported:', e);
    return {
      scene: null,
      camera: null,
      renderer: null,
      staticGroup: null,
      grassGroup: null,
      grassMesh: null,
      grassGeometry: null,
      grassMaterial: null,
      onWebGLError: () => {},
      dispose: () => {},
    };
  }

  // Scene (only after renderer succeeds)
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  // Camera
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, w / h, 0.1, CAMERA_FAR);
  camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
  camera.lookAt(CAMERA_LOOK_AT.x, CAMERA_LOOK_AT.y, CAMERA_LOOK_AT.z);

  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = TONE_MAPPING;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  container.appendChild(renderer.domElement);

  // Lighting
  createLighting(scene);

  // Static group for scenery (mountains, hills, sky sphere)
  const staticGroup = new THREE.Group();
  staticGroup.frustumCulled = true;
  scene.add(staticGroup);

  // Sky sphere
  const { skyMesh } = createSky(scene);
  staticGroup.add(skyMesh);

  // Mountains and hills
  createMountains(staticGroup);

  // Grass group (separate so it can be positioned independently)
  const grassGroup = new THREE.Group();
  grassGroup.position.z = 0;
  staticGroup.add(grassGroup);

  const { mesh: grassMesh, geometry: grassGeometry, material: grassMaterial } = createGrass(grassGroup);

  // Cleanup function
  function dispose() {
    // Remove groups from scene first
    if (scene && grassGroup) {
      scene.remove(grassGroup);
    }
    if (scene && staticGroup) {
      scene.remove(staticGroup);
    }
    // Remove grass mesh from its group
    if (grassGroup && grassMesh) {
      grassGroup.remove(grassMesh);
      grassMesh = null;
    }
    // Dispose sky mesh itself
    if (skyMesh) {
      staticGroup.remove(skyMesh);
      skyMesh.geometry.dispose();
      skyMesh.material.dispose();
      skyMesh = null;
    }
    // Note: grassGeometry and grassMaterial are already in disposables arrays
    // (added by createGrass), so they'll be disposed in the loops below.
    for (const geo of disposables.geometries) {
      try { geo.dispose(); } catch {}
    }
    disposables.geometries = [];
    for (const mat of disposables.materials) {
      try { mat.dispose(); } catch {}
    }
    disposables.materials = [];
    for (const tex of disposables.textures) {
      try { tex.dispose(); } catch {}
    }
    disposables.textures = [];
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
  }

  return {
    scene,
    camera,
    renderer,
    staticGroup,
    grassGroup,
    grassMesh,
    grassGeometry,
    grassMaterial,
    dispose,
    onWebGLError: () => {},
  };
}
