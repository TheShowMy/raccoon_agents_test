/**
 * Update Three.js renderer and camera dimensions to match a container element.
 *
 * Reads the container's bounding rect, applies the dimensions to the camera
 * (aspect ratio + projection matrix) and the renderer (pixel ratio + size).
 *
 * @param {Element} container - The DOM element whose bounding rect provides dimensions.
 * @param {THREE.PerspectiveCamera} camera - The Three.js camera to update aspect ratio.
 * @param {THREE.WebGLRenderer} renderer - The Three.js renderer to resize.
 */
export function syncRendererSize(container, camera, renderer) {
  if (!container || !camera || !renderer) return;
  const rect = container.getBoundingClientRect();
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
}

/**
 * Map mouse client-space coordinates to play-area coordinates.
 *
 * A pure function that normalizes the mouse position relative to a container
 * rect, then maps the result into the game play area (x on the horizontal axis,
 * z on the depth axis). Both axes are clamped to the play-area boundaries.
 * Returns a neutral origin (0, 0) when the rect has zero or negative dimensions.
 *
 * @param {number} clientX - Mouse event clientX.
 * @param {number} clientY - Mouse event clientY.
 * @param {DOMRect} rect - Container bounding rect (from getBoundingClientRect).
 * @param {number} playAreaWidth - Total width of the play area in world units.
 * @param {number} zRange - Total range of the depth (z) axis in world units.
 * @returns {{ x: number, z: number }} Mapped and clamped play-area coordinates.
 */
export function mapMouseToPlayArea(clientX, clientY, rect, playAreaWidth, zRange) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { x: 0, z: 0 };
  }

  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;

  const halfW = playAreaWidth / 2;
  const halfZ = zRange / 2;

  let x = (nx - 0.5) * playAreaWidth;
  let z = (0.5 - ny) * zRange;

  // Clamp to play-area boundaries
  x = Math.max(-halfW, Math.min(halfW, x));
  z = Math.max(-halfZ, Math.min(halfZ, z));

  return { x, z };
}
