import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "@colyseus/core";
import fastify from "fastify";
import { SurvivorRoom } from "./SurvivorRoom.js";

const port = Number(process.env.PORT ?? 2567);
const app = fastify();

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: app.server
  })
});

gameServer.define("survivor", SurvivorRoom);

app.get("/health", async () => ({ ok: true }));

app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`[server] listening on ws://localhost:${port}`);
});
