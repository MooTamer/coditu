import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `vercel.json` is the only thing standing between a push to `main` and a
 * production deployment, and it is one editable file.
 *
 * There is no dashboard toggle for this. `git.deploymentEnabled` is the
 * documented mechanism — the older `github.enabled` is deprecated in its
 * favour — so the control cannot be duplicated into a second independent
 * place. What it can be is **tamper-evident**: deleting the file, or quietly
 * flipping the flag while editing something else nearby, turns this suite red
 * instead of turning production deployments back on silently.
 *
 * That is the whole intent. This is not a schema test for Vercel's config
 * format; it is a tripwire on one setting, with the post-push provider check
 * as the second control.
 *
 * Why `{ "main": false }` and not a bare `false`: a boolean disables **preview**
 * deployments too, and the branch model (ADR 2026-08-29) makes per-branch
 * previews the testing/UAT environment. Blocking `main` alone leaves previews
 * building and takes production away from Git, which is what the deploy gate
 * wants — CI promotes production through the Vercel CLI, and a CLI deploy is
 * not a Git deployment, so this setting does not block it.
 */

const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../vercel.json"), "utf8"),
) as { git?: { deploymentEnabled?: boolean | Record<string, boolean> } };

describe("vercel.json still refuses to deploy main from a push", () => {
  it("declares git.deploymentEnabled", () => {
    expect(config.git).toBeDefined();
    expect(config.git?.deploymentEnabled).toBeDefined();
  });

  it("blocks main, whichever of the two shapes is used", () => {
    const enabled = config.git?.deploymentEnabled;

    // A bare `false` blocks everything including previews. It is accepted here
    // because it is *stricter* than required — it must never be `true`, and a
    // per-branch map must never let `main` through.
    if (typeof enabled === "boolean") {
      expect(enabled).toBe(false);
      return;
    }

    expect(enabled).toBeTypeOf("object");
    expect(enabled).toHaveProperty("main");
    expect((enabled as Record<string, boolean>).main).toBe(false);
  });

  it("does not carry the deprecated github.enabled instead", () => {
    // `github.enabled` reads like the same control and is deprecated in favour
    // of `git.deploymentEnabled`. Someone replacing one with the other would
    // otherwise leave this file looking protected while Vercel ignores it.
    const raw = readFileSync(resolve(import.meta.dirname, "../vercel.json"), "utf8");
    const parsed = JSON.parse(raw) as { github?: { enabled?: boolean } };
    expect(parsed.github?.enabled).toBeUndefined();
  });
});
