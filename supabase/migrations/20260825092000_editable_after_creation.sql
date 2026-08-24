-- Coditu — the things the schema always allowed and the app never offered.
--
-- Three of them, all from workstream F of the thread brief, plus the criterion
-- widening the team asked for by name.
--
-- ## 1. A work item can be deleted, softly (F2.4, §8.6 — answered: soft)
--
-- There was no `deleteWorkItem` anywhere. Deleting cascades to criteria, to
-- comments and to **time entries**, which is destroying hours somebody logged,
-- so the answer was a soft delete on the model of `comments.deleted_at`.
--
-- **The rule is enforced in the read policy, not in fifteen queries.** A
-- deleted item is invisible to every SELECT this app can make — the sprint
-- table, the board, my-work, the exports, the component history, the palette,
-- the report and the PDF all became correct without being touched, and none of
-- them can regress by somebody forgetting a filter. Joins inherit it: a comment
-- or a time entry belonging to a deleted item drops out of any query that goes
-- through `work_items!inner`, which is all of them.
--
-- Restoring therefore cannot be an UPDATE from the app — the row cannot be read
-- to find it. It is a `security definer` function, with the same authorization
-- check written out in full, and a companion that lists what is in the bin.
--
-- **The hard-delete policy goes.** Leaving it would make "soft delete" a habit
-- of the user interface rather than a property of the database, and one
-- PostgREST call away from a client's hours disappearing. Nobody hard-deletes a
-- work item, and the absence of a policy IS the rule — exactly as it already is
-- for `comments`.
--
-- ## 2. An item can move to another sprint (F2.4)
--
-- "This slipped, carry it over" is the single most common request in week one.
-- The move is refused across projects: an item's project comes from its sprint,
-- and its key already names that project. `COD-241` moved into Nile Atelier's
-- sprint would be a key that lies, a client boundary crossed, and a component
-- attribution pointing at another registry. So the answer to "refuse it or
-- clear the component" is **refuse the move** — and the component question does
-- not arise.
--
-- ## 3. An engineer can rewrite a criterion's body (§8, already resolved)
--
-- Answered by the team on 2026-08-24: *"everything important should be
-- editable, we are developers, don't lock anything as hardcoded."* The assignee
-- and the reviewer — the same set that may already tick — may now rewrite what
-- the box says. Insert and delete stay with admin/lead, so the SHAPE of the
-- scope is still a lead's call.

-- ---------------------------------------------------------------------------
-- 1. Soft delete.
-- ---------------------------------------------------------------------------

alter table public.work_items add column deleted_at timestamptz;

comment on column public.work_items.deleted_at is
  'Soft delete. A deleted item is invisible to every SELECT — the read policy enforces it, so no query can forget. Its criteria, comments and hours stay, and restoring brings all of them back.';

-- The sprint order index, but only over the rows anything will ever read.
create index work_items_live_sprint_order_idx
  on public.work_items (sprint_id, order_index) where deleted_at is null;

drop policy "active members read work items" on public.work_items;
create policy "active members read live work items" on public.work_items
  for select to authenticated
  using (public.is_active_member() and deleted_at is null);

-- Nobody hard-deletes a work item. The absence of a policy is the rule.
drop policy "leads delete work items" on public.work_items;

-- The column guard is an allowlist written as a denylist, so `deleted_at` is
-- writable by an assignee until it is named here — the same trap
-- `component_id` and `body_json` were each added for.
create or replace function public.guard_work_item_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text;
begin
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;

  changed := case
    when new.title            is distinct from old.title            then 'title'
    when new.description      is distinct from old.description      then 'description'
    when new.highlight        is distinct from old.highlight        then 'highlight'
    when new.type             is distinct from old.type             then 'type'
    when new.assignee_id      is distinct from old.assignee_id      then 'assignee_id'
    when new.reviewer_id      is distinct from old.reviewer_id      then 'reviewer_id'
    when new.deadline         is distinct from old.deadline         then 'deadline'
    when new.estimate_minutes is distinct from old.estimate_minutes then 'estimate_minutes'
    when new.grouping         is distinct from old.grouping         then 'grouping'
    when new.sprint_id        is distinct from old.sprint_id        then 'sprint_id'
    when new.key              is distinct from old.key              then 'key'
    when new.component_id     is distinct from old.component_id     then 'component_id'
    when new.deleted_at       is distinct from old.deleted_at       then 'deleted_at'
    else null
  end;

  if changed is not null then
    raise exception 'an engineer may change only status and order_index (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

