import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  SF_DATALESS,
  suspectFromStat,
  verifyArchive,
} from "../scripts/check-materialised.mjs";

/**
 * The trap, as a test rather than a sentence in a runbook.
 *
 * Google Drive, iCloud, OneDrive and Dropbox all present files that are not
 * there: a name, a size, a modified date, an icon — and no bytes. Reading one
 * blocks on a download, and with no network the read fails. A check that
 * asserts the file exists and is the right size passes on every one of them.
 *
 * **A backup that needs the internet to be read is not an off-site copy.** It
 * is a receipt. And this is one layer out from the defect this project keeps
 * finding, because here the control is not merely quiet — it is loud, green,
 * and wrong.
 *
 * ## What can be proved on a machine with no cloud client installed
 *
 * A **sparse file** is the same shape at the level `stat` sees: `st_size` says
 * 19 MB, `st_blocks` says zero, and the name is right. It is producible with
 * `dd seek=`, which means the detector can be shown failing rather than
 * asserted to work. It differs from a real placeholder in the one way that
 * makes the test weaker and says so: a sparse file READS, returning zeros,
 * where a placeholder with no network throws. So the sparse case exercises the
 * checksum limb and the error case is constructed separately.
 *
 * `SF_DATALESS` cannot be set by hand — it belongs to a File Provider and to
 * the kernel — so that limb is asserted as a pure function over the flag value
 * macOS actually uses.
 */

const roots: string[] = [];
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "coditu-materialised-"));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/** A real recovery set: bytes on disk, and a sidecar that describes them. */
function writeRealSet(dir: string, id = "2026-08-31T070134Z") {
  const bytes = randomBytes(64 * 1024);
  const archive = join(dir, `${id}.tar.gz.age`);
  writeFileSync(archive, bytes);
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
  return { archive, bytes: bytes.length };
}

/** The same name and the same size, and no data behind it. */
function replaceWithStub(archive: string, size: number) {
  rmSync(archive, { force: true });
  execFileSync("dd", ["if=/dev/zero", `of=${archive}`, "bs=1", "count=0", `seek=${size}`], {
    stdio: "ignore",
  });
}

describe("the stat tells, as a pure function", () => {
  it("calls a file with a size and no blocks suspect", () => {
    const verdict = suspectFromStat({ size: 19_401_140, blocks: 0 }, 0);
    expect(verdict.suspect).toBe(true);
    expect(verdict.reason).toContain("no disk blocks");
  });

  it("calls a dataless file suspect even when it has blocks", () => {
    // macOS can allocate a placeholder some blocks; the flag is the statement.
    const verdict = suspectFromStat({ size: 19_401_140, blocks: 8 }, SF_DATALESS);
    expect(verdict.suspect).toBe(true);
    expect(verdict.reason).toContain("dataless");
  });

  it("calls an empty file suspect", () => {
    expect(suspectFromStat({ size: 0, blocks: 0 }, 0).suspect).toBe(true);
  });

  it("passes a file that owns its bytes", () => {
    expect(suspectFromStat({ size: 19_401_140, blocks: 37_896 }, 0).suspect).toBe(false);
  });

  it("does not guess on a platform with no st_flags", () => {
    // Linux has no SF_DATALESS. `null` means "no answer", and no answer must
    // not read as "dataless" — the file read below is the assertion.
    expect(suspectFromStat({ size: 19_401_140, blocks: 37_896 }, null).suspect).toBe(false);
  });
});

describe("a real recovery set on local disk", () => {
  it("verifies, and says so", async () => {
    const dir = scratch();
    const { archive } = writeRealSet(dir);
    const result = await verifyArchive(archive);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("on disk");
  });
});

describe("a stub that would pass a size check", () => {
  it("has exactly the shape that fools one", () => {
    const dir = scratch();
    const { archive, bytes } = writeRealSet(dir);
    replaceWithStub(archive, bytes);

    const stat = statSync(archive);
    // This is the whole point: every cheap assertion still passes.
    expect(stat.size).toBe(bytes);
    expect(stat.blocks).toBe(0);
  });

  it("is refused", async () => {
    const dir = scratch();
    const { archive, bytes } = writeRealSet(dir);
    replaceWithStub(archive, bytes);

    const result = await verifyArchive(archive);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("checksum does not match");
    expect(result.detail).toContain("no disk blocks");
  });
});

describe("a file that is present and is the wrong bytes", () => {
  it("is refused, which no stat could do", async () => {
    const dir = scratch();
    const { archive } = writeRealSet(dir);
    writeFileSync(archive, randomBytes(64 * 1024));

    const result = await verifyArchive(archive);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("checksum does not match");
  });
});

describe("a set with no sidecar", () => {
  it("is refused rather than trusted", async () => {
    const dir = scratch();
    const { archive } = writeRealSet(dir);
    rmSync(join(dir, "2026-08-31T070134Z.metadata.json"));

    const result = await verifyArchive(archive);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("no readable sidecar");
  });
});

describe("a file that cannot be read at all", () => {
  it("reports the read failure, which is what a placeholder does offline", async () => {
    const dir = scratch();
    const { archive } = writeRealSet(dir);
    // The closest reproducible stand-in for "the file provider cannot fetch
    // it": the name resolves, the read does not.
    rmSync(archive);
    const result = await verifyArchive(archive);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("cannot stat it");
  });
});
