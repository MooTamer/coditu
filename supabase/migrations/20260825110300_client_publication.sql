-- Coditu — publication. What a client has been shown ON PURPOSE.
--
-- Granting a project does not make everything in it client-visible. Being
-- inside a project a client can reach is not the same as having been shown to
-- them deliberately, and the difference has to be a column rather than a
-- convention — a convention is a thing somebody forgets on the Friday of a
-- release.
--
-- ── Curated at the component, reused at the item ────────────────────────────
--
-- The alternative designs were both worse. Requiring a hand-written summary for
-- every work item is fourteen pieces of writing per sprint, every sprint, and a
-- feature that costs that much on a four-person team stops being used in week
-- three — an unused publication model publishes nothing, which is safe and
-- useless. Reusing internal text wholesale is cheap and wrong: titles are
-- written by engineers for engineers.
--
-- So: a COMPONENT carries a summary written once, for this client, and cannot
-- be published without one. It changes rarely, so the cost is paid once. A WORK
-- ITEM defaults to its own title, with an optional rewrite when the internal
-- one would not do.
--
-- `description` and `highlight` are exposed by NOTHING, ever. `highlight` is
-- the discuss-before-implementing note; it is the single most internal sentence
-- on a work item and it sits in a column right next to the ones being added
-- here.

alter table public.components
  add column client_summary text,
  add column published_at   timestamptz;

comment on column public.components.client_summary is
  'What this component is, written for the client. Required before it can be published — the check constraint below, not a convention.';

comment on column public.components.published_at is
  'When this component was deliberately shown to the client. Null means internal, which is the default and the safe direction.';

-- Publishing without a summary is refused by the DATABASE, not by the form.
-- The form is not the boundary; a Server Action, a psql session and a future
-- importer all reach this table, and only one of them has the form.
alter table public.components
  add constraint components_published_needs_summary check (
    published_at is null
    or (client_summary is not null and length(btrim(client_summary)) > 0)
  );

-- The index the client component list asks for, and nothing else: published
-- components of one project. Partial, because an unpublished one is never the
-- answer to a client-facing question.
create index components_published_idx
  on public.components (project_id, name) where published_at is not null;

alter table public.work_items
  add column client_published_at timestamptz,
  add column client_title        text check (client_title is null or length(btrim(client_title)) > 0),
  add column client_summary      text;

comment on column public.work_items.client_published_at is
  'When this item was deliberately included in what the client sees. Null means internal. Belonging to a granted project is not enough and never will be.';

comment on column public.work_items.client_title is
  'An optional client-safe rewrite. Null means the internal title is fine to show — which is the common case, and the reason this is optional rather than required.';

comment on column public.work_items.client_summary is
  'An optional sentence for the client. NOT a mirror of `description`, which is never exposed, and never a home for `highlight`, which is the discuss-before-implementing note.';

create index work_items_client_published_idx
  on public.work_items (component_id, client_published_at)
  where client_published_at is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- The three new columns, NAMED in the guard.
--
-- `guard_work_item_columns` is an allowlist written as a denylist: an engineer
-- may change `status` and `order_index`, and the function enforces that by
-- listing everything they may NOT change. So a new column is writable by any
-- assignee until it appears here. `component_id`, `body_json` and `deleted_at`
-- each had to be retrofitted after the fact; `07-FIELD-NOTES.md` has the entry.
--
-- These three are being named in the same migration that creates them, which is
-- the only moment it is free. Publishing to a client is a decision about what
-- leaves the company — it belongs with admin and lead, alongside assigning work
-- and moving an item between sprints.
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
    when new.title               is distinct from old.title               then 'title'
    when new.description         is distinct from old.description         then 'description'
    when new.highlight           is distinct from old.highlight           then 'highlight'
    when new.type                is distinct from old.type                then 'type'
    when new.assignee_id         is distinct from old.assignee_id         then 'assignee_id'
    when new.reviewer_id         is distinct from old.reviewer_id         then 'reviewer_id'
    when new.deadline            is distinct from old.deadline            then 'deadline'
    when new.estimate_minutes    is distinct from old.estimate_minutes    then 'estimate_minutes'
    when new.grouping            is distinct from old.grouping            then 'grouping'
    when new.sprint_id           is distinct from old.sprint_id           then 'sprint_id'
    when new.key                 is distinct from old.key                 then 'key'
    when new.component_id        is distinct from old.component_id        then 'component_id'
    when new.deleted_at          is distinct from old.deleted_at          then 'deleted_at'
    when new.client_published_at is distinct from old.client_published_at then 'client_published_at'
    when new.client_title        is distinct from old.client_title        then 'client_title'
    when new.client_summary      is distinct from old.client_summary      then 'client_summary'
    else null
  end;

  if changed is not null then
    raise exception 'an engineer may change only status and order_index (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_work_item_columns is
  'Per-column half of the work_items update rule. The policy picks the rows; this picks the columns. It is an allowlist written as a DENYLIST, so a new column is writable by an assignee until it is named here — three have already had to be retrofitted.';

-- ---------------------------------------------------------------------------
-- The same rule for a component's client-facing columns.
--
-- `components` had no column guard at all, because until now every column on it
-- was equally internal and the row policy was the whole story. `client_summary`
-- and `published_at` change that: they decide what leaves the company, so they
-- need the same admin/lead restriction the work-item columns just got.
-- ---------------------------------------------------------------------------

create or replace function public.guard_component_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;

  if new.client_summary is distinct from old.client_summary
     or new.published_at is distinct from old.published_at then
    raise exception 'only an admin or lead decides what a client sees'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger components_guard_publication
  before update on public.components
  for each row execute function public.guard_component_publication();
