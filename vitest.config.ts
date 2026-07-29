import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@tpf2-mod-studio/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx"
    ],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
