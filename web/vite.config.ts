import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const sharedDir = fileURLToPath(new URL("../shared", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@shared\//, replacement: `${sharedDir}/` }],
  },
  server: {
    // shared/ lives outside web/, so Vite needs explicit permission to read it.
    fs: { allow: [".", sharedDir] },
  },
  build: { target: "es2022", sourcemap: true },
});
