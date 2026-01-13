import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id = "";
  @type("string") kind = "player";
  @type("number") x = 480;
  @type("number") y = 270;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") hp = 100;
}

export class Enemy extends Schema {
  @type("string") id = "";
  @type("string") kind = "enemy";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 1;
}

export class SurvivorState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
  @type("number") tick = 0;
  @type([ "string" ]) messages = new ArraySchema<string>();
}
