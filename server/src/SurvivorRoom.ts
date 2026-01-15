import { Room, type Client } from "@colyseus/core";
import { Enemy, Player, SurvivorState } from "./SurvivorState.js";

type MoveMessage = {
  x: number;
  y: number;
};

type AttackMessage = {
  x: number;
  y: number;
  attackId?: string;
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
  private enemyContactCooldown = new Map<string, number>();
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
      const attackId =
        message.attackId ?? `${client.sessionId}-${Date.now()}-${Math.random()}`;
      const originX = player.x;
      const originY = player.y;
      const dx = message.x - originX;
      const dy = message.y - originY;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0) {
        return;
      }
      const rangeValue = player.range ?? 1;
      const clampedDistance = Math.min(distance, ATTACK_BASE_RANGE * rangeValue);
      const nx = dx / distance;
      const ny = dy / distance;
      const targetX = originX + nx * clampedDistance;
      const targetY = originY + ny * clampedDistance;
      const hit = this.findClosestHitOnSegment(
        player.id,
        originX,
        originY,
        targetX,
        targetY,
        ATTACK_HIT_RADIUS,
        FRIENDLY_FIRE
      );
      if (!hit) {
        return;
      }
      const now = Date.now();
      const cooldownKey = `${client.sessionId}:${hit.targetId}`;
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
        applyDefense(baseDamage, hit.defense) *
          (isCritical ? TUNING.critMultiplier : 1)
      );
      hit.applyDamage(damage, now, player, isCritical);
      this.broadcast("attackEffect", {
        fromX: originX,
        fromY: originY,
        toX: targetX,
        toY: targetY,
        attackerId: player.id,
        attackId
      });
      this.broadcast("attackHit", {
        attackId,
        x: hit.x,
        y: hit.y
      });
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
        case "range":
          player.range += amount;
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

  private findClosestHitOnSegment(
    attackerId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    radius: number,
    includePlayers: boolean
  ) {
    const maxDistance = Math.hypot(endX - startX, endY - startY);
    if (maxDistance <= 0) {
      return;
    }
    let closest:
      | {
          distanceAlong: number;
          x: number;
          y: number;
          defense: number;
          targetId: string;
          applyDamage: (
            damage: number,
            now: number,
            attacker: Player,
            critical: boolean
          ) => void;
        }
      | undefined;

    for (const enemy of this.state.enemies.values()) {
      const distanceAlong = distanceAlongSegment(
        startX,
        startY,
        endX,
        endY,
        enemy.x,
        enemy.y
      );
      if (distanceAlong < 0 || distanceAlong > maxDistance) {
        continue;
      }
      const distance = distanceToSegment(
        startX,
        startY,
        endX,
        endY,
        enemy.x,
        enemy.y
      );
      if (distance > radius) {
        continue;
      }
      if (!closest || distanceAlong < closest.distanceAlong) {
        closest = {
          distanceAlong,
          x: enemy.x,
          y: enemy.y,
          defense: ENEMY_DEFENSE_BASE,
          targetId: enemy.id,
          applyDamage: (damage, _now, attacker, critical) => {
            enemy.hp = Math.max(0, enemy.hp - damage);
            this.broadcast("damageFloat", {
              x: enemy.x,
              y: enemy.y,
              amount: damage,
              kind: "dealt",
              critical,
              targetId: enemy.id
            });
            if (enemy.hp <= 0) {
              this.state.enemies.delete(enemy.id);
              attacker.xp += ENEMY_XP_REWARD;
              this.applyLevelUps(attacker);
              this.broadcast("xpFloat", {
                x: enemy.x,
                y: enemy.y,
                amount: ENEMY_XP_REWARD
              });
            }
          }
        };
      }
    }

    if (includePlayers) {
      for (const targetPlayer of this.state.players.values()) {
        if (targetPlayer.id === attackerId || targetPlayer.isDead) {
          continue;
        }
        const distanceAlong = distanceAlongSegment(
          startX,
          startY,
          endX,
          endY,
          targetPlayer.x,
          targetPlayer.y
        );
        if (distanceAlong < 0 || distanceAlong > maxDistance) {
          continue;
        }
        const distance = distanceToSegment(
          startX,
          startY,
          endX,
          endY,
          targetPlayer.x,
          targetPlayer.y
        );
        if (distance > radius) {
          continue;
        }
        if (!closest || distanceAlong < closest.distanceAlong) {
          closest = {
            distanceAlong,
            x: targetPlayer.x,
            y: targetPlayer.y,
          defense: targetPlayer.defense ?? 0,
            targetId: targetPlayer.id,
          applyDamage: (damage, now, attacker, critical) => {
            targetPlayer.hp = Math.max(0, targetPlayer.hp - damage);
            this.broadcast("damageFloat", {
              x: targetPlayer.x,
              y: targetPlayer.y,
              amount: damage,
              kind: "dealt",
              critical,
              targetId: targetPlayer.id
            });
              if (targetPlayer.hp <= 0) {
                targetPlayer.isDead = true;
                targetPlayer.vx = 0;
                targetPlayer.vy = 0;
                const gainedXp = Math.floor(targetPlayer.xp * 0.5);
                if (gainedXp > 0) {
                  attacker.xp += gainedXp;
                  this.applyLevelUps(attacker);
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
                targetPlayer.range = 1;
                targetPlayer.maxHp = 100;
                targetPlayer.hp = 0;
                targetPlayer.maxSp = 50;
                targetPlayer.sp = 0;
                this.playerDeadUntil.set(targetPlayer.id, now + PLAYER_RESPAWN_MS);
              }
            }
          };
        }
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

    const alivePlayers = Array.from(this.state.players.values()).filter(
      (player) => !player.isDead
    );
    for (const enemy of this.state.enemies.values()) {
      const target = this.findClosestAlivePlayer(enemy.x, enemy.y, alivePlayers);
      if (target) {
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const distance = Math.hypot(dx, dy) || 1;
        enemy.x = clamp(
          enemy.x + (dx / distance) * ENEMY_MOVE_SPEED * deltaSeconds,
          0,
          MAP_WIDTH
        );
        enemy.y = clamp(
          enemy.y + (dy / distance) * ENEMY_MOVE_SPEED * deltaSeconds,
          0,
          MAP_HEIGHT
        );
      }
      for (const player of alivePlayers) {
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance > ENEMY_CONTACT_RADIUS) {
          continue;
        }
        const cooldownKey = `${enemy.id}:${player.id}`;
        const lastHit = this.enemyContactCooldown.get(cooldownKey) ?? 0;
        if (now - lastHit < ENEMY_CONTACT_COOLDOWN_MS) {
          continue;
        }
        this.enemyContactCooldown.set(cooldownKey, now);
        this.applyEnemyContactDamage(player, enemy, now);
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

  private applyEnemyContactDamage(player: Player, enemy: Enemy, now: number) {
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
      player.range = 1;
      player.maxHp = 100;
      player.hp = 0;
      player.maxSp = 50;
      player.sp = 0;
      this.playerDeadUntil.set(player.id, now + PLAYER_RESPAWN_MS);
    }
  }

  private findClosestAlivePlayer(
    x: number,
    y: number,
    players: Player[]
  ): Player | undefined {
    let closest: Player | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of players) {
      const dx = player.x - x;
      const dy = player.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = player;
      }
    }
    return closest;
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
      player.range = 1;
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

const distanceToSegment = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
};

const distanceAlongSegment = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) {
    return -1;
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  return t < 0 || t > 1 ? -1 : Math.sqrt(lengthSq) * t;
};

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
const ATTACK_BASE_RANGE = 140;
const ATTACK_HIT_RADIUS = 16;
const ENEMY_CONTACT_DAMAGE = 8;
const ENEMY_MOVE_SPEED = 120;
const ENEMY_CONTACT_RADIUS = 32;
const ENEMY_CONTACT_COOLDOWN_MS = 600;
const PLAYER_HIT_COOLDOWN_MS = 600;
const PLAYER_RESPAWN_MS = 1500;
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
  baseMoveSpeed: 200,
  movePerPoint: 0.08,
  moveMaxMult: 2,
  baseAttackStat: 5,
  baseAttackDamage: 10,
  attackPerPoint: 1,
  defenseReducePerPoint: 0.6,
  minDamage: 1,
  baseAttackCooldownMs: 500,
  cooldownReductionPerPoint: 18,
  minAttackCooldownMs: 120,
  baseCritChance: 0.04,
  critPerLuck: 0.01,
  maxCritChance: 0.35,
  critMultiplier: 1.8
} as const;

const cryptoRandomId = () =>
  `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
