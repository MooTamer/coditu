# 02 — Data model

Postgres via Supabase. Real SQL migrations in `supabase/migrations/`. RLS enabled on every table, no
exceptions, and no `using (true)` on a write policy.

The five invariants in `CLAUDE.md` are the obligations this schema exists to satisfy. Read them first.

---

## Enums

```sql
create type app_role         as enum ('admin','lead','engineer');
create type sprint_status    as enum ('planned','active','closed');
create type work_item_status as enum ('draft','ready','in_progress','in_peer_review',
                                      'in_qa','changes_requested','done','blocked');
create type work_item_type   as enum ('story','change_request','bug_fix','chore','spike');
```

### Status display order — fixed

Boards, reports, exports, and sorting all use this order, which is **not** the enum declaration order:

```
in_progress → in_peer_review → in_qa → changes_requested → ready → draft → blocked → done
```

Defined once as a Postgres function and once in TypeScript. A test asserts the two agree.

---

## Tables

### `profiles`
`id uuid pk references auth.users on delete cascade`, `full_name`, `initials`, `avatar_url`,
`role app_role default 'engineer'`, `weekly_capacity_minutes int default 2400`,
`is_active bool default true`, timestamps. Populated by an `on auth.users` insert trigger.

`weekly_capacity_minutes` is minutes, per invariant 2. 2400 = 40 hours.

### `clients`
`id`, `name`, `website_url`, `logo_path`, `accent_hex`, timestamps.
EVIM lives here with `logo_path = '/clients/evim.svg'` and `website_url = 'https://www.evim.de'`.

### `projects`
`id`, `client_id fk`, `name`, `slug unique`, `scope text`, `accent_hex`,
`is_archived bool default false`, timestamps.

### `sprints`
`id`, `project_id fk`, `number int`, `name`, `starts_on date`, `ends_on date`, `goal text`,
`notes text` (markdown), `notes_author_id fk`, `status sprint_status default 'planned'`, timestamps.

- `unique (project_id, number)`
- A **partial unique index** enforces at most one `active` sprint per project.

### `work_items`
`id`, `sprint_id fk on delete cascade`, `key text unique` (`COD-140`, from a sequence), `title`,
`description text`, `highlight text`, `status`, `type`, `assignee_id fk profiles null`,
`reviewer_id fk profiles null`, `deadline date`, `estimate_minutes int`,
`minutes_logged int not null default 0`, `grouping smallint null`, `order_index int not null`,
`closed_at timestamptz`, timestamps.

`highlight` is the "discuss before implementing" note. It is a **first-class column**, not a markdown
convention inside `description`, because the table, the item detail, the Markdown export, and the PDF
all render it distinctly.

### `acceptance_criteria`
`id`, `work_item_id fk on delete cascade`, `body text`, `is_done bool default false`, `order_index int`.

### `time_entries`
`id`, `work_item_id fk`, `profile_id fk`,
`minutes int not null check (minutes > 0 and minutes <= 1440)`,
`worked_on date not null default current_date`, `note text`, `created_at`.

### `comments`
`id`, `work_item_id fk on delete cascade`, `author_id fk`, `body_json jsonb not null` (ProseMirror doc),
`body_text text not null` (flattened, for search and export), `edited_at`, `deleted_at`, `created_at`.

Soft delete only. `body_text` is written in the **same transaction** as `body_json`.

### `comment_mentions`
`comment_id fk`, `profile_id fk`, primary key on the pair. Written by a trigger that walks `body_json`
for `mention` nodes. The stored node holds the profile **UUID**, never the display name, so a rename
never breaks a historical mention.

### `notifications`
`id`, `profile_id fk`, `kind text` (`mention` | `assigned` | `review_requested`), `work_item_id fk`,
`comment_id fk null`, `read_at`, `created_at`.

### `attachments`
`id`, `work_item_id fk`, `storage_path`, `file_name`, `mime_type`, `bytes int`, `uploaded_by`,
`created_at`.

### `activity`
`id`, `work_item_id fk`, `actor_id`, `verb`, `field`, `from_value`, `to_value`, `created_at`.
Written by `security definer` triggers on status, assignee, reviewer, and deadline changes.
Read-only to everyone.

---

## Triggers, views, indexes

**Rollup trigger.** `after insert/update/delete on time_entries` recomputes `work_items.minutes_logged`.
The migration carries a comment explaining why it is denormalised: the table renders a per-row number
and a footer sum on every paint, and an aggregate per render is the wrong trade.

**Protected-column trigger.** A `before update on work_items` trigger raises when an `engineer` changes
any column other than `status` or `order_index`. A policy alone cannot express a per-column restriction.

**Views**
- `v_sprint_summary` — per sprint: item count, count per status, total estimate minutes, total logged
  minutes, days remaining.
- `v_person_load` — per profile per sprint: assigned count, review-queue count, minutes logged, capacity.

**Indexes**
```
work_items(sprint_id, order_index)
work_items(assignee_id) where status <> 'done'
work_items(reviewer_id) where status = 'in_peer_review'
time_entries(work_item_id)
time_entries(profile_id, worked_on)
comments(work_item_id, created_at)
activity(work_item_id, created_at desc)
notifications(profile_id) where read_at is null
```

---

## Auth and RLS

Supabase Auth, email + password with magic-link fallback. **No public sign-up:** an `allowed_emails`
table plus a `before insert on auth.users` trigger that raises on a miss. `middleware.ts` guards
`/app/*` and redirects to `/login?next=…`. Roles are read server-side from `profiles`; a client-held
role is never trusted.