/**
 * Delete or restore a work item.
 *
 * SECURITY DEFINER because the read policy hides a deleted row from everybody,
 * including the person who has to bring it back. The authorization check is
 * therefore written out here in full rather than delegated to a policy, and it
 * is the only thing standing between a caller and this table — read it as such.
 *
 * Returns enough for the caller to revalidate the right paths and say something
 * true in a toast, including the hours the deletion took out of the sprint.
 */
create or replace function public.set_work_item_deleted(p_item_id uuid, p_deleted boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key            text;
  v_title          text;
  v_minutes        int;
  v_sprint_id      uuid;
  v_sprint_number  int;
  v_project_slug   text;
begin
  if not public.is_admin_or_lead() then
    raise exception 'only an admin or lead may delete or restore a work item'
      using errcode = '42501';
  end if;

  update public.work_items w
     set deleted_at = case when p_deleted then now() else null end
   where w.id = p_item_id
  returning w.key, w.title, w.minutes_logged, w.sprint_id
       into v_key, v_title, v_minutes, v_sprint_id;

  if v_key is null then
    return null;
  end if;

  select s.number, p.slug into v_sprint_number, v_project_slug
  from public.sprints s
  join public.projects p on p.id = s.project_id
  where s.id = v_sprint_id;

  return jsonb_build_object(
    'key', v_key,
    'title', v_title,
    'minutes_logged', v_minutes,
    'sprint_number', v_sprint_number,
    'project_slug', v_project_slug
  );
end;
$$;

comment on function public.set_work_item_deleted is
  'Soft-deletes or restores an item. Definer, because the read policy hides a deleted row from the person who has to restore it; the admin/lead check inside is the whole authorization.';

/**
 * What is in the bin, for one sprint.
 *
 * The counterpart to the read policy: without this an item deleted five minutes
 * ago is unreachable, and "reversible" would mean "until the toast fades".
 */
create or replace function public.list_deleted_work_items(p_sprint_id uuid)
returns table (id uuid, key text, title text, minutes_logged int, deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_or_lead() then
    raise exception 'only an admin or lead may look in the bin' using errcode = '42501';
  end if;

  return query
    select w.id, w.key, w.title, w.minutes_logged, w.deleted_at
    from public.work_items w
    where w.sprint_id = p_sprint_id
      and w.deleted_at is not null
    order by w.deleted_at desc;
end;
$$;

grant execute on function public.set_work_item_deleted, public.list_deleted_work_items
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Moving an item between sprints.
-- ---------------------------------------------------------------------------

/**
 * Invariant 1, at the one place an item can change project: it cannot.
 *
 * A move to another project's sprint would give the item a key naming a client
 * it no longer belongs to, a component from a registry it can no longer see,
 * and an entry in two clients' hours. The trigger refuses it; the action says
 * so in a sentence first.
 */
create or replace function public.guard_work_item_sprint_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_project uuid;
  v_new_project uuid;
begin
  if new.sprint_id is not distinct from old.sprint_id then
    return new;
  end if;

  select project_id into v_old_project from public.sprints where id = old.sprint_id;
  select project_id into v_new_project from public.sprints where id = new.sprint_id;

  if v_old_project is distinct from v_new_project then
    raise exception 'a work item cannot move to another project''s sprint'
      using errcode = '23514';
  end if;

  -- It lands at the end of its new sprint. Keeping the old index would drop it
  -- into the middle of somebody else's ordering at a position that meant
  -- something over there and nothing here.
  select coalesce(max(w.order_index), -1) + 1 into new.order_index
  from public.work_items w
  where w.sprint_id = new.sprint_id and w.id <> new.id;

  return new;
end;
$$;

create trigger work_items_guard_sprint_project
  before update of sprint_id on public.work_items
  for each row execute function public.guard_work_item_sprint_project();

-- ---------------------------------------------------------------------------
-- 3. The assignee and the reviewer may rewrite a criterion's body.
-- ---------------------------------------------------------------------------

create or replace function public.guard_criteria_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;

  -- `body` and `body_json` are no longer on this list, and that is the change.
  -- The row policy already restricts an engineer to criteria on items they are
  -- assigned to or reviewing; within those, they may now say what the box says
  -- as well as tick it. Moving a criterion to another item or reordering the
  -- checklist is still a lead's call, because that is the shape of the scope
  -- rather than the content of one line.
  if new.work_item_id is distinct from old.work_item_id
     or new.order_index is distinct from old.order_index then
    raise exception 'an engineer may change a criterion''s body and tick it, nothing else'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_criteria_columns is
  'Per-column half of the criteria update rule. The assignee and the reviewer may rewrite a body and tick a box; work_item_id and order_index stay with admin/lead.';
