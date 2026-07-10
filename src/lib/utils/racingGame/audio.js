/**
 * Racing Game — audio module
 *
 * Web Audio API-based sound synthesis functions for engine hum,
 * wind noise, and gameplay sound effects.
 */

/* ===================================================================
   Web Audio API — Synthesised sound effects
   =================================================================== */

/** Buffer time (seconds) added after the fade‑out ramp in stopEngineHum. */
export const ENGINE_HUM_STOP_BUFFER = 0.05;

/** Minimum engine hum frequency in Hz. */
export const ENGINE_HUM_FREQ_MIN = 80;

/** Maximum engine hum frequency in Hz (approached at high speed). */
export const ENGINE_HUM_FREQ_MAX = 400;

/**
 * Speed (world units / second) at which audio effects reach maximum intensity.
 * Shared by engine hum frequency and wind noise synthesis as a common
 * speed‑normalisation ceiling.
 */
export const AUDIO_SPEED_MAX = 50;

/** Smoothing time constant (seconds) for setTargetAtTime calls in audio update loops. */
export const AUDIO_SMOOTH_TIME = 0.05;

/** Startup frequency (Hz) for the engine hum oscillator — the ramp target during warm‑up. */
export const ENGINE_HUM_STARTUP_FREQ = 120;

/** Buffer time (seconds) added after the fade‑out ramp in stopWindNoise. */
export const WIND_NOISE_STOP_BUFFER = 0.05;

/** Minimum lowpass filter cutoff for wind noise (Hz, at idle speed). */
export const WIND_NOISE_FILTER_FREQ_MIN = 400;

/** Maximum lowpass filter cutoff for wind noise (Hz, at full speed). */
export const WIND_NOISE_FILTER_FREQ_MAX = 2000;

/** Maximum gain for wind noise at full speed. */
export const WIND_NOISE_GAIN_MAX = 0.15;

/** Shared oscillator / gain helper — creates and connects a one‑shot tone. */
function playTone(ctx, frequency, type, duration, volume = 0.3, rampDown = true) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/**
 * Start a continuous engine / driving background hum.
 *
 * Returns an object with `{ oscillator, gain }` that the caller can
 * manipulate (e.g. adjust frequency or volume) and must eventually stop.
 *
 * The oscillator begins at 80 Hz and performs a brief warm‑up ramp to
 * {@link ENGINE_HUM_STARTUP_FREQ}.  Call {@link updateEngineHumFrequency}
 * each frame to track the speed‑to‑frequency curve dynamically.
 *
 * @param {AudioContext} ctx - Web Audio API context.
 * @returns {{ oscillator: OscillatorNode, gain: GainNode }}
 */
