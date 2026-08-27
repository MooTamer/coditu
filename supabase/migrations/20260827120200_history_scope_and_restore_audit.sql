-- What `/app/history` has to be able to ask, and what a restore has to leave behind.
--
-- Three things, and they are in one file because they are one screen's worth of
-- honesty:
--
--   1. **Which project.** `PLAN.md` §11 asks for filtering by *"person, content
--      type, project, date, and action"*. Person and content type are already
--      columns. Project is two joins away through `work_item_id` and one through
--      `sprint_id`, and PostgREST cannot filter a parent row by an embedded
--      column without `!inner` — which on `work_item` would silently drop every
--      sprint-note revision, and on `actor` would drop every write made outside
--      the app, both of which are categories this screen offers as filters.
--      So the scope is denormalised, exactly as `work_item_id` and `sprint_id`
--      already are, and for the reason the original migration states.
--
--   2. **Which words.** Free-text search needs an index, or it is a sequential
--      scan of every version of every document on a screen that is read while
--      somebody is worried.
--
--   3. **That a restore happened.** The revision carries `restored_from`, which
--      is the record. What it did not do was reach the story's own Activity
--      feed, which is where a person looks.

-- ---------------------------------------------------------------------------
-- 1. Project scope.
--
-- ## Backfilling an append-only table
--
-- `document_revisions` is append-only *by policy*: it has a `select` policy and
-- no `insert`, `update` or `delete` policy, so nobody — including an admin —
-- can change a row through PostgREST, and `supabase/tests/revisions.sql`
-- asserts each refusal. A migration runs as the table's owner, which is not
-- subject to those policies, and this is the one legitimate use of that: adding
-- a derived scope column and filling it from the foreign keys that were already
-- on the row.
--
-- What is written is not content. Not one `doc`, `plain_text`, `actor_id`,
-- `revision_no` or `created_at` is touched. If this backfill were wrong the
-- worst outcome is a revision that does not appear under a project filter —
-- never a revision that says something different than it did.
-- ---------------------------------------------------------------------------

alter table public.document_revisions
  add column if not exists project_id uuid references public.projects (id) on delete set null;

comment on column public.document_revisions.project_id is
  'Denormalised project scope, written by the capture trigger. Null for a workspace page, which belongs to no project. Derived, never content: a wrong value hides a row from a filter, it cannot make a row say anything false.';

-- `on delete set null` rather than `cascade`, and that difference matters. The
-- other two scope columns cascade because a purged story's history goes with
-- it. A project is not deleted in this application at all, and if one ever were,
-- losing every version of everything that had ever been in it would be the
-- opposite of what a version history is for.

create index if not exists document_revisions_project_idx
  on public.document_revisions (project_id, created_at desc)
  where project_id is not null;

-- The backfill. Each row already knows its parent; this asks the parent which
-- project it is in.
update public.document_revisions r
   set project_id = s.project_id
  from public.work_items w
  join public.sprints s on s.id = w.sprint_id
 where r.work_item_id = w.id
   and r.project_id is null;

update public.document_revisions r
   set project_id = s.project_id
  from public.sprints s
 where r.sprint_id = s.id
   and r.project_id is null;

update public.document_revisions r
   set project_id = g.project_id
  from public.pages g
 where r.page_id = g.id
   and r.project_id is null
   and g.project_id is not null;

-- The capture trigger learns to write it. Re-stated whole, as every
-- `create or replace` in this schema is.
create or replace function public.record_document_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surface    public.revision_surface := tg_argv[0]::public.revision_surface;
  doc_col      text := tg_argv[1];
  text_col     text := tg_argv[2];
  version_col  text := tg_argv[3];

  new_row      jsonb := to_jsonb(new);
  old_row      jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  new_doc      jsonb := new_row -> doc_col;
  new_text     text  := new_row ->> text_col;

  scope_item   uuid;
  scope_sprint uuid;
  scope_page   uuid;
  scope_proj   uuid;
  next_no      smallint;
  restored     smallint := nullif(current_setting('coditu.restored_from', true), '')::smallint;
