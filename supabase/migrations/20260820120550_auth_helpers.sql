-- Coditu — authorization helpers.
--
-- Deliberately AFTER the tables they read. A `language sql` function has its
-- body parsed and its references resolved at creation time, so these cannot
-- live alongside the enums in the first migration: `public.profiles` does not
-- exist yet at that point and the migration fails.

-- ---------------------------------------------------------------------------
-- Authorization helpers.
--
-- SECURITY DEFINER on purpose. A policy on `profiles` that reads `profiles` to
-- decide whether you may read `profiles` recurses forever; a definer function
-- runs with the owner's rights, skips RLS, and breaks the cycle. They are
-- STABLE so the planner calls them once per statement rather than once per row.
--
-- `set search_path = ''` is not optional on a definer function: without it a
-- caller can prepend a schema they control and have the function resolve
-- `profiles` to their own table.
-- ---------------------------------------------------------------------------

create or replace function public.auth_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
$$;

comment on function public.auth_role is
  'The caller''s role, or null when they are not a signed-in active profile. Never trust a client-supplied role.';

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  )
$$;

create or replace function public.is_admin_or_lead()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_role() in ('admin','lead')
$$;

-- Invariant 1, in one function: an item's project is always re-derived from the
-- item's own sprint. Nothing anywhere accepts a client-supplied project id.
create or replace function public.work_item_project_id(item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.project_id
  from public.work_items w
  join public.sprints s on s.id = w.sprint_id
  where w.id = item_id
$$;

comment on function public.work_item_project_id is
  'Invariant 1: derive an item''s project from its own sprint, never from client-supplied state.';
