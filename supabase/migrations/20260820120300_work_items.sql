-- Coditu — work items, their acceptance criteria, and logged time.

-- Keys are COD-140 upward. The sequence starts at 140 because that is where the
-- team's real numbering is: the seed transcribes COD-140..COD-151 from the
-- design bundle, and a fresh item must not collide with them.
create sequence public.work_item_key_seq start with 140;

create table public.work_items (
  id              uuid primary key default gen_random_uuid(),
  sprint_id       uuid not null references public.sprints (id) on delete cascade,
  key             text not null unique default ('COD-' || nextval('public.work_item_key_seq')),
  title           text not null,
  description     text,
  -- A first-class column, not a markdown convention inside `description`: the
  -- table, the item detail, the Markdown export and the PDF each render it
  -- distinctly, and "find the bold paragraph" is not a data model.
  highlight       text,
  status          work_item_status not null default 'todo',
  type            work_item_type not null default 'story',
  assignee_id     uuid references public.profiles (id) on delete set null,
  reviewer_id     uuid references public.profiles (id) on delete set null,
  deadline        date,
  estimate_minutes int check (estimate_minutes is null or estimate_minutes >= 0),
  -- Trigger-maintained rollup of time_entries.minutes. Denormalised on purpose:
  -- the table renders a per-row number AND a footer sum on every paint, and an
  -- aggregate per render is the wrong trade. See the trigger below.
  minutes_logged  int not null default 0 check (minutes_logged >= 0),
  grouping        smallint check (grouping is null or grouping > 0),
  order_index     int not null default 0,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.work_items.highlight is
  'The "discuss before implementing" note. First-class, because four surfaces render it distinctly.';
comment on column public.work_items.minutes_logged is
  'Trigger-maintained rollup of time_entries.minutes. Invariant 2: integer minutes.';
comment on column public.work_items.grouping is
  'Items sharing an integer overlap in logic/UI and are taken by one developer. Hue is deterministic per integer — see lib/work-items.ts.';

create trigger work_items_set_updated_at
  before update on public.work_items
  for each row execute function public.set_updated_at();

-- `closed_at` tracks `status = 'done'` automatically so the two can never
-- disagree — a "done" item with no closed_at makes every cycle-time number wrong.
create or replace function public.sync_work_item_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.status <> 'done' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger work_items_sync_closed_at
  before insert or update of status on public.work_items
  for each row execute function public.sync_work_item_closed_at();

create table public.acceptance_criteria (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  body         text not null,
  is_done      boolean not null default false,
  order_index  int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.time_entries (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  -- Invariant 2. Integer minutes, bounded to a plausible day.
  minutes      int not null check (minutes > 0 and minutes <= 1440),
  -- Invariant 5: a calendar date, not a timestamp.
  worked_on    date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);

comment on column public.time_entries.minutes is
  'Invariant 2: integer minutes, never floating hours. Summing floats drifts, and this app''s whole credibility is its sums.';

-- The rollup. Recomputed rather than incremented: an increment that misses one
-- event drifts silently forever, and this number is the one the client sees.
create or replace function public.refresh_minutes_logged()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.work_item_id, old.work_item_id);
begin
  update public.work_items w
  set minutes_logged = coalesce(
    (select sum(t.minutes) from public.time_entries t where t.work_item_id = target), 0
  )
  where w.id = target;

  -- An UPDATE that moves an entry between items has to fix both sides.
  if tg_op = 'UPDATE' and old.work_item_id is distinct from new.work_item_id then
    update public.work_items w
    set minutes_logged = coalesce(
      (select sum(t.minutes) from public.time_entries t where t.work_item_id = old.work_item_id), 0
    )
    where w.id = old.work_item_id;
  end if;

  return null;
end;
$$;

create trigger time_entries_refresh_rollup
  after insert or update or delete on public.time_entries
  for each row execute function public.refresh_minutes_logged();
