-- Coditu — "member" now means "internal member".
--
-- This is the migration that closes the boundary, and it does it by changing
-- two function bodies rather than by editing a single policy.
--
-- ── Why not edit the policies ───────────────────────────────────────────────
--
-- There are eleven `for select … using (public.is_active_member())` policies,
-- written across six migrations, on `profiles`, `clients`, `projects`,
-- `sprints`, `work_items`, `acceptance_criteria`, `time_entries`, `comments`,
-- `comment_mentions`, `attachments`, `activity`, `components`, `app_settings`,
-- `sprint_payouts`, `sprint_payout_shares` and `project_slug_aliases`.
--
-- Editing each one would work today and rot tomorrow: the failure mode of that
-- approach is the TWELFTH policy, written next month by somebody following the
-- pattern of the eleven, which would be open to clients and would look exactly
-- like every policy around it. `docs/07-FIELD-NOTES.md` calls this shape "an
-- allowlist written as a denylist" and this repository has paid for it three
-- times.
--
-- One function, one definition, and every policy that already exists — and
-- every policy anybody writes after this — inherits the right meaning without
-- knowing that client accounts are a thing.
--
-- ── The measured before-and-after ───────────────────────────────────────────
--
-- Run against the local database with a client fixture in place, BEFORE this
-- migration, `supabase/tests/rls.sql` reported fifteen failures: a client
-- account read every work item, every internal comment, every time entry,
-- every activity row, every confirmed payout, the hourly rate, and all six
-- profiles. That is not a hypothetical — it is what `select plan()` printed.

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.account_kind = 'internal'
  )
$$;

comment on function public.is_active_member is
  'True for a signed-in, active, INTERNAL account. This is the predicate behind every broad read policy in the schema, so a client contact reads nothing through any base table — by construction, not by remembering to filter.';

-- `auth_role()` gains the same clause, and it matters as much.
--
-- Without it a client contact would come back as `'engineer'`, and the twenty
-- server actions that ask "is this person an engineer?" would get a truthful
-- answer to the wrong question. With it the answer is NULL, so `= 'admin'`,
-- `= 'engineer'` and `in ('admin','lead')` are all false — a client cannot be
-- on the permissive side of any comparison, including comparisons written
-- after this migration by somebody who has never heard of client accounts.
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
    and p.account_kind = 'internal'
$$;

comment on function public.auth_role is
  'The caller''s role, or null when they are not a signed-in active INTERNAL profile. A client contact has no role: every role comparison must be false for them, not merely non-admin.';

-- ---------------------------------------------------------------------------
-- `is_admin_or_lead()` must return a BOOLEAN, not a three-valued one.
--
-- This was found by the test above and it is not cosmetic. The body was:
--
--     select public.auth_role() in ('admin','lead')
--
-- `auth_role()` never returned null before this migration — every caller was an
-- active profile with a role. Now a client contact makes it null, and
-- `null in ('admin','lead')` evaluates to **NULL**, not false.
--
-- Where that is survivable: an RLS `using` clause treats null as not-true, and
-- a `with check` clause rejects on anything that is not true. Both fail closed,
-- so the eleven policies built on this were never exposed.
--
-- Where it would not have been survivable: any plpgsql that writes
-- `if not public.is_admin_or_lead() then raise …`. `not null` is null, null is
-- not true, and the `if` does not fire — so the guard silently permits. There
-- is no such caller in the schema today, which is precisely why this is worth
-- fixing now rather than after somebody writes the obvious next guard.
--
-- A function whose whole job is to answer a yes/no security question should
-- never be able to answer "maybe".
-- ---------------------------------------------------------------------------

create or replace function public.is_admin_or_lead()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.auth_role() in ('admin','lead'), false)
$$;

comment on function public.is_admin_or_lead is
  'True only for an active internal admin or lead. Returns false, never null — a client contact has no role, and `null in (…)` is null, which reads as "maybe" to every caller that is not an RLS policy.';

-- ---------------------------------------------------------------------------
-- One row a client still has to be able to read: her own.
--
-- `getClientContact()` renders her name, and the account menu shows her email.
-- Tightening `is_active_member()` took her own profile away along with
-- everybody else's, so this gives exactly that one row back.
--
-- A second PERMISSIVE policy, so the two OR together: an internal member keeps
-- reading the whole team through the existing policy, and everybody — internal
-- or client — can read themselves through this one. It is scoped by primary
-- key, so it can never return a second row.
--
-- Note what this does NOT do: it is a `for select` policy only. Writing your
-- own profile is still `"own profile update"` plus
-- `guard_profile_privilege_columns`, which now names `account_kind`.
-- ---------------------------------------------------------------------------

create policy "own profile read" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

comment on policy "own profile read" on public.profiles is
  'You can always read yourself. The only profile row a client contact may see — the team is not enumerable from a client session.';
