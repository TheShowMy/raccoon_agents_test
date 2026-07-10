/**
 * Racing Game — Visual Effects Module
 *
 * Manages particle bursts, shockwave rings, spiral particles, and camera shake.
 * All effects are pure Three.js point-cloud objects managed in scene space.
 */

/* ===================================================================
   Constants
   =================================================================== */

export const PARTICLE_COUNT_PER_BURST = 16;
export const PARTICLE_LIFETIME = 0.7;
export const PARTICLE_SPEED = 3.5;

export const SHOCKWAVE_COUNT = 24;
export const SHOCKWAVE_LIFETIME = 0.6;
export const SHOCKWAVE_EXPAND_SPEED = 2.5;
export const SHOCKWAVE_INITIAL_RADIUS = 0.15;

export const SPIRAL_COUNT = 16;
export const SPIRAL_LIFETIME = 0.7;
export const SPIRAL_ANGULAR_SPEED_BASE = 4;
export const SPIRAL_ANGULAR_SPEED_VARIANCE = 2;
export const SPIRAL_RISE_SPEED_BASE = 1.5;
export const SPIRAL_RISE_SPEED_VARIANCE = 1.0;
export const SPIRAL_RADIUS_BASE = 0.2;
export const SPIRAL_RADIUS_VARIANCE = 0.1;

export const SHAKE_DURATION_COLLISION = 0.3;
export const SHAKE_INTENSITY_COLLISION = 0.15;

/* ===================================================================
   Internal state
   =================================================================== */

/** @type {THREE.Scene|null} */
let scene = null;

/** @type {Array} particle burst entries */
let particleBursts = [];

/** @type {Array} shockwave ring entries */
let shockwaves = [];

/** @type {Array} spiral particle entries */
let spiralParticles = [];

/* ===================================================================
   Public API
   =================================================================== */

/**
 * Create the effects controller.
 * Must be called once with a live THREE.Scene before any effect is triggered.
 *
 * @param {{ scene: THREE.Scene }} options
 * @returns {{ createParticleBurst, createShockwave, createSpiralParticles, triggerShake, update, cleanup }}
 */
