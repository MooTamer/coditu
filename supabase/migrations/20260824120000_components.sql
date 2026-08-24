-- Coditu — the component registry, and the column that ties a work item to it.
--
-- ## What this is for
--
-- Almost every EVIM item is a change to ONE named thing: "EVIM Themen Kachel",
-- "EVIM Newspart", the React Redakteurkalender. Until now that name only ever
-- existed inside `title` — typed by hand, spelled four ways across fifteen
-- sprints — so "what has happened to the Newspart" was a text search that
-- missed as often as it hit. A component is a first-class row, chosen from a
-- list, and the item points at it.
--
-- ## Why a table and not an enum or a text column
--
-- An enum would need a migration every time the team starts a new web part, and
-- the whole point is that the team can add one. A text column is what we
-- already have inside the title, with its spellings and its typos. A row can be
-- renamed once and every item that names it follows.
--
-- ## Invariant 1
--
-- A component belongs to a project, exactly like a sprint does. An item's
-- component must come from the item's OWN project — otherwise a per-component
-- reading of EVIM's work could contain a Converso item, which is the precise
-- thing invariant 1 exists to prevent. RLS cannot express "these two rows agree
-- about their project", so a trigger does. See `guard_work_item_component_project`.

create type component_kind as enum ('react', 'spfx');

comment on type component_kind is
  'How a component is built: a React app/feature, or a SharePoint Framework web part or extension. The team maintains both and they are reviewed, built and shipped differently.';

create table public.components (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  -- URL identity: /app/projects/<project>/components/<slug>. Derived from the
  -- name when the component is created and never rewritten by a rename — a
  -- link somebody pasted into a comment in March must still resolve.
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind        component_kind not null,
  -- The glyph SharePoint puts beside this web part in the "Add a web part"
  -- toolbox: `preconfiguredEntries[0].officeFabricIconFontName` out of the
  -- solution's own manifest, stored verbatim ('Page', 'News', 'Calendar', …).
  --
  -- Verbatim, and not a name of our own, because it is a FACT about the web
  -- part that the delivery repository already states — so re-syncing is a
  -- string comparison, not a re-decision. Coditu does not ship the Fluent icon
  -- font (it would be a webfont on a route with a 110KB budget), so the name is
  -- resolved to its nearest Lucide equivalent at the render edge. Null is
  -- honest and common: the three extensions have no toolbox entry at all, and
  -- nothing in the React app has one either.
  icon        text check (icon is null or icon ~ '^[A-Za-z0-9]{1,40}$'),
  -- Retired, not deleted. An archived component keeps every item that names it
  -- and stops being offered in the pickers. There is deliberately no delete
  -- policy below: deleting one would blank the column on all of its history,
  -- and this table exists to make that history readable.
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, slug)
);

comment on table public.components is
  'The things a project is made of — one row per web part, extension or React feature. Scoped to a project like everything else in this schema.';
comment on column public.components.slug is
  'Stable URL identity, derived from the name at creation. A rename does not move it: pasted links must keep resolving.';
comment on column public.components.icon is
  'officeFabricIconFontName from the SPFx manifest — the glyph SharePoint shows in the web part toolbox. Stored verbatim so re-syncing from the delivery repo is a comparison, not a decision; mapped to a Lucide icon at the render edge.';
comment on column public.components.is_archived is
  'Retired from the pickers, still attached to its history. There is no delete: deleting a component would blank the column on every item that named it.';

create trigger components_set_updated_at
  before update on public.components
  for each row execute function public.set_updated_at();

create index components_project_idx on public.components (project_id, name);

-- ---------------------------------------------------------------------------
-- The column.
--
-- Nullable, and it stays nullable: 232 items were imported from Notion before
-- this existed and a NOT NULL would have meant inventing an answer for each of
-- them. "Not attributed yet" is a truthful state and the table renders it as
-- one.
--
-- `on delete set null` is the owner-level safety net, not a workflow — nothing
-- in the application can reach it, because nothing can delete a component.
-- ---------------------------------------------------------------------------

alter table public.work_items
  add column component_id uuid references public.components (id) on delete set null;

