#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const commit = process.env.GITHUB_SHA;
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
  process.stderr.write("write-build-health: GITHUB_SHA must be a full lowercase commit SHA\n");
  process.exit(1);
}

// `public/`, not `.vercel/output/static/`.
//
// This used to write into a prebuilt Vercel output because CI built the app and
// deployed the result. That cannot work on this project: four of its production
// environment variables are marked **Sensitive**, and a Sensitive variable is
// write-only by design — `vercel pull` writes `[SENSITIVE]` in place of the
// value and no token can read it back. The build then died on its own
// configuration check. See ADR 2026-08-31.
//
// Vercel builds now, as it did for every production deploy this project has
// ever had. `public/` is copied into the output verbatim, so CI still decides
// what commit this file names — the one it verified — rather than the build
// reading a system environment variable that may not be exposed.
const destination = resolve(import.meta.dirname, "../public/build-health.json");
mkdirSync(resolve(destination, ".."), { recursive: true });
writeFileSync(destination, `${JSON.stringify({ status: "ok", commit })}\n`, {
  encoding: "utf8",
  mode: 0o644,
});
process.stdout.write(`build_health_commit=${commit}\n`);
