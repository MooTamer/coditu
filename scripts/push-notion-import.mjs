/**
 * Apply the Notion import to a hosted Supabase project.
 *
 *   node scripts/push-notion-import.mjs <extracted-export-dir> --dry-run
 *   node scripts/push-notion-import.mjs <extracted-export-dir> --commit
 *
 * `--dry-run` is the default and writes nothing: it resolves people, counts what
 * it would delete and insert, and stops. `--commit` is the only mode that
 * touches the database, and it prints exactly what it removed.
 *
 * This is NOT `supabase/seed.sql`. The seed creates its own four accounts with a
 * known password and hard-codes their UUIDs, which is right for a local stack and
 * catastrophic against a live one — it has already put those accounts in
 * production once. This script never touches `auth`, never creates a profile and
 * never changes a role. It resolves the four people who are already there by
 * name, refuses to run if any of them is missing or ambiguous, and imports only
 * delivery data: clients, projects, sprints, work items, criteria, logged time
 * and attachments.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment, or from `.env.production.local`.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const EXPORT_ROOT = process.argv[2];
const COMMIT = process.argv.includes("--commit");

if (!EXPORT_ROOT || !existsSync(EXPORT_ROOT)) {
  console.error("usage: node scripts/push-notion-import.mjs <extracted-export-dir> [--commit]");
  process.exit(1);
}

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.production.local", ".env.local"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const URL_BASE = env("NEXT_PUBLIC_SUPABASE_URL");
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_BASE || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

async function rest(path, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...init.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const insert = (table, rows) =>
  rest(table, { method: "POST", body: JSON.stringify(rows), headers: { prefer: "return=representation" } });

const payload = JSON.parse(readFileSync(join(root, "supabase", "notion-import.json"), "utf8"));

console.log(`target: ${URL_BASE}`);
console.log(COMMIT ? "mode:   COMMIT — this writes\n" : "mode:   dry run — nothing will be written\n");

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

const profiles = await rest("profiles?select=id,full_name,is_active");
const counts = new Map();
for (const p of profiles) counts.set(p.full_name, (counts.get(p.full_name) ?? 0) + 1);

// A name is not a key. Two people can share one — it has happened in this
// database — so an ambiguous name resolves to nothing and stops the run rather
// than assigning a hundred items to an arbitrary one of them.
const byName = new Map(
  profiles.filter((p) => counts.get(p.full_name) === 1).map((p) => [p.full_name, p.id])
);

const needed = new Set();
for (const sprint of payload.sprints) {
  for (const item of sprint.items) {
    if (item.assignee) needed.add(item.assignee);
    if (item.reviewer) needed.add(item.reviewer);
    if (item.time?.who) needed.add(item.time.who);
  }
}
const missing = [...needed].filter((name) => !byName.has(name));
if (missing.length) {
  console.error("REFUSING TO RUN — these people are not resolvable in the target database:");
  for (const name of missing) {
    console.error(`  - ${name}${counts.has(name) ? " (name is ambiguous)" : " (no profile)"}`);
  }
  process.exit(1);
}
console.log("people resolved:");
for (const name of [...needed].sort()) console.log(`  ${name}`);

/* -------------------------------------------------------------------------- */
/* What is there now                                                           */
/* -------------------------------------------------------------------------- */

const existing = {};
for (const table of ["clients", "projects", "sprints", "work_items", "acceptance_criteria",
                     "time_entries", "comments", "attachments"]) {
  const response = await fetch(`${URL_BASE}/rest/v1/${table}?select=id`, {
    headers: { ...H, prefer: "count=exact", range: "0-0" },
  });
  existing[table] = Number((response.headers.get("content-range") ?? "*/0").split("/")[1]);
}
console.log("\nalready in the target:");
for (const [table, n] of Object.entries(existing)) console.log(`  ${table.padEnd(20)} ${n}`);

const willInsert = {
  clients: payload.clients.length,
  projects: payload.projects.length,
  sprints: payload.sprints.length,
  work_items: payload.sprints.reduce((n, s) => n + s.items.length, 0),
  acceptance_criteria: payload.sprints.reduce((n, s) => n + s.items.reduce((m, i) => m + i.criteria.length, 0), 0),
  time_entries: payload.sprints.reduce((n, s) => n + s.items.filter((i) => i.time).length, 0),
  attachments: payload.sprints.reduce((n, s) => n + s.items.reduce((m, i) => m + i.media.length, 0), 0),
};
console.log("\nwill insert:");
for (const [table, n] of Object.entries(willInsert)) console.log(`  ${table.padEnd(20)} ${n}`);

