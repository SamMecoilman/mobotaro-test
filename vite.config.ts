import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "client"),
  server: {
    port: 5173,
    fs: {
      allow: [resolve(__dirname)]
    }
  }
});
