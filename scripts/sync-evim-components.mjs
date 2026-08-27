/**
 * Regenerate the MEINEvim component registry from the delivery repository.
 *
 *   node scripts/sync-evim-components.mjs            # rewrite the seed, report the diff
 *   node scripts/sync-evim-components.mjs --check    # report only, exit 1 if stale
 *   node scripts/sync-evim-components.mjs --repo ../elsewhere
 *
 * ## Why this exists
 *
 * The registry is a fact about another repository — one row per SPFx solution
 * and per React feature EVIM actually has, carrying the same toolbox icon
 * SharePoint shows in "Add a web part". Facts about another repository go stale
 * silently: somebody adds a web part over there and Coditu keeps offering
 * yesterday's list, which is the failure mode a picker is supposed to remove.
 *
 * So the seed is GENERATED, and staying in step is one command with a diff at
 * the end of it rather than a memory of having looked.
 *
 * Reads nothing but the manifests and the React feature registry. Writes one
 * file. Never touches a database: applying it is `npm run db:reset` locally, or
 * running `supabase/seeds/components.sql` against the hosted project — it is a
 * single idempotent insert and safe to paste into the SQL editor as it is.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "supabase", "seeds", "components.sql");
const CHECK = process.argv.includes("--check");

const repoFlag = process.argv.indexOf("--repo");
const REPO = resolve(
  repoFlag > -1 && process.argv[repoFlag + 1]
    ? process.argv[repoFlag + 1]
    : process.env.EVIM_REPO ?? join(ROOT, "..", "microsoft-web-parts-final")
);

if (!existsSync(REPO)) {
  console.error(
    `The delivery repository is not at ${REPO}.\n` +
      `Pass --repo <path>, or set EVIM_REPO. Nothing was written.`
  );
  process.exit(1);
}

/**
 * Folders that are not deliverables.
 *
 * `ORG CHART V2` is a build drop of Org Chart — `lib/`, `release/`, `temp/`, no
 * `package.json` — and `teaser-video` is a Remotion project, not SPFx. Both are
 * named here rather than guessed at, so a folder that stops matching a heuristic
 * cannot silently disappear from the registry.
 */
/**
 * Components the delivery repository no longer has, kept in the registry as
 * ARCHIVED.
 *
 * ## Why they cannot simply drop out of the seed
 *
 * `components.is_archived` exists because *"an archived component keeps every
 * item that names it"* — retiring one is not deleting one. But this file is
 * generated from the delivery repo, so a web part deleted over there vanished
 * from the seed entirely, and then a fresh `npm run db:reset` created a
 * database in which it had **never existed**: `work_item_components` rows
 * pointing at it are silently not made, and the item history that names it has
 * nothing to resolve.
 *
 * `Redakteurkalender` carries exactly that today — one story is attributed to
 * it. Dropping it from the seed would have taken that attribution with it, on
 * every fresh checkout, with nothing on screen to say so.
 *
 * So a component that leaves the delivery repository moves **here**, and is
 * emitted archived. The registry page and the picker already hide archived
 * rows from new work and keep showing them on the items that have them.
 *
 * Each entry records when and why, because the alternative is a list nobody
 * dares prune.
 */
const RETIRED = [
  { name: "Anfrage", slug: "anfrage", kind: "react", icon: null,
    since: "2026-08-27", why: "removed from the EVIM React feature registry" },
  { name: "Redakteurkalender", slug: "redakteurkalender", kind: "react", icon: null,
    since: "2026-08-27", why: "superseded by Redaktionskalender" },
];

const NOT_A_COMPONENT = new Set([
  "ORG CHART V2",
  "teaser-video",
  "packages",
  "scripts",
  "docs",
  "exports",
  "node_modules",
]);

/** The one React solution. Its features come from its own registry, not its folders. */
const REACT_SOLUTION = "EVIM React Library";

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

