import Phaser from "phaser";
import { Client, Room } from "colyseus.js";

type PlayerState = {
  id: string;
  x: number;
  y: number;
  kind: string;
  hp?: number;
  maxHp?: number;
  isDead?: boolean;
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

const extractFrameNumber = (path: string) => {
  const matches = path.match(/(\d+)/g);
  if (!matches || matches.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number.parseInt(matches[matches.length - 1], 10);
};

const MOBTARO_FPS = 8;
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
  private playerSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private enemySprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private enemyHpTexts = new Map<string, Phaser.GameObjects.Text>();
  private statusText?: Phaser.GameObjects.Text;
  private selfSprite?: Phaser.GameObjects.Sprite;
  private selfIsDead = false;
  private pcHpValueEl?: HTMLElement | null;
  private pcHpFillEl?: HTMLElement | null;
  private mobileHpValueText?: Phaser.GameObjects.Text;
  private mobileHpFill?: Phaser.GameObjects.Rectangle;
  private mobileHpBarWidth = 0;
  private mobileHpBarHeight = 0;
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

  constructor() {
    super("main");
  }

  preload() {
    this.load.image(
      "background",
      new URL("../../map/school2.png", import.meta.url).href
    );
    mobtaroFrameUrls.forEach((url, index) => {
      this.load.image(mobtaroFrameKeys[index], url);
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

    const isMobile = shouldShowVirtualStick();
    document.body.classList.toggle("is-mobile", isMobile);
    document.body.classList.toggle("is-desktop", !isMobile);
    if (!isMobile) {
      this.pcHpValueEl = document.getElementById("pc-hp-value");
      this.pcHpFillEl = document.getElementById("pc-hp-fill");
    }

    if (isMobile) {
      this.createVirtualStick();
      this.createMobileUi();
      this.setupPointerAttack();
    } else {
      this.setupPointerAttack();
    }

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerWithinCanvas(pointer)) {
        this.lastAimWorld = { x: pointer.worldX, y: pointer.worldY };
      }
    });

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
    const { width, height } = this.scale;
    const baseX = 80;
    const baseY = height - 80;
    this.stickBasePosition = { x: baseX, y: baseY };

    this.stickBase = this.add
      .circle(baseX, baseY, this.stickRadius, 0x1a1b1f, 0.6)
      .setStrokeStyle(2, 0x2a2d33)
      .setScrollFactor(0)
      .setDepth(5);

    this.stickKnob = this.add
      .circle(baseX, baseY, 18, 0x4aa3ff, 0.9)
      .setStrokeStyle(2, 0x1b2b3a)
      .setScrollFactor(0)
      .setDepth(6);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== undefined) {
        return;
      }
      const distance = Phaser.Math.Distance.Between(
        pointer.x,
        pointer.y,
        baseX,
        baseY
      );
      if (distance <= this.stickRadius * 1.2) {
        this.stickPointerId = pointer.id;
        this.updateStick(pointer, baseX, baseY);
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== pointer.id) {
        return;
      }
      this.updateStick(pointer, baseX, baseY);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== pointer.id) {
        return;
      }
      this.stickPointerId = undefined;
      this.stickVector.x = 0;
      this.stickVector.y = 0;
      this.stickKnob?.setPosition(baseX, baseY);
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
          .setDisplaySize(40, 40)
          .play("mobtaro_walk");
        this.selfSprite = sprite;
        this.cameras.main.startFollow(sprite);
        this.updateSelfHud(player);
      } else {
        const size = 18;
        const stroke = 0x1f3b27;
        const fill = 0x7bd88f;
        const sprite = this.add
          .rectangle(player.x, player.y, size, size, fill)
          .setStrokeStyle(1, stroke);
        this.playerSprites.set(id, sprite);
      }
      player.onChange(() => {
        if (id === this.playerId) {
          this.selfSprite?.setPosition(player.x, player.y);
          this.updateSelfHud(player);
          return;
        }
        const otherSprite = this.playerSprites.get(id);
        if (otherSprite) {
          otherSprite.setPosition(player.x, player.y);
        }
      });
    });

    this.room.state.players.onRemove((_player, id) => {
      const sprite = this.playerSprites.get(id);
      if (sprite) {
        sprite.destroy();
        this.playerSprites.delete(id);
      }
      if (id === this.playerId) {
        this.cameras.main.stopFollow();
        this.selfSprite?.destroy();
        this.selfSprite = undefined;
      }
    });

    this.room.state.enemies.onAdd((enemy, id) => {
      const sprite = this.add
        .rectangle(enemy.x, enemy.y, 14, 14, 0xff7b7b)
        .setStrokeStyle(1, 0x4b1b1b);
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
    this.add
      .text(hpX, hpY, "HP", labelStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);
    this.mobileHpFill = this.add
      .rectangle(hpX, hpY + 16, barWidth, barHeight, 0x8b1e1e, 0.9)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(uiDepth);
    this.mobileHpValueText = this.add
      .text(hpX, hpY + 24, "100 / 100", valueStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);

    const spY = hpY + 26;
    this.add
      .text(hpX, spY, "SP", labelStyle)
      .setDepth(uiDepth)
      .setScrollFactor(0);
    this.add
      .rectangle(hpX + barWidth / 2, spY + 16, barWidth, barHeight, 0x1b4a8b, 0.9)
      .setScrollFactor(0)
      .setDepth(uiDepth);
    this.add
      .text(hpX, spY + 24, "100 / 100", valueStyle)
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
    this.add
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

    this.mobileFabButton.on("pointerdown", () => {
      if (!this.mobileMenu) {
        return;
      }
      this.mobileMenu.setVisible(!this.mobileMenu.visible);
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
    this.mobilePanels.set("settings", settingsPanel);
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
      if (pointer.button !== 0) {
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
    const targets: Phaser.GameObjects.GameObject[] = [];
    if (this.mobileFabButton) {
      targets.push(this.mobileFabButton);
    }
    if (this.mobileMenu?.visible) {
      targets.push(this.mobileMenu);
    }
    this.mobilePanels.forEach((panel) => {
      if (panel.visible) {
        targets.push(panel);
      }
    });

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
    this.spawnAttackEffect(this.selfSprite.x, this.selfSprite.y, target.x, target.y);
    if (!this.room || !this.room.connection.isOpen) {
      return;
    }
    this.room.send("attack", { source, x: target.x, y: target.y });
  }

  private spawnAttackEffect(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number
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
    this.tweens.add({
      targets: [orb, trail, glow],
      x: finalX,
      y: finalY,
      duration,
      ease: "Sine.Out",
      onComplete: () => {
        orb.destroy();
        trail.destroy();
        glow.destroy();
      }
    });
  }

  private updateSelfHud(player: PlayerState) {
    const hp = player.hp ?? 0;
    const maxHp = player.maxHp ?? 100;
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    this.selfIsDead = Boolean(player.isDead);

    if (this.pcHpValueEl) {
      this.pcHpValueEl.textContent = `${hp} / ${maxHp}`;
    }
    if (this.pcHpFillEl) {
      this.pcHpFillEl.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    }

    if (this.mobileHpValueText) {
      this.mobileHpValueText.setText(`${hp} / ${maxHp}`);
    }
    if (this.mobileHpFill) {
      const width = this.mobileHpBarWidth * Math.max(0, Math.min(1, ratio));
      this.mobileHpFill.setDisplaySize(width, this.mobileHpBarHeight);
    }

    if (this.selfSprite) {
      this.selfSprite.setAlpha(this.selfIsDead ? 0.4 : 1);
    }
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
  return /Android|iPhone|iPad|iPod|Tablet/i.test(ua);
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 512,
  height: 768,
  backgroundColor: "#ffffff",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: MainScene
};

new Phaser.Game(config);
