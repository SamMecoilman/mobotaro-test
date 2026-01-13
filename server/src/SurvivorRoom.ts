import { Room, type Client } from "@colyseus/core";
import { Enemy, Player, SurvivorState } from "./SurvivorState.js";

type MoveMessage = {
  x: number;
  y: number;
};

type AttackMessage = {
  x: number;
  y: number;
};

type AssignStatMessage = {
  stat: string;
};

export class SurvivorRoom extends Room<SurvivorState> {
  private spawnTimer = 0;
  private maxEnemies = 25;
  private enemyHitCooldown = new Map<string, number>();
  private playerHitCooldown = new Map<string, number>();
  private playerDeadUntil = new Map<string, number>();

  onCreate() {
    this.setState(new SurvivorState());
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / 15);

    this.onMessage("move", (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDead) {
        return;
      }

      player.vx = Math.max(-1, Math.min(1, message.x));
      player.vy = Math.max(-1, Math.min(1, message.y));
    });

    this.onMessage("attack", (client: Client, message: AttackMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDead) {
        return;
      }
      const target = this.findClosestEnemy(message.x, message.y, ATTACK_RADIUS);
      if (!target) {
        return;
      }
      const cooldownKey = `${client.sessionId}:${target.id}`;
      const now = Date.now();
      const lastHit = this.enemyHitCooldown.get(cooldownKey) ?? 0;
      if (now - lastHit < ENEMY_HIT_COOLDOWN_MS) {
        return;
      }
      this.enemyHitCooldown.set(cooldownKey, now);
      target.hp = Math.max(0, target.hp - PLAYER_ATTACK_DAMAGE);
      this.broadcast("damageFloat", {
        x: target.x,
        y: target.y,
        amount: PLAYER_ATTACK_DAMAGE
      });
      if (target.hp <= 0) {
        this.state.enemies.delete(target.id);
        player.xp += ENEMY_XP_REWARD;
        this.applyLevelUps(player);
        this.broadcast("xpFloat", {
          x: target.x,
          y: target.y,
          amount: ENEMY_XP_REWARD
        });
      }
    });

    this.onMessage("assignStat", (client: Client, message: AssignStatMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.statPoints <= 0) {
        return;
      }
      const key = message.stat;
      switch (key) {
        case "hp":
          player.maxHp += 5;
          player.hp = Math.min(player.hp + 5, player.maxHp);
          break;
        case "sp":
          player.maxSp += 5;
          player.sp = Math.min(player.sp + 5, player.maxSp);
          break;
        case "attack":
          player.attack += 1;
          break;
        case "defense":
          player.defense += 1;
          break;
        case "speed":
          player.speed += 1;
          break;
        case "attackSpeed":
          player.attackSpeed += 1;
          break;
        case "luck":
          player.luck += 1;
          break;
        default:
          return;
      }
      player.statPoints -= 1;
    });
  }

  onJoin(client: Client) {
    const player = new Player();
    player.id = client.sessionId;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private findClosestEnemy(
    x: number,
    y: number,
    radius: number
  ): Enemy | undefined {
    let closest: Enemy | undefined;
    let closestDistance = radius;
    for (const enemy of this.state.enemies.values()) {
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      if (distance <= closestDistance) {
        closestDistance = distance;
        closest = enemy;
      }
    }
    return closest;
  }

  private tick(dt: number) {
    const deltaSeconds = dt / 1000;
    const speed = 220;
    const now = Date.now();

    this.state.tick += 1;

    for (const player of this.state.players.values()) {
      if (player.isDead) {
        const reviveAt = this.playerDeadUntil.get(player.id) ?? 0;
        if (now >= reviveAt) {
          player.isDead = false;
          player.hp = player.maxHp;
          player.x = MAP_WIDTH / 2;
          player.y = MAP_HEIGHT / 2;
        }
        player.vx = 0;
        player.vy = 0;
        continue;
      }
      player.x = clamp(
        player.x + player.vx * speed * deltaSeconds,
        0,
        MAP_WIDTH
      );
      player.y = clamp(
        player.y + player.vy * speed * deltaSeconds,
        0,
        MAP_HEIGHT
      );
    }

    for (const enemy of this.state.enemies.values()) {
      for (const player of this.state.players.values()) {
        if (player.isDead) {
          continue;
        }
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance > CONTACT_RADIUS) {
          continue;
        }
        const cooldownKey = `${enemy.id}:${player.id}`;
        const lastHit = this.playerHitCooldown.get(cooldownKey) ?? 0;
        if (now - lastHit < PLAYER_HIT_COOLDOWN_MS) {
          continue;
        }
        this.playerHitCooldown.set(cooldownKey, now);
        player.hp = Math.max(0, player.hp - ENEMY_CONTACT_DAMAGE);
        this.broadcast("damageFloat", {
          x: player.x,
          y: player.y,
          amount: ENEMY_CONTACT_DAMAGE
        });
        if (player.hp <= 0) {
          player.isDead = true;
          player.vx = 0;
          player.vy = 0;
          player.level = 1;
          player.xp = 0;
          player.statPoints = 0;
          player.attack = 5;
          player.defense = 2;
          player.speed = 1;
          player.attackSpeed = 1;
          player.luck = 1;
          player.maxHp = 100;
          player.hp = 0;
          player.maxSp = 50;
          player.sp = 0;
          this.playerDeadUntil.set(player.id, now + PLAYER_RESPAWN_MS);
        }
      }
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= 1500) {
      this.spawnTimer = 0;
      const enemy = new Enemy();
      enemy.id = cryptoRandomId();
      enemy.x = randomRange(60, 900);
      enemy.y = randomRange(60, 480);
      this.state.enemies.set(enemy.id, enemy);
      if (this.state.enemies.size > this.maxEnemies) {
        const oldestKey = this.state.enemies.keys().next().value;
        if (oldestKey) {
          this.state.enemies.delete(oldestKey);
        }
      }
    }
  }

  private applyLevelUps(player: Player) {
    while (player.xp >= this.getXpForLevel(player.level)) {
      player.xp -= this.getXpForLevel(player.level);
      player.level += 1;
      player.statPoints += 5;
    }
  }

  private getXpForLevel(level: number) {
    return BASE_XP_TO_LEVEL + (level - 1) * XP_PER_LEVEL;
  }
}

const randomRange = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const MAP_WIDTH = 1536 * 4;
const MAP_HEIGHT = 1024 * 4;
const ATTACK_RADIUS = 120;
const PLAYER_ATTACK_DAMAGE = 10;
const ENEMY_CONTACT_DAMAGE = 8;
const ENEMY_HIT_COOLDOWN_MS = 200;
const PLAYER_HIT_COOLDOWN_MS = 600;
const PLAYER_RESPAWN_MS = 1500;
const CONTACT_RADIUS = 32;
const ENEMY_XP_REWARD = 25;
const BASE_XP_TO_LEVEL = 100;
const XP_PER_LEVEL = 25;

const cryptoRandomId = () =>
  `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
