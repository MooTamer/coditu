#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const commit = process.env.GITHUB_SHA;
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
  process.stderr.write("write-build-health: GITHUB_SHA must be a full lowercase commit SHA\n");
  process.exit(1);
}

const destination = resolve(import.meta.dirname, "../.vercel/output/static/build-health.json");
mkdirSync(resolve(destination, ".."), { recursive: true });
writeFileSync(destination, `${JSON.stringify({ status: "ok", commit })}\n`, {
  encoding: "utf8",
  mode: 0o644,
});
process.stdout.write(`build_health_commit=${commit}\n`);
