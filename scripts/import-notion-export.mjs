/**
 * Turn the team's Notion workspace export into `supabase/seed.sql`.
 *
 * The Notion export is the record of the real work: fifteen sprints of EVIM
 * web parts, from Week 3 in November 2025 to Week 17 in August 2026. It is not
 * committed here — it contains live credentials — so this script takes the
 * extracted export as an argument and is the only thing that reads it.
 *
 *   node scripts/import-notion-export.mjs <extracted-export-dir>
 *
 * It writes three files:
 *   supabase/seed.sql                     the local database, in full
 *   supabase/notion-attachments.json      what scripts/upload-notion-attachments.mjs pushes to storage
 *   supabase/notion-import.json           the same import as portable data, for
 *                                         scripts/push-notion-import.mjs — which
 *                                         cannot use the seed's hard-coded profile
 *                                         UUIDs, because production's people are
 *                                         real accounts with ids of their own
 *
 * Everything it emits is transcribed. Where the export does not say something —
 * estimates, most sprint windows, who wrote a sprint note — the column is left
 * NULL rather than filled with a plausible guess. See docs/05-DECISIONS.md.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";

const EXPORT_ROOT = process.argv[2];
if (!EXPORT_ROOT || !existsSync(EXPORT_ROOT)) {
  console.error("usage: node scripts/import-notion-export.mjs <extracted-export-dir>");
  process.exit(1);
}

const TEAM = join(EXPORT_ROOT, "Private & Shared", "Global Stack team");
const EVIM = join(TEAM, "EVIM Webparts");

/* -------------------------------------------------------------------------- */
/* Secrets                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The export carries live secrets in its prose: a SharePoint password on the
 * project page, an OpenAI key in the Week 5 note, an OpenRouter key in Week 6,
 * and a test login in the Converso task. None of them belong in a database that
 * every team member can read, and none of them belong in git.
 *
 * Redaction happens on every string that leaves this file, and `assertNoSecrets`
 * re-checks the finished SQL — a scrubber you only run on the paths you thought
 * of is not a scrubber.
 */
const SECRET_PATTERNS = [
  [/sk-proj-[A-Za-z0-9_-]{16,}/g, "[OpenAI key redacted]"],
  [/sk-or-v1-[A-Za-z0-9]{16,}/g, "[OpenRouter key redacted]"],
  [/sk-ant-[A-Za-z0-9_-]{16,}/g, "[Anthropic key redacted]"],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, "[GitHub token redacted]"],
  [/\bsk-[A-Za-z0-9]{32,}/g, "[API key redacted]"],
  [/(Passwort|Password|Passwor\w*)\s*:?\s*\S+/gi, "$1: [redacted]"],
  [/\bpass\s*:\s*\S+/gi, "pass: [redacted]"],
  [/\blogin\s*:\s*\S+@\S+/gi, "login: [redacted]"],
  [/(Benutzername)\s*:?\s*\S+/gi, "$1: [redacted]"],
];

function scrub(text) {
  if (!text) return text;
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function assertNoSecrets(sql) {
  const leaks = [];
  for (const [pattern] of SECRET_PATTERNS.slice(0, 5)) {
    const hit = sql.match(pattern);
    if (hit) leaks.push(hit[0].slice(0, 12) + "…");
  }
  if (leaks.length) {
    console.error("REFUSING TO WRITE — secret-shaped strings survived scrubbing:", leaks);
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/** RFC 4180. Notion quotes any cell holding a comma, and titles here do. */
function parseCsv(text) {
  const input = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function readTable(path) {
  const [header, ...body] = parseCsv(readFileSync(path, "utf8"));
  return body.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name.trim(), (cells[i] ?? "").trim()]))
  );
}

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const PEOPLE = {
  "mohamed tamer": "MT",
  "abdelrahman elkhateeb": "AE",
  khateeb: "AE",
  "ahmed yehia": "AY",
  yehia: "AY",
  "adam nafie": "AN",
  adam: "AN",
};

/** The seed's own ids. Production has its own — see scripts/push-notion-import.mjs. */
const FULL_NAME = {
  MT: "Mohamed Tamer",
  AN: "Adam Nafie",
  AE: "Abdelrahman Elkhateeb",
  AY: "Ahmed Yehia",
};

const PROFILE_ID = {
  MT: "a0000000-0000-4000-8000-000000000001",
  AN: "a0000000-0000-4000-8000-000000000002",
  AE: "a0000000-0000-4000-8000-000000000003",
  AY: "a0000000-0000-4000-8000-000000000004",
};

