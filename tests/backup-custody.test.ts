import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The three custody rules, as assertions.
 *
 * From ADR 2026-08-31: the test for a dependency is not *"is this free?"* but
 * *"if this provider vanished tonight, what would I lose and how long until I
 * am running again?"* Three rules follow, and each of them is the kind of thing
 * that decays quietly — one `BACKUP_UPLOAD=1` restored while fixing something
 * else and the primary copy is a staging area again, with nothing to say so.
 *
 *   1. The PRIMARY copy lives on hardware Mohamed owns.
 *   2. Off-site copies are replaceable; no single one is load-bearing.
 *   3. The restore path requires none of them.
 */

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const nightly = read("scripts/local-nightly.sh");
const freshness = read("scripts/check-backup-freshness.sh");
const prune = read("scripts/prune-backups.sh");
const offsite = read("scripts/offsite-copy.sh");
const runbook = read("docs/12-RECOVERY-RUNBOOK.md");

/** Lines that are shell, not the essay above them. */
const code = (script: string) =>
  script
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

describe("rule 1 — the primary copy is on this Mac", () => {
  it("the nightly writes the set locally and does not publish it", () => {
    expect(code(nightly)).toContain("BACKUP_UPLOAD=0");
    expect(code(nightly)).not.toContain("BACKUP_UPLOAD=1");
  });

  it("the nightly never invokes the release uploader", () => {
    expect(code(nightly)).not.toContain("upload-backup.sh");
  });

  it("the freshness check reads the local store back, not a provider", () => {
    expect(code(nightly)).toContain("BACKUP_STORE=local");
    expect(code(freshness)).toContain("canary_store=${BACKUP_STORE:-local}");
  });

  it("the prune defaults to the local store too", () => {
    expect(code(prune)).toContain("prune_store=${BACKUP_STORE:-local}");
  });
});

describe("rule 2 — no single off-site copy is load-bearing", () => {
  it("an unconfigured destination warns and does not fail the night", () => {
    // Failing the night because a REPLACEABLE copy is missing would take down
    // the copy that is not replaceable, in protest about one that is.
    expect(nightly).toMatch(/if \[ -z "\$\{OFFSITE_DESTINATIONS:-\}" \]/);
    expect(nightly).toContain("no off-site destination is configured");
    expect(code(nightly)).toContain('nightly_offsite_lines="offsite=none-configured"');
  });

  it("an absent optional destination is reported, never fatal", () => {
    expect(code(offsite)).toContain('offsite_required=${OFFSITE_REQUIRED:-1}');
    expect(code(offsite)).toContain("_days_since=");
    expect(code(offsite)).toContain("_last_seen=");
  });

  it("a CONFIGURED destination that stopped working is fatal", () => {
    expect(code(nightly)).toContain("is configured and did not work");
  });

  it("the heartbeat payload carries where the copies went", () => {
    // healthchecks.io keeps the body of the last ping. If the off-site legs are
    // not in it, "the backup ran" is all anybody ever learns.
    expect(code(nightly)).toContain("${nightly_offsite_lines:-offsite=none-configured}");
  });
});

describe("rule 3 — the restore path needs none of the off-site copies", () => {
  it("the recovery runbook restores from a local archive path", () => {
    expect(runbook).toMatch(/tar\.gz\.age/);
  });

  it("nothing in the restore verifier reaches a provider", () => {
    const verifier = code(read("scripts/verify-backup-restore.sh"));
    for (const reach of ["gh release", "curl http", "rclone", "aws s3"]) {
      expect(verifier, `the verifier must not need ${reach}`).not.toContain(reach);
    }
  });
});

describe("the release store is kept and depended upon by nothing", () => {
  it("still works when asked for by name", () => {
    // Removing a dependency is not a reason to burn the road back to it.
    expect(code(freshness)).toContain("github-release");
    expect(code(prune)).toContain("github-release");
  });

  it("is never the default", () => {
    expect(code(freshness)).not.toMatch(/BACKUP_STORE:-github-release/);
    expect(code(prune)).not.toMatch(/BACKUP_STORE:-github-release/);
  });
});

describe("the cloud workflows still name the store they read", () => {
  // The default flipped from the release store to `local` on 2026-08-31. These
  // two run in the cloud, where there is no local store — an unnamed default
  // fails them on "BACKUP_LOCAL_DIR is required", which would be a backup
  // canary broken by a change to where backups live.
  const cloud = ["backup-canary.yml", "nightly-backup.yml"];

  it.each(cloud)("%s pins BACKUP_STORE", (file) => {
    const workflow = read(`ops/recovery-repo/workflows/${file}`);
    expect(workflow).toContain("check-backup-freshness.sh");
    expect(workflow).toContain("BACKUP_STORE: github-release");
  });

  it.each(cloud)("%s names it at every call site", (file) => {
    const workflow = read(`ops/recovery-repo/workflows/${file}`);
    const calls = (workflow.match(/check-backup-freshness\.sh/g) ?? []).length;
    const pins = (workflow.match(/BACKUP_STORE: github-release/g) ?? []).length;
    expect(pins).toBe(calls);
  });
});

describe("the destination is proved by reading it back, never by a size", () => {
  it("the off-site copy hashes what it wrote, through the destination", () => {
    expect(code(offsite)).toContain("check-materialised.mjs");
  });

  it("writes to a dot-name and renames, so a sync cannot catch it half-written", () => {
    expect(code(offsite)).toContain(".partial");
  });

  it("refuses to overwrite a set that is already there", () => {
    // A recovery set is written once. Anything presenting as an edit is
    // corruption or an id collision, and must stop the copy rather than
    // quietly replace a night that restored.
    expect(code(offsite)).toMatch(/if \[ -f "\$offsite_target" \]; then\n\s*offsite_present_already/);
  });
});
