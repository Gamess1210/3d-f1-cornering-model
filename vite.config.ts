import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
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
});
