import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite resolves the `@/` alias from tsconfig natively; no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
