/**
 * Racing Game — Disposal Module
 *
 * Encapsulates all resource cleanup that runs in onDestroy.
 * Called once when the RacingGameScene component is unmounted.
 * All Three.js geometries, materials, textures, audio handles,
 * and DOM observers are released here to prevent memory leaks.
 */

import { stopEngineHumAudio, stopWindNoiseAudio, closeAudioContext } from './audio.js';

/* ===================================================================
   Public API factory
   =================================================================== */

/**
 * Create the disposal controller.
 *
 * @param {object} params
 * @param {Function} params.cancelAnimation    - cancel the RAF loop
 * @param {Function} params.removeKeyListeners - unregister keydown/keyup
 * @param {Function} params.disconnectResize   - disconnect ResizeObserver
 * @param {object} params.modules - All scene-level module APIs
 * @param {object} params.modules.environment  - { dispose }
 * @param {object} params.modules.road          - { disposeRoadMaterials }
 * @param {object} params.modules.decorations   - { disposeDecorations }
 * @param {object} params.modules.vehicle       - { dispose }
 * @param {object} params.modules.worldObjects  - (none / cleanup handled via scene traversal)
 * @param {object} params.modules.effects       - { cleanup }
 * @param {object} params.modules.input         - { dispose }
 * @param {object} params.modules.hud           - (none)
 * @param {object} params.modules.gameLoop      - { _gameLoopAPI }
 * @param {object} params.state - Scene-level refs and handles
 * @param {Array}  params.state.disposables     - { geometries[], materials[], textures[] }
 * @param {Function} params.state.setScene      - set scene ref to null
 * @param {Function} params.state.setCamera    - set camera ref to null
 * @param {Function} params.state.setRenderer  - set renderer ref to null
 * @param {Function} params.state.setComposer  - set composer ref to null
 * @returns {{ dispose }}
 */
export function createDisposal({ cancelAnimation, removeKeyListeners, disconnectResize, modules, state }) {
  const {
    environment,
    road,
    decorations,
    vehicle,
    effects,
    input,
  } = modules;

  const {
    disposables,
    setScene,
    setCamera,
    setRenderer,
    setComposer,
  } = state;

  /* ===================================================================
     Core disposal routine
     =================================================================== */
  function dispose() {
    // 1. Cancel animation frame first to stop the loop
    cancelAnimation();

    // 2. Remove keyboard listeners
    removeKeyListeners();

    // 3. Disconnect ResizeObserver
    disconnectResize();

    // 4. Stop audio
    try { stopEngineHumAudio(0.2); } catch {}
    try { stopWindNoiseAudio(0.2); } catch {}
    try { closeAudioContext(); } catch {}

    // 5. Dispose input module
    if (input && input.dispose) {
      try { input.dispose(); } catch {}
    }

    // 6. Dispose effects
    if (effects && effects.cleanup) {
      try { effects.cleanup(); } catch {}
    }

    // 7. Dispose vehicle
    if (vehicle && vehicle.dispose) {
      try { vehicle.dispose(); } catch {}
    }

    // 8. Dispose environment resources (sky sphere, grass plane, shared textures)
    //    Called first so environment-owned resources are released before scene traversal
    if (environment && environment.dispose) {
      try { environment.dispose(); } catch {}
    }

    // 9. Dispose all Three.js resources from scene objects via traversal
    //    (road, vehicles, objects, etc.)
    const scene = state._scene;
    if (scene) {
      scene.traverse((obj) => {
        if (obj.isMesh || obj.isPoints) {
          try { obj.geometry.dispose(); } catch {}
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => { try { m.dispose(); } catch {} });
          } else if (obj.material) {
            try { obj.material.dispose(); } catch {}
          }
        }
      });
    }

    // 10. Dispose shared road materials
    if (road && road.disposeRoadMaterials) {
      try { road.disposeRoadMaterials(); } catch {}
    }

    // 11. Dispose decorations
    if (decorations && decorations.disposeDecorations) {
      try { decorations.disposeDecorations(); } catch {}
    }

    // 12. Dispose tracked geometries, materials, textures from disposables list
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

    // 13. Dispose post-processing composer
    if (state._composer) {
      try { state._composer.dispose(); } catch {}
      if (state._bloomPass) {
        try { state._bloomPass.dispose(); } catch {}
        state._bloomPass = null;
      }
      state._composer = null;
      setComposer(null);
    }

    // 14. Dispose renderer and remove its canvas from DOM
    if (state._renderer) {
      try { state._renderer.dispose(); } catch {}
      if (state._renderer.domElement && state._renderer.domElement.parentNode) {
        state._renderer.domElement.parentNode.removeChild(state._renderer.domElement);
      }
      state._renderer = null;
      setRenderer(null);
    }

    // 15. Null out scene/camera refs
    setScene(null);
    setCamera(null);

    // 16. Clear state arrays
    if (state._roadSegments) state._roadSegments = [];
    if (state._roadTileData) state._roadTileData = [];
    if (state._treesData) state._treesData = [];
    if (state._decoData) state._decoData = [];
  }

  return { dispose };
}

/* ===================================================================
   Re-export audio stop functions for external consumers
   =================================================================== */

export {
  stopEngineHumAudio,
  stopWindNoiseAudio,
  closeAudioContext,
} from './audio.js';
