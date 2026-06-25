<script>
  import { onMount, onDestroy } from 'svelte';
  import { pendingMenuAction } from '../../stores/menuActions.js';
  import { syncRendererSize } from '../../utils/airplaneGame.js';
  import * as THREE from 'three';

  /** @type {{ id: string, appId: string }} */
  export let win;

  // --- Game state ---
  let score = 0;
  let lives = 3;
  let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'win' | 'fail'
  let gameMessage = '飞机大战';
  let subMessage = '鼠标移动战机 · 自动射击';

  // Three.js refs
  /** @type {HTMLDivElement} */
  let containerEl;

  /** @type {THREE.Scene|null} */
  let scene = null;

  /** @type {THREE.PerspectiveCamera|null} */
  let camera = null;

  /** @type {THREE.WebGLRenderer|null} */
  let renderer = null;

  /** @type {THREE.Group|null} */
  let playerGroup = null;

  /** @type {THREE.Mesh[]} */
  let bullets = [];

  /** @type {THREE.Mesh[]} */
  let enemies = [];

  /** @type {THREE.Mesh[]} */
  let asteroids = [];

  /** @type {number|null} */
  let animationId = null;

  /** @type {boolean} */
  let isPaused = false;

  // Game config
  const PLAY_AREA = { width: 50, height: 70 };
  const BULLET_SPEED = 0.7;
  const ENEMY_SPEED = 0.12;
  const ASTEROID_SPEED = 0.08;
  const FIRE_INTERVAL = 12; // frames between shots
  let frameCount = 0;
  const TARGET_SCORE = 100;

  // Mouse tracking
  let targetX = 0;
  let targetZ = 0;

  // Refs for cleanup
  let mouseHandler = null;
  let resizeObserver = null;

  // --- Three.js initialization ---

  function initThree() {
    const container = containerEl;
    const rect = container.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 400;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.Fog(0x0a0a1a, 60, 120);

    camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 200);
    camera.position.set(0, 18, 28);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(15, 25, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    fillLight.position.set(-10, 5, -10);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x88ccff, 0.2);
    rimLight.position.set(0, -10, -15);
    scene.add(rimLight);

    // Stars
    createStars();

    // Player
    createPlayer();

    animate();
  }

  function createStars() {
    const count = 500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 150;
      positions[i * 3 + 2] = -Math.random() * 80 - 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.25,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(geo, mat);
    stars.name = 'stars';
    scene.add(stars);
  }

  function createPlayer() {
    playerGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.7, 1.8, 8);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x3498db,
      emissive: 0x1a5276,
      emissiveIntensity: 0.3,
      shininess: 60,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    playerGroup.add(body);

    // Nose cone
    const noseGeo = new THREE.ConeGeometry(0.45, 1.0, 8);
    const noseMat = new THREE.MeshPhongMaterial({
      color: 0x2ecc71,
      emissive: 0x145a32,
      emissiveIntensity: 0.25,
      shininess: 40,
    });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.y = 1.3;
    playerGroup.add(nose);

    // Wings
    const wingGeo = new THREE.BoxGeometry(2.8, 0.08, 0.5);
    const wingMat = new THREE.MeshPhongMaterial({
      color: 0x2980b9,
      emissive: 0x1a5276,
      emissiveIntensity: 0.2,
      shininess: 40,
    });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.position.y = -0.1;
    playerGroup.add(wings);

    // Wing tips
    const tipGeo = new THREE.ConeGeometry(0.35, 0.5, 4);
    const tipMat = new THREE.MeshPhongMaterial({ color: 0xe74c3c, shininess: 30 });
    const tipLeft = new THREE.Mesh(tipGeo, tipMat);
    tipLeft.rotation.z = Math.PI / 2;
    tipLeft.position.set(-1.7, -0.1, 0);
    playerGroup.add(tipLeft);
    const tipRight = new THREE.Mesh(tipGeo, tipMat);
    tipRight.rotation.z = -Math.PI / 2;
    tipRight.position.set(1.7, -0.1, 0);
    playerGroup.add(tipRight);

    // Cockpit glow
    const cockpitGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const cockpitMat = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.6,
    });
    const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
    cockpit.position.set(0, 0.3, 0.5);
    cockpit.scale.set(1, 0.4, 0.7);
    playerGroup.add(cockpit);

    // Engine glow
    const flameGeo = new THREE.ConeGeometry(0.25, 0.4, 6);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.5,
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.y = -1.2;
    playerGroup.add(flame);

    const glowGeo = new THREE.CircleGeometry(0.35, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, -1.4, 0);
    glow.rotation.x = -Math.PI / 2;
    playerGroup.add(glow);

    playerGroup.position.set(0, -PLAY_AREA.height / 2 + 4, 0);
    scene.add(playerGroup);
  }

  // --- Factory functions ---

  function createBullet(x, y, z) {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    const bullet = new THREE.Mesh(geo, mat);
    bullet.rotation.x = Math.PI / 2;
    bullet.position.set(x, y, z);
    bullet.userData = { active: true };
    scene.add(bullet);
    bullets.push(bullet);
  }

  function createEnemy() {
    const type = Math.random() > 0.5 ? 'basic' : 'fast';
    let geo, mat, speed;

    if (type === 'basic') {
      geo = new THREE.ConeGeometry(0.5, 0.9, 6);
      mat = new THREE.MeshPhongMaterial({
        color: 0xff4444,
        emissive: 0x661111,
        emissiveIntensity: 0.3,
        shininess: 20,
      });
      speed = ENEMY_SPEED;
    } else {
      geo = new THREE.OctahedronGeometry(0.45);
      mat = new THREE.MeshPhongMaterial({
        color: 0xff8800,
        emissive: 0x553300,
        emissiveIntensity: 0.3,
        flatShading: true,
      });
      speed = ENEMY_SPEED * 1.6;
    }

    const enemy = new THREE.Mesh(geo, mat);
    const x = (Math.random() - 0.5) * PLAY_AREA.width * 0.8;
    enemy.position.set(x, PLAY_AREA.height / 2 + 3, 0);
    enemy.rotation.z = Math.PI;
    enemy.castShadow = true;
    enemy.userData = { speed, health: 1, type, active: true };
    scene.add(enemy);
    enemies.push(enemy);
  }

  function createAsteroid() {
    const size = Math.random() * 0.5 + 0.25;
    const geo = new THREE.DodecahedronGeometry(size);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x887766,
      emissive: 0x332211,
      emissiveIntensity: 0.08,
      flatShading: true,
    });
    const asteroid = new THREE.Mesh(geo, mat);
    const x = (Math.random() - 0.5) * PLAY_AREA.width;
    asteroid.position.set(x, PLAY_AREA.height / 2 + 3, (Math.random() - 0.5) * 8);
    asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    asteroid.castShadow = true;
    asteroid.userData = {
      speed: ASTEROID_SPEED + Math.random() * 0.06,
      rotSpeed: {
        x: (Math.random() - 0.5) * 0.04,
        y: (Math.random() - 0.5) * 0.04,
      },
      active: true,
      health: 2,
    };
    scene.add(asteroid);
    asteroids.push(asteroid);
  }

  function createExplosion(position) {
    const count = 20;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.3,
      color: 0xff8800,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(geo, mat);
    particles.position.copy(position);
    particles.userData = { life: 25 };
    scene.add(particles);

    const timer = setInterval(() => {
      particles.userData.life--;
      if (particles.userData.life <= 0 || !particles.parent) {
        clearInterval(timer);
        if (particles.parent) {
          scene.remove(particles);
          particles.geometry.dispose();
          particles.material.dispose();
        }
        return;
      }
      const positions = particles.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        positions[i * 3] *= 1.12;
        positions[i * 3 + 1] *= 1.12;
        positions[i * 3 + 2] *= 1.12;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.material.opacity -= 0.04;
    }, 50);
  }

  // --- Game logic ---

  function fireBullet() {
    if (!playerGroup || gameState !== 'playing') return;
    const px = playerGroup.position.x;
    const py = playerGroup.position.y + 1.5;
    const pz = playerGroup.position.z;
    createBullet(px - 0.2, py, pz);
    createBullet(px + 0.2, py, pz);
  }

  function updateGame() {
    if (gameState !== 'playing' || isPaused) return;
    if (!scene) return;
    frameCount++;

    // Auto-fire
    if (frameCount % FIRE_INTERVAL === 0) {
      fireBullet();
    }

    // Spawn enemies — rate increases with score
    const spawnRate = Math.max(30, 60 - Math.floor(score / 20) * 5);
    if (frameCount % spawnRate === 0) {
      createEnemy();
    }

    // Spawn asteroids
    if (frameCount % 100 === 0) {
      createAsteroid();
    }

    // Move player towards mouse
    if (playerGroup) {
      const dx = targetX - playerGroup.position.x;
      const dz = targetZ - playerGroup.position.z;
      playerGroup.position.x += dx * 0.08;
      playerGroup.position.z += dz * 0.08;

      // Tilt
      playerGroup.rotation.z = Math.max(-0.3, Math.min(0.3, -dx * 0.04));

      // Clamp
      const halfW = PLAY_AREA.width / 2 - 1.5;
      playerGroup.position.x = Math.max(-halfW, Math.min(halfW, playerGroup.position.x));
      playerGroup.position.z = Math.max(-4, Math.min(4, playerGroup.position.z));
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.position.y += BULLET_SPEED;
      if (b.position.y > PLAY_AREA.height / 2 + 5) {
        scene.remove(b);
        b.geometry.dispose();
        b.material.dispose();
        bullets.splice(i, 1);
      }
    }

    // Update enemies (move down, sinusoidal sway)
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.position.y -= e.userData.speed;
      e.position.x += Math.sin(frameCount * 0.025 + e.position.y * 0.1) * 0.015;
      if (e.position.y < -PLAY_AREA.height / 2 - 5) {
        scene.remove(e);
        e.geometry.dispose();
        e.material.dispose();
        enemies.splice(i, 1);
      }
    }

    // Update asteroids (move down, rotate)
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.position.y -= a.userData.speed;
      a.rotation.x += a.userData.rotSpeed.x;
      a.rotation.y += a.userData.rotSpeed.y;
      if (a.position.y < -PLAY_AREA.height / 2 - 5) {
        scene.remove(a);
        a.geometry.dispose();
        a.material.dispose();
        asteroids.splice(i, 1);
      }
    }

    // Collision: bullets vs enemies
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (!b.userData.active) continue;

      let used = false;

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (b.position.distanceTo(e.position) < 0.8) {
          b.userData.active = false;
          e.userData.health--;
          used = true;
          if (e.userData.health <= 0) {
            createExplosion(e.position);
            scene.remove(e);
            e.geometry.dispose();
            e.material.dispose();
            enemies.splice(j, 1);
            score += 10;
          }
          break;
        }
      }

      if (used) {
        scene.remove(b);
        b.geometry.dispose();
        b.material.dispose();
        bullets.splice(i, 1);
        continue;
      }

      for (let j = asteroids.length - 1; j >= 0; j--) {
        const a = asteroids[j];
        if (b.position.distanceTo(a.position) < 1.0) {
          b.userData.active = false;
          a.userData.health--;
          used = true;
          if (a.userData.health <= 0) {
            createExplosion(a.position);
            scene.remove(a);
            a.geometry.dispose();
            a.material.dispose();
            asteroids.splice(j, 1);
            score += 15;
          }
          break;
        }
      }

      if (used) {
        scene.remove(b);
        b.geometry.dispose();
        b.material.dispose();
        bullets.splice(i, 1);
      }
    }

    // Collision: player vs enemies
    if (playerGroup && gameState === 'playing') {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (playerGroup.position.distanceTo(e.position) < 1.4) {
          createExplosion(e.position);
          scene.remove(e);
          e.geometry.dispose();
          e.material.dispose();
          enemies.splice(i, 1);
          loseLife();
          if (gameState !== 'playing') break;
        }
      }

      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        if (playerGroup.position.distanceTo(a.position) < 1.4) {
          createExplosion(a.position);
          scene.remove(a);
          a.geometry.dispose();
          a.material.dispose();
          asteroids.splice(i, 1);
          loseLife();
          if (gameState !== 'playing') break;
        }
      }
    }

    // Win condition
    if (score >= TARGET_SCORE && gameState === 'playing') {
      gameState = 'win';
      gameMessage = '🎉 胜利！';
      subMessage = `得分: ${score}`;
    }
  }

  function loseLife() {
    lives--;
    if (lives <= 0) {
      gameState = 'fail';
      gameMessage = '💀 游戏结束';
      subMessage = `最终得分: ${score}`;
    } else if (playerGroup) {
      playerGroup.visible = false;
      setTimeout(() => {
        if (playerGroup) playerGroup.visible = true;
      }, 800);
    }
  }

  // --- Animation loop ---

  function animate() {
    animationId = requestAnimationFrame(animate);
    updateGame();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // --- Event handlers ---

  function onMouseMove(e) {
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    targetX = (x - 0.5) * PLAY_AREA.width;
    targetZ = (0.5 - y) * 12;
  }



  // --- Menu actions ---

  function handleMenuAction(action) {
    switch (action) {
      case '开始新游戏':
      case '重新开始':
        resetGame();
        break;
      case '暂停':
        isPaused = !isPaused;
        break;
      case '结束游戏':
        endGame();
        break;
      default:
        break;
    }
  }

  function resetGame() {
    cleanupMovingObjects();
    score = 0;
    lives = 3;
    frameCount = 0;
    isPaused = false;
    gameState = 'playing';
    gameMessage = '';
    subMessage = '';
    createPlayer();
  }

  function endGame() {
    cleanupMovingObjects();
    gameState = 'menu';
    gameMessage = '飞机大战';
    subMessage = '鼠标移动战机 · 自动射击';
    score = 0;
    lives = 3;
    createPlayer();
  }

  function cleanupMovingObjects() {
    if (!scene) return;

    for (const b of bullets) {
      if (b.parent) scene.remove(b);
      b.geometry.dispose();
      b.material.dispose();
    }
    bullets = [];

    for (const e of enemies) {
      if (e.parent) scene.remove(e);
      e.geometry.dispose();
      e.material.dispose();
    }
    enemies = [];

    for (const a of asteroids) {
      if (a.parent) scene.remove(a);
      a.geometry.dispose();
      a.material.dispose();
    }
    asteroids = [];

    if (playerGroup) {
      playerGroup.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      scene.remove(playerGroup);
      playerGroup = null;
    }
  }

  // --- Lifecycle ---

  onMount(() => {
    const timer = setTimeout(() => {
      if (containerEl) {
        initThree();
        mouseHandler = onMouseMove.bind(this);
        containerEl.addEventListener('mousemove', mouseHandler);
        resizeObserver = new ResizeObserver(() => {
          syncRendererSize(containerEl, camera, renderer);
        });
        resizeObserver.observe(containerEl);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
    };
  });

  // Subscribe to menu actions
  $: if ($pendingMenuAction && $pendingMenuAction.appId === win.appId) {
    handleMenuAction($pendingMenuAction.action);
    pendingMenuAction.set(null);
  }

  onDestroy(() => {
    // Cancel animation
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // Remove event listeners
    if (containerEl && mouseHandler) {
      containerEl.removeEventListener('mousemove', mouseHandler);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    // Dispose all Three.js resources recursively
    if (scene) {
      scene.traverse((obj) => {
        if (obj.isMesh || obj.isPoints) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
    }

    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }

    scene = null;
    camera = null;
    renderer = null;
    playerGroup = null;
    bullets = [];
    enemies = [];
    asteroids = [];
  });
</script>

<div class="game-container" bind:this={containerEl}>
  {#if gameState === 'menu'}
    <div class="game-overlay">
      <div class="overlay-card">
        <div class="overlay-title">✈️ 飞机大战</div>
        <div class="overlay-sub">鼠标移动战机 · 自动射击</div>
        <div class="overlay-info">
          <div class="info-row">🎯 消灭敌机 +10 分</div>
          <div class="info-row">💎 击碎小行星 +15 分</div>
          <div class="info-row">❤️ 初始 3 条命</div>
          <div class="info-row">🏆 {TARGET_SCORE} 分胜利</div>
        </div>
        <button class="overlay-btn" on:click={resetGame}>开始游戏</button>
      </div>
    </div>
  {/if}

  {#if gameState === 'paused'}
    <div class="game-overlay">
      <div class="overlay-card overlay-card--small">
        <div class="overlay-title">⏸️ 已暂停</div>
        <button class="overlay-btn" on:click={() => { isPaused = false; }}>继续</button>
      </div>
    </div>
  {/if}

  {#if gameState === 'win' || gameState === 'fail'}
    <div class="game-overlay">
      <div class="overlay-card">
        <div class="overlay-title">{gameMessage}</div>
        <div class="overlay-sub">{subMessage}</div>
        <button class="overlay-btn" on:click={resetGame}>再来一局</button>
      </div>
    </div>
  {/if}

  <!-- HUD -->
  {#if gameState === 'playing' || gameState === 'paused'}
    <div class="game-hud">
      <div class="hud-item">
        <span class="hud-icon">⭐</span>
        <span class="hud-value">{score}</span>
      </div>
      <div class="hud-item">
        <span class="hud-icon">❤️</span>
        <span class="hud-value">{'♥'.repeat(lives)}{'♡'.repeat(Math.max(0, 3 - lives))}</span>
      </div>
      <div class="hud-item">
        <span class="hud-icon">🎯</span>
        <span class="hud-value">{TARGET_SCORE}</span>
      </div>
      {#if isPaused}
        <div class="hud-paused">暂停</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .game-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #0a0a1a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
  }

  /* ===== Overlay Screens ===== */

  .game-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 26, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 10;
    animation: overlay-fadein 0.3s ease;
  }

  @keyframes overlay-fadein {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .overlay-card {
    background: rgba(20, 20, 40, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px 40px;
    text-align: center;
    min-width: 280px;
    max-width: 360px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  }

  .overlay-card--small {
    padding: 24px 32px;
    min-width: 200px;
  }

  .overlay-title {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
    letter-spacing: 1px;
  }

  .overlay-sub {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 20px;
  }

  .overlay-info {
    text-align: left;
    margin: 16px 0 24px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 10px;
  }

  .info-row {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    padding: 4px 0;
    line-height: 1.5;
  }

  .overlay-btn {
    display: inline-block;
    padding: 10px 32px;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #3498db, #2ecc71);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    font-family: inherit;
  }

  .overlay-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(52, 152, 219, 0.4);
  }

  .overlay-btn:active {
    transform: translateY(0);
  }

  /* ===== HUD ===== */

  .game-hud {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 6px 18px;
    background: rgba(10, 10, 26, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    z-index: 5;
    user-select: none;
  }

  .hud-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
  }

  .hud-icon {
    font-size: 14px;
  }

  .hud-value {
    font-weight: 600;
    font-size: 14px;
  }

  .hud-paused {
    font-size: 12px;
    font-weight: 700;
    color: #f1c40f;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 2px 8px;
    background: rgba(241, 196, 15, 0.15);
    border-radius: 4px;
    animation: blink 1s infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
