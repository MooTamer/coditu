-- Pages: the two document surfaces the design has and the build never had.
--
-- `PLAN.md` §3 lists six writing surfaces for the one universal editor. Five
-- exist. The sixth — *"Standalone workspace notes/pages"* — does not, and
-- neither does *"Project notes/pages"* from §7, which the returned prototype
-- shows as a **Pages & notes** panel on the project page whose rows call
-- `this.toast("Project page — same block editor, project-scoped")`. Furniture,
-- by the design's own admission. This is the table under it.
--
-- ## One table for both, because they differ in one column
--
-- A project page belongs to a project. A workspace page belongs to nobody:
-- meeting notes, a convention, a runbook. Two tables would duplicate the
-- document columns, the revision trigger, the soft delete, the trash entry and
-- the recovery check to express a nullable foreign key.
--
-- **`project_id is null` is the workspace page**, and it is the only difference.
--
-- ### This does not weaken invariant 1
--
-- `CLAUDE.md`: *"A work item belongs to a sprint; a sprint belongs to a
-- project; a project belongs to a client. Nothing is global."* That invariant
-- is about **work items** and the queries, views, exports and reports that
-- return them. A page is not a work item: it is never exported, never in a
-- sprint report, never in a CSV, and never reachable by a client account —
-- `is_active_member()` is false for a client contact, and it is the whole read
-- policy here. A workspace page cannot leak across a project boundary because
-- it never enters a project-scoped read in the first place.
--
-- What the invariant *does* still bind: a **project** page is scoped by its
-- `project_id` and nothing else, and every route that renders one re-derives
-- the project from the page's own row rather than from the URL segment.
--
-- ## Who may write one
--
-- Admin or lead, matching sprint notes. The returned prototype's own data says
-- the same thing — `pgNotes` is authored by Mohamed (admin) and Adam (lead) —
-- and the handoff's unresolved-decisions list flags *"Sprint notes editors:
-- notes are admin/lead-authored in this design. If engineers should be able to
-- add to them, the publish flow needs a section-level author"*. That question is
-- open for pages too and is recorded in `05-DECISIONS.md` for Mohamed rather
-- than answered here by inventing a per-section author.
--
-- ## Drafts stay in the browser
--
-- `PLAN.md` §3: *"Other users must not see the draft text live"*, and *"Longer
-- story or note changes become visible only after Publish/Save succeeds."* The
-- same shape sprint notes already have: the editor holds the draft, Publish
-- writes, and the server never holds an unpublished body of a live page. What
-- `published_at` adds is the one case sprint notes do not have — a page that has
-- been **created and never published at all**, which is visible to its author
-- and to nobody else until they publish it.

-- ---------------------------------------------------------------------------
-- The table.
-- ---------------------------------------------------------------------------

create table if not exists public.pages (
  id            uuid primary key default gen_random_uuid(),

  -- Null is a workspace page. See the note above on why this is one table.
  project_id    uuid references public.projects (id) on delete cascade,

  title         text not null,

  -- The URL segment. Derived from the title on create and then frozen, the same
  -- rule `project_slug_aliases` exists to enforce for projects: a link somebody
  -- pasted into a message must keep working after a rename.
  slug          text not null,

  -- The block document and its flattened projection, written in the same
  -- statement. Same pair, and the same reason, as every other document surface:
  -- the editor and the diff read `body_json`, search and the revision's
  -- `plain_text` read `body`.
  body_json     jsonb,
  body          text not null default '',
  body_version  smallint not null default 1,

  -- Acknowledgement-based publishing. Null means it has never been published and
  -- only its author can see it.
  published_at  timestamptz,
  published_by  uuid references public.profiles (id) on delete set null,

  created_by    uuid references public.profiles (id) on delete set null,

  -- Soft delete, so a page goes to the bin rather than away. Matches
  -- `work_items.deleted_at` and `comments.deleted_at`.
  deleted_at    timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint pages_title_not_blank check (btrim(title) <> ''),
  constraint pages_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 1 and 80)
);