begin
  -- Nothing changed about the writing — unless this is a restore, which is
  -- always a version. See `20260827120100_workspace_and_project_pages.sql`.
  if restored is null
     and old_row is not null
     and (old_row -> doc_col) is not distinct from new_doc
     and (old_row ->> text_col) is not distinct from new_text then
    return null;
  end if;

  if new_doc is null or new_doc = 'null'::jsonb then
    if new_text is null or btrim(new_text) = '' then
      return null;
    end if;
  end if;

  case v_surface
    when 'work_item_description' then scope_item := (new_row ->> 'id')::uuid;
    when 'work_item_highlight'   then scope_item := (new_row ->> 'id')::uuid;
    when 'acceptance_criterion'  then scope_item := (new_row ->> 'work_item_id')::uuid;
    when 'comment'               then scope_item := (new_row ->> 'work_item_id')::uuid;
    when 'sprint_notes'          then scope_sprint := (new_row ->> 'id')::uuid;
    when 'page'                  then scope_page := (new_row ->> 'id')::uuid;
  end case;

  -- The project, asked of the parent rather than taken from the payload. A
  -- caller cannot claim a project their row is not in, which is invariant 1
  -- re-derived rather than trusted — the same rule the two scope columns above
  -- already follow.
  if scope_item is not null then
    select s.project_id into scope_proj
      from public.work_items w
      join public.sprints s on s.id = w.sprint_id
     where w.id = scope_item;
  elsif scope_sprint is not null then
    select s.project_id into scope_proj from public.sprints s where s.id = scope_sprint;
  elsif scope_page is not null then
    -- Null for a workspace page, and that is the correct answer rather than a
    -- missing one: it belongs to no project, and a project filter should not
    -- find it.
    select g.project_id into scope_proj from public.pages g where g.id = scope_page;
  end if;

  select coalesce(max(r.revision_no), 0) + 1
    into next_no
    from public.document_revisions r
   where r.surface = v_surface
     and r.entity_id = (new_row ->> 'id')::uuid;

  insert into public.document_revisions
    (surface, entity_id, revision_no, actor_id, doc, plain_text, doc_version,
     restored_from, work_item_id, sprint_id, page_id, project_id)
  values
    (v_surface,
     (new_row ->> 'id')::uuid,
     next_no,
     (select auth.uid()),
     case when new_doc = 'null'::jsonb then null else new_doc end,
     new_text,
     coalesce((new_row ->> version_col)::smallint, 1),
     restored,
     scope_item,
     scope_sprint,
     scope_page,
     scope_proj);

  return null;
end;
$$;

comment on function public.record_document_revision() is
  'AFTER trigger. Writes one append-only revision when a document column actually changes — or unconditionally when coditu.restored_from is set, because a restore is always a version. Scope columns are re-derived from the row''s own parent, never supplied.';

-- ---------------------------------------------------------------------------
-- 2. Searching the words.
--
-- `plain_text ilike '%…%'` cannot use a btree index, and a history screen is
-- read on the day somebody is trying to find what a paragraph used to say. A
-- trigram index is the one that answers an unanchored `ilike`.
--
-- `pg_trgm` is in `extensions`, where Supabase puts every extension. The
-- operator class has to be named with its schema because this function-free DDL
-- runs with `search_path` unset in the rest of the file's spirit.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

create index if not exists document_revisions_text_trgm_idx
  on public.document_revisions
  using gin (plain_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. A restore reaches the Activity feed.
--
-- ## Why a trigger on the revision rather than a line in the RPC
--
-- `restore_document_revision` is `security invoker` — deliberately, so the
-- caller's own policies decide whether the write lands. `activity` is granted
-- `select` and nothing else to `authenticated`: it is trigger-written, by
-- design, so *nobody* can forge a row in it. An insert inside the invoker
-- function would therefore fail with `42501`, and the two ways round that are
-- both worse: making the RPC `security definer` moves the authorization
-- decision out of the policies that already hold it, and granting `insert` on
-- `activity` to `authenticated` makes the audit feed writable by the people it
-- audits.
--
-- So the audit is written where the fact is: an `AFTER INSERT` on
-- `document_revisions`, which has no insert policy at all and is reachable only
-- through the `security definer` capture trigger. A row in this feed cannot be
-- forged because a revision cannot be forged.
--
-- ## What this covers and what it does not
--
-- `activity.work_item_id` is `not null`, so this reaches the four surfaces that
-- resolve to a story — description, highlight, criterion, comment. A **sprint
-- note** or a **page** restore has no story to attach to, and inventing a
-- nullable-scope activity feed to hold two rows a year is the kind of feature
-- `CLAUDE.md` says not to add. For those two the audit trail is the revision
-- itself: `restored_from` is set, the actor and the timestamp are on the row,
-- and `/app/history?action=restored` is the screen that lists them. Recorded in
-- `05-DECISIONS.md` so it is a decision and not an omission.
-- ---------------------------------------------------------------------------

create or replace function public.record_restore_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.restored_from is null or new.work_item_id is null then
    return null;
  end if;

  insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
  values (
    new.work_item_id,
    new.actor_id,
    'restored',
    -- The surface, in the words the history screen uses, so the feed reads
    -- "restored the description" rather than naming a column.
    case new.surface
      when 'work_item_description' then 'description'
      when 'work_item_highlight'   then 'highlight'
      when 'acceptance_criterion'  then 'acceptance criterion'
      when 'comment'               then 'comment'
      else new.surface::text
    end,
    'v' || new.restored_from,
    'v' || new.revision_no
  );

  return null;
end;
$$;

comment on function public.record_restore_activity is
  'AFTER INSERT on document_revisions. Puts a restore in the story''s Activity feed. Cannot be forged: document_revisions has no insert policy.';

drop trigger if exists document_revisions_record_restore on public.document_revisions;
create trigger document_revisions_record_restore
  after insert on public.document_revisions
  for each row execute function public.record_restore_activity();