/**
 * Notion's status labels against the `work_item_status` enum.
 *
 * Four of Notion's labels have no enum equivalent, and the mapping is a
 * judgement recorded in docs/05-DECISIONS.md:
 *   "Ready for review"       -> in_review           (distinct from peer review, which Notion also has)
 *   "Ready for deployment"   -> done                (passed review; these shipped in 2025)
 *   "Read for deployment"    -> done                (the same label, misspelled once, in Week 3)
 *   "Next sprint"            -> todo                (carried forward; the follow-up item exists in the next sprint)
 */
const STATUS = {
  done: "done",
  "dev started": "dev_started",
  "to do": "todo",
  todo: "todo",
  "not started": "todo",
  "next sprint": "todo",
  draft: "draft",
  "ready for peer review": "ready_for_peer_review",
  "ready for review": "in_review",
  "ready for deployment": "done",
  "read for deployment": "done",
};

const TYPE = { story: "story", "cr: change request": "change_request", "bug fix": "bug_fix" };

/**
 * Sprint windows, and only the six the export can actually prove.
 *
 * Week 17 is fixed by its item deadlines; 15 and 16 step back from it in
 * Monday-to-Sunday weeks. Week 3 is pinned by a screen recording filed as
 * `20251106-…mp4` and by deadlines on the 7th and 9th; Week 4 by a deadline of
 * the 16th and a note dated the 13th; Week 7 by eight deadlines of 29/12/2025.
 *
 * The other nine are NOT weekly-contiguous with these — Week 7 closes in
 * December 2025 and Week 15 opens in August 2026, which is seven sprints across
 * thirty-one weeks — so there is nothing to interpolate from and they stay NULL.
 */
const SPRINT_WINDOW = {
  3: ["2025-11-03", "2025-11-09"],
  4: ["2025-11-10", "2025-11-16"],
  7: ["2025-12-22", "2025-12-28"],
  15: ["2026-08-03", "2026-08-09"],
  16: ["2026-08-10", "2026-08-16"],
  17: ["2026-08-17", "2026-08-23"],
};

/**
 * The day a time entry is filed against when its own sprint has no window.
 *
 * Notion recorded one "Hours Worked" total per item, never a daily log, so no
 * per-day date exists anywhere in the source. The entry still has to carry a
 * date, so it carries the earliest day the work provably could have happened —
 * the day after the previous evidenced sprint closed — and every imported entry
 * says so in its note.
 */
const EARLIEST_POSSIBLE = { 5: "2025-11-17", 6: "2025-11-17" };
for (const n of [8, 9, 10, 11, 12, 13, 14]) EARLIEST_POSSIBLE[n] = "2025-12-29";

/* -------------------------------------------------------------------------- */
/* Markdown                                                                    */
/* -------------------------------------------------------------------------- */

/** One level of nesting is enough: paths here look like `EVIM Collapser (restoring…)/image.png`. */
const NESTED = "((?:[^()]|\\([^()]*\\))*)";
const IMG_RE = new RegExp(`!\\[[^\\]]*\\]\\(${NESTED}\\)`, "g");
const LINK_RE = new RegExp(`(?<!!)\\[([^\\]]*)\\]\\(${NESTED}\\)`, "g");
const PROP_RE =
  /^(Status|Hours Worked|Assignee|Reviewer|Deadline|Story Type|Grouping|deployment link|Priority|Due date|status|deadline):\s*(.*)$/;
const CHECK_RE = /^(\s*)-\s*\[( |x)\]\s*(.*)$/;

/**
 * Markdown to plain text.
 *
 * `description` and `highlight` render inside a single <p>, so anything left
 * unconverted shows up literally on screen. This is the only place that
 * conversion happens.
 */
function plain(text) {
  if (!text) return "";
  let t = text.replace(/<\/?aside>/g, "");
  t = t.replace(IMG_RE, "");
  t = t.replace(LINK_RE, (_m, label, url) => {
    const l = (label ?? "").trim();
    const u = (url ?? "").trim();
    if (!/^(https?:|mailto:)/.test(u)) return l;
    if (!l || l.replace(/\/$/, "") === u.replace(/\/$/, "")) return u;
    // Notion auto-links anything shaped like a hostname, so "Adam.Nafie" is
    // stored as `[Adam.Na](http://Adam.Name)fie`. That is not a link anybody
    // meant; keep the words and drop the URL it invented.
    const host = u.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!host.includes("/") && host.toLowerCase().startsWith(l.toLowerCase())) return l;
    return `${l} (${u})`;
  });
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/\*\*/g, "").replace(/~~/g, "");
  t = t.replace(/^\s*[-*•]\s+/gm, "• ");
  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return scrub(t).trim();
}

/**
 * A bold run on its own is ordinary emphasis. The Week 17 note defines the
 * highlight as a section you must discuss before implementing, so the paragraph
 * has to be asking for a conversation as well as be emphasised.
 */
const DISCUSS_RE =
  /discuss|reach out|contact me|tell me|let me know|before implement|do not implement|don.t implement|please only|what do you think|confirm|ask me|talk about this/i;

