import { InputManager } from './input.js';
import { Player } from './player.js';
import { BulletManager } from './bullets.js';
import { EnemyManager } from './enemies.js';
import { CollisionManager } from './collision.js';

/**
 * 游戏主循环
 * 协调各子系统：输入、更新、碰撞、渲染
 */
export class GameLoop {
  constructor(renderer) {
    this.renderer = renderer;
    this.input = new InputManager();
    this.player = new Player();
    this.bullets = new BulletManager(renderer.scene);
    this.enemies = new EnemyManager(renderer.scene);
    this.collision = new CollisionManager();

    this.score = 0;
    this.gameOver = false;
    this.running = false;
    this.lastTime = 0;

    // 将玩家添加到场景
    this.player.reset();
    renderer.scene.add(this.player.group);
  }

  start() {
    this.running = true;
    this.gameOver = false;
    this.score = 0;
    this.player.reset();
    this.bullets.clear();
    this.enemies.clear();
    this.lastTime = performance.now();
    this._loop(this.lastTime);
  }

  stop() {
    this.running = false;
  }

  restart() {
    this.stop();
    this.start();
  }

  _loop = (time) => {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05); // 上限 50ms
    this.lastTime = time;

    this._update(dt);
    this.renderer.updateCamera(this.player.getPosition());
    this.renderer.render();

    requestAnimationFrame(this._loop);
  };

  _update(dt) {
    if (this.gameOver) return;

    // 更新玩家
    this.player.update(dt, this.input);

    // 开火
    if (this.player.canFire() && this.input.isFiring()) {
      this.player.fire();
      const pos = this.player.getPosition().clone();
      pos.z += 1.5;
      this.bullets.fire(pos);
    }

    // 更新子弹
    this.bullets.update(dt);

    // 更新敌机
    this.enemies.update(dt, this.player.getPosition());

    // 碰撞检测
    this.collision.update(
      this.player,
      this.bullets,
      this.enemies,
      (points) => { this.score += points; },
      () => {
        if (!this.player.alive) {
          this.gameOver = true;
        }
      }
    );
  }

  getState() {
    return {
      score: this.score,
      health: this.player.health,
      alive: this.player.alive,
      gameOver: this.gameOver,
    };
  }

  destroy() {
    this.stop();
    this.input.destroy();
    this.bullets.clear();
    this.enemies.clear();
    if (this.player.group.parent) {
      this.player.group.parent.remove(this.player.group);
    }
  }
}
