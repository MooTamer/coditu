import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The design bundle is a committed artefact, not source. `support.js` and
    // `doc-page.js` are the design tool's own runtime — they are read as spec
    // and never shipped, so linting them only produces noise about someone
    // else's code.
    "design/**",
    // Playwright output. Regenerated every run, never reviewed.
    "test-results/**",
    "playwright-report/**",
    // The Supabase CLI's own scratch directory. `supabase start` writes vendor
    // JS in here, so linting it reports someone else's minified code as our
    // problem — and only in CI, because the files do not exist until the stack
    // has been started on that machine. A "works on my laptop" waiting to
    // happen.
    "supabase/.temp/**",
    // Local agent and tooling state. `.gitignore` already excludes it, but
    // eslint has its own idea of the repository — and a worktree in here comes
    // with a built `.next`, which is fifteen thousand warnings about compiled
    // output. Exactly the shape of the `supabase/.temp` bug above.
    ".claude/**",
    ".claude-flow/**",
    ".swarm/**",
    ".hive-mind/**",
  ]),
  {
    // Playwright's fixture callback is named `use`, and the React hooks rule
    // reads any `use(...)` as a hook call. It is not one — these files contain
    // no React at all. Everything else still applies here.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
]);

export default eslintConfig;
