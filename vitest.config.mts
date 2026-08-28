import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite resolves the `@/` alias from tsconfig natively; no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    /**
     * PF-2's specification is executable and RED on purpose, so it is not part
     * of the suite that says whether anything is broken.
     *
     * With it in, `npm run test` reported `480 passed, 1 failed` permanently —
     * and a permanently-red command cannot tell "PF-2 is unbuilt" from
     * "something new broke". Everybody learns to read past the red, which is
     * exactly how the production-only bundle assertion in `scripts/gate.sh`
     * went quiet for weeks.
     *
     * It has not been deleted, weakened or skipped. `npm run roundtrip` runs
     * it, still fails, and still prints every field that drifted — and
     * `scripts/roundtrip.sh` turns that into a check the gate can fail on: it
     * fails if the round trip ever starts PASSING, which is the moment this
     * line has to come out and PF-2 closes.
     */
    exclude: ["node_modules/**", "tests/notion-roundtrip.test.ts"],
  },
});
