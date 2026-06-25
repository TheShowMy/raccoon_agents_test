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
