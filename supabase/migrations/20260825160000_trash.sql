-- One place to find what has been deleted, and one place to put it back.
--
-- Soft delete already exists: `work_items.deleted_at` since
-- `20260825092000_editable_after_creation.sql`, `comments.deleted_at` since the
-- first thread migration. What has never existed is a way to SEE either of them.
-- `list_deleted_work_items(sprint_id)` is the closest thing, and it was written
-- for one job — stopping `deleteSprint` from cascading away a sprint that looks
-- empty because everything in it is binned. You have to already know which
-- sprint to ask about.
--
-- So a story deleted from the wrong sprint is recoverable in principle and
-- unfindable in practice, and a withdrawn comment is recoverable by nobody at
-- all. This adds the read.
--
-- ## Who sees what, and why it is not one rule
--
-- Items: admin and lead, matching `list_deleted_work_items` and matching who may
-- delete one in the first place.
--
-- Comments: the author, or an admin. **Not a lead**, and that is deliberate
-- rather than an oversight. The policy that governs a comment is `edit own
-- comment` — author or admin — and restoring somebody's withdrawn remark into a
-- thread is closer to editing it than to un-deleting a row. Widening this would
-- mean widening that policy, which would also let a lead rewrite anybody's
-- comment. Same principle as `restore_document_revision`: who may restore is who
-- may write, and it is decided in one place.
--
-- ## Purging is admin only, and it is the only destructive thing here
--
-- Everything else in this schema is recoverable. `purge_deleted` is not, which
-- is why it takes an explicit id rather than offering "empty the trash": there
-- is no control that destroys an unbounded amount of work in one press.

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

  -- Withdrawn comments. Everyone internal can SEE that one exists — the thread
  -- already shows its tombstone — but only the author or an admin gets the
  -- restore, so `can_restore` is computed here rather than guessed by the
  -- screen.
  --
  -- `body_text` is deliberately NOT returned. The thread hides a withdrawn
  -- comment's words from every reader including its author, and a trash screen
  -- that prints them would undo that with no one noticing. What is shown is
  -- where it was and when it went.
  select
    'comment'::text,
    c.id,
    -- Enough to tell two of your own apart, and nothing anybody said.
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

  order by 9 desc;
end;
$$;

comment on function public.trash_list is
  'Everything soft-deleted that the caller may see. Never returns a withdrawn comment''s words — only where it was and when it went.';

revoke all on function public.trash_list() from public, anon;
grant execute on function public.trash_list() to authenticated;

-- ---------------------------------------------------------------------------
-- Putting a comment back.
--
-- `security invoker`, so the `edit own comment` policy decides — author or
-- admin — exactly as it does when the same person withdrew it. Nothing here
-- restates the rule.
--
-- Stories already have `set_work_item_deleted(id, false)` and keep using it.
-- ---------------------------------------------------------------------------

create or replace function public.restore_comment(p_comment_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected int;
  item     uuid;
begin
  update public.comments
     set deleted_at = null
   where id = p_comment_id
     and deleted_at is not null
  returning work_item_id into item;

  get diagnostics affected = row_count;
  -- RLS refuses by matching no rows rather than by raising, so a denied restore
  -- would otherwise report success. Same trap as restore_document_revision.
  if affected = 0 then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  return item;
end;
$$;

revoke all on function public.restore_comment(uuid) from public, anon;
grant execute on function public.restore_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Purging. The one irreversible operation.
-- ---------------------------------------------------------------------------

create or replace function public.purge_deleted(p_kind text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Admin only, and stated here rather than left to RLS: a hard delete on
  -- `work_items` cascades to its criteria, its thread, its time entries and its
  -- revisions, and none of that comes back. This is the one place in the schema
  -- where "the policy happens to allow it" is not a good enough reason.
  if public.auth_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only an admin may purge' using errcode = '42501';
  end if;

  if p_kind = 'work_item' then
    -- Only something already in the bin. Purging is emptying the trash, never a
    -- shortcut past the soft delete — deleting a live story in one step is not
    -- an operation this offers.
    delete from public.work_items where id = p_entity_id and deleted_at is not null;
  elsif p_kind = 'comment' then
    delete from public.comments where id = p_entity_id and deleted_at is not null;
  else
    raise exception 'Not something that can be purged' using errcode = '22023';
  end if;
end;
$$;

comment on function public.purge_deleted is
  'Irreversible. Admin only, one row at a time, and only rows already soft-deleted.';

revoke all on function public.purge_deleted(text, uuid) from public, anon;
grant execute on function public.purge_deleted(text, uuid) to authenticated;
