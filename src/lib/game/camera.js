import * as THREE from 'three';

/**
 * 第三人称尾随相机
 *
 * 始终保持固定在玩家战机的后方上方，持续平滑跟随。
 * 坐标系约定：+Z 为玩家机头方向（前方），+Y 为上方，+X 为右翼。
 * 相机位于玩家 (-Z) 后方 (+Y) 上方，持续注视玩家。
 */
export class ThirdPersonCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera - Three.js 透视相机实例
   * @param {Object} [options]
   * @param {number} [options.height=4]     - 相机在玩家上方的垂直偏移
   * @param {number} [options.distance=7]   - 相机在玩家后方的水平距离
   * @param {number} [options.smoothFactor=0.08] - 平滑跟随系数 (0~1, 越小越平滑)
   */
  constructor(camera, options = {}) {
    this.camera = camera;

    // 后方上方偏移：-Z 为后方，+Y 为上方
    this.offset = new THREE.Vector3(
      0,
      options.height ?? 4,
      -(options.distance ?? 7),
    );

    // 平滑插值系数 — 值越小跟随越平滑但滞后感越强
    this.smoothFactor = options.smoothFactor ?? 0.08;

    // 重用临时向量避免 GC
    this._targetPos = new THREE.Vector3();
  }

  /**
   * 每帧调用，驱动相机跟随玩家
   * @param {THREE.Vector3} playerPosition - 玩家战机世界坐标
   */
  update(playerPosition) {
    // 目标位置 = 玩家位置 + 后方上方偏移
    this._targetPos.copy(playerPosition).add(this.offset);

    // 平滑插值移动相机
    this.camera.position.lerp(this._targetPos, this.smoothFactor);

    // 始终注视玩家
    this.camera.lookAt(playerPosition);
  }
}
