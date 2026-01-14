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
  amount?: number;
};

export class SurvivorRoom extends Room<SurvivorState> {
  private spawnTimer = 0;
  private maxEnemies = 25;
  private enemyHitCooldown = new Map<string, number>();
  private playerHitCooldown = new Map<string, number>();
  private playerContactCooldown = new Map<string, number>();
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
      if (FRIENDLY_FIRE) {
        const targetPlayer = this.findClosestPlayer(
          player.id,
          message.x,
          message.y,
          ATTACK_RADIUS
        );
        if (targetPlayer) {
          const cooldownKey = `${client.sessionId}:${targetPlayer.id}`;
          const now = Date.now();
          const lastHit = this.enemyHitCooldown.get(cooldownKey) ?? 0;
          const cooldownMs = getAttackCooldownMs(player.attackSpeed);
          if (now - lastHit >= cooldownMs) {
            this.enemyHitCooldown.set(cooldownKey, now);
            const critChance = getCritChance(player.luck);
            const isCritical = Math.random() < critChance;
            const baseDamage = getAttackDamage(player.attack);
            const damage = Math.round(
              applyDefense(baseDamage, targetPlayer.defense) *
                (isCritical ? TUNING.critMultiplier : 1)
            );
            targetPlayer.hp = Math.max(0, targetPlayer.hp - damage);
            this.broadcast("damageFloat", {
              x: targetPlayer.x,
              y: targetPlayer.y,
              amount: damage,
              kind: "dealt",
              critical: isCritical,
              targetId: targetPlayer.id
            });
            this.broadcast("attackEffect", {
              fromX: player.x,
              fromY: player.y,
              toX: message.x,
              toY: message.y,
              attackerId: player.id
            });
            if (targetPlayer.hp <= 0) {
              targetPlayer.isDead = true;
              targetPlayer.vx = 0;
              targetPlayer.vy = 0;
              const gainedXp = Math.floor(targetPlayer.xp * 0.5);
              if (gainedXp > 0) {
                player.xp += gainedXp;
                this.applyLevelUps(player);
                this.broadcast("xpFloat", {
                  x: targetPlayer.x,
                  y: targetPlayer.y,
                  amount: gainedXp
                });
              }
              targetPlayer.xp = 0;
              targetPlayer.level = 1;
              targetPlayer.statPoints = 0;
              targetPlayer.attack = 5;
              targetPlayer.defense = 2;
              targetPlayer.speed = 1;
              targetPlayer.attackSpeed = 1;
              targetPlayer.luck = 1;
              targetPlayer.maxHp = 100;
              targetPlayer.hp = 0;
              targetPlayer.maxSp = 50;
              targetPlayer.sp = 0;
              this.playerDeadUntil.set(targetPlayer.id, now + PLAYER_RESPAWN_MS);
            }
            return;
          }
        }
      }
      const target = this.findClosestEnemy(message.x, message.y, ATTACK_RADIUS);
      if (!target) {
        return;
      }
      const cooldownKey = `${client.sessionId}:${target.id}`;
      const now = Date.now();
      const lastHit = this.enemyHitCooldown.get(cooldownKey) ?? 0;
      const cooldownMs = getAttackCooldownMs(player.attackSpeed);
      if (now - lastHit < cooldownMs) {
        return;
      }
      this.enemyHitCooldown.set(cooldownKey, now);
      const critChance = getCritChance(player.luck);
      const isCritical = Math.random() < critChance;
      const baseDamage = getAttackDamage(player.attack);
      const damage = Math.round(
        applyDefense(baseDamage, ENEMY_DEFENSE_BASE) *
          (isCritical ? TUNING.critMultiplier : 1)
      );
      target.hp = Math.max(0, target.hp - damage);
      this.broadcast("damageFloat", {
        x: target.x,
        y: target.y,
        amount: damage,
        kind: "dealt",
        critical: isCritical,
        targetId: target.id
      });
      this.broadcast("attackEffect", {
        fromX: player.x,
        fromY: player.y,
        toX: message.x,
        toY: message.y,
        attackerId: player.id
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
      if (!player) {
        return;
      }
      const rawAmount = message.amount ?? 1;
      if (!Number.isFinite(rawAmount)) {
        return;
      }
      const amount = Math.max(1, Math.floor(rawAmount));
      if (player.statPoints < amount) {
        return;
      }
      const key = message.stat;
      switch (key) {
        case "hp":
          player.maxHp += 5 * amount;
          player.hp = Math.min(player.hp + 5 * amount, player.maxHp);
          break;
        case "sp":
          player.maxSp += 5 * amount;
          player.sp = Math.min(player.sp + 5 * amount, player.maxSp);
          break;
        case "atk":
          player.attack += amount;
          break;
        case "def":
          player.defense += amount;
          break;
        case "moveSpeed":
          player.speed += amount;
          break;
        case "atkSpeed":
          player.attackSpeed += amount;
          break;
        case "luck":
          player.luck += amount;
          break;
        default:
          return;
      }
      player.statPoints -= amount;
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

  private findClosestPlayer(
    attackerId: string,
    x: number,
    y: number,
    radius: number
  ): Player | undefined {
    let closest: Player | undefined;
    let closestDistance = radius;
    for (const player of this.state.players.values()) {
      if (player.id === attackerId || player.isDead) {
        continue;
      }
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance <= closestDistance) {
        closestDistance = distance;
        closest = player;
      }
    }
    return closest;
  }

  private tick(dt: number) {
    const deltaSeconds = dt / 1000;
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
      const moveSpeed = TUNING.baseMoveSpeed * getMoveMultiplier(player.speed);
      player.x = clamp(
        player.x + player.vx * moveSpeed * deltaSeconds,
        0,
        MAP_WIDTH
      );
      player.y = clamp(
        player.y + player.vy * moveSpeed * deltaSeconds,
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
        const incomingDamage = applyDefense(ENEMY_CONTACT_DAMAGE, player.defense);
        player.hp = Math.max(0, player.hp - incomingDamage);
        this.applyKnockback(player, enemy.x, enemy.y);
        this.broadcast("damageFloat", {
          x: player.x,
          y: player.y,
          amount: incomingDamage,
          kind: "received",
          critical: false,
          targetId: player.id
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
    if (FRIENDLY_FIRE) {
      const players = Array.from(this.state.players.values());
      for (let i = 0; i < players.length; i += 1) {
        const playerA = players[i];
        if (playerA.isDead) {
          continue;
        }
        for (let j = i + 1; j < players.length; j += 1) {
          const playerB = players[j];
          if (playerB.isDead) {
            continue;
          }
          const distance = Math.hypot(playerA.x - playerB.x, playerA.y - playerB.y);
          if (distance > PLAYER_CONTACT_RADIUS) {
            continue;
          }
          const pairKey = `${playerA.id}:${playerB.id}`;
          const lastHit = this.playerContactCooldown.get(pairKey) ?? 0;
          if (now - lastHit < PLAYER_CONTACT_COOLDOWN_MS) {
            continue;
          }
          this.playerContactCooldown.set(pairKey, now);
          this.applyPlayerContactDamage(playerA, playerB, now);
          this.applyPlayerContactDamage(playerB, playerA, now);
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

  private applyKnockback(player: Player, sourceX: number, sourceY: number) {
    const dx = player.x - sourceX;
    const dy = player.y - sourceY;
    const distance = Math.hypot(dx, dy) || 1;
    const knockback = PLAYER_KNOCKBACK_DISTANCE;
    player.x = clamp(player.x + (dx / distance) * knockback, 0, MAP_WIDTH);
    player.y = clamp(player.y + (dy / distance) * knockback, 0, MAP_HEIGHT);
  }

  private applyPlayerContactDamage(player: Player, source: Player, now: number) {
    const incomingDamage = applyDefense(PLAYER_CONTACT_DAMAGE, player.defense);
    player.hp = Math.max(0, player.hp - incomingDamage);
    this.applyKnockback(player, source.x, source.y);
    this.broadcast("damageFloat", {
      x: player.x,
      y: player.y,
      amount: incomingDamage,
      kind: "received",
      critical: false,
      targetId: player.id
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

const randomRange = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getMoveMultiplier = (speed: number) => {
  const normalized = Math.max(0, speed - 1);
  return clamp(
    1 + normalized * TUNING.movePerPoint,
    1,
    TUNING.moveMaxMult
  );
};

const getAttackCooldownMs = (attackSpeed: number) => {
  const normalized = Math.max(0, attackSpeed - 1);
  const raw = TUNING.baseAttackCooldownMs - normalized * TUNING.cooldownReductionPerPoint;
  return clamp(Math.round(raw), TUNING.minAttackCooldownMs, TUNING.baseAttackCooldownMs);
};

const getAttackDamage = (attack: number) => {
  const normalized = Math.max(0, attack - TUNING.baseAttackStat);
  return TUNING.baseAttackDamage + normalized * TUNING.attackPerPoint;
};

const applyDefense = (damage: number, defense: number) => {
  const reduced = damage - Math.max(0, defense) * TUNING.defenseReducePerPoint;
  return Math.max(TUNING.minDamage, Math.round(reduced));
};

const getCritChance = (luck: number) => {
  const chance = TUNING.baseCritChance + Math.max(0, luck) * TUNING.critPerLuck;
  return clamp(chance, 0, TUNING.maxCritChance);
};

const MAP_WIDTH = 1536 * 4;
const MAP_HEIGHT = 1024 * 4;
const ATTACK_RADIUS = 120;
const ENEMY_CONTACT_DAMAGE = 8;
const PLAYER_HIT_COOLDOWN_MS = 600;
const PLAYER_RESPAWN_MS = 1500;
const CONTACT_RADIUS = 32;
const ENEMY_XP_REWARD = 25;
const BASE_XP_TO_LEVEL = 100;
const XP_PER_LEVEL = 25;
const PLAYER_KNOCKBACK_DISTANCE = 18;
const FRIENDLY_FIRE = true;
const PLAYER_CONTACT_RADIUS = 26;
const PLAYER_CONTACT_DAMAGE = 2;
const PLAYER_CONTACT_COOLDOWN_MS = 600;
const ENEMY_DEFENSE_BASE = 0;

const TUNING = {
  baseMoveSpeed: 220,
  movePerPoint: 0.08,
  moveMaxMult: 2,
  baseAttackStat: 5,
  baseAttackDamage: 10,
  attackPerPoint: 1,
  defenseReducePerPoint: 0.6,
  minDamage: 1,
  baseAttackCooldownMs: 350,
  cooldownReductionPerPoint: 18,
  minAttackCooldownMs: 120,
  baseCritChance: 0.04,
  critPerLuck: 0.01,
  maxCritChance: 0.35,
  critMultiplier: 1.8
} as const;

const cryptoRandomId = () =>
  `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
