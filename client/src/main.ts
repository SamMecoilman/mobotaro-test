import Phaser from "phaser";
import { Client, Room } from "colyseus.js";

type PlayerState = {
  id: string;
  x: number;
  y: number;
  kind: string;
  hp?: number;
  maxHp?: number;
  sp?: number;
  maxSp?: number;
  isDead?: boolean;
  xp?: number;
  level?: number;
  statPoints?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  attackSpeed?: number;
  luck?: number;
};

type EnemyState = {
  id: string;
  x: number;
  y: number;
  kind: string;
  hp?: number;
  maxHp?: number;
};

type RoomState = {
  players: Map<string, PlayerState>;
  enemies: Map<string, EnemyState>;
  tick: number;
};

type AttackEffectHandle = {
  orb: Phaser.GameObjects.Arc;
  trail: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Arc;
  tween: Phaser.Tweens.Tween;
};

const extractFrameNumber = (path: string) => {
  const matches = path.match(/(\d+)/g);
  if (!matches || matches.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number.parseInt(matches[matches.length - 1], 10);
};
const extractBombFrameNumber = (path: string) => {
  const match = path.match(/frame_(\d+)/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number.parseInt(match[1], 10);
};

const MOBTARO_FPS = 8;
const PROFILE_FRAME_SIZE = 68;
const PROFILE_Y_OFFSET = -6;
const BOMB_FPS = 24;
const MAX_ACTIVE_BOMBS = 8;
const BOMB_Y_OFFSET = -50;
const BGM_VOLUME_DEFAULT = 0.5;
const SE_VOLUME_DEFAULT = 0.5;
const ATTACK_SE_PATHS = [
  new URL("../../mob/attack/voice1.wav", import.meta.url).href,
  new URL("../../mob/attack/voice2.wav", import.meta.url).href,
  new URL("../../mob/attack/voice3.wav", import.meta.url).href
];
const ATTACK_SE_KEYS = ATTACK_SE_PATHS.map((_, index) => `se_attack_${index + 1}`);
const DAMAGE_SE_PATHS = [
  new URL("../../mob/damage/voice1.wav", import.meta.url).href,
  new URL("../../mob/damage/voice2.wav", import.meta.url).href,
  new URL("../../mob/damage/voice3.wav", import.meta.url).href
];
const DAMAGE_SE_KEYS = DAMAGE_SE_PATHS.map((_, index) => `se_damage_${index + 1}`);
const DEATH_SE_PATH = new URL("../../audio/se/boobm.wav", import.meta.url).href;
const DEATH_SE_KEY = "se_death";
const DEATH_SE_SELF_BASE = 0.7;
const DEATH_SE_OTHER_BASE = 0.42;
const PC_HINT_ICON_SCALE = 1.1;
const PC_ACTION_ROW_HEIGHT_MULT = 1.25;
const ATTACK_COOLDOWN_MS = 500;
const PLAYER_SPRITE_SIZE = 100;
const mobtaroFrameEntries = Object.entries(
  import.meta.glob("../../images/mobtaro_sprite/*.png", {
    eager: true,
    import: "default"
  })
) as Array<[string, string]>;
const mobtaroSortedFrames = [...mobtaroFrameEntries].sort((left, right) => {
  const leftNumber = extractFrameNumber(left[0]);
  const rightNumber = extractFrameNumber(right[0]);
  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left[0].localeCompare(right[0]);
});
const mobtaroFrameKeys = mobtaroSortedFrames.map(
  (_entry, index) => `mobtaro_${index}`
);
const mobtaroFrameUrls = mobtaroSortedFrames.map((entry) => entry[1]);
const mobtaroProfileEntries = Object.entries(
  import.meta.glob("../../images/mobtaro_profilesprite/*.png", {
    eager: true,
    import: "default"
  })
) as Array<[string, string]>;
const mobtaroProfileSorted = [...mobtaroProfileEntries].sort((left, right) => {
  const leftNumber = extractFrameNumber(left[0]);
  const rightNumber = extractFrameNumber(right[0]);
  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left[0].localeCompare(right[0]);
});
const mobtaroProfileKeys = mobtaroProfileSorted.map(
  (_entry, index) => `mobtaro_profile_${index}`
);
const mobtaroProfileUrls = mobtaroProfileSorted.map((entry) => entry[1]);
const bombFrameEntries = Object.entries(
  import.meta.glob("../../images/bomb/frame_*.png", {
    eager: true,
    import: "default"
  })
) as Array<[string, string]>;
const bombSortedFrames = [...bombFrameEntries].sort((left, right) => {
  const leftNumber = extractBombFrameNumber(left[0]);
  const rightNumber = extractBombFrameNumber(right[0]);
  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left[0].localeCompare(right[0]);
});
const bombFrameKeys = bombSortedFrames.map((entry) => {
  const number = extractBombFrameNumber(entry[0]);
  return `bomb_${number.toString().padStart(2, "0")}`;
});
const bombFrameUrls = bombSortedFrames.map((entry) => entry[1]);

type TapStart = {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  time: number;
  isUi: boolean;
  isStick: boolean;
  moved: boolean;
  firedHold: boolean;
  pointerType: string;
};

class MainScene extends Phaser.Scene {
  private client?: Client;
  private room?: Room<RoomState>;
  private playerId?: string;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private playerSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private enemySprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private enemyHpTexts = new Map<string, Phaser.GameObjects.Text>();
  private statusText?: Phaser.GameObjects.Text;
  private selfSprite?: Phaser.GameObjects.Sprite;
  private selfIsDead = false;
  private pcHpValueEl?: HTMLElement | null;
  private pcHpFillEl?: HTMLElement | null;
  private pcSpValueEl?: HTMLElement | null;
  private pcSpFillEl?: HTMLElement | null;
  private pcXpFillEl?: HTMLElement | null;
  private pcXpLabelEl?: HTMLElement | null;
  private pcDetailButton?: HTMLElement | null;
  private pcLevelEl?: HTMLElement | null;
  private pcCharacterHint?: Phaser.GameObjects.Image;
  private pcCharacterHintEl?: HTMLImageElement;
  private pcCharacterLabelEl?: HTMLSpanElement;
  private pcOptionLabelEl?: HTMLSpanElement;
  private pcOptionHintEl?: HTMLImageElement;
  private pcOptionButtonEl?: HTMLElement;
  private pcActionUiGame?: Phaser.Game;
  private mobileDetailButton?: Phaser.GameObjects.Rectangle;
  private detailPanel?: Phaser.GameObjects.Container;
  private detailSprite?: Phaser.GameObjects.Sprite;
  private detailFields = new Map<string, Phaser.GameObjects.Text>();
  private detailPlusButtons = new Map<string, Phaser.GameObjects.Rectangle>();
  private detailPlusLabels = new Map<string, Phaser.GameObjects.Text>();
  private detailPlusButtonsFive = new Map<string, Phaser.GameObjects.Rectangle>();
  private detailPlusLabelsFive = new Map<string, Phaser.GameObjects.Text>();
  private detailStatPoints?: Phaser.GameObjects.Text;
  private detailLevelText?: Phaser.GameObjects.Text;
  private detailXpText?: Phaser.GameObjects.Text;
  private detailProfileCenter?: { x: number; y: number };
  private optionPanel?: Phaser.GameObjects.Container;
  private optionVolumeText?: Phaser.GameObjects.Text;
  private optionSeText?: Phaser.GameObjects.Text;
  private optionButtons: Phaser.GameObjects.Rectangle[] = [];
  private optionButtonLabels: Phaser.GameObjects.Text[] = [];
  private bgmSound?: Phaser.Sound.BaseSound;
  private bgmArmed = false;
  private bgmVolume = BGM_VOLUME_DEFAULT;
  private seVolume = SE_VOLUME_DEFAULT;
  private mobileGuideTexts: Phaser.GameObjects.Text[] = [];
  private mobileHpValueText?: Phaser.GameObjects.Text;
  private mobileHpFill?: Phaser.GameObjects.Rectangle;
  private mobileHpLabel?: Phaser.GameObjects.Text;
  private mobileSpLabel?: Phaser.GameObjects.Text;
  private mobileSpValueText?: Phaser.GameObjects.Text;
  private mobileSpFill?: Phaser.GameObjects.Rectangle;
  private mobileXpFill?: Phaser.GameObjects.Rectangle;
  private mobileXpLabel?: Phaser.GameObjects.Text;
  private mobileGoldText?: Phaser.GameObjects.Text;
  private mobileHpBarWidth = 0;
  private mobileHpBarHeight = 0;
  private mobileFabLabel?: Phaser.GameObjects.Text;
  private mobileMenuCenter?: { x: number; y: number };
  private mobilePanelCenters = new Map<string, { x: number; y: number }>();
  private mobileItemSlots: Phaser.GameObjects.Rectangle[] = [];
  private mobileSkillSlots: Phaser.GameObjects.Rectangle[] = [];
  private mobileResizeTimer?: Phaser.Time.TimerEvent;
  private wasd?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private stickBase?: Phaser.GameObjects.Arc;
  private stickKnob?: Phaser.GameObjects.Arc;
  private stickPointerId?: number;
  private stickBasePosition?: { x: number; y: number };
  private stickVector = { x: 0, y: 0 };
  private stickRadius = 48;
  private mobileFabButton?: Phaser.GameObjects.Arc;
  private mobileMenu?: Phaser.GameObjects.Container;
  private mobilePanels = new Map<string, Phaser.GameObjects.Container>();
  private mobileTapStarts = new Map<number, TapStart>();
  private mobileHoldTimers = new Map<number, Phaser.Time.TimerEvent>();
  private lastAimWorld?: { x: number; y: number };
  private lastMoveDirection?: { x: number; y: number };
  private lastKnownDead = new Map<string, boolean>();
  private activeBombs: Phaser.GameObjects.Sprite[] = [];
  private nextAttackAtMs = 0;
  private attackEffectCounter = 0;
  private attackEffects = new Map<string, AttackEffectHandle>();

  constructor() {
    super("main");
  }

  preload() {
    this.load.image(
      "background",
      new URL("../../map/school2.png", import.meta.url).href
    );
    this.load.image(
      "kibodo_c",
      new URL("../../images/kibodo/kibodo_c.png", import.meta.url).href
    );
    this.load.image(
      "kibodo_esc",
      new URL("../../images/kibodo/kibodo_esc.png", import.meta.url).href
    );
    this.load.audio(
      "bgm_school",
      new URL("../../audio/school/Pixel Playground Afternoon.wav", import.meta.url).href
    );
    ATTACK_SE_PATHS.forEach((path, index) => {
      this.load.audio(ATTACK_SE_KEYS[index], path);
    });
    DAMAGE_SE_PATHS.forEach((path, index) => {
      this.load.audio(DAMAGE_SE_KEYS[index], path);
    });
    if (DEATH_SE_PATH) {
      this.load.audio(DEATH_SE_KEY, DEATH_SE_PATH);
    }
    mobtaroFrameUrls.forEach((url, index) => {
      this.load.image(mobtaroFrameKeys[index], url);
    });
    mobtaroProfileUrls.forEach((url, index) => {
      this.load.image(mobtaroProfileKeys[index], url);
    });
    bombFrameUrls.forEach((url, index) => {
      this.load.image(bombFrameKeys[index], url);
    });
  }

  create() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys(
      "W,A,S,D"
    ) as MainScene["wasd"];

    const background = this.add
      .image(0, 0, "background")
      .setOrigin(0, 0)
      .setScale(4);
    this.cameras.main.setBounds(
      0,
      0,
      background.width * 4,
      background.height * 4
    );

    this.statusText = this.add
      .text(this.scale.width / 2, 8, "connecting...", {
        color: "#e6e6e6",
        fontSize: "16px",
        fontFamily: "Times New Roman"
      })
      .setDepth(10)
      .setScrollFactor(0)
      .setOrigin(0.5, 0);

    if (!this.anims.exists("mobtaro_walk")) {
      this.anims.create({
        key: "mobtaro_walk",
        frames: mobtaroFrameKeys.map((key) => ({ key })),
        frameRate: MOBTARO_FPS,
        repeat: -1
      });
    }
    if (mobtaroProfileKeys.length > 0 && !this.anims.exists("mobtaro_profile")) {
      this.anims.create({
        key: "mobtaro_profile",
        frames: mobtaroProfileKeys.map((key) => ({ key })),
        frameRate: MOBTARO_FPS,
        repeat: -1
      });
    }
    if (bombFrameKeys.length > 0 && !this.anims.exists("bomb_explosion")) {
      this.anims.create({
        key: "bomb_explosion",
        frames: bombFrameKeys.map((key) => ({ key })),
        frameRate: BOMB_FPS,
        repeat: 0
      });
    }

    const isMobile = shouldShowVirtualStick();
    document.body.classList.toggle("is-mobile", isMobile);
    document.body.classList.toggle("is-desktop", !isMobile);
    if (!isMobile) {
      this.pcHpValueEl = document.getElementById("pc-hp-value");
      this.pcHpFillEl = document.getElementById("pc-hp-fill");
      this.pcSpValueEl = document.getElementById("pc-sp-value");
      this.pcSpFillEl = document.getElementById("pc-sp-fill");
      this.pcXpFillEl = document.getElementById("pc-xp-fill");
      this.pcXpLabelEl = document.getElementById("pc-xp-label");
      this.pcLevelEl = document.getElementById("pc-level");
      this.pcDetailButton = document.getElementById(
        "pc-detail-button"
      ) as HTMLButtonElement | null;
      this.pcCharacterHint = this.add
        .image(0, 0, "kibodo_c")
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(40)
        .setVisible(false);
      this.ensurePcOptionHint();
      this.scale.on("resize", () => {
        this.updatePcCharacterHintPosition();
      });
      this.input.keyboard?.on("keydown-C", () => {
        const active = document.activeElement;
        if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) {
          return;
        }
        this.toggleDetailPanel();
      });
      this.input.keyboard?.on("keydown-ESC", () => {
        const active = document.activeElement;
        if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) {
          return;
        }
        this.toggleOptionPanel();
      });
    }
    this.input.addPointer(2);

    if (isMobile) {
      this.createVirtualStick();
      this.createMobileUi();
      this.setupPointerAttack();
      this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
        this.scheduleMobileUiResize(gameSize.width, gameSize.height);
      });
    } else {
      this.setupPointerAttack();
      this.createDetailPanel();
    }
    this.createOptionPanel();
    this.setupBgmPlayback();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerWithinCanvas(pointer)) {
        this.lastAimWorld = { x: pointer.worldX, y: pointer.worldY };
      }
    });
    const resetAttackState = () => this.resetAttackInputState();
    window.addEventListener("blur", resetAttackState);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        resetAttackState();
      }
    });
    this.game.canvas.addEventListener("pointerleave", resetAttackState);

    this.joinServer().catch((error) => {
      console.error(error);
      this.statusText?.setText("connection failed");
    });
  }

  update() {
    if (!this.room || !this.cursors || !this.playerId || !this.room.connection.isOpen) {
      return;
    }
    if (this.selfIsDead) {
      return;
    }

    const inputX =
      (this.cursors.left?.isDown ? -1 : 0) +
      (this.cursors.right?.isDown ? 1 : 0) +
      (this.wasd?.A.isDown ? -1 : 0) +
      (this.wasd?.D.isDown ? 1 : 0);
    const inputY =
      (this.cursors.up?.isDown ? -1 : 0) +
      (this.cursors.down?.isDown ? 1 : 0) +
      (this.wasd?.W.isDown ? -1 : 0) +
      (this.wasd?.S.isDown ? 1 : 0);

    const combinedX = clamp(inputX + this.stickVector.x, -1, 1);
    const combinedY = clamp(inputY + this.stickVector.y, -1, 1);

    if (combinedX !== 0 || combinedY !== 0) {
      const length = Math.hypot(combinedX, combinedY);
      this.lastMoveDirection = {
        x: combinedX / length,
        y: combinedY / length
      };
    }

    this.room.send("move", { x: combinedX, y: combinedY });
  }

  private createVirtualStick() {
    this.stickBase = this.add
      .circle(0, 0, this.stickRadius, 0x1a1b1f, 0.6)
      .setStrokeStyle(2, 0x2a2d33)
      .setScrollFactor(0)
      .setDepth(5);

    this.stickKnob = this.add
      .circle(0, 0, 18, 0x4aa3ff, 0.9)
      .setStrokeStyle(2, 0x1b2b3a)
      .setScrollFactor(0)
      .setDepth(6);

    this.layoutMobileStick();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== undefined) {
        return;
      }
      const base = this.stickBasePosition;
      if (!base) {
        return;
      }
      const distance = Phaser.Math.Distance.Between(
        pointer.x,
        pointer.y,
        base.x,
        base.y
      );
      if (distance <= this.stickRadius * 1.2) {
        this.stickPointerId = pointer.id;
        this.updateStick(pointer, base.x, base.y);
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== pointer.id) {
        return;
      }
      const base = this.stickBasePosition;
      if (!base) {
        return;
      }
      this.updateStick(pointer, base.x, base.y);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== pointer.id) {
        return;
      }
      this.stickPointerId = undefined;
      this.stickVector.x = 0;
      this.stickVector.y = 0;
      if (this.stickBasePosition) {
        this.stickKnob?.setPosition(
          this.stickBasePosition.x,
          this.stickBasePosition.y
        );
      }
    });
  }

  private updateStick(
    pointer: Phaser.Input.Pointer,
    baseX: number,
    baseY: number
  ) {
    const dx = pointer.x - baseX;
    const dy = pointer.y - baseY;
    const distance = Math.min(Math.hypot(dx, dy), this.stickRadius);
    const angle = Math.atan2(dy, dx);
    const knobX = baseX + Math.cos(angle) * distance;
    const knobY = baseY + Math.sin(angle) * distance;

    this.stickKnob?.setPosition(knobX, knobY);

    const normalizedX = dx / this.stickRadius;
    const normalizedY = dy / this.stickRadius;
    this.stickVector.x = clamp(normalizedX, -1, 1);
    this.stickVector.y = clamp(normalizedY, -1, 1);
  }

  private layoutMobileStick() {
    const { width, height } = this.scale;
    const margin = 20;
    const targetX = 90;
    const targetY = height - Math.max(140, height * 0.22);
    const baseX = clamp(
      targetX,
      margin + this.stickRadius,
      width - margin - this.stickRadius
    );
    const baseY = clamp(
      targetY,
      margin + this.stickRadius,
      height - margin - this.stickRadius
    );
    this.stickBasePosition = { x: baseX, y: baseY };
    this.stickBase?.setPosition(baseX, baseY);
    this.stickKnob?.setPosition(baseX, baseY);
  }

  private async joinServer() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const hostname = window.location.hostname || "localhost";
    this.client = new Client(`${protocol}://${hostname}:2567`);
    this.room = await this.client.joinOrCreate<RoomState>("survivor");
    this.playerId = this.room.sessionId;

    this.statusText?.setText("connected");

      this.room.state.players.onAdd((player, id) => {
        const isSelf = id === this.playerId;
        if (isSelf) {
        const sprite = this.add
          .sprite(player.x, player.y, mobtaroFrameKeys[0])
          .setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE)
          .play("mobtaro_walk");
          this.selfSprite = sprite;
          this.cameras.main.startFollow(sprite);
          this.updateSelfHud(player);
        } else {
          const sprite = this.add
          .sprite(player.x, player.y, mobtaroFrameKeys[0])
          .setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE)
          .setAlpha(0.55)
          .play("mobtaro_walk");
          this.playerSprites.set(id, sprite);
        }
        this.lastKnownDead.set(id, Boolean(player.isDead));
        player.onChange(() => {
          if (id === this.playerId) {
            this.selfSprite?.setPosition(player.x, player.y);
            this.updateSelfHud(player);
            this.handleDeathFx(id, player.x, player.y, Boolean(player.isDead));
            return;
          }
          const otherSprite = this.playerSprites.get(id);
          if (otherSprite) {
            otherSprite.setPosition(player.x, player.y);
          }
          this.handleDeathFx(id, player.x, player.y, Boolean(player.isDead));
        });
      });

      this.room.state.players.onRemove((_player, id) => {
        const sprite = this.playerSprites.get(id);
        if (sprite) {
          sprite.destroy();
          this.playerSprites.delete(id);
        }
        this.lastKnownDead.delete(id);
        if (id === this.playerId) {
          this.cameras.main.stopFollow();
          this.selfSprite?.destroy();
        this.selfSprite = undefined;
      }
    });

    this.room.state.enemies.onAdd((enemy, id) => {
      const sprite = this.add
        .rectangle(enemy.x, enemy.y, 14, 14, 0xff7b7b)
        .setStrokeStyle(1, 0x4b1b1b)
        .setDepth(6);
      this.enemySprites.set(id, sprite);
      const hpText = this.add
        .text(enemy.x, enemy.y - 14, this.formatHp(enemy.hp, enemy.maxHp), {
          color: "#f1f1f1",
          fontSize: "10px",
          fontFamily: "Times New Roman"
        })
        .setOrigin(0.5)
        .setDepth(9);
      this.enemyHpTexts.set(id, hpText);
      enemy.onChange(() => {
        const enemySprite = this.enemySprites.get(id);
        if (enemySprite) {
          enemySprite.setPosition(enemy.x, enemy.y);
        }
        const enemyText = this.enemyHpTexts.get(id);
        if (enemyText) {
          enemyText.setText(this.formatHp(enemy.hp, enemy.maxHp));
          enemyText.setPosition(enemy.x, enemy.y - 14);
        }
      });
    });

    this.room.state.enemies.onChange((enemy, id) => {
      const sprite = this.enemySprites.get(id);
      if (sprite) {
        sprite.setPosition(enemy.x, enemy.y);
      }
      const hpText = this.enemyHpTexts.get(id);
      if (hpText) {
        hpText.setText(this.formatHp(enemy.hp, enemy.maxHp));
        hpText.setPosition(enemy.x, enemy.y - 14);
      }
    });

    this.room.state.enemies.onRemove((_enemy, id) => {
      const sprite = this.enemySprites.get(id);
      if (sprite) {
        sprite.destroy();
        this.enemySprites.delete(id);
      }
      const hpText = this.enemyHpTexts.get(id);
      if (hpText) {
        hpText.destroy();
        this.enemyHpTexts.delete(id);
      }
    });

    this.room.state.onChange(() => {
      this.statusText?.setText(`connected | tick ${this.room?.state.tick ?? 0}`);
    });

      this.room.onMessage("xpFloat", (message) => {
        if (!message) {
          return;
        }
        this.spawnXpFloat(message.x, message.y, message.amount);
      });
      this.room.onMessage("damageFloat", (message) => {
        if (!message) {
          return;
        }
        const resolvedKind =
          message.targetId && message.targetId === this.playerId ? "received" : message.kind;
        this.spawnDamageFloat(
          message.x,
          message.y,
          message.amount,
          resolvedKind,
          message.critical
        );
        this.playRandomSe(DAMAGE_SE_KEYS, 1);
        if (message.targetId === this.playerId) {
          this.spawnSelfDamageEffect(
            this.selfSprite?.x ?? message.x,
            this.selfSprite?.y ?? message.y
          );
        }
      });
      this.room.onMessage("attackEffect", (message) => {
        if (!message) {
          return;
        }
        if (message.attackerId && message.attackerId === this.playerId) {
          return;
        }
        const attackId = message.attackId as string | undefined;
        if (attackId && this.attackEffects.has(attackId)) {
          return;
        }
        this.spawnAttackEffect(
          message.fromX,
          message.fromY,
          message.toX,
          message.toY,
          attackId
        );
      });
      this.room.onMessage("attackHit", (message) => {
        if (!message || !message.attackId) {
          return;
        }
        this.destroyAttackEffect(message.attackId, message.x, message.y);
      });

    this.room.onLeave(() => {
      this.statusText?.setText("connection closed");
      this.room = undefined;
    });
  }

  private createMobileUi() {
    const { width, height } = this.scale;
    const uiDepth = 30;
    const panelStroke = 0x000000;
    const labelStyle = {
      color: "#e6e6e6",
      fontSize: "11px",
      fontFamily: "Times New Roman"
    };
    const valueStyle = {
      color: "#b9b9b9",
      fontSize: "9px",
      fontFamily: "Times New Roman"
    };

    const barWidth = 96;
    const barHeight = 6;
    this.mobileHpBarWidth = barWidth;
    this.mobileHpBarHeight = barHeight;
    const hpX = 12;
    const hpY = 12;
    this.mobileHpLabel = this.add
      .text(hpX, hpY, "HP / Lv: 1", labelStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);
    this.mobileHpFill = this.add
      .rectangle(hpX, hpY + 14, barWidth, barHeight, 0x8b1e1e, 0.9)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(uiDepth);
    this.mobileHpValueText = this.add
      .text(hpX, hpY + 21, "100 / 100", valueStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);

    const spY = hpY + 30;
    this.mobileSpLabel = this.add
      .text(hpX, spY, "SP", labelStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);
    this.mobileSpFill = this.add
      .rectangle(hpX, spY + 14, barWidth, barHeight, 0x1b4a8b, 0.9)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(uiDepth);
    this.mobileSpValueText = this.add
      .text(hpX, spY + 21, "100 / 100", valueStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);

    const guideStyle = {
      color: "#b1b1b1",
      fontSize: "9px",
      fontFamily: "Times New Roman"
    };
    const guideStartY = spY + 36;
    this.mobileGuideTexts = [
      this.add
        .text(hpX, guideStartY, "MOVE: STICK", guideStyle)
        .setDepth(uiDepth)
        .setScrollFactor(0),
      this.add
        .text(hpX, guideStartY + 12, "ATK: TAP / HOLD", guideStyle)
        .setDepth(uiDepth)
        .setScrollFactor(0)
    ];
    this.mobileGoldText = this.add
      .text(hpX, guideStartY + 26, "GOLD: 0", guideStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);

    const fabRadius = 22;
    const fabX = width - 28;
    const fabY = 28;
    this.mobileFabButton = this.add
      .circle(fabX, fabY, fabRadius, 0x1a1d22, 0.9)
      .setStrokeStyle(2, panelStroke)
      .setScrollFactor(0)
      .setDepth(uiDepth)
      .setInteractive({ useHandCursor: true });
    this.mobileFabLabel = this.add
      .text(fabX, fabY, "+", {
        color: "#ffffff",
        fontSize: "18px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(uiDepth + 1);

    const menuWidth = 160;
    const menuHeight = 180;
    const menuX = width / 2;
    const menuY = height / 2;
    const menuBg = this.add
      .rectangle(menuX, menuY, menuWidth, menuHeight, 0x101216, 0.9)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setDepth(uiDepth + 2);

    const menuButtons: Array<{
      label: string;
      onPress: () => void;
    }> = [
      {
        label: "Inventory",
        onPress: () => this.toggleMobilePanel("inventory")
      },
      {
        label: "Character",
        onPress: () => this.toggleDetailPanel()
      },
      {
        label: "Settings",
        onPress: () => this.toggleMobilePanel("settings")
      }
    ];

    const menuItems: Phaser.GameObjects.GameObject[] = [menuBg];
    const buttonWidth = menuWidth - 24;
    const buttonHeight = 30;
    const buttonStartY = menuY - menuHeight / 2 + 20 + buttonHeight / 2;
    menuButtons.forEach((button, index) => {
      const y = buttonStartY + index * (buttonHeight + 8);
      const box = this.add
        .rectangle(menuX, y, buttonWidth, buttonHeight, 0x1a1d22, 0.9)
        .setStrokeStyle(1, panelStroke)
        .setScrollFactor(0)
        .setDepth(uiDepth + 3)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(menuX, y, button.label, {
          color: "#e6e6e6",
          fontSize: "12px",
          fontFamily: "Times New Roman"
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(uiDepth + 4);
      box.on("pointerdown", () => {
        button.onPress();
        this.mobileMenu?.setVisible(false);
      });
      menuItems.push(box, label);
    });

    const menu = this.add.container(0, 0, menuItems);
    menu.setDepth(uiDepth + 2);
    menu.setVisible(false);
    this.mobileMenu = menu;
    this.mobileMenuCenter = { x: menuX, y: menuY };

    this.mobileFabButton.on("pointerdown", () => {
      if (!this.mobileMenu) {
        return;
      }
      this.mobileMenu.setVisible(!this.mobileMenu.visible);
      if (this.mobileMenu.visible) {
        this.detailPanel?.setVisible(false);
      }
    });

    const panelWidth = Math.min(280, width - 40);
    const panelHeight = Math.min(280, height - 200);
    const panelX = width / 2;
    const panelY = height / 2;

    const inventoryPanel = this.createMobileOverlayPanel(
      "Inventory",
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      ["Items", "Tap to inspect"]
    );
    const settingsPanel = this.createMobileOverlayPanel(
      "Settings",
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      ["Coming soon"]
    );
    [inventoryPanel, settingsPanel].forEach((panel) => {
      panel.setDepth(uiDepth + 5);
    });
    this.mobilePanels.set("inventory", inventoryPanel);
    this.mobilePanelCenters.set("inventory", { x: panelX, y: panelY });
    this.mobilePanels.set("settings", settingsPanel);
    this.mobilePanelCenters.set("settings", { x: panelX, y: panelY });

    this.createDetailPanel();
    this.createMobileBottomSlots();
    this.layoutMobileUi();
  }

  private createMobileOverlayPanel(
    title: string,
    x: number,
    y: number,
    width: number,
    height: number,
    lines: string[]
  ) {
    const panelStroke = 0x000000;
    const bg = this.add
      .rectangle(x, y, width, height, 0x0f1115, 0.92)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0);
    const titleText = this.add
      .text(x - width / 2 + 12, y - height / 2 + 10, title, {
        color: "#e6e6e6",
        fontSize: "14px",
        fontFamily: "Times New Roman"
      })
      .setScrollFactor(0);
    const bodyText = this.add
      .text(x - width / 2 + 12, y - height / 2 + 36, lines.join("\n"), {
        color: "#c8c8c8",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setScrollFactor(0);
    const closeBox = this.add
      .rectangle(x + width / 2 - 18, y - height / 2 + 16, 24, 24, 0x1a1d22, 0.95)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const closeLabel = this.add
      .text(x + width / 2 - 18, y - height / 2 + 16, "X", {
        color: "#e6e6e6",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const panel = this.add.container(0, 0, [
      bg,
      titleText,
      bodyText,
      closeBox,
      closeLabel
    ]);
    panel.setVisible(false);
    closeBox.on("pointerdown", () => panel.setVisible(false));
    return panel;
  }

  private createMobileBottomSlots() {
    const uiDepth = 30;
    const slotSize = 34;
    const slotGap = 6;
    for (let i = 0; i < 5; i += 1) {
      const slot = this.add
        .rectangle(0, 0, slotSize, slotSize, 0xf4f4f4, 1)
        .setStrokeStyle(1, 0x000000)
        .setScrollFactor(0)
        .setDepth(uiDepth);
      this.mobileItemSlots.push(slot);
    }
    for (let i = 0; i < 3; i += 1) {
      const slot = this.add
        .rectangle(0, 0, slotSize, slotSize, 0xf4f4f4, 1)
        .setStrokeStyle(1, 0x000000)
        .setScrollFactor(0)
        .setDepth(uiDepth);
      this.mobileSkillSlots.push(slot);
    }
  }

  private layoutMobileUi() {
    if (!isMobileDevice) {
      return;
    }
    const { width, height } = this.scale;
    const fabX = width - 28;
    const fabY = 28;
    this.mobileFabButton?.setPosition(fabX, fabY);
    this.mobileFabLabel?.setPosition(fabX, fabY);

    if (this.mobileMenu && this.mobileMenuCenter) {
      const deltaX = width / 2 - this.mobileMenuCenter.x;
      const deltaY = height / 2 - this.mobileMenuCenter.y;
      this.mobileMenu.setPosition(deltaX, deltaY);
    }
    this.mobilePanels.forEach((panel, key) => {
      const center = this.mobilePanelCenters.get(key);
      if (!center) {
        return;
      }
      const deltaX = width / 2 - center.x;
      const deltaY = height / 2 - center.y;
      panel.setPosition(deltaX, deltaY);
    });

    const slotSize = 34;
    const slotGap = 6;
    const groupGap = 16;
    const itemGroupWidth = 5 * slotSize + 4 * slotGap;
    const skillGroupWidth = 3 * slotSize + 2 * slotGap;
    const totalWidth = itemGroupWidth + groupGap + skillGroupWidth;
    const startX = width / 2 - totalWidth / 2 + slotSize / 2;
    const y = height - slotSize / 2 - 12;
    this.mobileItemSlots.forEach((slot, index) => {
      const x = startX + index * (slotSize + slotGap);
      slot.setPosition(x, y);
    });
    const skillStartX = startX + itemGroupWidth + groupGap;
    this.mobileSkillSlots.forEach((slot, index) => {
      const x = skillStartX + index * (slotSize + slotGap);
      slot.setPosition(x, y);
    });
  }

  private toggleMobilePanel(name: string) {
    const panel = this.mobilePanels.get(name);
    if (!panel) {
      return;
    }
    const nextVisible = !panel.visible;
    this.mobilePanels.forEach((entry) => entry.setVisible(false));
    panel.setVisible(nextVisible);
  }

  private setupPointerAttack() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.pointerType === "mouse" && pointer.button !== 0) {
        return;
      }
      const isUi = this.isPointerOverMobileUi(pointer);
      const isStick = this.isPointerOverStick(pointer);
      const start: TapStart = {
        x: pointer.x,
        y: pointer.y,
        worldX: pointer.worldX,
        worldY: pointer.worldY,
        time: pointer.downTime,
        isUi,
        isStick,
        moved: false,
        firedHold: false,
        pointerType: pointer.pointerType
      };
      this.mobileTapStarts.set(pointer.id, start);
      if (isUi || isStick) {
        return;
      }
      const holdTimer = this.time.addEvent({
        delay: 240,
        loop: true,
        callback: () => {
          const current = this.mobileTapStarts.get(pointer.id);
          if (!current) {
            return;
          }
          current.firedHold = true;
          this.handleAttackFromPointer(pointer, "hold");
        }
      });
      this.mobileHoldTimers.set(pointer.id, holdTimer);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const start = this.mobileTapStarts.get(pointer.id);
      if (!start) {
        return;
      }
      this.mobileTapStarts.delete(pointer.id);
      const holdTimer = this.mobileHoldTimers.get(pointer.id);
      if (holdTimer) {
        holdTimer.destroy();
        this.mobileHoldTimers.delete(pointer.id);
      }
      const distance = Math.hypot(pointer.x - start.x, pointer.y - start.y);
      if (distance > 12 || start.moved) {
        return;
      }
      if (start.isUi || start.isStick) {
        return;
      }
      if (start.firedHold) {
        return;
      }
      if (pointer.upTime - start.time <= 240) {
        this.handleAttackFromPointer(pointer, "tap");
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const start = this.mobileTapStarts.get(pointer.id);
      if (!start) {
        return;
      }
      const distance = Math.hypot(pointer.x - start.x, pointer.y - start.y);
      if (distance > 12) {
        start.moved = true;
      }
    });
  }

  private isPointerOverMobileUi(pointer: Phaser.Input.Pointer) {
    if (this.detailPanel?.visible) {
      return true;
    }
    const targets: Phaser.GameObjects.GameObject[] = [];
    if (this.mobileFabButton) {
      targets.push(this.mobileFabButton);
    }
    if (this.mobileFabLabel) {
      targets.push(this.mobileFabLabel);
    }
    if (this.mobileHpLabel) {
      targets.push(this.mobileHpLabel);
    }
    if (this.mobileHpFill) {
      targets.push(this.mobileHpFill);
    }
    if (this.mobileHpValueText) {
      targets.push(this.mobileHpValueText);
    }
    if (this.mobileSpLabel) {
      targets.push(this.mobileSpLabel);
    }
    if (this.mobileSpFill) {
      targets.push(this.mobileSpFill);
    }
    if (this.mobileSpValueText) {
      targets.push(this.mobileSpValueText);
    }
    if (this.mobileGoldText) {
      targets.push(this.mobileGoldText);
    }
    this.mobileGuideTexts.forEach((guide) => targets.push(guide));
    if (this.mobileMenu?.visible) {
      targets.push(this.mobileMenu);
    }
    this.mobilePanels.forEach((panel) => {
      if (panel.visible) {
        targets.push(panel);
      }
    });
    this.mobileItemSlots.forEach((slot) => targets.push(slot));
    this.mobileSkillSlots.forEach((slot) => targets.push(slot));
    if (this.optionPanel?.visible) {
      targets.push(this.optionPanel);
    }

    return targets.some((target) =>
      Phaser.Geom.Rectangle.Contains(target.getBounds(), pointer.x, pointer.y)
    );
  }

  private isPointerOverStick(pointer: Phaser.Input.Pointer) {
    if (!this.stickBasePosition) {
      return false;
    }
    const distance = Math.hypot(
      pointer.x - this.stickBasePosition.x,
      pointer.y - this.stickBasePosition.y
    );
    return distance <= this.stickRadius * 1.2;
  }

  private handleAttackFromPointer(
    pointer: Phaser.Input.Pointer,
    source: string
  ) {
    if (!this.selfSprite) {
      return;
    }
    let target = this.lastAimWorld;
    if (this.isPointerWithinCanvas(pointer)) {
      target = { x: pointer.worldX, y: pointer.worldY };
    }
    if (!target && this.lastMoveDirection) {
      target = {
        x: this.selfSprite.x + this.lastMoveDirection.x * 240,
        y: this.selfSprite.y + this.lastMoveDirection.y * 240
      };
    }
    if (!target) {
      return;
    }
    this.lastAimWorld = target;
    this.fireAttack(source, target);
  }

  private handleAttackFromWorld(
    worldX: number,
    worldY: number,
    source: string
  ) {
    if (!this.selfSprite) {
      return;
    }
    const target = { x: worldX, y: worldY };
    this.lastAimWorld = target;
    this.fireAttack(source, target);
  }

  private handleAttackFromButton(source: string) {
    if (!this.selfSprite) {
      return;
    }
    if (this.lastAimWorld) {
      this.fireAttack(source, this.lastAimWorld);
      return;
    }
    if (!this.lastMoveDirection) {
      return;
    }
    const fallbackTarget = {
      x: this.selfSprite.x + this.lastMoveDirection.x * 240,
      y: this.selfSprite.y + this.lastMoveDirection.y * 240
    };
    this.fireAttack(source, fallbackTarget);
  }

  private fireAttack(source: string, target: { x: number; y: number }) {
    if (!this.selfSprite || this.selfIsDead) {
      return;
    }
    const now = Date.now();
    if (now < this.nextAttackAtMs) {
      return;
    }
    this.nextAttackAtMs = now + ATTACK_COOLDOWN_MS;
    const attackId = this.createAttackId();
    this.spawnAttackEffect(
      this.selfSprite.x,
      this.selfSprite.y,
      target.x,
      target.y,
      attackId
    );
    this.playRandomSe(ATTACK_SE_KEYS, 1);
    if (!this.room || !this.room.connection.isOpen) {
      return;
    }
    this.room.send("attack", { source, x: target.x, y: target.y, attackId });
  }

  private resetAttackInputState() {
    this.mobileTapStarts.clear();
    this.mobileHoldTimers.forEach((timer) => timer.destroy());
    this.mobileHoldTimers.clear();
  }

  private createAttackId() {
    this.attackEffectCounter += 1;
    const seed = this.playerId ?? "local";
    return `${seed}-${Date.now()}-${this.attackEffectCounter}`;
  }

  private spawnAttackEffect(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    attackId?: string
  ) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const distance = Math.hypot(dx, dy);
    if (distance < 6) {
      return;
    }
    const maxDistance = 420;
    const travelDistance = Math.min(distance, maxDistance);
    const nx = dx / distance;
    const ny = dy / distance;
    const finalX = originX + nx * travelDistance;
    const finalY = originY + ny * travelDistance;
    const angle = Math.atan2(ny, nx);

    const orb = this.add
      .circle(originX, originY, 6, 0x9fdcff, 0.95)
      .setDepth(9);
    const trail = this.add
      .rectangle(originX, originY, 18, 4, 0x9fdcff, 0.35)
      .setDepth(8)
      .setRotation(angle);
    const glow = this.add
      .circle(originX, originY, 10, 0x6fb6ff, 0.25)
      .setDepth(7);

    const duration = Math.max(160, travelDistance * 0.8);
    const tween = this.tweens.add({
      targets: [orb, trail, glow],
      x: finalX,
      y: finalY,
      duration,
      ease: "Sine.Out",
      onComplete: () => {
        orb.destroy();
        trail.destroy();
        glow.destroy();
        if (attackId) {
          this.attackEffects.delete(attackId);
        }
      }
    });
    if (attackId) {
      this.attackEffects.set(attackId, { orb, trail, glow, tween });
    }
  }

  private destroyAttackEffect(attackId: string, x?: number, y?: number) {
    const effect = this.attackEffects.get(attackId);
    if (!effect) {
      return;
    }
    effect.tween.stop();
    if (typeof x === "number" && typeof y === "number") {
      effect.orb.setPosition(x, y);
      effect.trail.setPosition(x, y);
      effect.glow.setPosition(x, y);
    }
    effect.orb.destroy();
    effect.trail.destroy();
    effect.glow.destroy();
    this.attackEffects.delete(attackId);
  }

  private spawnXpFloat(x: number, y: number, amount: number) {
    const label = this.add
      .text(x, y - 12, `+${amount} XP`, {
        color: "#f1e6b8",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setDepth(10);
    label.setAlpha(0);
    this.tweens.add({
      targets: label,
      y: y - 42,
      alpha: 1,
      duration: 200,
      ease: "Sine.Out",
      onComplete: () => {
        this.tweens.add({
          targets: label,
          alpha: 0,
          duration: 400,
          ease: "Sine.In",
          onComplete: () => label.destroy()
        });
      }
    });
  }

  private spawnDamageFloat(
    x: number,
    y: number,
    amount: number,
    kind?: string,
    critical?: boolean
  ) {
    const isCritical = Boolean(critical);
    const color =
      isCritical ? "#4a0d0d" : kind === "received" ? "#ff2f2f" : "#ff7a7a";
    const label = this.add
      .text(x, y - 10, `-${amount}`, {
        color,
        fontSize: "12px",
        fontFamily: "Times New Roman",
        fontStyle: isCritical ? "bold" : "normal"
      })
      .setOrigin(0.5)
      .setDepth(10);
    label.setAlpha(0);
    this.tweens.add({
      targets: label,
      y: y - 36,
      alpha: 1,
      duration: 200,
      ease: "Sine.Out",
      onComplete: () => {
        this.tweens.add({
          targets: label,
          alpha: 0,
          duration: 400,
          ease: "Sine.In",
          onComplete: () => label.destroy()
        });
      }
    });
  }

  private spawnSelfDamageEffect(x: number, y: number) {
    const pulse = this.add
      .circle(x, y, 24, 0xff2f2f, 0.35)
      .setDepth(8);
    this.tweens.add({
      targets: pulse,
      alpha: 0,
      duration: 260,
      ease: "Sine.Out",
      onComplete: () => pulse.destroy()
    });
  }

  private createDetailPanel() {
    const { width, height } = this.scale;
    const uiDepth = 40;
    const panelWidth = Math.min(360, width - 40);
    const panelHeight = Math.min(420, height - 80);
    const panelX = width / 2;
    const panelY = height / 2;
    const panelStroke = 0x000000;

    const bg = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0xf2f2f2, 0.95)
      .setStrokeStyle(2, panelStroke)
      .setScrollFactor(0);

    const title = this.add
      .text(panelX - panelWidth / 2 + 16, panelY - panelHeight / 2 + 12, "STUDENT ID", {
        color: "#1a1b1f",
        fontSize: "14px",
        fontFamily: "Times New Roman"
      })
      .setScrollFactor(0);

    const portraitX = panelX - panelWidth / 2 + 60;
    const portraitY = panelY - panelHeight / 2 + 90;
    const portraitFrame = this.add
      .rectangle(portraitX, portraitY, PROFILE_FRAME_SIZE, PROFILE_FRAME_SIZE, 0xffffff, 1)
      .setStrokeStyle(2, panelStroke)
      .setScrollFactor(0);
    const portraitMask = this.add.graphics();
    portraitMask.fillStyle(0xffffff);
    portraitMask.fillRect(
      portraitX - PROFILE_FRAME_SIZE / 2,
      portraitY - PROFILE_FRAME_SIZE / 2,
      PROFILE_FRAME_SIZE,
      PROFILE_FRAME_SIZE
    );
    const mask = portraitMask.createGeometryMask();
    portraitMask.setScrollFactor(0);

    const profileKey = mobtaroProfileKeys[0] ?? mobtaroFrameKeys[0];
    const profileAnim =
      mobtaroProfileKeys.length > 0 ? "mobtaro_profile" : "mobtaro_walk";
    this.detailSprite = this.add
      .sprite(portraitX, portraitY + PROFILE_Y_OFFSET, profileKey)
      .play(profileAnim);
    this.detailSprite.setScrollFactor(0);
    this.detailSprite.setMask(mask);
    this.detailProfileCenter = { x: portraitX, y: portraitY };
    this.applyProfileScale(this.detailSprite);

    const infoX = panelX - panelWidth / 2 + 16;
    const infoStartY = portraitY + PROFILE_FRAME_SIZE / 2 + 10;
    const infoLineHeight = 16;
    this.detailLevelText = this.add
      .text(infoX, infoStartY, "LV: 1", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setScrollFactor(0);
    this.detailXpText = this.add
      .text(infoX, infoStartY + infoLineHeight, "XP: 0 / 100", {
        color: "#1a1b1f",
        fontSize: "11px",
        fontFamily: "Times New Roman"
      })
      .setScrollFactor(0);
    const statPointText = this.add
      .text(infoX, infoStartY + infoLineHeight * 2, "SPT: 0", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setScrollFactor(0);
    this.detailStatPoints = statPointText;

    const statsStartX = panelX - panelWidth / 2 + 140;
    const statsStartY = panelY - panelHeight / 2 + 110;
    const statRows = [
      ["HP", "hp"],
      ["SP", "sp"],
      ["ATK", "atk"],
      ["DEF", "def"],
      ["LUCK", "luck"],
      ["MOVE", "moveSpeed"],
      ["ATK SPD", "atkSpeed"]
    ];
    statRows.forEach((row, index) => {
      const [label, key] = row;
      const y = statsStartY + index * 32;
      const nameText = this.add
        .text(statsStartX, y, label, {
          color: "#1a1b1f",
          fontSize: "12px",
          fontFamily: "Times New Roman"
        })
        .setScrollFactor(0);
      const valueText = this.add
        .text(statsStartX + 60, y, "-", {
          color: "#1a1b1f",
          fontSize: "12px",
          fontFamily: "Times New Roman"
        })
        .setScrollFactor(0);
        const plusBox = this.add
          .rectangle(statsStartX + 110, y + 6, 18, 18, 0xffffff, 1)
          .setStrokeStyle(1, panelStroke)
          .setScrollFactor(0)
          .setInteractive({ useHandCursor: true });
        const plusLabel = this.add
          .text(statsStartX + 110, y + 6, "+1", {
            color: "#1a1b1f",
            fontSize: "10px",
            fontFamily: "Times New Roman"
          })
          .setOrigin(0.5)
          .setScrollFactor(0);
        const plusFiveBox = this.add
          .rectangle(statsStartX + 134, y + 6, 22, 18, 0xffffff, 1)
          .setStrokeStyle(1, panelStroke)
          .setScrollFactor(0)
          .setInteractive({ useHandCursor: true });
        const plusFiveLabel = this.add
          .text(statsStartX + 134, y + 6, "+5", {
            color: "#1a1b1f",
            fontSize: "10px",
            fontFamily: "Times New Roman"
          })
          .setOrigin(0.5)
          .setScrollFactor(0);
        plusBox.on("pointerdown", () => this.sendAssignStat(key, 1));
        plusFiveBox.on("pointerdown", () => this.sendAssignStat(key, 5));
        this.detailFields.set(key, valueText);
        this.detailPlusButtons.set(key, plusBox);
        this.detailPlusButtonsFive.set(key, plusFiveBox);
        this.detailFields.set(`${key}-label`, nameText);
        this.detailPlusLabels.set(key, plusLabel);
        this.detailPlusLabelsFive.set(key, plusFiveLabel);
    });

    const closeBox = this.add
      .rectangle(panelX + panelWidth / 2 - 20, panelY - panelHeight / 2 + 18, 22, 22, 0xffffff, 1)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const closeLabel = this.add
      .text(panelX + panelWidth / 2 - 20, panelY - panelHeight / 2 + 18, "X", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    closeBox.on("pointerdown", () => this.toggleDetailPanel(false));

    this.detailPanel = this.add.container(0, 0, [
      bg,
      title,
      this.detailLevelText,
      this.detailXpText,
      portraitFrame,
      portraitMask,
      this.detailSprite,
      closeBox,
      closeLabel,
      statPointText
    ]);
    this.detailFields.forEach((value) => {
      this.detailPanel?.add(value);
    });
    this.detailPlusButtons.forEach((value) => {
      this.detailPanel?.add(value);
    });
    this.detailPlusButtonsFive.forEach((value) => {
      this.detailPanel?.add(value);
    });
    this.detailPlusLabels.forEach((value) => {
      this.detailPanel?.add(value);
    });
    this.detailPlusLabelsFive.forEach((value) => {
      this.detailPanel?.add(value);
    });
    this.detailPanel.setScrollFactor(0);
    this.detailPanel.setDepth(uiDepth);
    this.detailPanel.setVisible(false);
  }

  private rebuildDetailPanelForResize() {
    if (!this.detailPanel) {
      return;
    }
    const wasVisible = this.detailPanel.visible;
    this.destroyDetailPanel();
    this.createDetailPanel();
    if (wasVisible) {
      this.detailPanel?.setVisible(true);
    }
  }

  private destroyDetailPanel() {
    this.detailPanel?.destroy(true);
    this.detailPanel = undefined;
    this.detailSprite = undefined;
    this.detailStatPoints = undefined;
    this.detailLevelText = undefined;
    this.detailXpText = undefined;
    this.detailProfileCenter = undefined;
    this.detailFields.clear();
    this.detailPlusButtons.clear();
    this.detailPlusLabels.clear();
    this.detailPlusButtonsFive.clear();
    this.detailPlusLabelsFive.clear();
  }

  private rebuildMobileUiForResize() {
    this.destroyMobileUi();
    this.createMobileUi();
    this.layoutMobileStick();
  }

  private scheduleMobileUiResize(width: number, height: number) {
    if (width < 10 || height < 10) {
      return;
    }
    this.mobileResizeTimer?.remove(false);
    this.mobileResizeTimer = this.time.delayedCall(80, () => {
      if (this.scale.width < 10 || this.scale.height < 10) {
        this.scheduleMobileUiResize(this.scale.width, this.scale.height);
        return;
      }
      this.rebuildMobileUiForResize();
    });
  }

  private destroyMobileUi() {
    this.mobileHpLabel?.destroy();
    this.mobileHpLabel = undefined;
    this.mobileHpFill?.destroy();
    this.mobileHpFill = undefined;
    this.mobileHpValueText?.destroy();
    this.mobileHpValueText = undefined;
    this.mobileSpLabel?.destroy();
    this.mobileSpLabel = undefined;
    this.mobileSpFill?.destroy();
    this.mobileSpFill = undefined;
    this.mobileSpValueText?.destroy();
    this.mobileSpValueText = undefined;
    this.mobileGuideTexts.forEach((guide) => guide.destroy());
    this.mobileGuideTexts = [];
    this.mobileGoldText?.destroy();
    this.mobileGoldText = undefined;
    this.mobileFabButton?.destroy();
    this.mobileFabButton = undefined;
    this.mobileFabLabel?.destroy();
    this.mobileFabLabel = undefined;
    this.mobileMenu?.destroy(true);
    this.mobileMenu = undefined;
    this.mobileMenuCenter = undefined;
    this.mobilePanels.forEach((panel) => panel.destroy(true));
    this.mobilePanels.clear();
    this.mobilePanelCenters.clear();
    this.mobileItemSlots.forEach((slot) => slot.destroy());
    this.mobileItemSlots = [];
    this.mobileSkillSlots.forEach((slot) => slot.destroy());
    this.mobileSkillSlots = [];
    this.destroyDetailPanel();
  }

  private toggleDetailPanel(force?: boolean) {
    if (!this.detailPanel) {
      return;
    }
    const next = force ?? !this.detailPanel.visible;
    this.detailPanel.setVisible(next);
    if (next && this.detailSprite) {
      const frameKeys =
        mobtaroProfileKeys.length > 0 ? mobtaroProfileKeys : mobtaroFrameKeys;
      const animKey =
        mobtaroProfileKeys.length > 0 ? "mobtaro_profile" : "mobtaro_walk";
      const startIndex = Phaser.Math.Between(0, frameKeys.length - 1);
      this.detailSprite.play({ key: animKey, startFrame: startIndex });
      this.applyProfileScale(this.detailSprite);
    }
    if (next) {
      this.mobileMenu?.setVisible(false);
      this.mobilePanels.forEach((panel) => panel.setVisible(false));
    }
  }

  private applyProfileScale(sprite: Phaser.GameObjects.Sprite) {
    if (!this.detailProfileCenter) {
      return;
    }
    const texture = this.textures.get(sprite.texture.key);
    const source = texture.getSourceImage() as { width?: number; height?: number } | undefined;
    const texWidth = source?.width ?? sprite.width;
    const texHeight = source?.height ?? sprite.height;
    if (texWidth <= 0 || texHeight <= 0) {
      return;
    }
    const scale = Math.max(
      PROFILE_FRAME_SIZE / texWidth,
      PROFILE_FRAME_SIZE / texHeight
    );
    sprite.setScale(scale);
    const scaledHalfHeight = (texHeight * scale) / 2;
    const frameHalf = PROFILE_FRAME_SIZE / 2;
    const minY = this.detailProfileCenter.y - (scaledHalfHeight - frameHalf);
    const maxY = this.detailProfileCenter.y + (scaledHalfHeight - frameHalf);
    sprite.y = clamp(sprite.y, minY, maxY);
  }

  private createOptionPanel() {
    const { width, height } = this.scale;
    const uiDepth = 50;
    const panelWidth = 220;
    const panelHeight = 150;
    const panelX = width / 2;
    const panelY = height / 2;
    const panelStroke = 0x000000;
    const bg = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0xf2f2f2, 0.95)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0);
    const title = this.add
      .text(panelX - panelWidth / 2 + 12, panelY - panelHeight / 2 + 10, "OPTION", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setScrollFactor(0);
    this.optionVolumeText = this.add
      .text(
        panelX - panelWidth / 2 + 12,
        panelY - 4,
        `BGM: ${Math.round(this.bgmVolume * 100)}%`,
        {
        color: "#1a1b1f",
        fontSize: "11px",
        fontFamily: "Times New Roman"
        }
      )
      .setScrollFactor(0);
    this.optionSeText = this.add
      .text(
        panelX - panelWidth / 2 + 12,
        panelY + 18,
        `SE: ${Math.round(this.seVolume * 100)}%`,
        {
        color: "#1a1b1f",
        fontSize: "11px",
        fontFamily: "Times New Roman"
        }
      )
      .setScrollFactor(0);
    const minus = this.add
      .rectangle(panelX + 40, panelY - 6, 24, 20, 0xffffff, 1)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const minusLabel = this.add
      .text(panelX + 40, panelY - 6, "-", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const plus = this.add
      .rectangle(panelX + 70, panelY - 6, 24, 20, 0xffffff, 1)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const plusLabel = this.add
      .text(panelX + 70, panelY - 6, "+", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const seMinus = this.add
      .rectangle(panelX + 40, panelY + 16, 24, 20, 0xffffff, 1)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const seMinusLabel = this.add
      .text(panelX + 40, panelY + 16, "-", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const sePlus = this.add
      .rectangle(panelX + 70, panelY + 16, 24, 20, 0xffffff, 1)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const sePlusLabel = this.add
      .text(panelX + 70, panelY + 16, "+", {
        color: "#1a1b1f",
        fontSize: "12px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    minus.on("pointerdown", () => this.setBgmVolume(this.bgmVolume - 0.1));
    plus.on("pointerdown", () => this.setBgmVolume(this.bgmVolume + 0.1));
    seMinus.on("pointerdown", () => this.setSeVolume(this.seVolume - 0.1));
    sePlus.on("pointerdown", () => this.setSeVolume(this.seVolume + 0.1));
    this.optionButtons = [minus, plus, seMinus, sePlus];
    this.optionButtonLabels = [minusLabel, plusLabel, seMinusLabel, sePlusLabel];

    const closeBox = this.add
      .rectangle(panelX + panelWidth / 2 - 16, panelY - panelHeight / 2 + 14, 18, 18, 0xffffff, 1)
      .setStrokeStyle(1, panelStroke)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const closeLabel = this.add
      .text(panelX + panelWidth / 2 - 16, panelY - panelHeight / 2 + 14, "X", {
        color: "#1a1b1f",
        fontSize: "11px",
        fontFamily: "Times New Roman"
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    closeBox.on("pointerdown", () => this.toggleOptionPanel(false));

    this.optionPanel = this.add.container(0, 0, [
      bg,
      title,
      this.optionVolumeText,
      this.optionSeText,
      minus,
      minusLabel,
      plus,
      plusLabel,
      seMinus,
      seMinusLabel,
      sePlus,
      sePlusLabel,
      closeBox,
      closeLabel
    ]);
    this.optionPanel.setScrollFactor(0);
    this.optionPanel.setDepth(uiDepth);
    this.optionPanel.setVisible(false);
  }

  private toggleOptionPanel(force?: boolean) {
    if (!this.optionPanel) {
      return;
    }
    const next = force ?? !this.optionPanel.visible;
    this.optionPanel.setVisible(next);
  }

  private setupBgmPlayback() {
    if (this.bgmSound) {
      return;
    }
    this.bgmSound = this.sound.add("bgm_school", {
      loop: true,
      volume: this.bgmVolume
    });
    this.tryPlayBgm();
    const resumeOnce = () => {
      if (this.bgmArmed) {
        return;
      }
      this.bgmArmed = true;
      this.tryPlayBgm();
    };
    this.input.once("pointerdown", resumeOnce);
    this.input.keyboard?.once("keydown", resumeOnce);
  }

  private tryPlayBgm() {
    if (!this.bgmSound) {
      return;
    }
    if (!this.bgmSound.isPlaying) {
      this.bgmSound.setVolume(this.bgmVolume);
      this.bgmSound.play();
    }
  }

  private setBgmVolume(value: number) {
    this.bgmVolume = clamp(value, 0, 1);
    if (this.bgmSound) {
      this.bgmSound.setVolume(this.bgmVolume);
    }
    if (this.optionVolumeText) {
      this.optionVolumeText.setText(`BGM: ${Math.round(this.bgmVolume * 100)}%`);
    }
  }

  private setSeVolume(value: number) {
    this.seVolume = clamp(value, 0, 1);
    if (this.optionSeText) {
      this.optionSeText.setText(`SE: ${Math.round(this.seVolume * 100)}%`);
    }
  }

  private playSe(key: string, baseVolume: number) {
    if (this.seVolume <= 0) {
      return;
    }
    if (!this.cache.audio.exists(key)) {
      return;
    }
    const sound = this.sound.add(key, {
      volume: clamp(baseVolume * this.seVolume, 0, 1)
    });
    sound.once(Phaser.Sound.Events.COMPLETE, () => sound.destroy());
    sound.play();
  }

  private playRandomSe(keys: string[], baseVolume: number) {
    if (keys.length === 0 || this.seVolume <= 0) {
      return;
    }
    const index = Math.floor(Math.random() * keys.length);
    this.playSe(keys[index], baseVolume);
  }

  private handleDeathFx(playerId: string, x: number, y: number, isDead: boolean) {
    const wasDead = this.lastKnownDead.get(playerId) ?? false;
    if (!wasDead && isDead) {
      const sprite = playerId === this.playerId ? this.selfSprite : this.playerSprites.get(playerId);
      const spawnX = sprite?.x ?? x;
      const spawnY = sprite?.y ?? y;
      this.spawnDeathExplosion(spawnX, spawnY);
      const baseVolume =
        playerId === this.playerId ? DEATH_SE_SELF_BASE : DEATH_SE_OTHER_BASE;
      this.playSe(DEATH_SE_KEY, baseVolume);
      sprite?.setVisible(false);
    }
    if (wasDead && !isDead) {
      const sprite = playerId === this.playerId ? this.selfSprite : this.playerSprites.get(playerId);
      sprite?.setVisible(true);
    }
    this.lastKnownDead.set(playerId, isDead);
  }

  private spawnDeathExplosion(x: number, y: number) {
    if (bombFrameKeys.length === 0) {
      return;
    }
    while (this.activeBombs.length >= MAX_ACTIVE_BOMBS) {
      const oldest = this.activeBombs.shift();
      oldest?.destroy();
    }
    const sprite = this.add
      .sprite(x, y + BOMB_Y_OFFSET, bombFrameKeys[0])
      .setDepth(12);
    this.activeBombs.push(sprite);
    sprite.play("bomb_explosion");
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      const index = this.activeBombs.indexOf(sprite);
      if (index >= 0) {
        this.activeBombs.splice(index, 1);
      }
      sprite.destroy();
    });
  }

  private updatePcCharacterHintPosition() {
    if (!this.pcDetailButton || !this.pcCharacterHintEl) {
      return;
    }
    const targetHeight = Math.max(10, this.pcDetailButton.offsetHeight * PC_HINT_ICON_SCALE * 1.5);
    this.pcCharacterHintEl.style.height = `${targetHeight}px`;
    if (this.pcOptionHintEl) {
      this.pcOptionHintEl.style.height = `${targetHeight}px`;
    }
    const baseRowHeight =
      Number(this.pcDetailButton.dataset.baseRowHeight ?? 0) || this.pcDetailButton.offsetHeight;
    const targetRowHeight = Math.round(baseRowHeight * PC_ACTION_ROW_HEIGHT_MULT);
    this.pcDetailButton.style.height = `${targetRowHeight}px`;
    if (this.pcOptionButtonEl) {
      this.pcOptionButtonEl.style.height = `${targetRowHeight}px`;
    }
    if (this.pcCharacterLabelEl) {
      this.pcCharacterLabelEl.style.lineHeight = `${targetRowHeight}px`;
    }
    if (this.pcOptionLabelEl) {
      this.pcOptionLabelEl.style.lineHeight = `${targetRowHeight}px`;
    }
  }

  private ensurePcOptionHint() {
    if (!this.pcDetailButton) {
      return;
    }
    const section = this.pcDetailButton.parentElement;
    if (!section || this.pcActionUiGame) {
      return;
    }
    const baseRowHeight = this.pcDetailButton.getBoundingClientRect().height || 22;
    const rowHeight = Math.round(baseRowHeight * PC_ACTION_ROW_HEIGHT_MULT);
    const panelHeight = rowHeight * 2 + 1;
    const rightPadding = 12;
    const iconHeight = Math.max(10, baseRowHeight * PC_HINT_ICON_SCALE * 1.5);
    const labelColumnWidth = 120;
    const panelWidth = Math.max(
      1,
      Math.round(labelColumnWidth + iconHeight / 2 + rightPadding)
    );

    section.textContent = "";
    const host = document.createElement("div");
    host.style.width = `${panelWidth}px`;
    host.style.height = `${panelHeight}px`;
    host.style.display = "block";
    section.appendChild(host);

    const onCharacter = () => this.toggleDetailPanel();
    const onOption = () => this.toggleOptionPanel();
    const labelStyle = {
      fontFamily: "sans-serif",
      fontSize: "11px",
      color: "#1a1b1f"
    };
    const labelX = 10;
    const iconX = labelColumnWidth;
    const row1CenterY = rowHeight / 2;
    const row2CenterY = rowHeight + rowHeight / 2;

    const sceneConfig: Phaser.Types.Scenes.SettingsConfig = {
      key: "PcActionRows"
    };

    const scene = new Phaser.Scene(sceneConfig);
    scene.preload = () => {
      scene.load.image(
        "pc_kibodo_c",
        new URL("../../images/kibodo/kibodo_c.png", import.meta.url).href
      );
      scene.load.image(
        "pc_kibodo_esc",
        new URL("../../images/kibodo/kibodo_esc.png", import.meta.url).href
      );
    };
    scene.create = () => {
      const graphics = scene.add.graphics();
      graphics.lineStyle(1, 0x000000, 1);
      graphics.strokeRect(0.5, 0.5, panelWidth - 1, panelHeight - 1);
      graphics.lineBetween(0, rowHeight, panelWidth, rowHeight);

      scene.add.text(labelX, row1CenterY, "CHARACTER", labelStyle).setOrigin(0, 0.5);
      scene.add.text(labelX, row2CenterY, "OPTION", labelStyle).setOrigin(0, 0.5);

      const cIcon = scene.add.image(iconX, row1CenterY, "pc_kibodo_c").setOrigin(0.5, 0.5);
      const escIcon = scene.add.image(iconX, row2CenterY, "pc_kibodo_esc").setOrigin(0.5, 0.5);
      cIcon.setScale(iconHeight / cIcon.height);
      escIcon.setScale(iconHeight / escIcon.height);

      const rowWidth = panelWidth;
      const row1Hit = scene.add
        .rectangle(panelWidth / 2, row1CenterY, rowWidth, rowHeight, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      const row2Hit = scene.add
        .rectangle(panelWidth / 2, row2CenterY, rowWidth, rowHeight, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      row1Hit.on("pointerdown", onCharacter);
      row2Hit.on("pointerdown", onOption);
    };

    this.pcActionUiGame = new Phaser.Game({
      type: Phaser.CANVAS,
      width: panelWidth,
      height: panelHeight,
      parent: host,
      transparent: true,
      scene
    });
  }

  private sendAssignStat(stat: string, amount = 1) {
    if (!this.room || !this.room.connection.isOpen) {
      return;
    }
    this.room.send("assignStat", { stat, amount });
  }

  private updateSelfHud(player: PlayerState) {
    const hp = player.hp ?? 0;
    const maxHp = player.maxHp ?? 100;
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    this.selfIsDead = Boolean(player.isDead);

    const level = player.level ?? 1;
    if (this.pcHpValueEl) {
      this.pcHpValueEl.textContent = `${hp} / ${maxHp}`;
    }
    if (this.pcLevelEl) {
      this.pcLevelEl.textContent = `${level}`;
    }
    if (this.pcHpFillEl) {
      this.pcHpFillEl.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    }
    if (this.pcSpValueEl) {
      const sp = player.sp ?? 0;
      const maxSp = player.maxSp ?? 100;
      this.pcSpValueEl.textContent = `${sp} / ${maxSp}`;
    }
    if (this.pcSpFillEl) {
      const sp = player.sp ?? 0;
      const maxSp = player.maxSp ?? 100;
      const spRatio = maxSp > 0 ? sp / maxSp : 0;
      this.pcSpFillEl.style.width = `${Math.max(0, Math.min(1, spRatio)) * 100}%`;
    }
    if (this.pcXpFillEl) {
      const xp = player.xp ?? 0;
      const level = player.level ?? 1;
      const maxXp = this.getXpForLevel(level);
      const xpRatio = maxXp > 0 ? xp / maxXp : 0;
      this.pcXpFillEl.style.width = `${Math.max(0, Math.min(1, xpRatio)) * 100}%`;
    }
    if (this.pcXpLabelEl) {
      this.pcXpLabelEl.textContent = "NEXT LV";
    }

    if (this.mobileHpValueText) {
      this.mobileHpValueText.setText(`${hp} / ${maxHp}`);
    }
    if (this.mobileHpLabel) {
      this.mobileHpLabel.setText(`HP / Lv: ${level}`);
    }
    if (this.mobileHpFill) {
      const width = this.mobileHpBarWidth * Math.max(0, Math.min(1, ratio));
      this.mobileHpFill.setDisplaySize(width, this.mobileHpBarHeight);
    }
    if (this.mobileSpValueText) {
      const sp = player.sp ?? 0;
      const maxSp = player.maxSp ?? 100;
      this.mobileSpValueText.setText(`${sp} / ${maxSp}`);
    }
    if (this.mobileSpFill) {
      const sp = player.sp ?? 0;
      const maxSp = player.maxSp ?? 100;
      const spRatio = maxSp > 0 ? sp / maxSp : 0;
      const width = this.mobileHpBarWidth * Math.max(0, Math.min(1, spRatio));
      this.mobileSpFill.setDisplaySize(width, this.mobileHpBarHeight);
    }

    if (this.selfSprite) {
      this.selfSprite.setAlpha(this.selfIsDead ? 0.4 : 1);
    }

    if (this.detailFields.size > 0) {
      this.detailFields.get("hp")?.setText(`${player.hp ?? 0}`);
      this.detailFields.get("sp")?.setText(`${player.sp ?? 0}`);
      this.detailFields.get("atk")?.setText(`${player.attack ?? 0}`);
      this.detailFields.get("def")?.setText(`${player.defense ?? 0}`);
      this.detailFields.get("moveSpeed")?.setText(`${player.speed ?? 0}`);
      this.detailFields.get("atkSpeed")?.setText(`${player.attackSpeed ?? 0}`);
      this.detailFields.get("luck")?.setText(`${player.luck ?? 0}`);
    }
    if (this.detailStatPoints) {
      this.detailStatPoints.setText(`SPT: ${player.statPoints ?? 0}`);
    }
    if (this.detailLevelText) {
      this.detailLevelText.setText(`LV: ${player.level ?? 1}`);
    }
    if (this.detailXpText) {
      const xp = player.xp ?? 0;
      const level = player.level ?? 1;
      const maxXp = this.getXpForLevel(level);
      this.detailXpText.setText(`XP: ${xp} / ${maxXp}`);
    }
    if (this.detailPlusButtons.size > 0) {
      const points = player.statPoints ?? 0;
      const canSpendOne = points >= 1;
      const canSpendFive = points >= 5;
      this.detailPlusButtons.forEach((button) => {
        button.setAlpha(canSpendOne ? 1 : 0.4);
        button.disableInteractive();
        if (canSpendOne) {
          button.setInteractive({ useHandCursor: true });
        }
      });
      this.detailPlusButtonsFive.forEach((button) => {
        button.setAlpha(canSpendFive ? 1 : 0.4);
        button.disableInteractive();
        if (canSpendFive) {
          button.setInteractive({ useHandCursor: true });
        }
      });
      this.detailPlusLabels.forEach((label) => {
        label.setAlpha(canSpendOne ? 1 : 0.4);
      });
      this.detailPlusLabelsFive.forEach((label) => {
        label.setAlpha(canSpendFive ? 1 : 0.4);
      });
    }
  }

  private getXpForLevel(level: number) {
    return 100 + (level - 1) * 25;
  }

  private formatHp(hp?: number, maxHp?: number) {
    const current = hp ?? 0;
    const max = maxHp ?? 0;
    return `${current} / ${max}`;
  }

  private isPointerWithinCanvas(pointer: Phaser.Input.Pointer) {
    return (
      pointer.x >= 0 &&
      pointer.y >= 0 &&
      pointer.x <= this.scale.width &&
      pointer.y <= this.scale.height
    );
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const shouldShowVirtualStick = () => {
  const ua = navigator.userAgent;
  const isUaMobile = /Android|iPhone|iPad|iPod|Tablet/i.test(ua);
  const hasTouch = navigator.maxTouchPoints > 0;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) <= 900;
  return isUaMobile || (hasTouch && smallScreen);
};

const isMobileDevice = shouldShowVirtualStick();
const baseWidth = 512;
const baseHeight = 768;
const getViewportSize = () => {
  if (window.visualViewport) {
    return {
      width: Math.round(window.visualViewport.width),
      height: Math.round(window.visualViewport.height)
    };
  }
  return { width: window.innerWidth, height: window.innerHeight };
};
const initialViewport = getViewportSize();
const initialSize = isMobileDevice
  ? { width: initialViewport.width, height: initialViewport.height }
  : { width: baseWidth, height: baseHeight };
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: initialSize.width,
  height: initialSize.height,
  backgroundColor: "#ffffff",
  scale: {
    mode: isMobileDevice ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
    autoCenter: isMobileDevice ? Phaser.Scale.NO_CENTER : Phaser.Scale.CENTER_BOTH
  },
  scene: MainScene
};

const game = new Phaser.Game(config);
if (isMobileDevice) {
  window.addEventListener("resize", () => {
    const viewport = getViewportSize();
    game.scale.resize(viewport.width, viewport.height);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const viewport = getViewportSize();
      game.scale.resize(viewport.width, viewport.height);
    });
    window.visualViewport.addEventListener("scroll", () => {
      const viewport = getViewportSize();
      game.scale.resize(viewport.width, viewport.height);
    });
  }
}
