-- Coditu — the scope chain. Invariant 1 lives here:
-- a work item belongs to a sprint, a sprint to a project, a project to a client.
-- Nothing is global.

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  website_url text,
  logo_path   text,
  accent_hex  text check (accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete restrict,
  name        text not null,
  slug        text not null unique,
  scope       text,
  accent_hex  text check (accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.projects.client_id is
  'on delete restrict: deleting a client that still has projects would orphan every item beneath it. Archive instead.';

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table public.sprints (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  number          int not null check (number > 0),
  name            text not null,
  -- Invariant 5: calendar dates carry no timezone.
  starts_on       date,
  ends_on         date,
  goal            text,
  notes           text,
  notes_author_id uuid references public.profiles (id) on delete set null,
  status          sprint_status not null default 'planned',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, number),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- At most one active sprint per project. A partial unique index says this once,
-- in the only place that cannot be bypassed; application code checking it would
-- lose the race with a second concurrent write.
create unique index sprints_one_active_per_project
  on public.sprints (project_id)
  where status = 'active';

create trigger sprints_set_updated_at
  before update on public.sprints
  for each row execute function public.set_updated_at();
