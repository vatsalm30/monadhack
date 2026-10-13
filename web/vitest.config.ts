import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const sharedDir = fileURLToPath(new URL("../shared", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@shared\//, replacement: `${sharedDir}/` }],
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
