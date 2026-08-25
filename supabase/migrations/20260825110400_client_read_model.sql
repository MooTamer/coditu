-- Coditu — the client read boundary.
--
-- ── Why these are functions and not policies ────────────────────────────────
--
-- RLS filters ROWS, not COLUMNS. `work_items` carries `description`,
-- `highlight`, `assignee_id`, `reviewer_id`, `minutes_logged`, `grouping` and
-- `key` in the same row as the title. A policy permissive enough to show a
-- client the title would show her all of it, and the only way back from that is
-- a `select` list somebody has to remember to keep narrow on every query — a
-- rule, not a boundary.
--
-- So the base tables stay closed to clients (asserted: zero rows from every one
-- of them) and the entire client-facing surface of this database is the handful
-- of functions below. Each one:
--
--   * is `security definer` with `search_path = ''`, so a caller cannot shadow
--     `public` with a schema they control;
--   * checks the capability INSIDE its own body via `client_has_capability()`,
--     not in a policy, because a definer function bypasses RLS by construction
--     and an unguarded one is a public read wearing a friendly name;
--   * is revoked from `public` and `anon` — a definer function in `public` gets
--     EXECUTE granted to PUBLIC by default, which is the trap
--     `allowlist_claimed()` documents;
--   * names its columns. There is no `select *` anywhere in this file and there
--     must never be: `select *` is how a column added next year becomes a leak
--     nobody wrote.
--
-- ── Aggregates ──────────────────────────────────────────────────────────────
--
-- Every count and every sum is computed over client-visible rows ONLY, inside
-- the function, in the same query that returns the list. This is the difference
-- between "the hidden row is filtered out of the list" and "the hidden row does
-- not exist" — a client reading "3 pieces of work" beside a list of one has
-- been told the other two are there.
--
-- ── Effort ──────────────────────────────────────────────────────────────────
--
-- Hours come back NULL when `view_effort` was not granted, rather than 0 or an
-- absent column. Zero would be a lie the UI would render as a fact; an absent
-- column would give the row two shapes and force every caller to know which one
-- it got. Null means "not shown", the type stays one thing, and invariant 2
-- holds — these are integer minutes, divided by 60 at the render edge and
-- nowhere else.

-- ---------------------------------------------------------------------------
-- The projects a contact may see.
-- ---------------------------------------------------------------------------