comment on column public.work_items.component_id is
  'The thing this item changes. Must belong to the same project as the item''s sprint — enforced by guard_work_item_component_project, not by RLS.';

create index work_items_component_idx on public.work_items (component_id) where component_id is not null;

-- ---------------------------------------------------------------------------
-- Invariant 1, as a trigger.
--
-- The project is re-derived from the item's own sprint on every write, the same
-- way every server action in `lib/actions/work-items.ts` re-derives it. Nothing
-- here trusts a project id supplied by the caller, because nothing here is
-- given one.
-- ---------------------------------------------------------------------------

create or replace function public.guard_work_item_component_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_project      uuid;
  component_project uuid;
begin
  if new.component_id is null then
    return new;
  end if;

  select s.project_id into item_project
  from public.sprints s where s.id = new.sprint_id;

  select c.project_id into component_project
  from public.components c where c.id = new.component_id;

  if component_project is null or component_project is distinct from item_project then
    raise exception 'a work item may only name a component from its own project'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.guard_work_item_component_project is
  'Invariant 1 for the component column: the component and the item''s sprint must belong to the same project. Runs on the sprint_id change too — moving an item to another project''s sprint would otherwise carry a foreign component with it.';

create trigger work_items_guard_component_project
  before insert or update of component_id, sprint_id on public.work_items
  for each row execute function public.guard_work_item_component_project();

-- ---------------------------------------------------------------------------
-- The engineer column guard, extended.
--
-- `guard_work_item_columns` is an allowlist ("status and order_index") written
-- as a denylist, so a NEW column is silently writable by an engineer until it
-- is named here. `component_id` is added for that reason and not because
-- anybody asked: who owns which component is a lead's call, the same as the
-- type and the grouping beside it.
-- ---------------------------------------------------------------------------

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
    when new.component_id     is distinct from old.component_id     then 'component_id'
    when new.assignee_id      is distinct from old.assignee_id      then 'assignee_id'
    when new.reviewer_id      is distinct from old.reviewer_id      then 'reviewer_id'
    when new.deadline         is distinct from old.deadline         then 'deadline'
    when new.estimate_minutes is distinct from old.estimate_minutes then 'estimate_minutes'
    when new.grouping         is distinct from old.grouping         then 'grouping'
    when new.sprint_id        is distinct from old.sprint_id        then 'sprint_id'
    when new.key              is distinct from old.key              then 'key'
    else null
  end;

  if changed is not null then
    raise exception 'an engineer may change only status and order_index (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity.
--
-- Retagging an item is a change to the record of what happened to a component,
-- so it belongs in the feed beside status and assignee. The name is written
-- into the row rather than the id: activity is a history, and a history that
-- reads "set component → 3f2a…" is not one.
-- ---------------------------------------------------------------------------

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

  if new.component_id is distinct from old.component_id then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'set', 'component',
            (select name from public.components where id = old.component_id),
            (select name from public.components where id = new.component_id));
  end if;

  return null;
end;
$$;

-- `create or replace trigger` rather than drop-and-create: the column list is
-- part of the trigger, not the function, so the function above would never fire
-- for a component change without this line.
create or replace trigger work_items_record_activity
  after insert or update of status, assignee_id, reviewer_id, deadline, component_id
  on public.work_items
  for each row execute function public.record_work_item_activity();

-- ---------------------------------------------------------------------------
-- RLS. Read is the same "any active member reads everything" the rest of the
-- schema uses; writing the registry is admin and lead, exactly like the
-- projects and sprints a component sits between.
--
-- No delete policy, on purpose — see `is_archived` above.
-- ---------------------------------------------------------------------------

alter table public.components enable row level security;

grant select, insert, update on public.components to authenticated;

create policy "active members read components" on public.components
  for select to authenticated using (public.is_active_member());

create policy "leads insert components" on public.components
  for insert to authenticated with check (public.is_admin_or_lead());

create policy "leads update components" on public.components
  for update to authenticated
  using (public.is_admin_or_lead())
  with check (public.is_admin_or_lead());