/** A manifest is JSON with `//` comments, which JSON.parse refuses. */
function readManifest(path) {
  const text = readFileSync(path, "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(text);
}

function manifestsIn(folder) {
  const found = [];
  for (const kind of ["webparts", "extensions"]) {
    const dir = join(folder, "src", kind);
    if (!existsSync(dir)) continue;
    for (const component of readdirSync(dir).sort()) {
      const componentDir = join(dir, component);
      if (!statSync(componentDir).isDirectory()) continue;
      for (const file of readdirSync(componentDir).sort()) {
        // `._Name.manifest.json` is an AppleDouble sidecar, not a manifest.
        if (file.endsWith(".manifest.json") && !file.startsWith("._")) {
          found.push(join(componentDir, file));
        }
      }
    }
  }
  return found;
}

const rows = [];

for (const entry of readdirSync(REPO).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))) {
  if (entry.startsWith(".") || NOT_A_COMPONENT.has(entry)) continue;
  const folder = join(REPO, entry);
  if (!statSync(folder).isDirectory()) continue;

  for (const path of manifestsIn(folder)) {
    const manifest = readManifest(path);
    const preconfigured = manifest.preconfiguredEntries?.[0];
    rows.push({
      // The folder name is NOT the product name — `ButtonLinkPlus` ships as
      // *EVIM Button Link*. The toolbox title is what a ticket calls it. The
      // three extensions have no toolbox entry, so they keep their folder name.
      name: preconfigured?.title?.default ?? entry,
      kind: "spfx",
      icon: preconfigured?.officeFabricIconFontName ?? null,
      source: entry,
    });
  }
}

rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

/* The React app: one row for the shell, one per feature in its own registry. */
const reactRows = [{ name: REACT_SOLUTION, kind: "react", icon: null, source: REACT_SOLUTION }];
const registryPath = join(REPO, REACT_SOLUTION, "src", "app", "registry.ts");