create or replace function public.client_projects()
returns table (
  project_id  uuid,
  name        text,
  slug        text,
  client_name text,
  accent_hex  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.slug, cl.name, p.accent_hex
  from public.client_contacts       c
  join public.profiles              pr on pr.id = c.profile_id
  join public.client_project_grants g  on g.contact_profile_id = c.profile_id
  join public.projects              p  on p.id = g.project_id
  join public.clients               cl on cl.id = p.client_id
  where c.profile_id  = (select auth.uid())
    and pr.is_active
    and pr.account_kind = 'client'
    and c.status        = 'active'
    and g.revoked_at   is null
    and p.client_id     = c.client_id
    and not p.is_archived
    and 'view_project' = any (g.capabilities)
  order by p.name
$$;

comment on function public.client_projects is
  'Projects this client contact may see, client-safe columns only. Note what is absent: scope, key_prefix, next_key_number, is_archived. Returns nothing for an internal account.';

revoke all on function public.client_projects() from public, anon;
grant execute on function public.client_projects() to authenticated;

-- ---------------------------------------------------------------------------
-- The published components of one project.
--
-- `p_project_id` is supplied by the caller, and that is safe here for exactly
-- one reason: `client_has_capability()` re-derives whether THIS session may
-- read THAT project. A supplied id is a request, not a claim. Handing in
-- another company's id returns an empty set — not an error, because an error
-- that distinguishes "not yours" from "does not exist" is a way to enumerate
-- which projects exist.
-- ---------------------------------------------------------------------------

create or replace function public.client_components(p_project_id uuid)
returns table (
  component_id   uuid,
  name           text,
  slug           text,
  summary        text,
  item_count     int,
  done_count     int,
  minutes_logged int,
  last_activity  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    comp.id,
    comp.name,
    comp.slug,
    comp.client_summary,
    -- Counted over published, undeleted work only. An unpublished item does not
    -- appear in the list and must not appear in the number beside it either.
    count(w.id) filter (where w.id is not null)::int,
    count(w.id) filter (where w.status = 'done')::int,
    case
      when public.client_has_capability(p_project_id, 'view_effort')
        then coalesce(sum(w.minutes_logged), 0)::int
      else null
    end,
    max(w.updated_at)
  from public.components comp
  left join public.work_items w
    on w.component_id        = comp.id
   and w.client_published_at is not null
   and w.deleted_at          is null
  where comp.project_id   = p_project_id
    and comp.published_at is not null
    and not comp.is_archived
    and public.client_has_capability(p_project_id, 'view_components')
  group by comp.id, comp.name, comp.slug, comp.client_summary
  order by comp.name
$$;

comment on function public.client_components is
  'Published components of one granted project, with counts computed over published work only. Hours are null unless view_effort was granted — null rather than zero, because zero is a lie the UI would render as a fact.';

revoke all on function public.client_components(uuid) from public, anon;
grant execute on function public.client_components(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The published work under one component.
--
-- What is NOT selected here is the point of the function: no `key` (COD-229
-- means nothing to a client and everything to anyone guessing URLs), no
-- `description`, no `highlight` (the discuss-before-implementing note), no
-- `assignee_id` or `reviewer_id`, no `grouping`, no `estimate_minutes`, and no
-- raw status — `status_label` is the humanised string, chosen in SQL so the
-- enum value never crosses the wire at all.
-- ---------------------------------------------------------------------------

create or replace function public.client_component_work(
  p_project_id   uuid,
  p_component_id uuid
)
returns table (
  work_item_id uuid,
  title        text,
  summary      text,
  status_label text,
  is_done      boolean,
  deadline     date,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.id,
    -- The rewrite when there is one, the internal title when there is not.
    -- Curated at the component, reused at the item.
    coalesce(nullif(btrim(w.client_title), ''), w.title),
    w.client_summary,
    case w.status
      when 'draft'             then 'Not scoped yet'
      when 'ready'             then 'Not started'
      when 'in_progress'       then 'In progress'
      when 'in_peer_review'    then 'In peer review'
      when 'in_qa'             then 'In QA'
      when 'changes_requested' then 'Changes requested'
      when 'done'              then 'Done'
      when 'blocked'           then 'Blocked'
    end,
    w.status = 'done',
    -- A deadline is a promise made to this client, so it travels; but only
    -- when they were given the sprint context to read it against.
    case when public.client_has_capability(p_project_id, 'view_current_sprint')
      then w.deadline else null end,
    w.client_published_at
  from public.work_items w
  join public.components comp on comp.id = w.component_id
  where w.component_id        = p_component_id
    and comp.project_id       = p_project_id
    and comp.published_at    is not null
    and w.client_published_at is not null
    and w.deleted_at         is null
    and public.client_has_capability(p_project_id, 'view_work')
  order by w.client_published_at desc, w.order_index
$$;

comment on function public.client_component_work is
  'Published work under one component. The status is humanised in SQL so the enum value never crosses the wire; there is no key, no description, no highlight, no assignee and no estimate in the result at all.';

revoke all on function public.client_component_work(uuid, uuid) from public, anon;
grant execute on function public.client_component_work(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The current sprint, in client language.
--
-- Progress is expressed as published items done over published items total,
-- NOT as hours over estimate. Hours are a separate capability and a separate
-- conversation; a percentage that silently encodes them would hand out
-- `view_effort` to everyone who could see a progress bar.
-- ---------------------------------------------------------------------------

create or replace function public.client_current_sprint(p_project_id uuid)
returns table (
  name           text,
  goal           text,
  starts_on      date,
  ends_on        date,
  total_items    int,
  done_items     int,
  minutes_logged int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.name,
    s.goal,
    s.starts_on,
    s.ends_on,
    count(w.id) filter (where w.id is not null)::int,
    count(w.id) filter (where w.status = 'done')::int,
    case
      when public.client_has_capability(p_project_id, 'view_effort')
        then coalesce(sum(w.minutes_logged), 0)::int
      else null
    end
  from public.sprints s
  left join public.work_items w
    on w.sprint_id           = s.id
   and w.client_published_at is not null
   and w.deleted_at          is null
  where s.project_id = p_project_id
    and s.status     = 'active'
    and public.client_has_capability(p_project_id, 'view_current_sprint')
  group by s.id, s.name, s.goal, s.starts_on, s.ends_on
$$;

comment on function public.client_current_sprint is
  'The running sprint in client language. Progress is published-items-done over published-items-total, never hours over estimate — a percentage derived from hours would hand out view_effort to anyone who can see a progress bar. Sprint NOTES are never selected: they are written to the team.';

revoke all on function public.client_current_sprint(uuid) from public, anon;
grant execute on function public.client_current_sprint(uuid) to authenticated;
