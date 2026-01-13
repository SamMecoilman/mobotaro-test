import Phaser from "phaser";
import { Client, Room } from "colyseus.js";

type PlayerState = {
  x: number;
  y: number;
};

type EnemyState = {
  id: string;
  x: number;
  y: number;
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
  private playerSprite?: Phaser.GameObjects.Rectangle;
  private enemySprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private statusText?: Phaser.GameObjects.Text;

  constructor() {
    super("main");
  }

  preload() {
    // No assets yet. Placeholder for minimal boot.
  }

  create() {
    this.cursors = this.input.keyboard.createCursorKeys();

    this.statusText = this.add
      .text(12, 12, "connecting...", {
        color: "#e6e6e6",
        fontSize: "16px",
        fontFamily: "Times New Roman"
      })
      .setDepth(10);

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
      (this.cursors.right?.isDown ? 1 : 0);
    const inputY =
      (this.cursors.up?.isDown ? -1 : 0) +
      (this.cursors.down?.isDown ? 1 : 0);

    this.room.send("move", { x: inputX, y: inputY });
  }

  private async joinServer() {
    this.client = new Client("ws://localhost:2567");
    this.room = await this.client.joinOrCreate<RoomState>("survivor");
    this.playerId = this.room.sessionId;

    this.statusText?.setText("connected");

    this.room.state.players.onAdd((player, id) => {
      if (id === this.playerId) {
        this.playerSprite = this.add
          .rectangle(player.x, player.y, 18, 18, 0x4aa3ff)
          .setStrokeStyle(1, 0x1b2b3a);
        return;
      }

      this.add.rectangle(player.x, player.y, 18, 18, 0x7bd88f);
    });

    this.room.state.players.onChange((player, id) => {
      if (id === this.playerId && this.playerSprite) {
        this.playerSprite.setPosition(player.x, player.y);
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

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 960,
  height: 540,
  backgroundColor: "#121315",
  scene: MainScene
};

new Phaser.Game(config);