if (existsSync(registryPath)) {
  const source = readFileSync(registryPath, "utf8");
  for (const match of source.matchAll(/^\s*label:\s*["'](.+?)["'],?\s*$/gm)) {
    reactRows.push({ name: match[1], kind: "react", icon: null, source: registryPath });
  }
} else {
  console.warn(`! ${REACT_SOLUTION}/src/app/registry.ts is missing — no React features read.`);
}

// Live rows first, then the retired ones. Both are inserted; only the retired
// ones are archived afterwards, by an explicit statement the file carries.
const live = [...rows, ...reactRows];
const all = [...live, ...RETIRED];

/* -------------------------------------------------------------------------- */
/* Slug — must agree with componentSlug() in lib/components.ts                  */
/* -------------------------------------------------------------------------- */

function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const bySlug = new Map();
for (const row of all) {
  row.slug = slugify(row.name);
  if (!row.slug) {
    console.error(`"${row.name}" (${row.source}) has no usable slug. Nothing was written.`);
    process.exit(1);
  }
  const clash = bySlug.get(row.slug);
  if (clash) {
    console.error(
      `Two components would share the slug "${row.slug}": "${clash.name}" (${clash.source}) ` +
        `and "${row.name}" (${row.source}). Rename one, or add it to the registry by hand. Nothing was written.`
    );
    process.exit(1);
  }
  bySlug.set(row.slug, row);
}

/* -------------------------------------------------------------------------- */
/* Emit                                                                        */
/* -------------------------------------------------------------------------- */

const quote = (value) => (value === null ? "null" : `'${String(value).replace(/'/g, "''")}'`);

const width = (pick) => Math.max(...all.map((row) => quote(pick(row)).length));
const nameWidth = width((row) => row.name);
const slugWidth = width((row) => row.slug);
const kindWidth = width((row) => row.kind);

const values = all
  .map(
    (row) =>
      `  (${quote(row.name).padEnd(nameWidth)}, ${quote(row.slug).padEnd(slugWidth)}, ` +
      `${quote(row.kind).padEnd(kindWidth)}, ${quote(row.icon)})`
  )
  .join(",\n");

const archiveSql = RETIRED.length
  ? `update public.components set is_archived = true
 where project_id = (select id from public.projects where slug = 'meinevim')
   and slug in (${RETIRED.map((row) => quote(row.slug)).join(", ")})
   and not is_archived`
  : "-- nothing retired";

const sql = `-- Coditu — the MEINEvim component registry.
--
-- GENERATED by scripts/sync-evim-components.mjs from the delivery repository.
-- Do not edit by hand: re-run the script instead.
--
--   node scripts/sync-evim-components.mjs           rewrite this file
--   node scripts/sync-evim-components.mjs --check   fail if it is stale
--
-- ## Why this is a separate seed file
--
-- \`supabase/seed.sql\` is generated from the team's Notion export and says so at
-- the top. This list does not come from Notion: it is read out of the delivery
-- repository — one row per SPFx solution's \`preconfiguredEntries[0]\` (the title
-- and toolbox icon EVIM sees in SharePoint), one per feature in the React app's
-- own registry. \`supabase/config.toml\` lists both files, in order, under
-- \`[db.seed]\`.
--
-- ## Why it is not a migration
--
-- A migration runs BEFORE the seed on \`supabase db reset\`, so the project row it
-- needs does not exist yet locally and the insert would be a silent no-op on
-- every fresh checkout. Against the hosted database, where the project has
-- existed since the import, this file is safe to run exactly as it is: one
-- idempotent statement that opens no transaction (the Supabase SQL editor
-- discards those).
--
-- ## What it will not do
--
-- \`on conflict do nothing\`, so it only ever ADDS. A component renamed in the
-- delivery repo, or given a different toolbox icon, is not overwritten here —
-- renaming is a decision with a paper trail (the item history follows the row),
-- and this file is not the place to make it silently. The script prints those
-- as drift; act on them in the app.

insert into public.components (project_id, name, slug, kind, icon)
select project.id, listed.name, listed.slug, listed.kind::component_kind, listed.icon
from public.projects project
cross join (values
${values}
) as listed (name, slug, kind, icon)
where project.slug = 'meinevim'
on conflict (project_id, slug) do nothing;

-- Retired: in the registry, out of the toolbox.
--
-- These left the delivery repository and are kept because \`is_archived\` is what
-- *"keeps every item that names it"*. Dropping them from the list above would
-- have made a fresh \`db:reset\` produce a database in which they had never
-- existed, taking their item attributions with them.
--
-- An UPDATE rather than part of the insert, so it also reaches a database where
-- the row already exists and is not archived — which is every database that had
-- them before they were retired, including the hosted one. Idempotent, and it
-- opens no transaction (the Supabase SQL editor discards those).
${archiveSql};
`;

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

const previous = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

/** Pull `('Name', 'slug', 'kind', icon)` back out of the file we wrote last time. */
function parse(text) {
  const found = new Map();
  for (const match of text.matchAll(
    // The emitted rows are column-aligned, so every separator is
    // `<value><padding>,<space>` — matching a bare `',` finds nothing and every
    // component reads as new on every run.
    /^\s*\('((?:[^']|'')*)'\s*,\s*'([a-z0-9-]+)'\s*,\s*'(react|spfx)'\s*,\s*(?:'((?:[^']|'')*)'|null)\)/gm
  )) {
    found.set(match[2], {
      name: match[1].replace(/''/g, "'"),
      kind: match[3],
      icon: match[4] === undefined ? null : match[4].replace(/''/g, "'"),
    });
  }
  return found;
}

const before = parse(previous);
const added = all.filter((row) => !before.has(row.slug));
const removed = [...before.keys()].filter((slug) => !bySlug.has(slug));
const changed = all.filter((row) => {
  const was = before.get(row.slug);
  return was && (was.name !== row.name || was.kind !== row.kind || was.icon !== row.icon);
});

console.log(`${REPO}\n${all.length} components — ${rows.length} SPFx, ${reactRows.length} React\n`);

for (const row of added) console.log(`+ new       ${row.name}  (${row.kind}, icon ${row.icon ?? "—"})`);
for (const row of changed) {
  const was = before.get(row.slug);
  console.log(
    `~ changed   ${was.name} → ${row.name}  (${was.kind} → ${row.kind}, icon ${was.icon ?? "—"} → ${row.icon ?? "—"})`
  );
}
const retiredSlugs = new Set(RETIRED.map((row) => row.slug));
for (const slug of removed) {
  console.log(
    `- gone      ${before.get(slug).name}  — add it to RETIRED in this script; it keeps its history`
  );
}
for (const row of RETIRED) {
  if (!bySlug.has(row.slug)) console.log(`· archived  ${row.name}  (${row.since} — ${row.why})`);
}
void retiredSlugs;

const stale = sql !== previous;

if (!stale) {
  console.log("In step with the delivery repository. Nothing to do.");
  process.exit(0);
}

if (CHECK) {
  console.error("\nsupabase/seeds/components.sql is stale. Re-run without --check.");
  process.exit(1);
}

writeFileSync(OUT, sql);
console.log(`\nWrote supabase/seeds/components.sql.`);
console.log(
  added.length || changed.length
    ? "Apply it with `npm run db:reset` locally, or run the file against the hosted project."
    : "Formatting only — no rows moved."
);
