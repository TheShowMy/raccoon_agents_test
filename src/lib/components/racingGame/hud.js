/**
 * Racing Game — HUD Module
 *
 * Encapsulates HUD display value updates (health, distance, score, speed)
 * and flash / warning visual feedback. Values are written back to
 * RacingGameScene.svelte reactive variables via callbacks to preserve
 * Svelte's reactivity without direct DOM access.
 */

/* ===================================================================
   Public API factory
   =================================================================== */

/**
 * Create the HUD controller.
 *
 * @param {object} params
 * @param {Function} params.setDisplayHealth    - write health to scene reactive var
 * @param {Function} params.setDisplayDistance  - write distance to scene reactive var
 * @param {Function} params.setDisplayScore     - write score to scene reactive var
 * @param {Function} params.setDisplaySpeed     - write speed (km/h) to scene reactive var
 * @param {Function} params.setShowOncomingWarning - write oncoming warning flag
 * @param {Function} params.setShowFlash        - write flash visibility flag
 * @param {Function} params.setFlashColor       - write flash color rgba string
 * @param {Function} params.setFlashKey          - write incremented flash key (for {#key} re-render)
 * @returns {{ updateDisplay, flashCollision, flashPickup, updateOncomingWarning }}
 */
export function createHud({
  setDisplayHealth,
  setDisplayDistance,
  setDisplayScore,
  setDisplaySpeed,
  setShowOncomingWarning,
  setShowFlash,
  setFlashColor,
  setFlashKey,
}) {
  /** Counter incremented on every flash to force {#key} re-render */
  let _flashKey = 0;

  /* ===================================================================
     Smooth display value updates
     =================================================================== */
  function updateDisplay({ health, distance, score, speedMps, dt }) {
    setDisplayHealth(health);
    setDisplayDistance(Math.floor(distance));
    setDisplayScore(score);
    // km/h from m/s
    setDisplaySpeed(Math.round(Math.min(speedMps * 3.6, 180)));
  }

  /* ===================================================================
     Oncoming warning flag
     =================================================================== */
  function updateOncomingWarning(hasOncoming) {
    setShowOncomingWarning(hasOncoming);
  }

  /* ===================================================================
     Flash effects
     =================================================================== */
  function flashCollision() {
    _flashKey++;
    setFlashKey(_flashKey);
    // Two-step: first clear (force Svelte to re-evaluate {#key}), then set
    setShowFlash(false);
    setFlashColor('rgba(255, 60, 40, 0.35)');
    // Use setTimeout to allow Svelte to process the key change before showing
    setTimeout(() => setShowFlash(true), 0);
  }

  function flashPickup() {
    _flashKey++;
    setFlashKey(_flashKey);
    setShowFlash(false);
    setFlashColor('rgba(50, 255, 70, 0.25)');
    setTimeout(() => setShowFlash(true), 0);
  }

  return {
    updateDisplay,
    updateOncomingWarning,
    flashCollision,
    flashPickup,
  };
}
