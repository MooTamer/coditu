import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * `offsite-copy.sh`, run for real against temporary directories.
 *
 * These are behaviours, not greps. The script's whole job is to be right about
 * three states that look alike from a distance —
 *
 *   **absent and allowed** — the external disk is unplugged. Not a failure. An
 *     unplugged disk is somebody's bag, not a broken backup.
 *   **absent and not allowed** — Google Drive's folder has gone. That IS a
 *     failure: a destination that was working and silently stopped is the
 *     defect this repository keeps finding.
 *   **present and wrong** — the file is there, the size is right, and the bytes
 *     are not. The one that passes every cheap check.
 *
 * — and a script that confuses any two of them is worse than not having it.
 */

const script = resolve(import.meta.dirname, "../scripts/offsite-copy.sh");
const roots: string[] = [];

function scratch(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), `coditu-${prefix}-`));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

function writeSet(dir: string, id: string) {
  const bytes = randomBytes(4096);
  writeFileSync(join(dir, `${id}.tar.gz.age`), bytes);
  writeFileSync(
    join(dir, `${id}.metadata.json`),
    JSON.stringify({
      backupId: id,
      archive: `${id}.tar.gz.age`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      formatVersion: 1,
    }),
  );
  return bytes.length;
}

function run(env: Record<string, string>) {
  try {
    const stdout = execFileSync("bash", [script], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

/** A source directory holding `count` sets, newest last. */
function sourceWith(count: number, month = "08") {
  const dir = scratch("src");
  for (let day = 1; day <= count; day += 1) {
    writeSet(dir, `2026-${month}-${String(day).padStart(2, "0")}T010000Z`);
  }
  return dir;
}

describe("a destination that is there", () => {
  it("copies, reads back through the destination, and counts", () => {
    const source = sourceWith(3);
    const dest = scratch("dest");

    const result = run({
      OFFSITE_NAME: "drive",
      OFFSITE_DIR: dest,
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: scratch("state"),
    });

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("offsite_drive=present");
    expect(result.stdout).toContain("offsite_drive_copied=3");
    expect(result.stdout).toContain("offsite_drive_sets=3");
    // The claim that matters: not "3 files were written" but "3 files read back
    // from this destination and hashed to what the sidecars say".
    expect(result.stdout).toContain("offsite_drive_materialised=true");
  });

  it("does not copy again what is already there", () => {
    const source = sourceWith(2);
    const dest = scratch("dest");
    const state = scratch("state");
    const env = {
      OFFSITE_NAME: "drive",
      OFFSITE_DIR: dest,
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: state,
    };

    expect(run(env).stdout).toContain("offsite_drive_copied=2");
    const second = run(env);
    expect(second.stdout).toContain("offsite_drive_copied=0");
    expect(second.stdout).toContain("offsite_drive_already=2");
  });
});

describe("a destination that is present and wrong", () => {
  it("refuses a stub with the right name and the right size", () => {
    const source = sourceWith(1);
    const dest = scratch("dest");
    const state = scratch("state");
    const id = "2026-08-01T010000Z";

    // Copy it properly once, then replace the archive at the DESTINATION with
    // a file of exactly the right size and no data — a cloud placeholder, or a
    // sync that stopped halfway and told nobody.
    run({ OFFSITE_NAME: "drive", OFFSITE_DIR: dest, LOCAL_BACKUP_DIR: source, CODITU_NIGHTLY_LOG_DIR: state });
    const archive = join(dest, `${id}.tar.gz.age`);
    rmSync(archive);
    execFileSync("dd", ["if=/dev/zero", `of=${archive}`, "bs=1", "count=0", "seek=4096"], {
      stdio: "ignore",
    });

    const result = run({
      OFFSITE_NAME: "drive",
      OFFSITE_DIR: dest,
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: state,
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("does not read back");
  });
});

describe("a destination that is not there", () => {
  it("fails when it is required — Drive's folder vanishing is a real failure", () => {
    const source = sourceWith(1);
    const result = run({
      OFFSITE_NAME: "drive",
      OFFSITE_DIR: join(scratch("gone"), "not-here"),
      OFFSITE_REQUIRED: "1",
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: scratch("state"),
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("the destination is not there");
  });

  it("does NOT fail when it is optional — an unplugged disk is not a backup failure", () => {
    const source = sourceWith(1);
    const result = run({
      OFFSITE_NAME: "disk",
      OFFSITE_DIR: join(scratch("gone"), "not-here"),
      OFFSITE_REQUIRED: "0",
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: scratch("state"),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("offsite_disk=absent");
  });

  it("says how long it has been gone, so absent never reads as fine", () => {
    const source = sourceWith(1);
    const dest = scratch("dest");
    const state = scratch("state");
    const env = { OFFSITE_NAME: "disk", OFFSITE_REQUIRED: "0", LOCAL_BACKUP_DIR: source, CODITU_NIGHTLY_LOG_DIR: state };

    // Seen once…
    expect(run({ ...env, OFFSITE_DIR: dest }).stdout).toContain("offsite_disk=present");
    // …then unplugged.
    const gone = run({ ...env, OFFSITE_DIR: join(scratch("gone"), "not-here") });
    expect(gone.code).toBe(0);
    expect(gone.stdout).toMatch(/offsite_disk_last_seen=\d{4}-\d{2}-\d{2}T\d{6}Z/);
    expect(gone.stdout).toContain("offsite_disk_days_since=0");
  });

  it("reports never-seen as -1 rather than as zero days ago", () => {
    const source = sourceWith(1);
    const result = run({
      OFFSITE_NAME: "disk",
      OFFSITE_DIR: join(scratch("gone"), "not-here"),
      OFFSITE_REQUIRED: "0",
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: scratch("state"),
    });
    expect(result.stdout).toContain("offsite_disk_last_seen=never");
    expect(result.stdout).toContain("offsite_disk_days_since=-1");
  });
});

describe("the marker file", () => {
  // macOS creates the mount point whether or not anything is mounted on it, so
  // a directory existing at /Volumes/Backup proves nothing. Without this, a
  // night with no disk plugged in writes 19 MB to the boot disk and calls it an
  // off-site copy.
  it("makes an empty mount point read as absent, not as an empty destination", () => {
    const source = sourceWith(1);
    const emptyMountPoint = scratch("mountpoint");

    const result = run({
      OFFSITE_NAME: "disk",
      OFFSITE_DIR: emptyMountPoint,
      OFFSITE_MARKER: ".coditu-backup-volume",
      OFFSITE_REQUIRED: "0",
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: scratch("state"),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("offsite_disk=absent");
    expect(readdirSync(emptyMountPoint)).toHaveLength(0);
  });

  it("is what `--adopt` writes, and adoption is the whole installation", () => {
    const source = sourceWith(1);
    const disk = join(scratch("disk"), "coditu");
    const state = scratch("state");

    execFileSync("bash", [script, "--adopt", disk, "disk"], { encoding: "utf8" });
    expect(existsSync(join(disk, ".coditu-backup-volume"))).toBe(true);

    const result = run({
      OFFSITE_NAME: "disk",
      OFFSITE_DIR: disk,
      OFFSITE_MARKER: ".coditu-backup-volume",
      OFFSITE_REQUIRED: "0",
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: state,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("offsite_disk=present");
  });
});

describe("retention at the destination", () => {
  it("keeps 30 nightly and the first of each month, and says what it removed", () => {
    const source = scratch("src");
    // 31 days of August plus 5 of September: the 30-newest window cannot reach
    // back to 1 August, so only the monthly rule can keep it.
    for (let day = 1; day <= 31; day += 1) {
      writeSet(source, `2026-08-${String(day).padStart(2, "0")}T010000Z`);
    }
    for (let day = 1; day <= 5; day += 1) {
      writeSet(source, `2026-09-0${day}T010000Z`);
    }
    const dest = scratch("dest");

    const result = run({
      OFFSITE_NAME: "drive",
      OFFSITE_DIR: dest,
      LOCAL_BACKUP_DIR: source,
      CODITU_NIGHTLY_LOG_DIR: scratch("state"),
    });
    expect(result.code).toBe(0);

    const kept = readdirSync(dest).filter((n) => n.endsWith(".tar.gz.age")).sort();
    expect(kept).toHaveLength(31);
    expect(result.stdout).toContain("offsite_drive_pruned=5");
    // The grandfather: August's first set survives even though 30 newer ones exist.
    expect(kept).toContain("2026-08-01T010000Z.tar.gz.age");
    // And the ones it dropped are named, so a silent truncation is impossible.
    expect(result.stdout).toContain("pruned=drive/2026-08-02T010000Z");
  });
});

describe("a source with no sets at all", () => {
  it("refuses rather than reporting an empty destination as copied", () => {
    const result = run({
      OFFSITE_NAME: "drive",
      OFFSITE_DIR: scratch("dest"),
      LOCAL_BACKUP_DIR: scratch("empty-src"),
      CODITU_NIGHTLY_LOG_DIR: scratch("state"),
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("no archives in");
  });
});