| Table | Policy |
|---|---|
| all | **Read**: any authenticated profile with `is_active = true` reads all rows. Small team, full transparency. |
| `clients`, `projects`, `sprints` | insert / update / delete: `admin` and `lead` only. |
| `work_items` | insert / delete: `admin` and `lead`. Update: `admin` and `lead` on any column. An `engineer` may change **only** `status` and `order_index`, and **only** where they are the `assignee_id` or `reviewer_id` (enforced by the protected-column trigger). |
| `acceptance_criteria` | `is_done` togglable by assignee, reviewer, admin, lead. Body edits: admin and lead. |
| `time_entries` | insert / update / delete only where `profile_id = auth.uid()`. Admin may delete any. |
| `comments` | author may update or soft-delete their own; admin may soft-delete any; nobody hard-deletes. |
| `notifications` | a profile reads and updates only its own rows. |
| `attachments` + buckets `work-attachments`, `comment-images` | Both private. Authenticated read; insert by any active profile; delete by uploader or admin. Signed URLs, 1 hour TTL. |
| `activity` | read-only; written by triggers. |

### `supabase/tests/rls.sql`

Every policy asserts a **positive and a negative** case. The negatives that must be present:

- an engineer cannot reassign an item
- an engineer cannot edit an item they neither own nor review
- a user cannot delete another's time entry
- a member of one project cannot read another project's items through a crafted filter
- an anonymous session reads nothing

---

## Seed source

Step 5's seed is not invented. It is transcribed from `design/project/Coditu App.dc.html`, which holds
the real Week 17 data as executable constants:

| Constant | What it seeds |
|---|---|
| `P` | the three engineers referenced by initials — MT, AE, AY (Adam Nafie, `AN`, appears in `activity` strings and in the People view) |
| `PROJECTS` | four projects: `evim`, `nile`, `ops`, `nvrmiss` — with client, url, accent, scope, sprint count, hours. **Only EVIM runs a sprint.** |
| `SPRINTS` | EVIM Week 17 (`active`, 12 items) and Week 16 (`closed`, 9 items) |
| `ITEMS` | `COD-140` … `COD-151` — status, type, grouping, logged, estimate, assignee, reviewer, deadline, description, highlight, criteria, comments, activity, time entries |
| `MAPPING` | the Notion importer's column map, including the `"1a"` grouping row that must render as `unmatched` |

**The sums the seed must produce:** logged **16.0**, estimate **46.0**, across 12 items. That is the
assertion in step 5, and the same number the table footer must show in step 7.

Groupings in the seed: `1` on `COD-142` and `COD-143`; `2` on `COD-144` and `COD-145`. Everything else
is null.

**Sprint notes** (verbatim, from `exportMd()`):

> Please work this sprint on the issues in the order they are sorted in. Stories with the same grouping
> are preferred to be implemented by the same developer because they overlap in some logic/UI.
>
> **In the stories, there are highlighted sections, which means you need to discuss something before
> implementing — please reach out.**

Two items carry a `highlight`: `COD-140` (the Events webpart toggle default) and `COD-145` (which news
source wins when both a page and a list item are pinned).

Week 16 has no item-level data in the bundle. Seed it with nine closed items so the sprint list and the
burn-up have history, and mark them clearly as synthetic history in the seed script — they are not
transcribed facts.

---

## Things the migrations know that the schema diagram does not

**The key sequence must be `setval`'d after any seed that supplies explicit keys.**
`work_item_key_seq` starts at 140 and `work_items.key` defaults to `'COD-' || nextval(...)`. Inserting
`COD-140` explicitly does **not** advance the sequence, so the next generated key collides with one you
just wrote. Step 5's seed ends with `select setval('public.work_item_key_seq', <highest>, true);`, and
`supabase/tests/rls.sql` does the same. This is a caught bug, not a hypothetical.

**Definer functions need schema-qualified types, not just tables.** Every `security definer` function
sets `search_path = ''` so a caller cannot shadow `public` with a schema they control. That also means
`::app_role` does not resolve — it has to be `::public.app_role`. `handle_new_user` shipped with the
unqualified cast and every sign-up failed; the RLS suite caught it.

**Views are `security_invoker = on`.** A normal view runs with its owner's rights, which would make
`v_sprint_summary` and `v_person_load` a way around RLS. With `security_invoker` the underlying tables'
policies apply to whoever is querying.

**Grants are not optional.** Tables created by `postgres` give `authenticated` only
TRUNCATE/REFERENCES/TRIGGER/MAINTAIN by default — no DML. A flawless set of policies on a table with no
grant returns "permission denied" for everything, and the error points at the wrong layer. Every table
carries an explicit `grant`. `anon` is revoked everywhere, which is why the anonymous tests assert a
raised `42501` rather than an empty result: anon is stopped one layer below RLS.

**The two-part rule for `work_items` and `acceptance_criteria`.** RLS cannot express a per-column
restriction. The policy decides **which rows** an engineer may touch (theirs to own or review); a
`before update` trigger decides **which columns** (`status` and `order_index`; `is_done` on a
criterion). Both are required — either alone is a hole.

**`closed_at` is trigger-maintained.** It follows `status = 'done'` so the two can never disagree; a
done item with a null `closed_at` makes every cycle-time figure wrong.

**The rollup recomputes, it does not increment.** `refresh_minutes_logged` re-sums the entries for the
affected item. An increment that misses one event drifts silently and permanently, and this is the
number the client sees. It also fixes both sides when an entry moves between items.
