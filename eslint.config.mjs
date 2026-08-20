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
  ]),
]);

export default eslintConfig;
