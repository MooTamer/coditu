-- Coditu — a key that names its client, a slug that survives a rename, and an
-- order that ten people cannot collide on.
--
-- Three things that all live on `projects`, and all of which were hardcodes in
-- a `default`.
--
-- ## 1. The key prefix (§8.4, answered: per project)
--
-- `work_items.key` defaulted to `'COD-' || nextval(work_item_key_seq)` — one
-- global sequence, so every project's items were `COD-nnn` regardless of which
-- client they belonged to. That was fine while there was one client. There are
-- five projects in the database today and a second client's work about to land
-- on this app, and a key that does not name its project stops carrying any
-- information the moment two of them share a screen.
--
-- **Existing keys are immutable.** They are in comments, in exports, and in
-- people's memories. So the project that owns the most `COD-` items keeps
-- `COD`, every other project gets a prefix derived from its slug, and each
-- project's counter starts above the highest number that prefix has ever
-- issued — globally, not per project, because `COD-243` currently belongs to
-- Converso while `COD` belongs to MEINEvim.
--
-- The counter is a column, not a sequence, for two reasons: a sequence per
-- project means DDL at runtime, and `update … returning` takes a row lock,
-- which is exactly the serialisation ten items created in one sitting need.
--
-- ## 2. The slug (§8.5, answered: keep the old one as a redirect)
--
-- The slug is in every URL the team has bookmarked. Renaming a project must not
-- 404 them, so every slug a project has ever had is kept in
-- `project_slug_aliases` and the route resolver falls back to it.
--
-- ## 3. `order_index` (F4)
--
-- "Ten new work items created in one sitting must not collide on order_index."
-- They could: every caller read `max(order_index) + 1` and then inserted, which
-- is a read-modify-write with no lock in the middle. The default is dropped and
-- a trigger assigns it under a row lock on the sprint instead, so a caller that
-- simply omits the column gets an appended index that nothing else can take.

-- ---------------------------------------------------------------------------
-- 1. The key prefix.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column key_prefix      text,
  add column next_key_number int not null default 1;

comment on column public.projects.key_prefix is
  'The letters before the dash in this project''s item keys. Unique across projects — it is half of a globally unique key.';
comment on column public.projects.next_key_number is
  'The number the next item in this project takes. Advanced by `assign_work_item_key` under a row lock, which is what makes ten items created at once impossible to collide.';