if (!COMMIT) {
  console.log("\nDry run. Re-run with --commit to apply.");
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Replace                                                                     */
/* -------------------------------------------------------------------------- */

// Deleting a client is refused while it still has projects (`on delete restrict`,
// so that nothing is ever orphaned), so this unwinds the scope chain from the
// bottom. Everything below a work item — criteria, time entries, comments,
// activity, attachment rows — cascades from it.
console.log("\nremoving the existing delivery data…");
for (const table of ["work_items", "sprints", "projects", "clients"]) {
  const gone = await rest(`${table}?id=not.is.null`, {
    method: "DELETE",
    headers: { prefer: "return=representation" },
  });
  console.log(`  ${table.padEnd(12)} ${gone.length} removed`);
}

console.log("\ninserting…");
const clients = new Map(
  (await insert("clients", payload.clients)).map((row) => [row.name, row.id])
);
console.log(`  clients   ${clients.size}`);

const projects = new Map(
  (await insert(
    "projects",
    payload.projects.map((p) => ({
      client_id: clients.get(p.client),
      name: p.name,
      slug: p.slug,
      scope: p.scope,
      accent_hex: p.accent_hex,
    }))
  )).map((row) => [row.slug, row.id])
);
console.log(`  projects  ${projects.size}`);

const sprints = await insert(
  "sprints",
  payload.sprints.map((s) => ({
    project_id: projects.get(s.project),
    number: s.number,
    name: s.name,
    starts_on: s.starts_on,
    ends_on: s.ends_on,
    status: s.status,
    notes: s.notes,
    // `notes_author_id` stays null: Notion does not record who wrote a sprint
    // note, and the app prints that name beside the text.
    notes_author_id: null,
  }))
);
const sprintId = new Map(sprints.map((row) => [`${row.project_id}:${row.number}`, row.id]));
console.log(`  sprints   ${sprints.length}`);

/**
 * Keys are left to the sequence rather than written out.
 *
 * `seed.sql` states COD-140…COD-243 explicitly and then `setval`s the sequence
 * past them. There is no way to move a sequence through PostgREST, so writing
 * explicit keys here would leave `work_item_key_seq` wherever it happens to be
 * and the team's next new item would collide with an imported one. Letting the
 * default assign them cannot collide, and inserting in sprint order keeps them
 * chronological.
 */
const itemIds = [];
for (const sprint of payload.sprints) {
  const target = sprintId.get(`${projects.get(sprint.project)}:${sprint.number}`);
  if (!sprint.items.length) continue;
  const rows = await insert(
    "work_items",
    sprint.items.map((i) => ({
      sprint_id: target,
      title: i.title,
      description: i.description,
      highlight: i.highlight,
      status: i.status,
      type: i.type,
      assignee_id: i.assignee ? byName.get(i.assignee) : null,
      reviewer_id: i.reviewer ? byName.get(i.reviewer) : null,
      deadline: i.deadline,
      estimate_minutes: null,
      grouping: i.grouping,
      order_index: i.order_index,
    }))
  );
  // PostgREST returns a bulk insert in the order it was given.
  rows.forEach((row, index) => itemIds.push({ id: row.id, key: row.key, item: sprint.items[index] }));
}
console.log(`  items     ${itemIds.length}  (${itemIds[0]?.key} … ${itemIds.at(-1)?.key})`);

const criteria = itemIds.flatMap(({ id, item }) =>
  item.criteria.map((c) => ({ work_item_id: id, body: c.body, is_done: c.is_done, order_index: c.order_index }))
);
if (criteria.length) await insert("acceptance_criteria", criteria);
console.log(`  criteria  ${criteria.length}`);

const entries = itemIds
  .filter(({ item }) => item.time)
  .map(({ id, item }) => ({
    work_item_id: id,
    profile_id: byName.get(item.time.who) ?? byName.get(item.assignee),
    minutes: item.time.minutes,
    worked_on: item.time.worked_on,
    note: item.time.note,
  }));
if (entries.length) await insert("time_entries", entries);
console.log(`  time      ${entries.length}`);

/* Attachment bytes first, rows second: a row pointing at an object that is not
   there renders as a broken link with nothing to say why. */
let uploaded = 0;
const attachmentRows = [];
for (const { id, item } of itemIds) {
  for (const media of item.media) {
    const source = join(EXPORT_ROOT, media.source);
    if (!existsSync(source)) {
      console.error(`  !! missing source ${media.source}`);
      continue;
    }
    const path = `${id}/${media.slug}`;
    const response = await fetch(
      `${URL_BASE}/storage/v1/object/work-attachments/${path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": media.mime, "x-upsert": "true" },
        body: readFileSync(source),
      }
    );
    if (!response.ok) {
      console.error(`  !! upload ${path}: ${response.status} ${(await response.text()).slice(0, 120)}`);
      continue;
    }
    uploaded += 1;
    attachmentRows.push({
      work_item_id: id,
      storage_path: path,
      file_name: media.file_name,
      mime_type: media.mime,
      bytes: media.bytes,
      uploaded_by: item.assignee ? byName.get(item.assignee) : byName.get("Mohamed Tamer"),
    });
  }
}
if (attachmentRows.length) await insert("attachments", attachmentRows);
console.log(`  files     ${uploaded} uploaded, ${attachmentRows.length} rows`);

console.log("\ndone.");