comment on table public.pages is
  'Project and workspace pages. project_id null is a workspace page. Never exported, never client-visible: is_active_member() is the whole read predicate.';
comment on column public.pages.project_id is
  'Null for a workspace page. A project page is scoped by this column and re-derived from it, never from a URL segment.';
comment on column public.pages.published_at is
  'Null means never published: visible to its author alone. Drafts of an already-published page live in the browser, never here.';

-- Slug uniqueness is per scope, and only among pages that are not in the bin —
-- deleting a page has to free its name, or a bin nobody empties becomes a
-- namespace nobody can reuse.
create unique index if not exists pages_project_slug_idx
  on public.pages (project_id, slug) where project_id is not null and deleted_at is null;
create unique index if not exists pages_workspace_slug_idx
  on public.pages (slug) where project_id is null and deleted_at is null;

-- The two list reads: a project's pages, and the workspace's.
create index if not exists pages_project_idx
  on public.pages (project_id, updated_at desc) where deleted_at is null;
create index if not exists pages_workspace_idx
  on public.pages (updated_at desc) where project_id is null and deleted_at is null;
-- The bin's read.
create index if not exists pages_deleted_idx
  on public.pages (deleted_at desc) where deleted_at is not null;

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- `created_by` is not client-supplied.
--
-- The same rule `20260821180000_role_is_not_client_supplied.sql` established
-- for `profiles.role`: a column that decides who may see a draft must not be
-- settable by the person whose draft it is. An insert that names somebody else
-- would hide the page from its real author and show it to a stranger.
-- ---------------------------------------------------------------------------

create or replace function public.pages_stamp_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  -- Publishing stamps who did it, and un-publishing is not an operation this
  -- offers: a page that has been published stays published until it is deleted.
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    new.published_by := (select auth.uid());
  end if;
  return new;
end;
$$;

comment on function public.pages_stamp_author is
  'BEFORE INSERT. created_by and published_by come from the session, never from the payload.';

drop trigger if exists pages_stamp_author on public.pages;
create trigger pages_stamp_author
  before insert on public.pages
  for each row execute function public.pages_stamp_author();

create or replace function public.pages_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Immutable after creation: who wrote it, where it lives, and what it is
  -- called in a URL. A page that could move between projects would be a page
  -- that could carry one client's writing into another's space, which is the
  -- one thing invariant 1 exists to prevent.
  new.created_by := old.created_by;
  new.project_id := old.project_id;
  new.slug       := old.slug;

  -- Publishing is one-way and stamped here, not by the caller.
  if old.published_at is null and new.published_at is not null then
    new.published_by := (select auth.uid());
  elsif old.published_at is not null then
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;

  return new;
end;
$$;

comment on function public.pages_guard_columns is
  'BEFORE UPDATE. A page cannot change project, slug or author, and cannot be un-published.';

drop trigger if exists pages_guard_columns on public.pages;
create trigger pages_guard_columns
  before update on public.pages
  for each row execute function public.pages_guard_columns();

-- ---------------------------------------------------------------------------
-- Versions.
--
-- The same trigger every other document surface uses, with the same four
-- arguments. Nothing about `record_document_revision()` is page-specific except
-- the scope column, which the next block adds.
-- ---------------------------------------------------------------------------

alter table public.document_revisions
  add column if not exists page_id uuid references public.pages (id) on delete cascade;

comment on column public.document_revisions.page_id is
  'Denormalised scope for a page revision, written by the trigger from the row itself. The third of work_item_id / sprint_id / page_id; exactly one is set.';

create index if not exists document_revisions_page_idx
  on public.document_revisions (page_id, created_at desc)
  where page_id is not null;

-- `record_document_revision()` learns the sixth surface. Everything else about
-- it is unchanged and is re-stated here because `create or replace` replaces the
-- whole body.
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
  next_no      smallint;
  restored     smallint := nullif(current_setting('coditu.restored_from', true), '')::smallint;
