-- Coditu — a story is about more than one thing.
--
-- ## What was wrong with one column
--
-- `work_items.component_id` could not say "this touches the Link Kachel AND
-- Tabs with Cards AND the Newspart", which is precisely what the responsiveness
-- work is: three of Week 17's twelve items name several components in their
-- title and could only ever be attributed to one of them. The per-component
-- history the registry exists to provide was therefore wrong for exactly the
-- items where it mattered most.
--
-- ## Expand, migrate, contract — and why the column stays for now
--
-- This migration ADDS the join table, backfills it, and leaves
-- `work_items.component_id` in place as a **trigger-maintained mirror of the
-- first component**. A later migration drops it. The reason is this repository's
-- deployment reality rather than caution in general: production migrations are
-- pushed by hand and the application is deployed separately, so schema and code
-- arrive in whatever order they arrive — on 2026-08-21 that took production down
-- with `42703` on every sprint page. The gap is measured in days, not seconds.
--
-- So during the transition the two representations are kept in step **in both
-- directions**:
--
--   * writing the join table re-points the column   (old code still READS right)
--   * writing the column re-points the join table   (old code still WRITES right)
--
-- The second half is the one that is easy to forget and expensive to discover:
-- without it, a lead who tags an item from a not-yet-redeployed browser gets a
-- success toast and a change that the new read model cannot see.
--
-- Neither direction can loop, because each is a no-op when the two already
-- agree — `is distinct from` in the WHERE clause means no row is updated at all,
-- so the other trigger never fires.
--
-- ## Ordering is a hint, not a dense sequence
--
-- `position` has no unique constraint and does not have to be dense. Making it
-- dense would mean re-packing every sibling on every delete, which is a lot of
-- machinery to guarantee a property nothing reads. What IS guaranteed is a
-- **total, deterministic order** — `(position, created_at, component_id)` — so
-- the same item always renders its chips in the same sequence, on every machine
-- and after every reload. The first row by that order is the primary component,
-- and the mirror column holds it.

create table public.work_item_components (
  work_item_id uuid     not null references public.work_items (id) on delete cascade,
  component_id uuid     not null references public.components (id) on delete cascade,
  -- Lower sorts first. Not unique and not dense: it orders, it does not index.
  -- A direct write to the mirror column promotes its component by giving it
  -- `min(position) - 1`, which is why this is signed.
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  primary key (work_item_id, component_id)
);

comment on table public.work_item_components is
  'Which components a work item is about. Replaces the single work_items.component_id, which survives for one release as a trigger-maintained mirror of the first row.';
comment on column public.work_item_components.position is
  'Sort hint, lower first. Deliberately neither unique nor dense — the total order is (position, created_at, component_id).';

-- `on delete cascade` from `components` is the owner-level safety net and
-- nothing in the application can reach it: there is no delete policy and no
-- delete grant on `components`, because a component holds the history of what
-- happened to it.

-- The hot path is "everything tagged with this component", which is the whole
-- reason the registry exists.
create index work_item_components_component_idx
  on public.work_item_components (component_id, work_item_id);

-- ---------------------------------------------------------------------------
-- Invariant 1, on the join.
--
-- The project is re-derived from the item's OWN sprint on every write, the same
-- way every server action does it. Nothing here trusts a project id from the
-- caller, because nothing here is given one.
-- ---------------------------------------------------------------------------

create or replace function public.guard_work_item_component_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_project      uuid;
  component_project uuid;
begin
  select s.project_id into item_project
    from public.work_items w
    join public.sprints s on s.id = w.sprint_id
   where w.id = new.work_item_id;

  select c.project_id into component_project
    from public.components c where c.id = new.component_id;

  if component_project is null or component_project is distinct from item_project then
    raise exception 'a work item may only name a component from its own project'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.guard_work_item_component_scope is
  'Invariant 1 for the join table: a tag''s component and the item''s sprint must belong to the same project. The same rule guard_work_item_component_project applies to the mirror column.';

