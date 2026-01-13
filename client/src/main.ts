import Phaser from "phaser";
import { Client, Room } from "colyseus.js";

type PlayerState = {
  id: string;
  x: number;
  y: number;
  kind: string;
  hp?: number;
};

type EnemyState = {
  id: string;
  x: number;
  y: number;
  kind: string;
  hp?: number;
};

type RoomState = {
  players: Map<string, PlayerState>;
  enemies: Map<string, EnemyState>;
  tick: number;
};

class MainScene extends Phaser.Scene {
  private client?: Client;
  private room?: Room<RoomState>;
  private playerId?: string;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private playerSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private enemySprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private statusText?: Phaser.GameObjects.Text;
  private wasd?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private stickBase?: Phaser.GameObjects.Arc;
  private stickKnob?: Phaser.GameObjects.Arc;
  private stickPointerId?: number;
  private stickVector = { x: 0, y: 0 };
  private stickRadius = 48;

  constructor() {
    super("main");
  }

  preload() {
    // No assets yet. Placeholder for minimal boot.
  }

  create() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys(
      "W,A,S,D"
    ) as MainScene["wasd"];

    this.statusText = this.add
      .text(12, 12, "connecting...", {
        color: "#e6e6e6",
        fontSize: "16px",
        fontFamily: "Times New Roman"
      })
      .setDepth(10);

    this.createVirtualStick();

    this.joinServer().catch((error) => {
      console.error(error);
      this.statusText?.setText("connection failed");
    });
  }

  update() {
    if (!this.room || !this.cursors || !this.playerId) {
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

    this.room.send("move", { x: combinedX, y: combinedY });
  }

  private createVirtualStick() {
    const { width, height } = this.scale;
    const baseX = 80;
    const baseY = height - 80;

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
    this.client = new Client("ws://localhost:2567");
    this.room = await this.client.joinOrCreate<RoomState>("survivor");
    this.playerId = this.room.sessionId;

    this.statusText?.setText("connected");

    this.room.state.players.onAdd((player, id) => {
      const isSelf = id === this.playerId;
      const size = isSelf ? 20 : 18;
      const stroke = isSelf ? 0x1b2b3a : 0x1f3b27;
      const fill = isSelf ? 0x4aa3ff : 0x7bd88f;
      const sprite = this.add
        .rectangle(player.x, player.y, size, size, fill)
        .setStrokeStyle(1, stroke);
      this.playerSprites.set(id, sprite);
    });

    this.room.state.players.onChange((player, id) => {
      const sprite = this.playerSprites.get(id);
      if (sprite) {
        sprite.setPosition(player.x, player.y);
      }
    });

    this.room.state.players.onRemove((_player, id) => {
      const sprite = this.playerSprites.get(id);
      if (sprite) {
        sprite.destroy();
        this.playerSprites.delete(id);
      }
    });

    this.room.state.enemies.onAdd((enemy, id) => {
      const sprite = this.add
        .rectangle(enemy.x, enemy.y, 14, 14, 0xff7b7b)
        .setStrokeStyle(1, 0x4b1b1b);
      this.enemySprites.set(id, sprite);
    });

    this.room.state.enemies.onChange((enemy, id) => {
      const sprite = this.enemySprites.get(id);
      if (sprite) {
        sprite.setPosition(enemy.x, enemy.y);
      }
    });

    this.room.state.enemies.onRemove((_enemy, id) => {
      const sprite = this.enemySprites.get(id);
      if (sprite) {
        sprite.destroy();
        this.enemySprites.delete(id);
      }
    });

    this.room.state.onChange(() => {
      this.statusText?.setText(`connected | tick ${this.room?.state.tick ?? 0}`);
    });
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 960,
  height: 540,
  backgroundColor: "#121315",
  scene: MainScene
};

new Phaser.Game(config);
