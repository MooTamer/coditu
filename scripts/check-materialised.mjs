#!/usr/bin/env node
/**
 * Is this archive actually ON THIS DISK, or is it a name the network can fill in
 * later?
 *
 * ## The trap this exists for
 *
 * Google Drive for desktop, iCloud Drive, OneDrive and Dropbox Smart Sync all
 * present files that are not there. Finder shows a name, a size, a modified
 * date and an icon; `ls -l` shows a byte count; a script that checks the file
 * exists and is the right size passes. Reading it blocks on a download, and
 * with no network the read FAILS.
 *
 * A backup that needs the internet to be read is not an off-site copy of
 * anything. It is a receipt.
 *
 * This is one layer out from the defect this project keeps finding: a control
 * that is quiet when it is unconfigured. Here the control would be *loud and
 * green* — the file is present, the size is right — and wrong.
 *
 * ## Three tells, cheapest first, and only the last one is proof
 *
 * 1. **`st_blocks == 0` with `st_size > 0`.** The file claims bytes and owns no
 *    disk. True of a cloud placeholder and also of a sparse file, which is how
 *    this check can be tested on a machine with no cloud client installed.
 * 2. **`SF_DATALESS` (0x40000000).** macOS sets it on a File Provider
 *    placeholder. Read through `stat -f %f`, because `fstat` does not reach
 *    Node. Absent on Linux, where it is skipped rather than guessed at.
 * 3. **The whole file, read and hashed against its own sidecar.** The only one
 *    that is proof. It forces a placeholder to materialise, which is exactly
 *    what fails when the network is off — and it also catches a file that IS on
 *    disk and is the wrong bytes, which no `stat` can.
 *
 * The first two exist to produce a better message, not a different verdict.
 * Nothing here trusts a size.
 *
 * Usage:
 *   node scripts/check-materialised.mjs <dir>          every set in a directory
 *   node scripts/check-materialised.mjs <archive> ...  named archives
 *
 * Exit 0 only when every archive read back byte-for-byte from local disk.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** macOS `SF_DATALESS`: this name has no data behind it yet. */
export const SF_DATALESS = 0x4000_0000;

/**
 * The cheap tells, as a pure function so the shapes can be asserted without a
 * cloud client — see `tests/offsite-materialised.test.ts`.
 *
 * @param {{ size: number, blocks: number }} stat
 * @param {number | null} flags `st_flags`, or null where the platform has none.
 * @returns {{ suspect: boolean, reason: string }}
 */
export function suspectFromStat(stat, flags) {
  if (stat.size === 0) {
    return { suspect: true, reason: "the file is empty" };
  }
  if (flags !== null && (flags & SF_DATALESS) !== 0) {
    return {
      suspect: true,
      reason: "macOS marks it dataless — a placeholder the file provider fills on read",
    };
  }
  if (stat.blocks === 0) {
    return {
      suspect: true,
      reason: `it claims ${stat.size} bytes and owns no disk blocks`,
    };
  }
  return { suspect: false, reason: "" };
}

/** `st_flags`, which Node's `fs.Stats` does not carry. null where there is no such thing. */
export function fileFlags(path) {
  if (process.platform !== "darwin") return null;
  try {
    return Number.parseInt(execFileSync("stat", ["-f", "%f", path], { encoding: "utf8" }).trim(), 10);
  } catch {
    // A `stat` that cannot answer is not evidence of anything. The read below
    // is the assertion; this only ever improves the message.
    return null;
  }
}

function sha256(path) {
  return new Promise((ok, no) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", no);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => ok(hash.digest("hex")));
  });
}

/**
 * @returns {Promise<{ archive: string, ok: boolean, detail: string, bytes: number }>}
 */
export async function verifyArchive(archive) {
  const sidecar = join(dirname(archive), `${basename(archive, ".tar.gz.age")}.metadata.json`);

  let stat;
  try {
    stat = statSync(archive);
  } catch (error) {
    return { archive, ok: false, detail: `cannot stat it: ${error.code ?? error.message}`, bytes: 0 };
  }

  const suspect = suspectFromStat(stat, fileFlags(archive));

  let recorded;
  try {
    recorded = JSON.parse(readFileSync(sidecar, "utf8"));
  } catch {
    return { archive, ok: false, detail: `no readable sidecar at ${basename(sidecar)}`, bytes: stat.size };
  }

  // The read. A placeholder blocks here and, with no network, throws — which is
  // the entire point of running this pass with the wifi off.
  let digest;
  try {
    digest = await sha256(archive);
  } catch (error) {
    const why = suspect.suspect ? ` (${suspect.reason})` : "";
    return {
      archive,
      ok: false,
      detail: `the read failed: ${error.code ?? error.message}${why}`,
      bytes: stat.size,
    };
  }

  if (stat.size !== recorded.bytes) {
    return {
      archive,
      ok: false,
      detail: `${stat.size} bytes on disk, ${recorded.bytes} recorded`,
      bytes: stat.size,
    };
  }
  if (digest !== recorded.sha256) {
    // Reached by a sparse file, which reads back as zeros without erroring —
    // present to `stat`, present to `read`, and not the archive.
    const why = suspect.suspect ? ` (${suspect.reason})` : "";
    return { archive, ok: false, detail: `checksum does not match its sidecar${why}`, bytes: stat.size };
  }
  if (suspect.suspect) {
    // It hashed correctly and still looks wrong. Report rather than pass: the
    // read may have materialised it just now, over a network this run happened
    // to have.
    return { archive, ok: false, detail: `read back correctly but ${suspect.reason}`, bytes: stat.size };
  }
  return { archive, ok: true, detail: "on disk, and it is the archive", bytes: stat.size };
}

export function archivesIn(target) {
  const stat = statSync(target);
  if (!stat.isDirectory()) return [resolve(target)];
  return readdirSync(target)
    .filter((name) => name.endsWith(".tar.gz.age"))
    .sort()
    .map((name) => resolve(join(target, name)));
}

async function main(argv) {
  if (argv.length === 0) {
    console.error("usage: check-materialised.mjs <dir | archive...>");
    return 2;
  }

  const archives = argv.flatMap((target) => {
    try {
      return archivesIn(target);
    } catch (error) {
      console.error(`cannot read ${target}: ${error.code ?? error.message}`);
      return [];
    }
  });

  if (archives.length === 0) {
    // Nothing to check is not the same as everything being fine. An empty
    // destination is the failure this whole layer exists to notice.
    console.error("no archives found; refusing to report an empty destination as verified");
    return 1;
  }

  let failed = 0;
  let bytes = 0;
  for (const archive of archives) {
    const result = await verifyArchive(archive);
    bytes += result.bytes;
    console.log(`${result.ok ? "  ok  " : " FAIL "} ${basename(result.archive)}  ${result.detail}`);
    if (!result.ok) failed += 1;
  }

  console.log(`archives_checked=${archives.length}`);
  console.log(`archives_failed=${failed}`);
  console.log(`bytes_on_disk=${bytes}`);
  console.log(`materialised=${failed === 0 ? "true" : "false"}`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(await main(process.argv.slice(2)));
}
