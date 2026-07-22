import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/server": path.resolve(__dirname, "./node_modules/next/dist/server/web/exports/index.js"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    pool: "forks",
    server: {
      deps: {
        inline: ["next-auth", "next"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts", "src/features/**/*.ts"],
      exclude: ["src/lib/fonts.ts", "src/lib/auth.ts", "src/lib/db.ts"],
    },
  },
});
