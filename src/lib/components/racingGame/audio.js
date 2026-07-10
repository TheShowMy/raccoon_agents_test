/**
 * Racing Game — Audio Engine Module
 *
 * Manages Web Audio API lifecycle for the racing game:
 * - AudioContext creation
 * - Engine hum (continuous sawtooth oscillator, pitch-modulated by speed)
 * - Wind noise (looped white noise through lowpass filter, gain modulated by speed)
 *
 * Reuses the low-level synthesis helpers from utils/racingGame/audio.js
 * and adds the scene-side coupling (speed-to-frequency mapping, update loop).
 */

/* ===================================================================
   Internal state
   =================================================================== */

/** @type {AudioContext|null} */
let audioCtx = null;

/** @type {{ oscillator: OscillatorNode, gain: GainNode }|null} */
let engineHum = null;

/** @type {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }|null} */
let windNoise = null;

/* ===================================================================
   Public API
   =================================================================== */

/**
 * Initialise the audio system.
 * Safe to call more than once — subsequent calls are no-ops.
 *
 * @returns {{ audioCtx, engineHum, windNoise }} handles for scene-side refs
 */
export function createAudioController() {
  if (audioCtx) {
    return { audioCtx, engineHum, windNoise };
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engineHum = startEngineHum(audioCtx);
    windNoise = createWindNoise(audioCtx);
  } catch (e) {
    console.warn('[AudioController] init error:', e);
  }
  return { audioCtx, engineHum, windNoise };
}

/**
 * Update engine hum frequency and wind noise based on current speed.
 * Call this every frame from the game loop.
 *
 * @param {number} speedMps - Current player speed in world units / second.
 */
export function updateAudioSpeed(speedMps) {
  if (!audioCtx) return;
  if (engineHum) {
    try {
      updateEngineHumFrequency(engineHum, speedMps);
    } catch (e) {
      // ignore
    }
  }
  if (windNoise) {
    try {
      updateWindNoiseFilter(windNoise, speedMps);
      updateWindNoiseGain(windNoise, speedMps);
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Stop the engine hum with a fade-out.
 *
 * @param {number} [fadeOut=0.5] - Fade-out duration in seconds.
 */
export function stopEngineHumAudio(fadeOut = 0.5) {
  if (engineHum && audioCtx) {
    try {
      stopEngineHum(engineHum, fadeOut);
    } catch (e) {
      console.warn('[AudioController] stopEngineHum error:', e);
    }
    engineHum = null;
  }
}

/**
 * Stop the wind noise with a fade-out.
 *
 * @param {number} [fadeOut=0.1] - Fade-out duration in seconds.
 */
export function stopWindNoiseAudio(fadeOut = 0.1) {
  if (windNoise) {
    try {
      stopWindNoise(windNoise, fadeOut);
    } catch (e) {
      console.warn('[AudioController] stopWindNoise error:', e);
    }
    windNoise = null;
  }
}

/**
 * Close the AudioContext.
 */
export function closeAudioContext() {
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch (e) {
      console.warn('[AudioController] close error:', e);
    }
    audioCtx = null;
    engineHum = null;
    windNoise = null;
  }
}

/**
 * Play a one-shot gameplay sound effect.
 *
 * @param {'laneSwitch'|'jump'|'collision'|'pickup'|'gameOver'} kind
 */
export function playSoundEffect(kind) {
  if (!audioCtx) return;
  try {
    switch (kind) {
      case 'laneSwitch': playLaneSwitchSound(audioCtx); break;
      case 'jump':       playJumpSound(audioCtx);       break;
      case 'collision':  playCollisionSound(audioCtx);  break;
      case 'pickup':     playPickupSound(audioCtx);     break;
      case 'gameOver':   playGameOverSound(audioCtx);   break;
    }
  } catch (e) {
    console.warn('[AudioController] playSoundEffect error:', e);
  }
}

/* ===================================================================
   Re-export synthesis helpers from utils (read-only pass-through)
   =================================================================== */

export {
  startEngineHum,
  stopEngineHum,
  updateEngineHumFrequency,
  createWindNoise,
  stopWindNoise,
  updateWindNoiseFilter,
  updateWindNoiseGain,
  playLaneSwitchSound,
  playJumpSound,
  playCollisionSound,
  playPickupSound,
  playGameOverSound,
} from '../../utils/racingGame/audio.js';
