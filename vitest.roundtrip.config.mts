import { defineConfig } from "vitest/config";

/**
 * PF-2's specification, and nothing else.
 *
 * `vitest.config.mts` EXCLUDES `tests/notion-roundtrip.test.ts`, because that
 * test is red on purpose and a permanently-red `npm run test` cannot answer the
 * question it is asked. A CLI `--exclude` does not help here: vitest 4 appends
 * it to the config's list rather than replacing it, so naming the file on the
 * command line still matched nothing and printed "No test files found" — which
 * looks exactly like the test failing. `scripts/roundtrip.sh` has a guard for
 * that, and this config is why the guard never has to fire.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/notion-roundtrip.test.ts"],
  },
});