create trigger work_item_components_guard_scope
  before insert or update on public.work_item_components
  for each row execute function public.guard_work_item_component_scope();

-- Moving an item to another project's sprint would otherwise carry every tag
-- with it. The scalar column's guard already fired on `sprint_id`; this is the
-- same rule for the rows beside it.
create or replace function public.guard_work_item_move_keeps_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offending int;
begin
  select count(*) into offending
    from public.work_item_components wc
    join public.components c on c.id = wc.component_id
    join public.sprints    s on s.id = new.sprint_id
   where wc.work_item_id = new.id
     and c.project_id is distinct from s.project_id;

  if offending > 0 then
    raise exception 'this item is tagged with % component(s) from its current project and cannot move to another', offending
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger work_items_guard_move_keeps_scope
  after update of sprint_id on public.work_items
  for each row when (new.sprint_id is distinct from old.sprint_id)
  execute function public.guard_work_item_move_keeps_scope();

-- ---------------------------------------------------------------------------
-- The backfill.
--
-- Every attributed item becomes one tag at position 0. `on conflict do nothing`
-- so the migration is idempotent — a re-run finds nothing left to do rather
-- than failing, which matters because this is the kind of statement somebody
-- eventually runs twice.
-- ---------------------------------------------------------------------------

insert into public.work_item_components (work_item_id, component_id, position)
select id, component_id, 0
  from public.work_items
 where component_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Keeping the two representations in step, in both directions.
-- ---------------------------------------------------------------------------

