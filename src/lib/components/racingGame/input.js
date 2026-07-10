/**
 * Racing Game — Input Controller Module
 *
 * Encapsulates keyboard event handling, lane switching, and jump input
 * for the racing game. All key bindings (A/D, Arrow keys, Space, Enter)
 * are preserved exactly as in the original implementation.
 */

import {
  createAudioController,
} from './audio.js';

/* ===================================================================
   Input constants
   =================================================================== */

/** How long a lane switch takes in seconds (mirrors playerVehicle.js) */
export const LANE_SWITCH_DURATION = 0.18;

/* ===================================================================
   Public API factory
   =================================================================== */

/**
 * Create the input controller.
 *
 * @param {object} params
 * @param {Function} params.onLaneLeft  - called when player presses A / ArrowLeft
 * @param {Function} params.onLaneRight - called when player presses D / ArrowRight
 * @param {Function} params.onJump      - called when player presses Space / ArrowUp
 * @param {Function} params.onEnter     - called when player presses Enter (start game)
 * @returns {{ onKeyDown, onKeyUp, dispose }}
 */
export function createInputController({ onLaneLeft, onLaneRight, onJump, onEnter }) {
  /** @type {AudioContext|null} */
  let audioCtx = null;

  /* ===================================================================
     Key down handler
     =================================================================== */
  function onKeyDown(e) {
    // Prevent default for game keys in menu
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }

    // Enter key: start game from menu
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
      return;
    }

    // Initialise audio on first key interaction
    if (!audioCtx) {
      const handles = createAudioController();
      audioCtx = handles.audioCtx;
    }

    // Jump input
    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      onJump();
    }

    // Lane switch input
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      onLaneLeft();
    } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      onLaneRight();
    }
  }

  /* ===================================================================
     Key up handler
     =================================================================== */
  function onKeyUp(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }
  }

  /* ===================================================================
     Cleanup
     =================================================================== */
  function dispose() {
    audioCtx = null;
  }

  return { onKeyDown, onKeyUp, dispose };
}
