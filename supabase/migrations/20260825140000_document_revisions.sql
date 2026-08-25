-- Every version of every document, kept, and unable to be rewritten.
--
-- `activity` has recorded property changes since the first week — status moved,
-- assignee changed, hours logged. What it has never recorded is what a document
-- SAID before somebody changed it. A story's description could be replaced
-- wholesale and the only trace was a row saying the description changed.
--
-- ## Captured by a trigger, not by the action
--
-- The obvious place to write a revision is the Server Action that saves the
-- document, and it is the wrong place. There are already four actions that write
-- documents and there will be more; every one of them would have to remember,
-- and the one that forgets loses history silently and forever. A trigger cannot
-- forget. It also catches the writes no action makes — a migration, a fix
-- applied by hand in the SQL editor, the importer — which are exactly the
-- changes nobody can otherwise account for.
--
-- The cost is that a trigger knows WHAT changed and not WHY. `restored_from` is
-- the one piece of intent that matters, and it arrives through a transaction
-- setting the restore path sets; everything else a reader needs is in the row.
--
-- ## Append-only, enforced by what is absent
--
-- `authenticated` is granted SELECT and nothing else. There is no insert policy,
-- no update policy and no delete policy, so the only way a row reaches this
-- table is the `security definer` trigger below, and there is no way at all to
-- change or remove one. That is stronger than a guard trigger that raises: a
-- guard has to be written correctly, whereas a privilege that was never granted
-- cannot be got around by finding a path its author did not think of.
--
-- **A restore therefore writes a NEW revision.** It never rewinds the table,
-- because it cannot. Restoring version 3 over version 7 produces version 8 whose
-- content equals version 3 and whose `restored_from` says so, and 4 through 7
-- remain readable. This is the property the whole feature rests on: history that
-- can be edited is not history.
--
-- ## Client messages are deliberately not here
--
-- `client_messages` is the only document surface a client contact writes, and
-- `/app/history` is an internal screen. Admitting it would put a client-writable
-- path into a table whose read policy is `is_active_member()` — not a leak, but
-- a shape that invites one later. Client threads keep their own history in the
-- thread itself, where both sides can see it.

create type public.revision_surface as enum (
  'work_item_description',
  'work_item_highlight',
  'sprint_notes',
  'acceptance_criterion',
  'comment'
);

create table public.document_revisions (
  id            uuid primary key default gen_random_uuid(),
  surface       public.revision_surface not null,
  entity_id     uuid not null,
  revision_no   smallint not null,
  actor_id      uuid references public.profiles (id) on delete set null,

  -- The document as it stood AFTER this change, and its flattened text. Both,
  -- for the same reason the live tables keep both: the diff and the restore read
  -- `doc`, and history search reads `plain_text` without walking a jsonb tree.
  doc           jsonb,
  plain_text    text,
  doc_version   smallint not null default 1,

  -- Set only when this revision was produced by restoring an earlier one, and
  -- then it holds that earlier revision's number. Null for an ordinary edit.
  restored_from smallint,

  -- Denormalised scope, so the history screen can ask "everything about this
  -- story" without a five-way union. Written by the trigger from the row's own
  -- parent, never supplied by a caller — invariant 1 re-derived rather than
  -- trusted.
  work_item_id  uuid references public.work_items (id) on delete cascade,
  sprint_id     uuid references public.sprints (id) on delete cascade,

  created_at    timestamptz not null default now(),

  unique (surface, entity_id, revision_no)
);

comment on table public.document_revisions is
  'Append-only. Rows arrive only through record_document_revision(); nothing may update or delete one, including an admin.';
comment on column public.document_revisions.restored_from is
  'The revision number this one was restored from. A restore adds a version, it never removes the versions in between.';

create index document_revisions_entity_idx
  on public.document_revisions (surface, entity_id, revision_no desc);
create index document_revisions_work_item_idx
  on public.document_revisions (work_item_id, created_at desc)
  where work_item_id is not null;
create index document_revisions_sprint_idx
  on public.document_revisions (sprint_id, created_at desc)
  where sprint_id is not null;

-- ---------------------------------------------------------------------------
-- The capture trigger.
--
-- One function, five triggers. The surface and the two column names arrive in
-- `TG_ARGV` so that adding a sixth document surface is a `create trigger` and
-- not a sixth copy of this logic — the mistake `record_work_item_activity`
-- avoided by the same means.
--
-- `to_jsonb(new)` rather than dynamic SQL: it reads the columns by name with no
-- `execute`, no quoting question, and no plan cache to invalidate. NULL columns
-- become JSON `null` on both sides of the comparison, so `is not distinct from`
-- still means what it says.
-- ---------------------------------------------------------------------------

create or replace function public.record_document_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- `v_` because `surface` is also a column on the table this writes to, and a
  -- trigger function has no label to disambiguate them with.
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
  next_no      smallint;
  restored     smallint := nullif(current_setting('coditu.restored_from', true), '')::smallint;