begin
  -- Nothing changed about the writing. A status flip must not add a version to
  -- the description, or every story acquires a history of edits nobody made.
  --
  -- **Unless this is a restore.** `restored is not null` means
  -- `restore_document_revision` is running, and a restore is required to add a
  -- version whether or not the text moved: putting back the version that is
  -- already current is a thing somebody did, at a time, and it has to be on the
  -- record. Without this clause that restore wrote nothing and the RPC returned
  -- the pre-existing latest revision as though it had just made it — which is
  -- the one shape of dishonesty a version history cannot afford.
  if restored is null
     and old_row is not null
     and (old_row -> doc_col) is not distinct from new_doc
     and (old_row ->> text_col) is not distinct from new_text then
    return null;
  end if;

  -- A row created with an empty document has no first version. Version 1 is
  -- what somebody wrote, not the blank they were given.
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

  select coalesce(max(r.revision_no), 0) + 1
    into next_no
    from public.document_revisions r
   where r.surface = v_surface
     and r.entity_id = (new_row ->> 'id')::uuid;

  insert into public.document_revisions
    (surface, entity_id, revision_no, actor_id, doc, plain_text, doc_version,
     restored_from, work_item_id, sprint_id, page_id)
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
     scope_page);

  return null;
end;
$$;

comment on function public.record_document_revision() is
  'AFTER trigger. Writes one append-only revision when a document column actually changes — or unconditionally when coditu.restored_from is set, because a restore is always a version.';

drop trigger if exists record_page_revision on public.pages;
create trigger record_page_revision
  after insert or update of body_json, body on public.pages
  for each row execute function public.record_document_revision(
    'page', 'body_json', 'body', 'body_version');

-- ---------------------------------------------------------------------------
-- Restoring a page revision.
--
-- `restore_document_revision` is re-stated whole for the same reason as above.
-- The only new thing is the sixth `when`.
-- ---------------------------------------------------------------------------

