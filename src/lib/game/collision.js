import * as THREE from 'three';

/**
 * 碰撞检测模块
 * 使用包围球（距离）检测子弹与敌机、敌机与玩家之间的碰撞
 */
export class CollisionManager {
  constructor() {
    this._vec3 = new THREE.Vector3();
  }

  /**
   * 检测并处理碰撞
   * @param {Object} player - 玩家对象
   * @param {BulletManager} bulletManager
   * @param {EnemyManager} enemyManager
   * @param {Function} onEnemyHit - 敌机被击中回调 (score, position)
   * @param {Function} onPlayerHit - 玩家被击中回调 (position)
   */
  update(player, bulletManager, enemyManager, onEnemyHit, onPlayerHit) {
    const playerPos = player.getPosition();
    const playerRadius = player.getBoundsRadius();

    // 子弹 vs 敌机
    const bullets = bulletManager.getBullets();
    const enemies = enemyManager.getEnemies();

    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const bullet = bullets[bi];
      const bulletPos = bullet.mesh.position;

      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const enemy = enemies[ei];
        const enemyPos = enemy.group.position;
        const dist = bulletPos.distanceTo(enemyPos);

        if (dist < 1.5) {
          // 碰撞！记录位置后移除子弹和敌机
          const hitPos = enemyPos.clone();
          bulletManager.removeBullet(bi);
          enemyManager.removeEnemy(ei);
          if (onEnemyHit) onEnemyHit(100, hitPos);
          break; // 子弹已移除，跳出内层循环
        }
      }
    }

    // 敌机 vs 玩家
    if (player.alive) {
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const enemy = enemies[ei];
        const enemyPos = enemy.group.position;
        const dist = playerPos.distanceTo(enemyPos);

        if (dist < playerRadius + 1.0) {
          const hitPos = enemyPos.clone();
          enemyManager.removeEnemy(ei);
          player.takeDamage();
          if (onPlayerHit) onPlayerHit(hitPos);
        }
      }
    }
  }
}
