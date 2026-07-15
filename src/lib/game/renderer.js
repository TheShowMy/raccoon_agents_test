import * as THREE from 'three';
import { ThirdPersonCamera } from './camera.js';

/**
 * Three.js 渲染场景、相机（第三人称尾随）、灯光和环境
 */
export class GameRenderer {
  constructor(container) {
    this.container = container;

    // 场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.Fog(0x0a0a1a, 30, 60);

    // 相机
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    this.camera.position.set(0, 5, 8);

    // 第三人称尾随相机控制器
    this.thirdPersonCamera = new ThirdPersonCamera(this.camera);

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 灯光
    this._setupLights();

    // 地面网格与环境
    this._setupEnvironment();

    // 窗口尺寸调整
    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
  }

  _setupLights() {
    // 环境光
    const ambient = new THREE.AmbientLight(0x334466, 0.6);
    this.scene.add(ambient);

    // 主方向光
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 15, 10);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // 辅助背光
    const backLight = new THREE.DirectionalLight(0x4477ff, 0.4);
    backLight.position.set(-5, 0, -10);
    this.scene.add(backLight);

    // 半球光
    const hemi = new THREE.HemisphereLight(0x4488ff, 0x002244, 0.3);
    this.scene.add(hemi);
  }

  _setupEnvironment() {
    // 地面网格
    const gridHelper = new THREE.GridHelper(50, 20, 0x4488ff, 0x224488);
    gridHelper.position.y = -0.5;
    this.scene.add(gridHelper);

    // 地面半透明平面
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a2a,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    this.scene.add(ground);

    // 星星背景粒子
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 800;
    const positions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 200;
      if (i % 3 === 1) positions[i] = Math.abs(positions[i]) * 0.3 + 1;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({
      color: 0x88bbff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
    });
    const stars = new THREE.Points(starsGeo, starsMat);
    stars.position.y = 0;
    this.scene.add(stars);
  }

  /**
   * 更新相机：委托给 ThirdPersonCamera 实现平滑后方上方跟随
   * @param {THREE.Vector3} playerPosition
   */
  updateCamera(playerPosition) {
    this.thirdPersonCamera.update(playerPosition);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  _handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