create or replace function public.restore_document_revision(
  p_surface public.revision_surface,
  p_entity_id uuid,
  p_revision_no smallint
)
returns table (revision_no smallint, work_item_id uuid, sprint_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target   public.document_revisions;
  affected int;
begin
  select * into target
    from public.document_revisions r
   where r.surface = p_surface
     and r.entity_id = p_entity_id
     and r.revision_no = p_revision_no;

  if target is null then
    raise exception 'No such revision' using errcode = 'P0002';
  end if;

  perform set_config('coditu.restored_from', p_revision_no::text, true);

  case p_surface
    when 'work_item_description' then
      update public.work_items
         set description_json = target.doc, description = target.plain_text
       where id = p_entity_id;
    when 'work_item_highlight' then
      update public.work_items
         set highlight_json = target.doc, highlight = target.plain_text
       where id = p_entity_id;
    when 'sprint_notes' then
      update public.sprints
         set notes_json = target.doc, notes = target.plain_text
       where id = p_entity_id;
    when 'acceptance_criterion' then
      update public.acceptance_criteria
         set body_json = target.doc, body = target.plain_text
       where id = p_entity_id;
    when 'comment' then
      update public.comments
         set body_json = target.doc, body_text = target.plain_text
       where id = p_entity_id;
    when 'page' then
      -- `body` is `not null` on this table, unlike the four above. A revision
      -- whose `plain_text` is null would violate it, and the honest value for
      -- "this version had no words" is the empty string the column defaults to.
      update public.pages
         set body_json = target.doc, body = coalesce(target.plain_text, '')
       where id = p_entity_id
         and deleted_at is null;
  end case;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  perform set_config('coditu.restored_from', '', true);

  return query
    select r.revision_no, r.work_item_id, r.sprint_id
      from public.document_revisions r
     where r.surface = p_surface
       and r.entity_id = p_entity_id
     order by r.revision_no desc
     limit 1;
end;
$$;

comment on function public.restore_document_revision is
  'Writes an earlier revision back onto the live row. Always adds a version, even when the content is already current; never removes the versions in between.';

revoke all on function public.restore_document_revision(public.revision_surface, uuid, smallint) from public, anon;
grant execute on function public.restore_document_revision(public.revision_surface, uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading and writing a page.
--
-- Read: any active internal member — and a never-published page only by the
-- person who created it. A client contact fails `is_active_member()` and so
-- reads nothing here at all, which is why there is no client clause anywhere in
-- this file.
--
-- Write: admin or lead, matching sprint notes.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.pages to authenticated;

alter table public.pages enable row level security;

drop policy if exists "members read published pages" on public.pages;
create policy "members read published pages"
  on public.pages
  for select
  to authenticated
  using (
    public.is_active_member()
    and deleted_at is null
    and (published_at is not null or created_by = (select auth.uid()))
  );

drop policy if exists "admins and leads write pages" on public.pages;
create policy "admins and leads write pages"
  on public.pages
  for insert
  to authenticated
  with check (public.is_admin_or_lead());

drop policy if exists "admins and leads edit pages" on public.pages;
create policy "admins and leads edit pages"
  on public.pages
  for update
  to authenticated
  using (public.is_admin_or_lead() and deleted_at is null)
  with check (public.is_admin_or_lead());

-- No `delete` policy. A page goes to the bin through `set_page_deleted`, and
-- leaves the schema only through `purge_deleted`, which is admin-only and takes
-- an id one at a time. The absent policy is what makes that true.

-- ---------------------------------------------------------------------------
-- The bin.
-- ---------------------------------------------------------------------------

create or replace function public.set_page_deleted(p_page_id uuid, p_deleted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected int;
begin
  if not public.is_admin_or_lead() then
    raise exception 'Only an admin or lead may delete a page' using errcode = '42501';
  end if;

  update public.pages
     set deleted_at = case when p_deleted then now() else null end
   where id = p_page_id
     and (deleted_at is not null) <> p_deleted;

  get diagnostics affected = row_count;
  if affected = 0 then
    -- Either there is no such page or it is already in the state asked for.
    -- Both are worth saying out loud rather than reporting a success that
    -- changed nothing — the trap `restore_comment` records.
    raise exception 'No such page, or it is already in that state' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.set_page_deleted is
  'Soft delete and restore for a page. security definer because the table has no delete policy at all — the bin is the only route out.';

revoke all on function public.set_page_deleted(uuid, boolean) from public, anon;
grant execute on function public.set_page_deleted(uuid, boolean) to authenticated;

-- `trash_list()` gains a third union arm. The return shape changes — a page has
-- no sprint — so the function is dropped rather than replaced.
drop function if exists public.trash_list();

create or replace function public.trash_list()
returns table (
  kind          text,
  entity_id     uuid,
  title         text,
  item_key      text,
  project_slug  text,
  project_name  text,
  sprint_number int,
  minutes_logged int,
  deleted_at    timestamptz,
  can_restore   boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not public.is_active_member() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  return query
  -- Stories, for an admin or a lead.
  select
    'work_item'::text,
    w.id,
    w.title,
    w.key,
    p.slug,
    p.name,
    s.number,
    w.minutes_logged,
    w.deleted_at,
    true
  from public.work_items w
  join public.sprints s  on s.id = w.sprint_id
  join public.projects p on p.id = s.project_id
  where w.deleted_at is not null
    and public.is_admin_or_lead()

  union all

  -- Withdrawn comments. `body_text` is deliberately NOT returned: the thread
  -- hides a withdrawn comment's words from every reader including its author,
  -- and a trash screen that printed them would undo that with no one noticing.
  select
    'comment'::text,
    c.id,
    'Comment on ' || w.key,
    w.key,
    p.slug,
    p.name,
    s.number,
    null::int,
    c.deleted_at,
    (c.author_id = actor or public.auth_role() = 'admin'::public.app_role)
  from public.comments c
  join public.work_items w on w.id = c.work_item_id
  join public.sprints s    on s.id = w.sprint_id
  join public.projects p   on p.id = s.project_id
  where c.deleted_at is not null
    and (
      public.is_admin_or_lead()
      or c.author_id = actor
    )

  union all

  -- Pages. `item_key` carries the slug so the screen can name what it was
  -- called in a URL, `project_slug` is null for a workspace page, and
  -- `sprint_number` is null for both — a page has never belonged to a sprint.
  -- The **title** is returned because a page's title is not its contents: a
  -- reader has to be able to tell "Component naming rules" from "Meeting notes
  -- 08-11" to decide which one to put back, and neither says anything the page
  -- itself said.
  select
    'page'::text,
    g.id,
    g.title,
    g.slug,
    pr.slug,
    coalesce(pr.name, 'Workspace'),
    null::int,
    null::int,
    g.deleted_at,
    public.is_admin_or_lead()
  from public.pages g
  left join public.projects pr on pr.id = g.project_id
  where g.deleted_at is not null
    and public.is_admin_or_lead()

  order by 9 desc;
end;
$$;

comment on function public.trash_list is
  'Everything soft-deleted that the caller may see: stories, withdrawn comments and pages. Never returns a withdrawn comment''s words — only where it was and when it went.';

revoke all on function public.trash_list() from public, anon;
grant execute on function public.trash_list() to authenticated;

-- Purging learns the third kind. Re-stated whole, as ever.
create or replace function public.purge_deleted(p_kind text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only an admin may purge' using errcode = '42501';
  end if;

  if p_kind = 'work_item' then
    -- Only something already in the bin. Purging is emptying the trash, never a
    -- shortcut past the soft delete — deleting a live story in one step is not
    -- an operation this offers.
    --
    -- Revisions go by cascade: `document_revisions.work_item_id` references
    -- this row, and that includes the revisions of its criteria and comments,
    -- which the trigger stamps with the story they belong to.
    delete from public.work_items where id = p_entity_id and deleted_at is not null;

  elsif p_kind = 'comment' then
    -- Nothing cascades here, so the history is removed explicitly — and BEFORE
    -- the comment, so a failure leaves the comment in the bin with its history
    -- rather than a comment that is gone with its words still readable. If only
    -- one of these two statements can happen, this is the safe order.
    --
    -- The `exists` is load-bearing and not defensive noise: without it, calling
    -- this with a LIVE comment's id deletes that comment's whole history and
    -- then deletes no comment. Every arm below is written to the same rule —
    -- **nothing is removed unless the row is already in the bin.**
    delete from public.document_revisions
     where surface = 'comment'
       and entity_id = p_entity_id
       and exists (
         select 1 from public.comments c
          where c.id = p_entity_id and c.deleted_at is not null
       );

    delete from public.comments where id = p_entity_id and deleted_at is not null;

  elsif p_kind = 'page' then
    -- `document_revisions.page_id` has a real foreign key with `on delete
    -- cascade`, so a page's revisions go on their own. The explicit delete is
    -- here anyway, guarded exactly as the comment arm is, for any row written
    -- before that column existed — there are none today, and relying on that is
    -- how the comment case became a leak in the first place.
    delete from public.document_revisions
     where surface = 'page'
       and entity_id = p_entity_id
       and exists (
         select 1 from public.pages g
          where g.id = p_entity_id and g.deleted_at is not null
       );

    delete from public.pages where id = p_entity_id and deleted_at is not null;

  else
    raise exception 'Not something that can be purged' using errcode = '22023';
  end if;
end;
$$;

comment on function public.purge_deleted is
  'Irreversible. Admin only, one row at a time, only rows already soft-deleted. Takes the entity''s document history with it.';

revoke all on function public.purge_deleted(text, uuid) from public, anon;
grant execute on function public.purge_deleted(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime is NOT enabled on this table.
--
-- `20260821120000_realtime_publication.sql` adds the tables whose changes have
-- to reach another browser. A page has no presence surface, no live insertion
-- treatment and no second reader mid-write; adding it to the publication would
-- broadcast every keystroke-batch of a published body to every open tab for no
-- behaviour anybody asked for. `PLAN.md` §4 is explicit that presence is the
-- realtime feature and draft content is not.
-- ---------------------------------------------------------------------------
