import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ command }) => ({
  // Served from https://<user>.github.io/3d-f1-cornering-model/ in production;
  // keep dev server at the root so `npm run dev` still opens at localhost:5173/.
  base: command === "build" ? "/3d-f1-cornering-model/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@physics": path.resolve(__dirname, "physics"),
      "@data": path.resolve(__dirname, "data"),
    },
  },
  test: {
    environment: "node",
  },
}));