function readPage(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  const title = lines[0].replace(/^#+/, "").trim();

  let i = 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (!PROP_RE.test(line)) break;
    i += 1;
  }

  const prose = [];
  const criteria = [];
  const media = [];

  for (const line of lines.slice(i)) {
    for (const m of line.matchAll(IMG_RE)) media.push(m[1]);
    for (const m of line.matchAll(LINK_RE)) {
      const ref = (m[2] ?? "").trim();
      // A local file link is an attachment too — the Week 15 requirements PDF
      // arrives this way rather than as an embedded image.
      if (ref && !/^(https?:|mailto:)/.test(ref) && /\.[a-z0-9]{2,5}$/i.test(ref)) media.push(ref);
    }
    const bare = line.replace(IMG_RE, "").replace(/\s+$/, "");
    const check = CHECK_RE.exec(bare);
    if (check) {
      const body = plain(check[3].trim());
      if (body) {
        criteria.push({ depth: Math.floor(check[1].length / 4), done: check[2] === "x", body });
      }
      continue;
    }
    // Blank lines are kept: they are the paragraph boundary the highlight rule
    // splits on, and dropping them glues separate paragraphs together.
    prose.push(bare);
  }

  const highlight = [];
  const description = [];
  for (const para of prose.join("\n").trim().split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    const bold = /\*\*[^*]+\*\*/.test(p);
    const heading = /^\s*#{1,6}\s/.test(p);
    (bold && !heading && DISCUSS_RE.test(p) ? highlight : description).push(p);
  }

  return {
    title,
    description: plain(description.join("\n\n")) || null,
    highlight: plain(highlight.join("\n\n")) || null,
    criteria,
    media,
    dir: join(path, ".."),
  };
}

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function parseDate(raw, where) {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (m) {
    const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (month > 12) throw new Error(`${where}: deadline "${value}" is ambiguous`);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(value);
  if (m) {
    const month = MONTHS.indexOf(m[1]) + 1;
    if (month === 0) throw new Error(`${where}: unknown month in "${value}"`);
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  throw new Error(`${where}: unparsed date "${value}"`);
}

/** Invariant 2: hours become integer minutes here, at the boundary, or not at all. */
function toMinutes(raw, where) {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const minutes = Number(value) * 60;
  if (!Number.isFinite(minutes)) throw new Error(`${where}: hours "${value}" is not a number`);
  if (Math.abs(minutes - Math.round(minutes)) > 1e-9) {
    throw new Error(`${where}: hours "${value}" is not a whole number of minutes`);
  }
  return Math.round(minutes);
}

/** Notion strips these characters from export filenames, and truncates at 50. */
function sanitise(title) {
  return title
    .replace(/[/\\]/g, " ")
    .replace(/[:?*"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* SQL                                                                         */
/* -------------------------------------------------------------------------- */

const problems = [];
const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const uuid = (prefix, n) => `${prefix}-${String(n).padStart(12, "0")}`;

/* -------------------------------------------------------------------------- */
/* Walk                                                                        */
/* -------------------------------------------------------------------------- */

const weekDirs = readdirSync(EVIM)
  .filter((name) => /^Week \d+$/.test(name) && statSync(join(EVIM, name)).isDirectory())
  .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));

const sprints = [];

for (const name of weekDirs) {
  const number = Number(name.slice(5));
  const dir = join(EVIM, name);

  const view = readdirSync(dir).find((f) => f.endsWith(".csv") && !f.endsWith("_all.csv"));
  if (!view) {
    problems.push(`Week ${number}: no view CSV`);
    continue;
  }
  // The plain CSV preserves the board's own row order; `_all.csv` re-sorts the
  // columns alphabetically and loses it. Order is what `order_index` records.
  const rows = readTable(join(dir, view));

  const board = readdirSync(dir).find(
    (f) => f.startsWith("Dashboard") && statSync(join(dir, f)).isDirectory()
  );
  const pages = new Map();
  if (board) {
    for (const file of readdirSync(join(dir, board)).filter((f) => f.endsWith(".md"))) {
      const page = readPage(join(dir, board, file));
      const key = norm(sanitise(page.title));
      if (!pages.has(key)) pages.set(key, []);
      pages.get(key).push(page);
    }
  }

  const noteFile = readdirSync(EVIM).find((f) => f.startsWith(`Week ${number} `) && f.endsWith(".md"));
  let notes = null;
  if (noteFile) {
    let body = readFileSync(join(EVIM, noteFile), "utf8").split("\n").slice(1).join("\n");
    body = body.replace(/\[Dashboard\s*\]?\([^\n]*\)/g, "");
    body = body.replace(/\[Login Credentials\]\([^)]*\)/g, "held outside this system");
    body = plain(body);
    // Weeks 4 to 14 repeat the project's standing requirements verbatim. They
    // are the project's scope, written once on `projects.scope`; repeating them
    // on eleven sprints buries whatever that sprint actually said.
    const BOILERPLATE =
      /^(General requirements Important:|• Login Creds.*|• Mobile\/Tablet\/Desktop responsiveness|• First, Last name pasring.*|• Modern cool UI with animations|• Use Assistant, sans-serif as default font|• ?.?font size to be slider|• Use #d80345 as default color|• Use Fluent UI as much as possible|• ALL text either in German OR dynamic|---)$/;
    notes = body
      .split("\n")
      .filter((line) => !BOILERPLATE.test(line.trim()))
      // `sprint-notes.client.tsx` splits notes on blank lines and renders each
      // block as its own paragraph. A bullet list joined by single newlines is
      // therefore one paragraph, and Week 17's three instructions came out as a
      // single run-on line. Give every bullet the blank line the renderer wants.
      .map((line, i, all) => (/^\s*•/.test(line) && i > 0 && all[i - 1].trim() ? `\n${line}` : line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    notes = notes || null;
  }

  const items = [];
  rows.forEach((raw, order) => {
    const title = raw["Task"] || raw["Task name"] || "";
    if (!title) return; // Notion exports its trailing blank rows

    const where = `Week ${number} · ${title}`;
    const key = norm(sanitise(title));
    let matched = pages.get(key);
    if (!matched) {
      // Notion truncates long filenames, so fall back to a prefix match.
      matched = [];
      for (const [candidate, list] of pages) {
        if (candidate.length > 20 && key.startsWith(candidate)) matched.push(...list);
      }
    }
    const page = matched?.[0] ?? null;
    if (!page) problems.push(`${where}: no page found`);

    const statusRaw = raw["Status"] || raw["status"] || "";
    const status = STATUS[norm(statusRaw)];
    if (!status) problems.push(`${where}: unknown status "${statusRaw}"`);

    const typeRaw = raw["Story Type"] || "";
    const type = typeRaw ? TYPE[norm(typeRaw)] : "story";
    if (!type) problems.push(`${where}: unknown story type "${typeRaw}"`);

    const assignee = raw["Assignee"] ? PEOPLE[norm(raw["Assignee"])] : null;
    if (raw["Assignee"] && !assignee) problems.push(`${where}: unknown assignee "${raw["Assignee"]}"`);
    const reviewer = raw["Reviewer"] ? PEOPLE[norm(raw["Reviewer"])] : null;
    if (raw["Reviewer"] && !reviewer) problems.push(`${where}: unknown reviewer "${raw["Reviewer"]}"`);

    let description = page?.description ?? null;
    // Week 16 carries a `deployment link` column that has no home in the schema,
    // and inventing one is out of scope, so it rides in the description.
    if (raw["deployment link"]) {
      const line = `Deployed at: ${raw["deployment link"]}`;
      description = description ? `${description}\n\n${line}` : line;
    }

    const grouping = /^\d+$/.test(raw["Grouping"] ?? "") ? Number(raw["Grouping"]) : null;

    items.push({
      order,
      title,
      status: status ?? "todo",
      type: type ?? "story",
      assignee,
      reviewer,
      deadline: parseDate(raw["Deadline"] || raw["deadline"], where),
      grouping,
      minutes: toMinutes(raw["Hours Worked"], where),
      description,
      highlight: page?.highlight ?? null,
      criteria: page?.criteria ?? [],
      media: (page?.media ?? []).map((ref) => ({ ref, dir: page.dir })),
    });
  });

  sprints.push({ number, notes, items });
}

/* Converso — one real task, and an empty Notion template that is not one. */
const conversoDir = join(TEAM, "Converso");
const conversoItems = [];
if (existsSync(conversoDir)) {
  // Notion files a database's CSV beside its folder, not inside it.
  const view = readdirSync(TEAM).find(
    (f) => f.startsWith("Converso ") && f.endsWith(".csv") && !f.endsWith("_all.csv")
  );
  const rows = view ? readTable(join(TEAM, view)) : [];
  const pages = new Map();
  for (const file of readdirSync(conversoDir).filter((f) => f.endsWith(".md"))) {
    const page = readPage(join(conversoDir, file));
    pages.set(norm(sanitise(page.title)), page);
  }
  rows.forEach((raw, order) => {
    const title = raw["Task name"] || raw["Task"] || "";
    if (!title || norm(title) === "untitled") return;
    const page = pages.get(norm(sanitise(title))) ?? null;
    conversoItems.push({
      order,
      title,
      status: STATUS[norm(raw["Status"])] ?? "todo",
      type: "story",
      assignee: null,
      reviewer: null,
      deadline: parseDate(raw["Due date"], `Converso · ${title}`),
      grouping: null,
      minutes: null,
      description: page?.description ?? null,
      highlight: page?.highlight ?? null,
      criteria: page?.criteria ?? [],
      media: (page?.media ?? []).map((ref) => ({ ref, dir: page.dir })),
    });
  });
}

if (problems.length) {
  console.error("REFUSING TO WRITE — the export did not map cleanly:");
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* The project's standing requirements                                         */
/* -------------------------------------------------------------------------- */

const projectPage = readdirSync(EVIM.replace(/\/EVIM Webparts$/, ""))
  .find((f) => f.startsWith("EVIM Webparts ") && f.endsWith(".md"));
let scope = "SPFx component set inside SharePoint Online governance";
if (projectPage) {
  const body = readFileSync(join(TEAM, projectPage), "utf8");
  const block = /## \*\*Important\*\* General Requirements[\s\S]*?<\/aside>/.exec(body);
  if (block) {
    const lines = plain(block[0])
      .split("\n")
      .map((l) => l.replace(/^\s*\d+\.\s*/, "• ").trim())
      .filter((l) => l && !/^Important General Requirements/i.test(l))
      .map((l) => l.replace(/^• Login Creds.*$/i, "• Login credentials are held outside this system"))
      .map((l) => l.replace(/^• To update task use.*$/i, "• Changes to a task are proposed, not applied directly"));
    scope = `SPFx component set inside SharePoint Online governance.\n\nStanding requirements:\n${lines.join("\n")}`;
  }
}
scope = scrub(scope);

/* -------------------------------------------------------------------------- */
/* Emit                                                                        */
/* -------------------------------------------------------------------------- */

const out = [];
const attachments = [];
/**
 * The same import, as data rather than SQL.
 *
 * `seed.sql` can name profiles by UUID because it creates them. Production
 * cannot: its four people are real accounts with their own ids, so
 * scripts/push-notion-import.mjs resolves them by name at run time and works
 * from this instead of parsing SQL back out of the seed.
 */
const payload = { clients: [], projects: [], sprints: [] };
let nextKey = 140;

out.push(`-- Coditu — seed.
--
-- TRANSCRIBED, not invented. Every client, project, sprint, work item, acceptance
-- criterion, logged hour and attachment below comes from the team's Notion
-- workspace export, converted by scripts/import-notion-export.mjs. Do not edit
-- this file by hand: re-run the script against the export instead.
--
-- Fifteen sprints of EVIM web parts, Week 3 (November 2025) through Week 17
-- (August 2026), plus Converso. Where the export is silent the column is NULL —
-- there are no estimates in Notion, nine sprints have no datable window, and no
-- sprint note records who wrote it. docs/05-DECISIONS.md says why.
--
-- The export also carries live credentials — a SharePoint password, an OpenAI
-- key, an OpenRouter key, a test login. They are redacted on the way through and
-- the finished SQL is re-checked for them. Nothing here should ever be pasted
-- back from the export by hand.
--
-- Accounts are local development logins. Password for all of them: \`coditu\`.

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

insert into public.allowed_emails (email, note) values
  ('mohamed@coditu.com',     'Frontend Lead'),
  ('adam@coditu.com',        'Client Partnerships Lead'),
  ('abdelrahman@coditu.com', 'Frontend Engineer'),
  ('ahmed@coditu.com',       'Backend & DevOps');

-- The token columns are set to '' rather than left NULL on purpose. GoTrue
-- scans them into Go strings, and a NULL there fails EVERY sign-in with
-- "Database error querying schema" — an error that names the schema and says
-- nothing about the actual column. Seeding auth.users by hand means supplying
-- them.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values
  ('${PROFILE_ID.MT}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mohamed@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Mohamed Tamer"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('${PROFILE_ID.AN}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'adam@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Adam Nafie"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('${PROFILE_ID.AE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'abdelrahman@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Abdelrahman Elkhateeb"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('${PROFILE_ID.AY}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ahmed@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Ahmed Yehia"}'::jsonb, '', '', '', '', '', '', '', '');

-- GoTrue expects an \`identities\` row per provider. Without it the user exists
-- but has no email identity, and some flows (magic link, identity linking)
-- refuse to run.
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id, u.id, u.id::text,
       json_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false)::jsonb,
       'email', now(), now(), now()
from auth.users u
where u.email like '%@coditu.com';

-- Roles are set HERE, not in \`raw_user_meta_data\` above: the trigger used to
-- read the role out of the sign-up request, which is how a client could hand
-- itself \`admin\` — see \`20260821180000_role_is_not_client_supplied.sql\`. Every
-- new account is an engineer now, so the seed states the roles it wants as the
-- privileged writer it already is.
--
-- Adam is part-time on delivery, hence 1200 minutes rather than 2400.
update public.profiles set role = 'admin',    initials = 'MT', weekly_capacity_minutes = 2400 where id = '${PROFILE_ID.MT}';
update public.profiles set role = 'lead',     initials = 'AN', weekly_capacity_minutes = 1200 where id = '${PROFILE_ID.AN}';
update public.profiles set role = 'engineer', initials = 'AE', weekly_capacity_minutes = 2400 where id = '${PROFILE_ID.AE}';
update public.profiles set role = 'engineer', initials = 'AY', weekly_capacity_minutes = 2400 where id = '${PROFILE_ID.AY}';

-- ---------------------------------------------------------------------------
-- Clients and projects.
--
-- EVIM and Converso are real and carry the imported work. The other three exist
-- so the no-sprint empty state and the project switcher have something to show;
-- they hold no items and must not be quoted as delivery history.
-- ---------------------------------------------------------------------------

insert into public.clients (id, name, website_url, logo_path, accent_hex) values
  ('c0000000-0000-4000-8000-000000000001', 'EVIM',            'https://www.evim.de',      '/clients/evim.svg', '#2B57FF'),
  ('c0000000-0000-4000-8000-000000000002', 'Nile Atelier',    'https://nileatelier.com',  null,                '#12A594'),
  ('c0000000-0000-4000-8000-000000000003', 'Internal · DevOps', null,                     null,                '#5B8CFF'),
  ('c0000000-0000-4000-8000-000000000004', 'NVRMiss',         'https://nvrmiss.com',      null,                '#FFB020'),
  ('c0000000-0000-4000-8000-000000000005', 'Converso',        'https://www.converso.ai',  null,                '#7C5CFF');

insert into public.projects (id, client_id, name, slug, scope, accent_hex) values
  ('40000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'MEINEvim components', 'meinevim',
   ${q(scope)}, '#2B57FF'),
  ('40000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   'Nile Atelier partner portal', 'nile-atelier',
   'Partner onboarding and document routing', '#12A594'),
  ('40000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   'Ops Console', 'ops-console',
   'Unified dashboard over Redis, Pinecone, S3, PostgreSQL', '#5B8CFF'),
  ('40000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004',
   'NVRMiss landing', 'nvrmiss',
   'AI receptionist product landing and pricing', '#FFB020'),
  ('40000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005',
   'Converso dashboard', 'converso',
   'Frontend review of the Converso database dashboard', '#7C5CFF');
`);

/* ---- sprints ---- */

out.push(`
-- ---------------------------------------------------------------------------
-- Sprints. Week 17 is the one in flight; everything before it is closed.
--
-- Only six windows are evidenced by the export; the rest are NULL because the
-- sprints are not weekly-contiguous and there is nothing honest to derive them
-- from. \`notes_author_id\` is NULL throughout — Notion does not record who wrote
-- a sprint note, and attributing it to a plausible person would be a guess
-- printed under someone's name.
-- ---------------------------------------------------------------------------

insert into public.sprints (id, project_id, number, name, starts_on, ends_on, status, notes, notes_author_id) values`);

const sprintRows = sprints.map(({ number, notes }) => {
  const [from, to] = SPRINT_WINDOW[number] ?? [null, null];
  const status = number === 17 ? "active" : "closed";
  return `  ('${uuid("50000000-0000-4000-8000", number)}', '40000000-0000-4000-8000-000000000001', ${number},
   'Sprint — Week ${number}', ${q(from)}, ${q(to)}, '${status}', ${q(notes)}, null)`;
});
// Notion's Converso board is a flat task list with no sprint concept, so this
// sprint is a container invented to satisfy invariant 1. It is `planned`, not
// `active`: its one task is "Not started", and nothing in the export says the
// review ever began. That is also the only status that keeps `/app/people`
// unambiguous — it shows load for the first project it finds with an active
// sprint, so a second active sprint anywhere makes which one it picks a
// coin-toss.
sprintRows.push(`  ('${uuid("51000000-0000-4000-8000", 1)}', '40000000-0000-4000-8000-000000000005', 1,
   'Sprint — Converso review', null, null, 'planned', null, null)`);
out.push(sprintRows.join(",\n") + ";\n");

/* ---- work items ---- */

const itemRows = [];
const criteriaRows = [];
const timeRows = [];

function emitItems(list, sprintId, sprintNumber, windowEnd, bucket) {
  for (const item of list) {
    const id = uuid("60000000-0000-4000-8000", nextKey);
    const key = `COD-${nextKey}`;
    nextKey += 1;
    const carried = {
      title: item.title,
      description: item.description,
      highlight: item.highlight,
      status: item.status,
      type: item.type,
      // Full names, not the initials the seed keys on: the push script resolves
      // real production accounts by the only thing both databases share.
      assignee: item.assignee ? FULL_NAME[item.assignee] : null,
      reviewer: item.reviewer ? FULL_NAME[item.reviewer] : null,
      deadline: item.deadline,
      grouping: item.grouping,
      order_index: item.order,
      criteria: [],
      time: null,
      media: [],
    };
    bucket.push(carried);

    itemRows.push(`  ('${id}', '${sprintId}', '${key}',
   ${q(item.title)},
   ${q(item.description)},
   ${q(item.highlight)},
   '${item.status}', '${item.type}',
   ${item.assignee ? `'${PROFILE_ID[item.assignee]}'` : "null"}, ${item.reviewer ? `'${PROFILE_ID[item.reviewer]}'` : "null"},
   ${q(item.deadline)}, null, ${item.grouping ?? "null"}, ${item.order})`);

    item.criteria.forEach((c, index) => {
      // The table is flat; Notion's nesting survives as a leading marker so a
      // sub-criterion still reads as one.
      const body = c.depth > 0 ? `${"— ".repeat(c.depth)}${c.body}` : c.body;
      criteriaRows.push(`  ('${id}', ${q(body)}, ${c.done}, ${index})`);
      carried.criteria.push({ body, is_done: c.done, order_index: index });
    });

    if (item.minutes && item.minutes > 0) {
      const anchored = item.deadline ?? windowEnd;
      const workedOn = anchored ?? EARLIEST_POSSIBLE[sprintNumber] ?? "2025-12-29";
      const note = anchored
        ? "Imported from Notion — one sprint total, not a daily log"
        : "Imported from Notion — one sprint total; the exact day was never recorded";
      const who = item.assignee ? PROFILE_ID[item.assignee] : PROFILE_ID.MT;
      timeRows.push(`  ('${id}', '${who}', ${item.minutes}, '${workedOn}', ${q(note)})`);
      carried.time = {
        minutes: item.minutes,
        worked_on: workedOn,
        note,
        who: FULL_NAME[item.assignee ?? "MT"],
      };
    }

    item.media.forEach((m, index) => {
      const file = join(m.dir, decodeURIComponent(m.ref));
      if (!existsSync(file)) {
        problems.push(`${item.title}: attachment not found — ${m.ref}`);
        return;
      }
      const name = basename(file);
      const ext = extname(name).toLowerCase();
      const mime =
        ext === ".png" ? "image/png"
        : ext === ".gif" ? "image/gif"
        : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
        : ext === ".pdf" ? "application/pdf"
        : ext === ".mp4" ? "video/mp4"
        : "application/octet-stream";
      const slug = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
      const path = `${id}/${index}-${slug}`;
      attachments.push({ path, source: relative(EXPORT_ROOT, file), mime });
      carried.media.push({
        source: relative(EXPORT_ROOT, file),
        file_name: name,
        mime,
        bytes: statSync(file).size,
        slug: `${index}-${slug}`,
      });
      // `uploaded_by` is the item's assignee where the export names one; Notion
      // does not record who attached a file, so an unassigned item's files are
      // filed under the workspace owner rather than invented.
      const by = item.assignee ? PROFILE_ID[item.assignee] : PROFILE_ID.MT;
      itemAttachmentRows.push(
        `  ('${id}', ${q(path)}, ${q(name)}, '${mime}', ${statSync(file).size}, '${by}')`
      );
    });
  }
}

const itemAttachmentRows = [];
for (const sprint of sprints) {
  const [from, to] = SPRINT_WINDOW[sprint.number] ?? [null, null];
  const carried = {
    project: "meinevim",
    number: sprint.number,
    name: `Sprint — Week ${sprint.number}`,
    starts_on: from,
    ends_on: to,
    status: sprint.number === 17 ? "active" : "closed",
    notes: sprint.notes,
    items: [],
  };
  payload.sprints.push(carried);
  emitItems(sprint.items, uuid("50000000-0000-4000-8000", sprint.number), sprint.number, to, carried.items);
}
const conversoSprint = {
  project: "converso",
  number: 1,
  name: "Sprint — Converso review",
  starts_on: null,
  ends_on: null,
  status: "planned",
  notes: null,
  items: [],
};
payload.sprints.push(conversoSprint);
emitItems(conversoItems, uuid("51000000-0000-4000-8000", 1), 1, null, conversoSprint.items);

if (problems.length) {
  console.error("REFUSING TO WRITE — the export did not map cleanly:");
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}

out.push(`
-- ---------------------------------------------------------------------------
-- Work items.
--
-- \`estimate_minutes\` is NULL for every row. Notion recorded one number per item,
-- "Hours Worked", and that is time spent, not time forecast — it becomes a
-- \`time_entries\` row below. There are no estimates in the source and none are
-- invented here, so the sprint footer reads what was logged against nothing
-- planned until somebody plans it.
--
-- \`order_index\` is the board's own row order, taken from the un-sorted view CSV.
-- ---------------------------------------------------------------------------

insert into public.work_items
  (id, sprint_id, key, title, description, highlight, status, type,
   assignee_id, reviewer_id, deadline, estimate_minutes, grouping, order_index)
values
${itemRows.join(",\n\n")};

-- Keep the sequence ahead of the transcribed keys. Without this a new item
-- collides with one of them on its very first insert.
select setval('public.work_item_key_seq', ${nextKey}, false);
`);

out.push(`
-- ---------------------------------------------------------------------------
-- Acceptance criteria. Notion checkboxes, including which are already ticked.
-- Nested checklists are flattened with a leading em dash per level.
-- ---------------------------------------------------------------------------

insert into public.acceptance_criteria (work_item_id, body, is_done, order_index) values
${criteriaRows.join(",\n")};
`);

out.push(`
-- ---------------------------------------------------------------------------
-- Logged time.
--
-- Invariant 2: integer minutes. Notion holds one "Hours Worked" total per item
-- and no daily breakdown, so each item becomes exactly one entry, attributed to
-- its assignee. \`worked_on\` is the item's own deadline where it has one, else
-- the sprint's last day; for the nine sprints with no datable window it is the
-- earliest day the work provably could have happened, and the note says so.
-- ---------------------------------------------------------------------------

insert into public.time_entries (work_item_id, profile_id, minutes, worked_on, note) values
${timeRows.join(",\n")};
`);

out.push(`
-- ---------------------------------------------------------------------------
-- Attachments.
--
-- Rows only. The bytes live in the private \`work-attachments\` bucket and are
-- pushed there by scripts/upload-notion-attachments.mjs, which has to run again
-- after \`db:reset\` — resetting the database clears \`storage.objects\` even
-- though the files themselves survive.
-- ---------------------------------------------------------------------------

insert into public.attachments (work_item_id, storage_path, file_name, mime_type, bytes, uploaded_by) values
${itemAttachmentRows.join(",\n")};
`);

const sql = out.join("\n");
assertNoSecrets(sql);

writeFileSync(join(import.meta.dirname, "..", "supabase", "seed.sql"), sql);
writeFileSync(
  join(import.meta.dirname, "..", "supabase", "notion-attachments.json"),
  JSON.stringify({ bucket: "work-attachments", files: attachments }, null, 1) + "\n"
);

// The same five clients the seed carries. EVIM and Converso hold the imported
// work; the other three hold nothing and exist so the no-sprint empty state and
// the project switcher have something to show.
payload.clients = [
  { name: "EVIM", website_url: "https://www.evim.de", logo_path: "/clients/evim.svg", accent_hex: "#2B57FF" },
  { name: "Nile Atelier", website_url: "https://nileatelier.com", logo_path: null, accent_hex: "#12A594" },
  { name: "Internal · DevOps", website_url: null, logo_path: null, accent_hex: "#5B8CFF" },
  { name: "NVRMiss", website_url: "https://nvrmiss.com", logo_path: null, accent_hex: "#FFB020" },
  { name: "Converso", website_url: "https://www.converso.ai", logo_path: null, accent_hex: "#7C5CFF" },
];
payload.projects = [
  { client: "EVIM", name: "MEINEvim components", slug: "meinevim", scope, accent_hex: "#2B57FF" },
  { client: "Nile Atelier", name: "Nile Atelier partner portal", slug: "nile-atelier",
    scope: "Partner onboarding and document routing", accent_hex: "#12A594" },
  { client: "Internal · DevOps", name: "Ops Console", slug: "ops-console",
    scope: "Unified dashboard over Redis, Pinecone, S3, PostgreSQL", accent_hex: "#5B8CFF" },
  { client: "NVRMiss", name: "NVRMiss landing", slug: "nvrmiss",
    scope: "AI receptionist product landing and pricing", accent_hex: "#FFB020" },
  { client: "Converso", name: "Converso dashboard", slug: "converso",
    scope: "Frontend review of the Converso database dashboard", accent_hex: "#7C5CFF" },
];
writeFileSync(
  join(import.meta.dirname, "..", "supabase", "notion-import.json"),
  JSON.stringify(payload, null, 1) + "\n"
);

const totalMinutes = timeRows.reduce((sum, row) => sum + Number(/, (\d+), '/.exec(row)[1]), 0);
console.log(`sprints:      ${sprints.length + 1}`);
console.log(`work items:   ${itemRows.length}   (keys COD-140 … COD-${nextKey - 1})`);
console.log(`criteria:     ${criteriaRows.length}`);
console.log(`time entries: ${timeRows.length}   (${totalMinutes} minutes = ${(totalMinutes / 60).toFixed(1)} h)`);
console.log(`attachments:  ${attachments.length}`);
