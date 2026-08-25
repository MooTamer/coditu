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
create type component_kind   as enum ('react','spfx');
```

`component_kind` is how a component is built. The team maintains both and they are reviewed, built and
shipped differently; the app labels them **React** and **Microsoft web part**, because that is what the
person filing the ticket calls them. Mirrored by `COMPONENT_KINDS` in `lib/components.ts`, and
`tests/components.test.ts` reads the migration to prove the two agree.

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
`is_active bool default true`, `must_set_password bool not null default false`,
`is_developer bool not null default false`, timestamps.
Populated by an `on auth.users` insert trigger.

`weekly_capacity_minutes` is minutes, per invariant 2. 2400 = 40 hours.

`must_set_password` is the forced password change. An admin generating a temporary password on
`/app/people` sets it; `setPassword` clears it, and nothing else can — it is one of the four columns
`guard_profile_privilege_columns` refuses to a non-admin, because a forced change its subject can
switch off is not a forced change. **The default is `false` and has to stay `false`:** default it
`true` and every account that already exists is locked out at once. There is no email recovery path
in this application at all — see `05-DECISIONS.md`, 2026-08-22.

`is_developer` decides whether somebody takes a share of a sprint's pot. It is the fifth column
`guard_profile_privilege_columns` names, and the reason is the sharpest of the five: without the entry
an engineer could decide they get paid. A non-developer's minutes still **count toward** the pot — the
confirmation screen names them and says they take no share. Set by an admin on `/app/settings`, and
**never by a name or an email in code**; `supabase/seeds/developers.sql` is the initial answer only,
matched on `full_name` because production and local do not share email addresses.

`weekly_capacity_minutes` became editable on 2026-08-25 — it had driven the load bars on People and
every `v_person_load` row since the first migration and was settable nowhere.

`account_kind` (`internal` | `client`, default `internal`) is **the client-portal boundary**, and it
is the sixth column `guard_profile_privilege_columns` names. It is deliberately **not** a fourth
`app_role`, and the reason is the shape of every authorization check already in this codebase:
twenty-two call sites across `lib/actions/**` reject `role === "engineer"` and treat everything else
as privileged. A fourth enum value is "not an engineer", so it would fall through all twenty-two —
the same allowlist-written-as-a-denylist trap `guard_work_item_columns` has already sprung three
times. Nothing anywhere reads `account_kind` as a negative; every check asks for `'internal'` by
name. The default has to stay `internal`: default it `client` and every existing account loses the
application at once, exactly as with `must_set_password`.

`full_name` and `avatar_url` are deliberately absent from that trigger's list. How a person presents
themselves is not a privilege; both are set by their owner on `/app/settings`, and `initials` is
re-derived from `full_name` by the same rule `handle_new_user` uses.

### `push_subscriptions`
`id`, `profile_id fk profiles on delete cascade`, `endpoint text not null unique`, `p256dh`, `auth`,
`user_agent`, `created_at`.

One row is one **browser on one device**, not one person: the same human on a laptop and a phone is
two rows and both are sent to. `endpoint` is the push service's URL for that installation and is what
identifies it — unique, so a device that re-subscribes upserts instead of doubling its notifications.
`p256dh` and `auth` are the subscription's public key and authentication secret; they are what the
payload is encrypted *to*, they are not credentials for this application, and they are useless
without the VAPID private key, which lives in the environment.

RLS is `profile_id = auth.uid()` on **every** operation, not just select: a subscription is a live
channel into somebody's lock screen, so inserting one against another profile would be a way to have
this application push their mentions to a device you hold, and deleting theirs would be a way to
switch their notifications off silently. `service_role` gets `select, delete` only — the server sends
the pushes and prunes the rows a push service answers 404 or 410 for; a subscription is created by
the browser that owns it, through its own session, or not at all. See `05-DECISIONS.md`, 2026-08-23.

### `clients`
`id`, `name`, `website_url`, `logo_path`, `accent_hex`, timestamps.
EVIM lives here with `logo_path = '/clients/evim.svg'` and `website_url = 'https://www.evim.de'`.

### `projects`
`id`, `client_id fk`, `name`, `slug unique`, `scope text`, `accent_hex`,
`is_archived bool default false`, `key_prefix text not null unique`,
`next_key_number int not null default 1`, timestamps.

`key_prefix` and `next_key_number` are how a work item gets its key, replacing the single global
`work_item_key_seq` default. `assign_work_item_key` derives both from the item's own sprint —
invariant 1, in a trigger — and advances the counter with `update … returning`, whose row lock is what
makes ten items created on planning morning impossible to collide. The loop inside it re-checks the
unique index, so a counter that is *behind* (an import that stated its own keys, a restore) heals
instead of failing with a message nobody can act on. **Existing keys are immutable**: MEINEvim keeps
`COD`, everybody else takes a prefix derived from their slug, and each counter starts above the
highest number that prefix has ever issued — globally, because `COD-243` belongs to Converso while
`COD` belongs to MEINEvim.

### `project_slug_aliases`
`slug text pk`, `project_id fk projects on delete cascade`, `created_at`.

Every address a project has ever had. A rename writes the outgoing slug here in the same call and
`getProjectBySlug` falls back to it, so no bookmark, pasted link or open address bar breaks. A live
slug and an alias share one namespace, enforced by `guard_slug_namespace` on **both** tables — two
answers to "which project is `/app/projects/x`?" is the failure this feature would otherwise
introduce. Renaming *back* to a previous slug deletes the now-redundant alias.

### `app_settings`
One row, `id smallint pk default 1 check (id = 1)`. `hourly_rate_cents int not null default 1200`,
`payout_share_threshold_pct int not null default 25`, `payout_from_sprint_id fk sprints`,
`usd_egp_rate_micros bigint`, `usd_egp_fetched_at timestamptz`,
`usd_egp_source text check (in ('live','manual'))`, `max_image_bytes int not null default 8388608`,
`max_image_batch int not null default 6`,
`default_weekly_capacity_minutes int not null default 2400`, `updated_at`, `updated_by fk profiles`.

Every tunable in Coditu, in one admin-editable row. The team's standing instruction is that nothing is
hardcoded, and the sharp edge of it is that a rate in a `const` is a change request that needs a
deploy. `check (id = 1)` makes "which row is live?" unaskable. Read through `lib/settings.ts`, which is
the only thing that touches it and which carries the same defaults so a database that has not been
migrated still renders — the `sprints.notes_written_at` outage in one sentence.

Readable by any active member (the rate is on the earnings screen, the image cap is in an error
message); writable by an admin. No insert policy and no delete policy: the row is created by its
migration and is not something the app makes or destroys.

### `sprints`
`id`, `project_id fk`, `number int`, `name`, `starts_on date`, `ends_on date`, `goal text`,
`notes text` (markdown), `notes_author_id fk`, `status sprint_status default 'planned'`, timestamps.

- `unique (project_id, number)`
- A **partial unique index** enforces at most one `active` sprint per project.

`goal` was in this table from the first migration and **nothing could write or read it** —
`grep -rn "goal" components/app app/app` returned nothing at all. Wired into `createSprint`,
`updateSprint` and the sprint header on 2026-08-25.

### `work_items`
`id`, `sprint_id fk on delete cascade`, `key text unique` (`COD-140`, from the item's own project —
see `projects.key_prefix`), `deleted_at timestamptz`, `title`,
`description text`, `highlight text`, `status`, `type`, `assignee_id fk profiles null`,
`reviewer_id fk profiles null`, `deadline date`, `estimate_minutes int`,
`minutes_logged int not null default 0`, `grouping smallint null`, `component_id fk components null`,
`order_index int not null`, `closed_at timestamptz`, timestamps.

`component_id` stays nullable and always will: 232 items were imported from Notion before the registry
existed, and a NOT NULL would have meant inventing an answer for each of them. "Not attributed yet" is
a truthful state and every surface renders it as one.

`highlight` is the "discuss before implementing" note. It is a **first-class column**, not a markdown
convention inside `description`, because the table, the item detail, the Markdown export, and the PDF
all render it distinctly.

### `components`
`id`, `project_id fk on delete cascade`, `name text`, `slug text`, `kind component_kind`,
`icon text null`, `is_archived bool default false`, timestamps. `unique (project_id, slug)`.

One row per thing a project is made of — an EVIM web part, an extension, a feature of the React app.
Scoped to a project exactly like a sprint is, because the same name means different things to
different clients.

`slug` is the URL identity, derived from the name **once** by `componentSlug()` and never rewritten by
a rename: a link pasted into a comment in March has to keep resolving. The column carries
`check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`, so the only legal producer is that function.

`icon` is the SPFx manifest's `preconfiguredEntries[0].officeFabricIconFontName`, stored **verbatim**
(`Page`, `News`, `OrganizationChart`) — the glyph SharePoint draws in its "Add a web part" toolbox.
Verbatim because it is a fact the delivery repository already states, so re-syncing is a string
comparison rather than a fresh judgement; it is mapped to a Lucide equivalent at the render edge in
`components/coditu/component-icon.tsx`, since shipping the Fluent icon webfont on a route with a
110KB budget is not a trade worth making. Null is normal: extensions have no toolbox entry and neither
does anything in the React app.

**There is no delete.** No policy, no grant. A component holds the history of what happened to it, and
deleting one would blank the column on every item that named it. `is_archived` retires it from the
pickers and keeps the history.

### `acceptance_criteria`
`id`, `work_item_id fk on delete cascade`, `body text`, `body_json jsonb`,
`is_done bool default false`, `order_index int default -1`.

`body_json` is a ProseMirror document on the same terms as `comments.body_json` — same editor, same
renderer, same allowlist, same storage bucket for the pictures — and `body` is its flattened text
projection, written in the same statement, because the CSV and Markdown exports are a contract and
read that column. Null for the 232 imported criteria that have only ever been a sentence.

`order_index` defaults to `-1`, which is **not a position**: negative means append, and
`assign_order_index` replaces it with `max + 1` under a row lock on the parent. The old default was
`0`, which is a real position, so "I did not say" and "put it first" were the same value and neither
caller could express the other. `work_items.order_index` works the same way and for the same reason.

**Who may write what** changed on 2026-08-25 at the team's request. The row policy still restricts an
engineer to criteria on items they are assigned to or reviewing; within those, `guard_criteria_columns`
now lets them rewrite `body` **and** `body_json` as well as tick `is_done`. `work_item_id` and
`order_index` — the two that move a criterion rather than edit it — stay with admin and lead, as do
insert and delete.

### `sprint_payouts`
`id`, `sprint_id fk sprints on delete cascade`, `confirmed_by fk profiles on delete restrict`,
`confirmed_at`, `total_minutes int`, `hourly_rate_cents int`, `pot_cents int`,
`usd_egp_rate_micros bigint`, `usd_egp_source text`, `superseded_at timestamptz`,
`superseded_by fk sprint_payouts`.

**Append-only, and enforced as such.** Everything above the supersede columns is a snapshot of what
was true at the moment somebody agreed to it, and `guard_payout_immutable` refuses a change to any of
it — a confirmed pot cannot be rewritten even by the admin who confirmed it. A later confirmation
writes a new row and marks the old one superseded; a superseded row cannot be un-superseded. There is
no delete policy and no DELETE grant, so nobody removes one.

`sprint_payouts_one_live_idx` is a **partial unique index** on `(sprint_id) where superseded_at is
null`. Two admins confirming at once is the one race an application check cannot win, so the index
decides it and the loser gets a sentence rather than a Postgres error.

### `sprint_payout_shares`
`payout_id fk on delete cascade`, `profile_id fk profiles on delete restrict`, `minutes_logged int`,
`share_cents int`, `primary key (payout_id, profile_id)`.

**`sum(share_cents) = pot_cents` exactly.** The split is equal, not proportional — the team's rule —
and the remainder is handed out one cent at a time by ascending `profile_id`, so the same inputs
always produce the same split. `tests/earnings.test.ts` asserts the identity across nine participant
counts and eleven pot sizes; `supabase/tests/rls.sql` asserts it again against the stored rows.

`on delete restrict` on both `profile_id` columns, deliberately. Deleting a profile already cascades
through ten tables and the standing answer is "merge duplicates, never delete them"; a share is a
record of money owed to a person and must not become the eleventh thing that quietly disappears with
them.

### Client access — `client_contacts`, `client_invitations`, `client_project_grants`

Access for a client contact is the **intersection of four things**, and all four must hold:
the account is a client contact and not revoked; the contact belongs to the company that owns the
project; a live grant exists for that specific project; and the grant carries the specific capability
being asked for. `client_has_capability(project_id, capability)` is the one place that intersection
is computed, and every client-facing read calls it.

`client_contacts` — `profile_id pk fk profiles`, `client_id fk clients on delete restrict`,
`status client_contact_status` (`invited` | `active` | `revoked`), `invited_by`, `invited_at`,
`accepted_at`, `revoked_at`. The primary key is the profile, so **a person represents exactly one
company**; someone who works for two clients needs two accounts, which is the honest answer rather
than a join table nobody can reason about. `on delete restrict` on `client_id` so deleting a company
that still has contacts fails loudly instead of orphaning them. **No delete policy** — revocation is
what withdrawal means, and `client_messages.author_id` is `on delete restrict`, so deleting a contact
would take her name off her own words.

`client_invitations` — `email`, `client_id`, `capabilities client_capability[]`, `status`
(`pending` | `accepted` | `revoked` | `expired`), `expires_at` (14 days), `created_by`,
`accepted_profile_id`. Plus `client_invitation_projects (invitation_id, project_id)`.
**This table exists so `handle_new_user` has something server-side to read.**
`20260821180000_role_is_not_client_supplied.sql` is the precedent: reading `raw_user_meta_data` let a
sign-up choose its own role, because that field is `options.data` on a public endpoint taking the
anon key. An account *kind* chosen the same way is the same bug with a larger blast radius. A partial
unique index allows one `pending` invitation per address while keeping the history of revoked ones.
Admin-only in all four verbs — a contact reads nothing here, not even her own invitation, which names
capabilities she was not given.

`client_project_grants` — `(contact_profile_id, project_id) pk`, `capabilities`, `granted_by`,
`granted_at`, `revoked_at`. Revoked by stamping, never deleting, so "who could see this in March"
stays answerable. `client_project_grants_live_idx` is partial on `where revoked_at is null`, which is
the only shape the hot path asks for.

`guard_client_grant_company` is **invariant 1 applied to access**: a `before insert or update`
trigger raising `23514` unless the project's `client_id` equals the contact's. Without it the model
rests on the application remembering, and "the admin picked the wrong row out of a dropdown" is a
cross-client breach rather than a validation error. Same shape as
`guard_work_item_component_project`.

`client_has_capability` takes **no contact parameter** and never will. A function that took one would
be a way to ask about somebody else's access, and every caller would have to be trusted to pass its
own id. It reads `auth.uid()`, so there is nothing to pass wrongly. It returns `false`, never null,
and it is revoked from `public` and `anon` — a `security definer` function in `public` is granted
EXECUTE to PUBLIC by default, which is the trap `allowlist_claimed()` documents.

The capability vocabulary is `client_capability`, mirrored by `lib/client-access.ts`;
`tests/client-access.test.ts` reads the migration to prove they agree. **`view_effort`,
`view_attachments` and `start_questions` are in no preset** — hours imply what the work cost, files
can carry anything, and a client who can open threads turns the portal into a support inbox nobody
agreed to staff.

### Publication — what a client has been shown on purpose

`components.client_summary text`, `components.published_at timestamptz`.
`work_items.client_published_at timestamptz`, `work_items.client_title text`,
`work_items.client_summary text`.

Granting a project does **not** make its contents client-visible. Being inside a project a client can
reach is not the same as having been shown to them deliberately, and the difference is a column
rather than a convention — a convention is a thing somebody forgets on the Friday of a release.

**Curated at the component, reused at the item.** A component needs a written `client_summary` before
it can be published; `components_published_needs_summary` is a **check constraint**, not form
validation, because a Server Action, a psql session and a future importer all reach this table and
only one of them has the form. A work item defaults to its own `title`, with `client_title` as an
optional rewrite. Requiring a hand-written summary per item would be fourteen pieces of writing per
sprint and the feature would stop being used in week three; reusing internal text wholesale is cheap
and wrong, because titles are written by engineers for engineers.

**`description` and `highlight` are exposed by nothing, ever.** `highlight` is the
discuss-before-implementing note — the single most internal sentence on a work item, sitting in a
column immediately next to the ones above.

All three work-item columns are **named in `guard_work_item_columns`** in the same migration that
creates them. That guard is an allowlist written as a denylist, so a new column is writable by any
assignee until it is named; `component_id`, `body_json` and `deleted_at` each had to be retrofitted
after the fact. Naming them at creation is the only moment it is free.
`guard_component_publication` is the same rule for the two component columns — `components` had no
column guard at all before, because until now every column on it was equally internal.

### The client read boundary — `client_*` functions

**RLS filters rows, not columns.** `work_items` carries `description`, `highlight`, `assignee_id`,
`minutes_logged` and `key` in the same row as the title, so no policy on that table can be a client's
read path: one permissive enough to show her the title shows her all of it. The base tables therefore
stay closed to clients — asserted, zero rows from every one — and the **entire** client-facing
surface of this database is four functions:

| Function | Returns |
|---|---|
| `client_projects()` | granted, unarchived projects: id, name, slug, client name, accent. Not `scope`, not `key_prefix`. |
| `client_components(project_id)` | published components, their curated summary, and counts over published work only |
| `client_component_work(project_id, component_id)` | published items: `client_title` or `title`, summary, **humanised status**, deadline |
| `client_current_sprint(project_id)` | the active sprint's name, goal, window and progress. Never `notes` — those are written to the team. |

Each is `security definer` with `search_path = ''`, checks `client_has_capability()` **inside its own
body**, and is revoked from `public` and `anon` — a definer function in `public` is granted EXECUTE
to PUBLIC by default. **There is no `select *` in any of them and there must never be**: `select *`
is how a column added next year becomes a leak nobody wrote.

`p_project_id` is caller-supplied and that is safe, for one reason: the function re-derives whether
*this session* may read *that project*. A supplied id is a request, not a claim. Another company's id
returns an empty set rather than an error, because an error distinguishing "not yours" from "does not
exist" is a way to enumerate what exists.

**Aggregates are computed inside the function, over client-visible rows only**, in the same query
that returns the list. That is the difference between "the hidden row is filtered out of the list"
and "the hidden row does not exist" — a client reading *3 pieces of work* beside a list of one has
been told the other two are there. There is an assertion for exactly this.

**Hours come back NULL without `view_effort`**, not `0` and not an absent column. Zero is a lie the
UI renders as a fact; an absent column gives the row two shapes and makes every caller know which one
it got. The status is humanised **in SQL**, so the enum value never crosses the wire at all. Sprint
progress is published-items-done over published-items-total, never hours over estimate — a percentage
derived from hours would hand `view_effort` to anyone who can see a progress bar.

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
Note the shape: it is an allowlist written as a *denylist*, so **a new column on `work_items` is
silently writable by an engineer until it is named in that trigger.** `component_id` was added to it
for that reason, not because anybody asked.

**Component/project agreement.** `guard_work_item_component_project`, `before insert or update of
component_id, sprint_id on work_items`, raises `23514` when the component's project is not the project
of the item's own sprint. This is invariant 1 on the join between the two tables — without it a
per-component reading of EVIM's work could contain a Converso item. It fires on `sprint_id` too:
moving an item to another project's sprint would otherwise carry a foreign component with it.

**Activity trigger** covers `status`, `assignee_id`, `reviewer_id`, `deadline` and `component_id`.
Retagging an item is a change to the record of what happened to a component, so it belongs in the feed;
the component's NAME is written into the row, not its id, because a history that reads
"set component → 3f2a…" is not one.

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
components(project_id, name)
work_items(component_id) where component_id is not null
```

---

### `v_sprint_minutes`
`security_invoker`. Minutes per person per sprint, grouped from `time_entries` through `work_items`.

One place, so the provisional figure on the earnings screen and the snapshot taken at confirmation
cannot disagree about which minutes count. `security_invoker` is what makes a soft-deleted work item
drop out on its own — the read policy on `work_items` hides it — rather than through a filter somebody
has to remember to write.

## Auth and RLS

Supabase Auth, email + password with magic-link fallback. **No public sign-up:** an `allowed_emails`
table plus a `before insert on auth.users` trigger that raises on a miss. `middleware.ts` guards
`/app/*` and redirects to `/login?next=…`. Roles are read server-side from `profiles`; a client-held
role is never trusted.

| Table | Policy |
|---|---|
| all | **Read**: any authenticated profile with `is_active = true` **and `account_kind = 'internal'`** reads all rows. Small team, full transparency — among the team. |
| `profiles` | plus `"own profile read"`: **you can always read yourself**, by primary key. The only row a client contact sees, so the team is not enumerable from a client session. |
| `clients`, `projects`, `sprints` | insert / update / delete: `admin` and `lead` only. |
| `work_items` | insert / delete: `admin` and `lead`. Update: `admin` and `lead` on any column. An `engineer` may change **only** `status` and `order_index`, and **only** where they are the `assignee_id` or `reviewer_id` (enforced by the protected-column trigger). |
| `acceptance_criteria` | `is_done` togglable by assignee, reviewer, admin, lead. Body edits: admin and lead. |
| `time_entries` | insert / update / delete only where `profile_id = auth.uid()`. Admin may delete any. |
| `comments` | author may update or soft-delete their own; admin may soft-delete any; nobody hard-deletes. |
| `notifications` | a profile reads and updates only its own rows. |
| `attachments` + buckets `work-attachments`, `comment-images` | Both private. Authenticated read; insert by any active profile; delete by uploader or admin. Signed URLs, 1 hour TTL. |
| bucket `avatars` | **Public**, 2MB, no SVG. Insert and delete only under your own `<profile id>/` prefix; an admin may delete anyone's. `profiles.avatar_url` holds the full public URL and is constrained to be one of our own objects or null — the column is client-writable, so without that it is an arbitrary URL in an `<img>` on every screen. See `05-DECISIONS.md`, 2026-08-22. |
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

**The three authorization helpers are the whole access model, so they are the whole blast radius.**
`is_active_member()`, `auth_role()` and `is_admin_or_lead()` are called by every policy in the schema.
Adding `and p.account_kind = 'internal'` to the first two changed the meaning of **eleven read
policies across six migrations without editing one of them** — which is the point: the failure mode of
editing each policy is the twelfth policy, written later by somebody following the pattern of the
eleven, open to clients and indistinguishable from its neighbours.

**A security helper must never return null.** `is_admin_or_lead()` was
`select public.auth_role() in ('admin','lead')`. That was total while `auth_role()` was — but a client
contact makes it null, and `null in ('admin','lead')` is **null**, not false. RLS fails closed on null
in both `using` and `with check`, so nothing was ever exposed; plpgsql does not. `if not
public.is_admin_or_lead() then raise` would have evaluated `not null` → null → the `if` never fires →
the guard silently permits. There was no such caller, which is exactly why it was worth fixing before
somebody wrote the obvious next guard. It is `coalesce(…, false)` now. Found by the pgTAP suite, not
by reading the code.
