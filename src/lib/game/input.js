/**
 * 键盘输入管理
 * 记录当前按下的键位状态，支持扩展鼠标/触摸
 */
export class InputManager {
  constructor() {
    this.keys = {};
    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  isPressed(code) {
    return !!this.keys[code];
  }

  /** 方向输入：返回 { x, y, z } 归一化方向向量 */
  getDirection() {
    let x = 0, y = 0, z = 0;
    if (this.isPressed('KeyA') || this.isPressed('ArrowLeft'))  x -= 1;
    if (this.isPressed('KeyD') || this.isPressed('ArrowRight')) x += 1;
    if (this.isPressed('KeyW') || this.isPressed('ArrowUp'))    z += 1;
    if (this.isPressed('KeyS') || this.isPressed('ArrowDown'))  z -= 1;
    if (this.isPressed('ShiftLeft') || this.isPressed('ShiftRight')) y -= 1;
    if (this.isPressed('Space')) y += 1;
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      x /= len; y /= len; z /= len;
    }
    return { x, y, z };
  }

  isFiring() {
    return this.isPressed('Space');
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
