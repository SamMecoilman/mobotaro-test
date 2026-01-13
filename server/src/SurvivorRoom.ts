import { Room, type Client } from "@colyseus/core";
import { Enemy, Player, SurvivorState } from "./SurvivorState.js";

type MoveMessage = {
  x: number;
  y: number;
};

export class SurvivorRoom extends Room<SurvivorState> {
  private spawnTimer = 0;

  onCreate() {
    this.setState(new SurvivorState());
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / 20);

    this.onMessage("move", (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      player.vx = Math.max(-1, Math.min(1, message.x));
      player.vy = Math.max(-1, Math.min(1, message.y));
    });
  }

  onJoin(client: Client) {
    const player = new Player();
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private tick(dt: number) {
    const deltaSeconds = dt / 1000;
    const speed = 220;

    this.state.tick += 1;

    for (const player of this.state.players.values()) {
      player.x = clamp(player.x + player.vx * speed * deltaSeconds, 40, 920);
      player.y = clamp(player.y + player.vy * speed * deltaSeconds, 40, 500);
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= 1500) {
      this.spawnTimer = 0;
      const enemy = new Enemy();
      enemy.id = cryptoRandomId();
      enemy.x = randomRange(60, 900);
      enemy.y = randomRange(60, 480);
      this.state.enemies.set(enemy.id, enemy);
    }
  }
}

const randomRange = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const cryptoRandomId = () =>
  `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