export function startEngineHum(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  // Initial frequency at 80 Hz
  osc.frequency.setValueAtTime(ENGINE_HUM_FREQ_MIN, ctx.currentTime);
  // Brief warm‑up ramp to startup frequency
  osc.frequency.linearRampToValueAtTime(ENGINE_HUM_STARTUP_FREQ, ctx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  return { oscillator: osc, gain };
}

/**
 * Update the engine hum frequency based on current speed.
 *
 * Call this every frame (or whenever the player's speed changes) to
 * smoothly track the speed‑to‑frequency curve using a short smoothing
 * time constant to avoid discrete steps.
 *
 * @param {{ oscillator: OscillatorNode, gain: GainNode }} engine - Result from startEngineHum.
 * @param {number} speed - Current player speed in world units / second.
 */
export function updateEngineHumFrequency(engine, speed) {
  if (!engine || !engine.oscillator) return;
  const clamped = Math.max(0, speed);
  const ratio = Math.min(1, clamped / AUDIO_SPEED_MAX);
  const targetFreq = ENGINE_HUM_FREQ_MIN + ratio * (ENGINE_HUM_FREQ_MAX - ENGINE_HUM_FREQ_MIN);
  const t = engine.oscillator.context.currentTime;
  engine.oscillator.frequency.setTargetAtTime(targetFreq, t, AUDIO_SMOOTH_TIME);
}

/**
 * Stop the engine hum.
 *
 * @param {{ oscillator: OscillatorNode, gain: GainNode }} engine - Result from startEngineHum.
 * @param {number} [fadeOut=0.3] - Fade‑out duration in seconds.
 */
export function stopEngineHum(engine, fadeOut = 0.3) {
  if (!engine || !engine.oscillator || !engine.gain) return;
  const t = engine.oscillator.context?.currentTime ?? 0;
  engine.gain.gain.linearRampToValueAtTime(0, t + fadeOut);
  engine.oscillator.stop(t + fadeOut + ENGINE_HUM_STOP_BUFFER);
}

/**
 * Create a wind‑noise layer that varies with vehicle speed.
 *
 * Creates a looping white‑noise buffer through a lowpass BiquadFilter
 * so the wind timbre is softer than raw noise. Callers should call
 * {@link updateWindNoiseGain} each frame to scale the wind volume
 * proportionally to the current speed.
 *
 * @param {AudioContext} ctx - Web Audio API context.
 * @returns {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }}
 */
export function createWindNoise(ctx) {
  // White‑noise buffer (2 seconds, looping)
  const sampleRate = ctx.sampleRate ?? 44100;
  const bufferSize = sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(WIND_NOISE_FILTER_FREQ_MIN, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  return { source, gain, filter };
}

/**
 * Update wind noise filter cutoff based on speed.
 *
 * Higher speed opens the lowpass filter more, letting the wind
 * sound brighter. Uses a short smoothing time constant to avoid
 * discrete stepping artifacts.
 *
 * @param {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }} wind - Result from createWindNoise.
 * @param {number} speed - Current player speed in world units / second.
 */
export function updateWindNoiseFilter(wind, speed) {
  if (!wind || !wind.filter) return;
  const clamped = Math.max(0, speed);
  const ratio = Math.min(1, clamped / AUDIO_SPEED_MAX);
  const cutoff = WIND_NOISE_FILTER_FREQ_MIN + ratio * (WIND_NOISE_FILTER_FREQ_MAX - WIND_NOISE_FILTER_FREQ_MIN);
  const t = wind.filter.context.currentTime;
  wind.filter.frequency.setTargetAtTime(cutoff, t, AUDIO_SMOOTH_TIME);
}

/**
 * Update wind noise gain based on speed.
 *
 * Uses a short smoothing time constant to avoid clicks when
 * gain changes rapidly.
 *
 * @param {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }} wind - Result from createWindNoise.
 * @param {number} speed - Current player speed in world units / second.
 */
export function updateWindNoiseGain(wind, speed) {
  if (!wind || !wind.gain) return;
  const clamped = Math.max(0, speed);
  const ratio = Math.min(1, clamped / AUDIO_SPEED_MAX);
  const targetGain = ratio * WIND_NOISE_GAIN_MAX;
  const t = wind.gain.context.currentTime;
  wind.gain.gain.setTargetAtTime(targetGain, t, AUDIO_SMOOTH_TIME);
}

/**
 * Stop the wind noise with an optional fade‑out.
 *
 * @param {{ source: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode }} wind - Result from createWindNoise.
 * @param {number} [fadeOut=0.3] - Fade‑out duration in seconds.
 */
export function stopWindNoise(wind, fadeOut = 0.3) {
  if (!wind || !wind.source || !wind.gain) return;
  const t = wind.gain.context.currentTime;
  wind.gain.gain.linearRampToValueAtTime(0, t + fadeOut);
  wind.source.stop(t + fadeOut + WIND_NOISE_STOP_BUFFER);
}

/**
 * Play a lane‑switch "whoosh" sound.
 *
 * @param {AudioContext} ctx
 */
export function playLaneSwitchSound(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

/**
 * Play a jump "boing" sound.
 *
 * Both oscillator/gain pairs are created inline (no "playTone" helper) so
 * all nodes are directly visible and can be managed or disconnected if
 * the playback needs to be interrupted before the tone finishes.
 *
 * @param {AudioContext} ctx
 */
export function playJumpSound(ctx) {
  // Low tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(200, ctx.currentTime);
  gain1.gain.setValueAtTime(0.2, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 0.2);

  // Quick pitch rise overlay
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(400, ctx.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
  gain2.gain.setValueAtTime(0.12, ctx.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(ctx.currentTime);
  osc2.stop(ctx.currentTime + 0.2);
}

/**
 * Play a collision "thud / crunch" sound.
 *
 * @param {AudioContext} ctx
 */
export function playCollisionSound(ctx) {
  // Low‑frequency noise burst
  playTone(ctx, 80, 'sawtooth', 0.25, 0.25);
  // Smash overlay
  playTone(ctx, 150, 'square', 0.1, 0.15);
}

/**
 * Play a repair‑kit pickup "ding" sound.
 *
 * @param {AudioContext} ctx
 */
export function playPickupSound(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

/**
 * Play a game‑over descending tone.
 *
 * @param {AudioContext} ctx
 */
export function playGameOverSound(ctx) {
  // Slow descending notes
  const notes = [400, 350, 300, 200];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const t = ctx.currentTime + i * 0.2;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}
