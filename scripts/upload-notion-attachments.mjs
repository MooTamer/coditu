/**
 * Push the imported Notion attachments into the private `work-attachments`
 * bucket, at exactly the paths `supabase/seed.sql` already claims for them.
 *
 *   node scripts/upload-notion-attachments.mjs <extracted-export-dir>
 *
 * Run it after `npm run db:seed`. A database reset clears `storage.objects`
 * even though the bytes survive on disk, so the rows in `attachments` would
 * otherwise point at objects the Storage API no longer knows about. The upload
 * is an upsert, so running it twice is free.
 *
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
 * environment, or from `.env.local` if they are not already set. The service
 * role is required: the bucket is private, and these objects belong to people
 * who are not the one running the script.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const EXPORT_ROOT = process.argv[2];
if (!EXPORT_ROOT || !existsSync(EXPORT_ROOT)) {
  console.error("usage: node scripts/upload-notion-attachments.mjs <extracted-export-dir>");
  process.exit(1);
}

const root = join(import.meta.dirname, "..");

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = join(root, ".env.local");
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const manifestPath = join(root, "supabase", "notion-attachments.json");
if (!existsSync(manifestPath)) {
  console.error("supabase/notion-attachments.json is missing — run scripts/import-notion-export.mjs first.");
  process.exit(1);
}
const { bucket, files } = JSON.parse(readFileSync(manifestPath, "utf8"));

console.log(`${files.length} files → ${bucket} at ${url}`);

let done = 0;
const failures = [];

for (const file of files) {
  const source = join(EXPORT_ROOT, file.source);
  if (!existsSync(source)) {
    failures.push(`${file.path}: source missing (${file.source})`);
    continue;
  }
  const body = readFileSync(source);
  const response = await fetch(
    `${url}/storage/v1/object/${bucket}/${file.path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": file.mime,
        // Upsert, so a re-run after `db:reset` re-registers every object
        // instead of failing on the first one that already exists.
        "x-upsert": "true",
      },
      body,
    }
  );
  if (!response.ok) {
    failures.push(`${file.path}: ${response.status} ${(await response.text()).slice(0, 160)}`);
    continue;
  }
  done += 1;
  if (done % 20 === 0) console.log(`  ${done}/${files.length}`);
}

console.log(`uploaded ${done}/${files.length}`);
if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}