begin
  -- Nothing changed about the writing. A status flip must not add a version to
  -- the description, or every story acquires a history of edits nobody made.
  if old_row is not null
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

  -- Where this document lives. Written out rather than passed in, so the
  -- mapping is checkable by reading it and a caller cannot claim a different
  -- parent than the row has.
  case v_surface
    when 'work_item_description' then scope_item := (new_row ->> 'id')::uuid;
    when 'work_item_highlight'   then scope_item := (new_row ->> 'id')::uuid;
    when 'acceptance_criterion'  then scope_item := (new_row ->> 'work_item_id')::uuid;
    when 'comment'               then scope_item := (new_row ->> 'work_item_id')::uuid;
    when 'sprint_notes'          then scope_sprint := (new_row ->> 'id')::uuid;
  end case;

  select coalesce(max(r.revision_no), 0) + 1
    into next_no
    from public.document_revisions r
   where r.surface = v_surface
     and r.entity_id = (new_row ->> 'id')::uuid;

  insert into public.document_revisions
    (surface, entity_id, revision_no, actor_id, doc, plain_text, doc_version,
     restored_from, work_item_id, sprint_id)
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
     scope_sprint);

  return null;
end;
$$;

comment on function public.record_document_revision() is
  'AFTER trigger. Writes one append-only revision when a document column actually changes. Reads coditu.restored_from for the restore path.';

create trigger record_description_revision
  after insert or update of description_json, description on public.work_items
  for each row execute function public.record_document_revision(
    'work_item_description', 'description_json', 'description', 'description_version');

create trigger record_highlight_revision
  after insert or update of highlight_json, highlight on public.work_items
  for each row execute function public.record_document_revision(
    'work_item_highlight', 'highlight_json', 'highlight', 'highlight_version');

create trigger record_sprint_notes_revision
  after insert or update of notes_json, notes on public.sprints
  for each row execute function public.record_document_revision(
    'sprint_notes', 'notes_json', 'notes', 'notes_version');

create trigger record_criterion_revision
  after insert or update of body_json, body on public.acceptance_criteria
  for each row execute function public.record_document_revision(
    'acceptance_criterion', 'body_json', 'body', 'body_version');

create trigger record_comment_revision
  after insert or update of body_json, body_text on public.comments
  for each row execute function public.record_document_revision(
    'comment', 'body_json', 'body_text', 'body_version');

-- ---------------------------------------------------------------------------
-- Restoring.
--
-- The restore is an ordinary UPDATE of the live row, which the capture trigger
-- then records like any other edit. All this function adds is the
-- `restored_from` stamp.
--
-- ## `security invoker`, and that is the whole authorization model
--
-- Almost every function in this schema is `security definer`. This one must not
-- be, and the reason is worth the paragraph: **who may restore a document is
-- exactly who may write it**, and that rule is already written down — in the
-- policies on `work_items`, `sprints`, `acceptance_criteria` and `comments`, and
-- in `guard_work_item_columns`. A definer function would have to state it a
-- second time, in a `case` over five surfaces, and the second copy is the one
-- that goes stale. The first draft of this function did exactly that and got it
-- wrong in a way that mattered: it let any active member restore a criterion
-- body, where editing one requires owning or reviewing the item.
--
-- Running as the caller means an engineer restoring a criterion on their own
-- story succeeds, the same engineer restoring one on somebody else's is refused,
-- and neither outcome is decided here. Nothing to keep in step.
--
-- The catch is that RLS refuses a write by matching no rows rather than by
-- raising, so a denied restore looks identical to a restore of something that
-- was already deleted. Hence the row count check — without it the caller is told
-- it worked.
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
  -- Reading the revision is governed by the table's own select policy, so a
  -- client account finds nothing here and gets the same answer as a bad id.
  select * into target
    from public.document_revisions r
   where r.surface = p_surface
     and r.entity_id = p_entity_id
     and r.revision_no = p_revision_no;

  if target is null then
    raise exception 'No such revision' using errcode = 'P0002';
  end if;

  -- Tells the capture trigger that the version it is about to write came from
  -- somewhere. `set local` dies with the transaction, so it cannot leak into the
  -- next statement on a pooled connection.
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
  'Writes an earlier revision back onto the live row. Adds a version; never removes the versions in between.';

revoke all on function public.restore_document_revision(public.revision_surface, uuid, smallint) from public, anon;
grant execute on function public.restore_document_revision(public.revision_surface, uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading.
--
-- SELECT and nothing else. The absent policies are the append-only guarantee.
-- ---------------------------------------------------------------------------

alter table public.document_revisions enable row level security;

grant select on public.document_revisions to authenticated;

create policy "active members read document revisions" on public.document_revisions
  for select to authenticated using (public.is_active_member());