-- A project's slug, shouted, as a prefix candidate. Uniquified against both the
-- prefixes already taken and any key that prefix has ever issued, because a
-- collision here would mean two projects racing for the same key.
create or replace function public.derive_key_prefix(p_slug text, p_exclude uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stem      text;
  candidate text;
  suffix    int := 0;
begin
  stem := upper(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]', '', 'g'));
  if stem !~ '^[A-Z]' then stem := 'P' || stem; end if;
  stem := left(rpad(stem, 3, 'X'), 3);

  candidate := stem;
  while exists (
          select 1 from public.projects
          where key_prefix = candidate and id is distinct from p_exclude
        )
     or exists (select 1 from public.work_items w where w.key like candidate || '-%') loop
    suffix := suffix + 1;
    candidate := stem || suffix::text;
  end loop;

  return candidate;
end;
$$;

comment on function public.derive_key_prefix is
  'A prefix for a project that has no items yet: its slug, shouted, uniquified against every prefix in use and every key ever issued.';

-- Give a project the prefix its existing items already use, and set every
-- counter above the highest number that prefix has issued.
--
-- Idempotent and re-runnable, because it is called in two places that see the
-- database in different states: this migration (against production, which has
-- fifteen sprints of `COD-` keys) and `supabase/seed.sql` (which creates the
-- projects first and the keys second, so the insert-time trigger can only ever
-- guess). Without the second call, a local reset would leave MEINEvim on `MEI`
-- while production kept `COD`, and every key in this repo's field notes would
-- be about a different database.
create or replace function public.rebalance_project_keys()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  -- The project that owns the most items under a prefix keeps that prefix.
  -- `distinct on` twice: once so a prefix goes to one project, once so a
  -- project claims one prefix. In today's data both collapse to "MEINEvim
  -- keeps COD".
  with per_prefix as (
    select split_part(w.key, '-', 1) as prefix, s.project_id, count(*) as n
    from public.work_items w
    join public.sprints s on s.id = w.sprint_id
    where w.key ~ '^[A-Z][A-Z0-9]*-\d+$'
    group by 1, 2
  ),
  prefix_owner as (
    select distinct on (prefix) prefix, project_id, n from per_prefix
    order by prefix, n desc, project_id
  ),
  project_prefix as (
    select distinct on (project_id) project_id, prefix from prefix_owner
    order by project_id, n desc, prefix
  )
  update public.projects p
  set key_prefix = pp.prefix
  from project_prefix pp
  where pp.project_id = p.id
    and p.key_prefix is distinct from pp.prefix;

  -- Anything still without one — a project that has never held an item.
  for r in select id, slug from public.projects where key_prefix is null order by created_at, id loop
    update public.projects set key_prefix = public.derive_key_prefix(r.slug, r.id) where id = r.id;
  end loop;

  -- Start each counter above the highest number its prefix has ever issued —
  -- across every project, not just this one. `COD-243` belongs to Converso and
  -- `COD` belongs to MEINEvim; scoping this per project would hand out a key
  -- that already exists.
  update public.projects p
  set next_key_number = greatest(p.next_key_number, coalesce((
    select max((regexp_match(w.key, '^' || p.key_prefix || '-(\d+)$'))[1]::int)
    from public.work_items w
    where w.key like p.key_prefix || '-%'
  ), 0) + 1);
end;
$$;

comment on function public.rebalance_project_keys is
  'Idempotent. Gives each project the prefix its own items already use and advances every counter past it. Called by this migration and by the seed, which build the same rows in opposite orders.';

-- A project created from the app has no items to learn from, so it takes its
-- slug at insert time. `rebalance_project_keys` corrects it later if items
-- arrive carrying a different prefix — which is what an import does.
create or replace function public.assign_project_key_prefix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key_prefix is null or new.key_prefix = '' then
    new.key_prefix := public.derive_key_prefix(new.slug, new.id);
  end if;
  return new;
end;
$$;

create trigger projects_assign_key_prefix
  before insert on public.projects
  for each row execute function public.assign_project_key_prefix();

select public.rebalance_project_keys();

alter table public.projects
  alter column key_prefix set not null,
  add constraint projects_key_prefix_shape check (key_prefix ~ '^[A-Z][A-Z0-9]{1,7}$'),
  add constraint projects_key_prefix_key unique (key_prefix);

-- The sequence default goes. `work_item_key_seq` itself stays: the seed and
-- `scripts/import-notion-export.mjs` both `setval` it and
-- `supabase/tests/seed.sql` asserts on it, and a sequence nothing reads costs
-- nothing. It is no longer how a key is issued.
--
-- The default becomes the empty string rather than being dropped outright, and
-- that is deliberate on two counts. A BEFORE INSERT trigger runs before the NOT
-- NULL check, so the column could have no default at all and still be filled —
-- but PostgREST's type generator reads "not null, no default" as "the caller
-- must supply this", and every insert in the app would have to invent a key it
-- is not allowed to choose. The empty string is the placeholder the trigger
-- replaces, and the check constraint below is what proves it did: a check runs
-- after BEFORE triggers, so a row can only land with a well-formed key.
alter table public.work_items alter column key set default '';

alter table public.work_items
  add constraint work_items_key_shape check (key ~ '^[A-Z][A-Z0-9]{1,7}-\d+$');

create or replace function public.assign_work_item_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_number int;
begin
  -- The seed and the Notion importer state their own keys, and a stated key is
  -- never overwritten: those are the rows whose numbering is already in
  -- somebody's export.
  if new.key is not null and new.key <> '' then
    return new;
  end if;

  -- Invariant 1: the project comes from the item's own sprint, never from the
  -- caller. `update … returning` is the lock — two inserts against the same
  -- project serialise here rather than reading the same number twice.
  --
  -- SECURITY DEFINER because `projects` is admin/lead-writable and this is not
  -- the caller writing to it. Without it RLS would filter the row, the RETURNING
  -- would come back empty, and the insert would fail with something unreadable.
  --
  -- The loop is the self-heal. A counter can only ever be BEHIND — an import
  -- that states its own keys, a restore, a rebalance that has not run yet — and
  -- a behind counter would hand out a key that exists and fail the unique index
  -- with a message nobody can act on. Each turn advances the counter, and the
  -- check is an equality lookup on `work_items_key_key`, so it costs one index
  -- probe and terminates.
  loop
    update public.projects p
       set next_key_number = p.next_key_number + 1
     where p.id = (select s.project_id from public.sprints s where s.id = new.sprint_id)
    returning p.key_prefix, p.next_key_number - 1 into v_prefix, v_number;

    if v_prefix is null then
      raise exception 'that sprint has no project, so an item key cannot be derived'
        using errcode = '23503';
    end if;

    new.key := v_prefix || '-' || v_number;
    exit when not exists (select 1 from public.work_items w where w.key = new.key);
  end loop;

  return new;
end;
$$;

comment on function public.assign_work_item_key is
  'Issues COD-140-style keys from the item''s own project. A stated key is left alone; existing keys are immutable.';

create trigger work_items_assign_key
  before insert on public.work_items
  for each row execute function public.assign_work_item_key();

-- ---------------------------------------------------------------------------
-- 2. Slug aliases.
-- ---------------------------------------------------------------------------

create table public.project_slug_aliases (
  slug       text primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.project_slug_aliases is
  'Every slug a project has ever had. A rename keeps the old URL working instead of 404ing every bookmark the team has.';

create index project_slug_aliases_project_idx on public.project_slug_aliases (project_id);

alter table public.project_slug_aliases enable row level security;

create policy "active members read slug aliases" on public.project_slug_aliases
  for select to authenticated using (public.is_active_member());
create policy "leads write slug aliases" on public.project_slug_aliases
  for insert to authenticated with check (public.is_admin_or_lead());
create policy "leads delete slug aliases" on public.project_slug_aliases
  for delete to authenticated using (public.is_admin_or_lead());

grant select, insert, delete on public.project_slug_aliases to authenticated;

-- A live slug and an alias share one namespace, or "which project is
-- /app/projects/x?" has two answers. The trigger is the only place that can
-- check across both tables.
create or replace function public.guard_slug_namespace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'projects' then
    if exists (
      select 1 from public.project_slug_aliases a
      where a.slug = new.slug and a.project_id is distinct from new.id
    ) then
      raise exception 'that address already belongs to another project' using errcode = '23505';
    end if;
    -- Renaming back to a slug this project used before: the alias is redundant
    -- now that it is live again.
    delete from public.project_slug_aliases where slug = new.slug;
  else
    if exists (select 1 from public.projects p where p.slug = new.slug) then
      raise exception 'that address is a live project address' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_guard_slug_namespace
  before insert or update of slug on public.projects
  for each row execute function public.guard_slug_namespace();

create trigger slug_aliases_guard_namespace
  before insert on public.project_slug_aliases
  for each row execute function public.guard_slug_namespace();

-- ---------------------------------------------------------------------------
-- 3. order_index, assigned under a lock.
-- ---------------------------------------------------------------------------

-- The default was `0`, which is a real position — so "I did not say" and "put it
-- first" were the same value and neither caller could express the other. It
-- becomes `-1`, which is not a position: negative means append, and appending
-- is what every caller in this app actually wants.
alter table public.work_items          alter column order_index set default -1;
alter table public.acceptance_criteria alter column order_index set default -1;

create or replace function public.assign_order_index()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next int;
begin
  -- A stated position is honoured. The seed and the Notion importer both
  -- number their own rows, and those numbers are the order somebody chose.
  if new.order_index is not null and new.order_index >= 0 then
    return new;
  end if;

  if tg_table_name = 'work_items' then
    -- The lock, and the whole point of this trigger. `for no key update` is the
    -- weakest lock that still serialises us against another insert doing the
    -- same thing; it does not block a reader and it does not block an update to
    -- the sprint's own columns.
    perform 1 from public.sprints where id = new.sprint_id for no key update;
    select coalesce(max(w.order_index), -1) + 1 into v_next
      from public.work_items w where w.sprint_id = new.sprint_id;
  else
    perform 1 from public.work_items where id = new.work_item_id for no key update;
    select coalesce(max(c.order_index), -1) + 1 into v_next
      from public.acceptance_criteria c where c.work_item_id = new.work_item_id;
  end if;

  new.order_index := v_next;
  return new;
end;
$$;

comment on function public.assign_order_index is
  'Appends, under a row lock on the parent. A caller that omits order_index cannot collide with another caller doing the same thing; a caller that states one is left alone.';

create trigger work_items_assign_order_index
  before insert on public.work_items
  for each row execute function public.assign_order_index();

create trigger criteria_assign_order_index
  before insert on public.acceptance_criteria
  for each row execute function public.assign_order_index();