export function createEffects({ scene: s }) {
  scene = s;

  /**
   * Burst of particles at a world position.
   *
   * @param {THREE.Vector3} position
   * @param {number} colorHex  - e.g. 0xff5533
   * @param {number} [count]   - defaults to PARTICLE_COUNT_PER_BURST
   * @param {boolean} [upwardFlame] - use upward flame physics instead of gravity
   * @returns {THREE.Points}
   */
  function createParticleBurst(position, colorHex, count = PARTICLE_COUNT_PER_BURST, upwardFlame = false) {
    if (!scene) return null;

    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = position.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.3;

      if (upwardFlame) {
        const angle  = Math.random() * Math.PI * 2;
        const spread = 0.5 + Math.random() * 1.5;
        velocities.push({
          x: Math.cos(angle) * spread,
          y: 2 + Math.random() * 2.5,
          z: Math.sin(angle) * spread,
        });
      } else {
        velocities.push({
          x: (Math.random() - 0.5) * PARTICLE_SPEED,
          y: Math.random() * PARTICLE_SPEED * 0.6 + 0.3,
          z: (Math.random() - 0.5) * PARTICLE_SPEED,
        });
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.25,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    particleBursts.push({ velocities, geometry, material, points, count, lifetime: 0, maxLifetime: PARTICLE_LIFETIME, upwardFlame });
    return points;
  }

  /**
   * Shockwave ring: particles arranged in a circle, expanding outward and fading.
   *
   * @param {THREE.Vector3} position
   * @returns {THREE.Points}
   */
  function createShockwave(position) {
    if (!scene) return null;

    const count = SHOCKWAVE_COUNT;
    const positions  = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions[i * 3]     = position.x + Math.cos(angle) * SHOCKWAVE_INITIAL_RADIUS;
      positions[i * 3 + 1] = position.y + 0.05;
      positions[i * 3 + 2] = position.z + Math.sin(angle) * SHOCKWAVE_INITIAL_RADIUS;
      velocities.push({
        x: Math.cos(angle) * SHOCKWAVE_EXPAND_SPEED,
        y: 0.1,
        z: Math.sin(angle) * SHOCKWAVE_EXPAND_SPEED,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffcc88,
      size: 0.18,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    shockwaves.push({ velocities, geometry, material, points, count, lifetime: 0, maxLifetime: SHOCKWAVE_LIFETIME });
    return points;
  }

  /**
   * Green spiral particles for repair kit pickup.
   *
   * @param {THREE.Vector3} position
   * @returns {THREE.Points}
   */
  function createSpiralParticles(position) {
    if (!scene) return null;

    const count = SPIRAL_COUNT;
    const positions  = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2;
      const radius = SPIRAL_RADIUS_BASE + Math.random() * SPIRAL_RADIUS_VARIANCE;
      positions[i * 3]     = position.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = position.y + 0.3;
      positions[i * 3 + 2] = position.z + Math.sin(angle) * radius;
      velocities.push({
        angle,
        radius,
        angularSpeed: SPIRAL_ANGULAR_SPEED_BASE + Math.random() * SPIRAL_ANGULAR_SPEED_VARIANCE,
        riseSpeed:    SPIRAL_RISE_SPEED_BASE    + Math.random() * SPIRAL_RISE_SPEED_VARIANCE,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x44ff44,
      size: 0.2,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    spiralParticles.push({ velocities, geometry, material, points, count, lifetime: 0, maxLifetime: SPIRAL_LIFETIME });
    return points;
  }

  /**
   * Advance all live effect animations by `dt` seconds.
   * Call this every frame from the game loop.
   *
   * @param {number} dt - Delta time in seconds.
   */
  function update(dt) {
    if (!scene) return;

    // -- Particle bursts --
    for (let i = particleBursts.length - 1; i >= 0; i--) {
      const burst = particleBursts[i];
      burst.lifetime += dt;
      const progress = burst.lifetime / burst.maxLifetime;

      if (progress >= 1) {
        scene.remove(burst.points);
        burst.geometry.dispose();
        burst.material.dispose();
        particleBursts.splice(i, 1);
        continue;
      }

      const pos = burst.geometry.attributes.position.array;
      for (let j = 0; j < burst.count; j++) {
        pos[j * 3]     += burst.velocities[j].x * dt;
        pos[j * 3 + 1] += burst.velocities[j].y * dt;
        pos[j * 3 + 2] += burst.velocities[j].z * dt;
        if (burst.upwardFlame) {
          burst.velocities[j].y -= 2 * dt;
        } else {
          burst.velocities[j].y += -8 * dt;
        }
      }
      burst.geometry.attributes.position.needsUpdate = true;
      burst.material.opacity = Math.max(0, 1 - progress);
      const scale = 1 + progress * 0.5;
      burst.points.scale.set(scale, scale, scale);
    }

    // -- Shockwave rings --
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.lifetime += dt;
      const progress = sw.lifetime / sw.maxLifetime;

      if (progress >= 1) {
        scene.remove(sw.points);
        sw.geometry.dispose();
        sw.material.dispose();
        shockwaves.splice(i, 1);
        continue;
      }

      const pos = sw.geometry.attributes.position.array;
      for (let j = 0; j < sw.count; j++) {
        pos[j * 3]     += sw.velocities[j].x * dt;
        pos[j * 3 + 1] += sw.velocities[j].y * dt;
        pos[j * 3 + 2] += sw.velocities[j].z * dt;
      }
      sw.geometry.attributes.position.needsUpdate = true;
      sw.material.opacity = Math.max(0, 1 - progress);
      const scale = 1 + progress * 3;
      sw.points.scale.set(scale, 1, scale);
    }

    // -- Spiral particles --
    for (let i = spiralParticles.length - 1; i >= 0; i--) {
      const sp = spiralParticles[i];
      sp.lifetime += dt;
      const progress = sp.lifetime / sp.maxLifetime;

      if (progress >= 1) {
        scene.remove(sp.points);
        sp.geometry.dispose();
        sp.material.dispose();
        spiralParticles.splice(i, 1);
        continue;
      }

      const pos = sp.geometry.attributes.position.array;
      for (let j = 0; j < sp.count; j++) {
        const v = sp.velocities[j];
        v.angle += v.angularSpeed * dt;
        pos[j * 3]     += Math.cos(v.angle) * v.radius * dt * 0.5;
        pos[j * 3 + 1] += v.riseSpeed * dt;
        pos[j * 3 + 2] += Math.sin(v.angle) * v.radius * dt * 0.5;
      }
      sp.geometry.attributes.position.needsUpdate = true;
      sp.material.opacity = Math.max(0, 1 - progress);
    }
  }

  /**
   * Remove and dispose all live effect objects.
   * Call on restart or game-over to clear the scene.
   */
  function cleanup() {
    if (!scene) {
      particleBursts = [];
      shockwaves = [];
      spiralParticles = [];
      return;
    }

    for (const burst of particleBursts) {
      scene.remove(burst.points);
      burst.geometry.dispose();
      burst.material.dispose();
    }
    particleBursts = [];

    for (const sw of shockwaves) {
      scene.remove(sw.points);
      sw.geometry.dispose();
      sw.material.dispose();
    }
    shockwaves = [];

    for (const sp of spiralParticles) {
      scene.remove(sp.points);
      sp.geometry.dispose();
      sp.material.dispose();
    }
    spiralParticles = [];
  }

  return { createParticleBurst, createShockwave, createSpiralParticles, update, cleanup };
}