create or replace function public.primary_component_of(p_work_item uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select wc.component_id
    from public.work_item_components wc
   where wc.work_item_id = p_work_item
   order by wc.position, wc.created_at, wc.component_id
   limit 1;
$$;

comment on function public.primary_component_of is
  'The first component of an item under the total order (position, created_at, component_id). This is what the mirror column holds.';

/**
 * join → column.
 *
 * `is distinct from` in the WHERE clause is what stops this from looping: when
 * the two already agree no row is updated, so the column's own trigger never
 * fires. It also means the mirror write is free on the common path.
 */
create or replace function public.refresh_component_mirror()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item uuid := coalesce(new.work_item_id, old.work_item_id);
begin
  update public.work_items w
     set component_id = public.primary_component_of(item)
   where w.id = item
     and w.component_id is distinct from public.primary_component_of(item);

  return null;
end;
$$;

create trigger work_item_components_refresh_mirror
  after insert or delete on public.work_item_components
  for each row execute function public.refresh_component_mirror();

/**
 * column → join.
 *
 * Old code that has not been redeployed still writes `component_id`, and this is
 * what keeps that write meaningful. Setting the column means "the primary
 * component is now X", so X is promoted to the front rather than replacing
 * everything: an item tagged with three components does not lose two of them
 * because a stale browser set one.
 *
 * Promotion is `min(position) - 1` rather than a re-pack. Nothing reads the
 * absolute number, and re-packing every sibling to keep a dense sequence would
 * be machinery in service of a property no query has.
 */
create or replace function public.sync_component_mirror_to_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.component_id is null then
    -- "Not attributed" through the old column clears only the row it owned —
    -- the primary — and leaves the rest. There is deliberately no way to say
    -- "remove every tag" through a scalar column that can hold one value.
    --
    -- `tg_op` rather than a bare `old.component_id`: this same function serves
    -- the INSERT trigger, where `old` does not exist. That branch is
    -- unreachable there (the trigger's WHEN requires a non-null component), and
    -- relying on unreachability for correctness is how the next person's edit
    -- becomes a runtime error.
    if tg_op = 'UPDATE' and old.component_id is not null then
      delete from public.work_item_components wc
       where wc.work_item_id = new.id
         and wc.component_id = old.component_id;
    end if;
    return null;
  end if;

  insert into public.work_item_components (work_item_id, component_id, position)
  values (
    new.id,
    new.component_id,
    coalesce((select min(wc.position) - 1 from public.work_item_components wc
               where wc.work_item_id = new.id), 0)
  )
  on conflict (work_item_id, component_id) do update
    set position = coalesce((select min(wc.position) - 1 from public.work_item_components wc
                              where wc.work_item_id = excluded.work_item_id), 0);

  return null;
end;
$$;

create trigger work_items_sync_component_to_join
  after update of component_id on public.work_items
  for each row
  when (new.component_id is distinct from old.component_id
        and new.component_id is distinct from public.primary_component_of(new.id))
  execute function public.sync_component_mirror_to_join();

-- An item CREATED with a component needs the same treatment; the update trigger
-- above cannot see an insert.
create trigger work_items_sync_component_to_join_insert
  after insert on public.work_items
  for each row when (new.component_id is not null)
  execute function public.sync_component_mirror_to_join();

-- ---------------------------------------------------------------------------
-- Activity.
--
-- Tagging is a change to the record of what happened to a COMPONENT, so it
-- belongs in the feed beside status and assignee — and the NAME goes in the
-- row, not the id, because a history that reads "added component 3f2a…" is not
-- one.
--
-- The log now lives on the join table alone. `record_work_item_activity` stops
-- logging `component_id`, because with the mirror in place every column change
-- is either caused by a join write (already logged) or causes one (logged when
-- it lands) — leaving both in would write the same fact twice.
-- ---------------------------------------------------------------------------

create or replace function public.record_component_tag_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activity (work_item_id, actor_id, verb, field, to_value)
    values (new.work_item_id, actor, 'set', 'component',
            (select name from public.components where id = new.component_id));
  else
    insert into public.activity (work_item_id, actor_id, verb, field, from_value)
    values (old.work_item_id, actor, 'cleared', 'component',
            (select name from public.components where id = old.component_id));
  end if;
  return null;
end;
$$;

create trigger work_item_components_record_activity
  after insert or delete on public.work_item_components
  for each row execute function public.record_component_tag_activity();

create or replace function public.record_work_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activity (work_item_id, actor_id, verb, field, to_value)
    values (new.id, actor, 'created', null, new.title);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'changed', 'status', old.status::text, new.status::text);
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'set', 'assignee',
            (select full_name from public.profiles where id = old.assignee_id),
            (select full_name from public.profiles where id = new.assignee_id));
  end if;

  if new.reviewer_id is distinct from old.reviewer_id then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'set', 'reviewer',
            (select full_name from public.profiles where id = old.reviewer_id),
            (select full_name from public.profiles where id = new.reviewer_id));
  end if;

  if new.deadline is distinct from old.deadline then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'set', 'deadline', old.deadline::text, new.deadline::text);
  end if;

  return null;
end;
$$;

-- `create or replace trigger`, not drop-and-create: the column list belongs to
-- the trigger rather than to the function, so dropping `component_id` from the
-- body without rewriting this line would leave it firing for a column it no
-- longer reads.
create or replace trigger work_items_record_activity
  after insert or update of status, assignee_id, reviewer_id, deadline
  on public.work_items
  for each row execute function public.record_work_item_activity();

-- ---------------------------------------------------------------------------
-- RLS.
--
-- Exactly the registry's own rule, and for the same reason: which component an
-- item is about is a lead's call, not the assignee's.
--
-- **No UPDATE policy and no UPDATE grant.** A tag is added or removed, never
-- edited — so every change is two rows in `activity` that name both components,
-- rather than one row that names neither. The only updatable column would be
-- `position`, and re-ordering chips is not a thing anybody has asked for.
-- ---------------------------------------------------------------------------

alter table public.work_item_components enable row level security;

grant select, insert, delete on public.work_item_components to authenticated;

create policy "active members read work item components" on public.work_item_components
  for select to authenticated using (public.is_active_member());

create policy "leads tag work items" on public.work_item_components
  for insert to authenticated with check (public.is_admin_or_lead());

create policy "leads untag work items" on public.work_item_components
  for delete to authenticated using (public.is_admin_or_lead());
