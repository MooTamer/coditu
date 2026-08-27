-- Coditu — the workspace redesign and client access, as one migration.
--
-- ## What this is
--
-- Twenty-four migrations, written between 2026-08-25 11:00 and 2026-08-26
-- 21:13, none of which production has ever seen. `supabase migration list
-- --linked` had the hosted project at `20260825100000` the whole time they were
-- being written, so they were still a draft in the only sense that matters:
-- nothing had been applied anywhere but a laptop.
--
-- They are one file now because they will be applied in one go, by hand, and
-- twenty-four rows in `supabase_migrations.schema_migrations` for a single
-- deployment is twenty-four things to reconcile if any part of it needs
-- looking at later.
--
-- ## Why it is a concatenation and not a schema dump
--
-- Because `supabase migration squash` produces a *schema*, and this is not only
-- a schema. Ten of the twenty-four carry data: `work_item_components`
-- back-fills the join table from the column it replaces and builds the
-- compatibility mirror, `document_revisions` seeds a first version for every
-- story that already had a description, `trash` back-fills `deleted_at`,
-- `access_events` and `client_accounts` protect and stamp existing rows. A
-- squash that captured the final shape of the tables and dropped those
-- statements would produce a database with the right columns and none of the
-- content, and it would do it silently.
--
-- So the original SQL is preserved verbatim, in chronological order, each
-- section under the name of the file it came from. Nothing was rewritten,
-- reordered or deduplicated: a later `create or replace function` that
-- supersedes an earlier one in this same file is left doing exactly that,
-- because the sequence is the behaviour and the end state is what it produces.
-- It is longer than it needs to be and it is provably the same.
--
-- ## Applying it
--
-- One transaction, like every other migration file. Checked before it was
-- built: no `alter type … add value`, no `create index concurrently`, no psql
-- meta-command, no explicit `begin`/`commit` in any of the twenty-four, so
-- nothing here needs its own transaction to be correct.
--
-- ## The mapping
--
-- Every version below was DELETED from `supabase/migrations` when this file was
-- written, and none of them was ever applied remotely. `06-PROGRESS.md` and
-- `05-DECISIONS.md` still name several of them, and those references are left
-- alone — they are the record of when a decision was made, not an instruction
-- to go and read a file.
--
--   20260825110000  client_accounts
--   20260825110100  internal_only_reads
--   20260825110200  client_access
--   20260825110300  client_publication
--   20260825110400  client_read_model
--   20260825110500  invitation_decides_account_kind
--   20260825110600  client_threads
--   20260825110700  client_thread_read_model
--   20260825120000  work_item_components
--   20260825120100  tag_activity_survives_a_cascade
--   20260825120200  client_reads_every_tag
--   20260825130000  block_documents
--   20260825140000  document_revisions
--   20260825150000  writes_that_survive_a_retry
--   20260825160000  trash
--   20260825170000  private_realtime_channels
--   20260825180000  purging_a_comment_takes_its_history
--   20260826090000  saved_views
--   20260826120000  favourites
--   20260826140000  access_events
--   20260826170000  recovery_runs
--   20260826180000  revoke_truncate
--   20260826210518  audit_events_survive_a_cascade
--   20260826211339  maintenance_rpc_is_not_an_endpoint
--
-- ===========================================================================



-- ===========================================================================
-- 20260825110000_client_accounts.sql
-- ===========================================================================

-- Coditu — a second kind of account.
--
-- Until now this application had exactly one kind of person in it: an active
-- `profiles` row, which by policy reads every row of every table. "Small team,
-- full transparency" is written into `20260820120600_rls.sql` as eleven
-- `is_active_member()` read policies, and it is the right rule for four people
-- who work together.
--
-- It is the wrong rule for a client contact.
--
-- ── Why this is a column and not a fourth `app_role` ────────────────────────
--
-- Adding `'client'` to `app_role` is the smaller diff and the larger hole.
-- Twenty-two call sites across `lib/actions/**` and two page components are
-- written as
--
--     if (profile.role === "engineer") return { ok: false, error: … }
--
-- — a DENYLIST. Everything that is not an engineer is privileged. A fourth
-- enum value is "not an engineer", so a client contact would fall through all
-- twenty-two of them and be able to reassign work items, create sprints, and
-- commit a Notion import.
--
-- This repository has been caught by exactly this shape three times already —
-- `guard_work_item_columns` is an allowlist written as a denylist, and
-- `component_id`, `body_json` and `deleted_at` each had to be added to it after
-- the fact. `docs/07-FIELD-NOTES.md` has the entry. The lesson is not "remember
-- to update the denylist"; it is "stop adding values that a denylist has to
-- learn about".
--
-- `account_kind` is orthogonal, and nothing anywhere reads it as a negative.
-- A client is not a role that can be mistaken for a permissive default — it is
-- a different kind of account, and every check asks for `'internal'` by name.
--
-- The boundary itself is closed in the NEXT migration, which redefines
-- `is_active_member()`. This one only introduces the concept, so that the
-- migration which changes the meaning of eleven existing policies is a diff
-- somebody can read on its own.

create type account_kind as enum ('internal', 'client');

comment on type account_kind is
  'Which side of the wall an account is on. Orthogonal to app_role, never a value of it: role checks in this codebase are denylists, and a fourth role would fall through every one of them.';

alter table public.profiles
  add column account_kind account_kind not null default 'internal';

comment on column public.profiles.account_kind is
  'internal = Coditu staff, reads per app_role. client = a client contact, reads nothing except through the client_* RPCs. Admin-set, never client-supplied, never read from sign-up metadata.';

-- `default 'internal'` and it has to be. Defaulting it to `'client'` would
-- lock every existing account out of the application at once — the same
-- reasoning `must_set_password` carries, and for the same reason it is written
-- down: the safe-looking default is the one that causes the outage.
--
-- The consequence is that a NEW account is internal unless something says
-- otherwise, so `handle_new_user` has to be the thing that says otherwise. It
-- reads the server-side invitation record, never the sign-up request. That is
-- in the invitations migration.

-- ---------------------------------------------------------------------------
-- The sixth guarded column.
--
-- `guard_profile_privilege_columns` is an allowlist written as a denylist, so
-- `account_kind` is writable by its owner until it is named here — and a client
-- contact who can set their own `account_kind` to `'internal'` is this entire
-- feature undone in one PATCH through PostgREST with the anon key.
--
-- Named alongside `role`, `is_active`, `weekly_capacity_minutes`,
-- `must_set_password` and `is_developer`. Same shape, same errcode.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() = 'admin' or (select auth.uid()) is null then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'only an admin may change a profile role' using errcode = '42501';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'only an admin may activate or deactivate a profile' using errcode = '42501';
  end if;
  if new.weekly_capacity_minutes is distinct from old.weekly_capacity_minutes then
    raise exception 'only an admin may change weekly capacity' using errcode = '42501';
  end if;
  if new.must_set_password is distinct from old.must_set_password then
    raise exception 'only an admin may require a password change' using errcode = '42501';
  end if;
  if new.is_developer is distinct from old.is_developer then
    raise exception 'only an admin may decide who takes a share' using errcode = '42501';
  end if;
  if new.account_kind is distinct from old.account_kind then
    raise exception 'only an admin may change what kind of account this is' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_profile_privilege_columns is
  'Per-column half of the profiles update rule. Six columns an owner may not write; the policy decides the row, this decides the columns. A new privilege column is writable until it is NAMED here.';


-- ===========================================================================
-- 20260825110100_internal_only_reads.sql
-- ===========================================================================

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


-- ===========================================================================
-- 20260825110200_client_access.sql
-- ===========================================================================

-- Coditu — client company membership, project grants, and capabilities.
--
-- Access for a client contact is the intersection of four things, and all four
-- have to hold at once:
--
--   1. the account is a client contact, and not revoked
--   2. the contact belongs to the client company that owns the project
--   3. a live grant exists for that specific project
--   4. that grant carries the specific capability being asked for
--
-- `client_has_capability()` at the bottom is the ONE place that intersection is
-- computed. Every client-facing read goes through it, so it is worth more
-- assertions than anything else in this migration.
--
-- Deliberately NOT a `clients.client_user_id` column: a company has more than
-- one person who talks to us, and a contact may be given some of that company's
-- projects and not others. A single column can express neither.

create type client_contact_status as enum ('invited', 'active', 'revoked');

comment on type client_contact_status is
  'invited = the account exists and has not signed in. active = in use. revoked = access withdrawn, history kept.';

-- ---------------------------------------------------------------------------
-- The capability vocabulary.
--
-- An enum rather than text, so a typo is a type error at the point of writing
-- rather than a capability that silently never matches. Mirrored by
-- `lib/client-access.ts`, and `tests/client-access.test.ts` reads this
-- migration to prove the two agree — the same drift guard the status vocabulary
-- and the component kinds already have.
--
-- Each of these reveals something different, and they are separate for that
-- reason. `view_effort` in particular is not implied by anything else: hours are
-- commercially sensitive, and "she can see the project" must never quietly mean
-- "she can see what it cost".
-- ---------------------------------------------------------------------------

create type client_capability as enum (
  'view_project',        -- the project exists, its name, its client-safe summary
  'view_components',     -- published components and their curated summaries
  'view_work',           -- published work items under those components
  'view_current_sprint', -- the running sprint: name, goal, window, humanised progress
  'view_past_sprints',   -- the same for closed ones
  'view_criteria',       -- client-safe acceptance criteria on published work
  'view_effort',         -- AGGREGATE hours. Never per person. Off by default.
  'read_questions',      -- client-visible threads and their messages
  'reply_questions',     -- and writing into them
  'start_questions',     -- opening a new one. Off by default: it is a support inbox.
  'view_attachments'     -- files explicitly marked client-safe. Off by default.
);

comment on type client_capability is
  'What a client contact may do inside one granted project. Mirrored by lib/client-access.ts; a test reads this migration to prove they agree.';

-- ---------------------------------------------------------------------------
-- Who represents whom.
-- ---------------------------------------------------------------------------

create table public.client_contacts (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete restrict,
  status      client_contact_status not null default 'invited',
  invited_by  uuid references public.profiles (id) on delete set null,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at  timestamptz
);

comment on table public.client_contacts is
  'One row per client contact. The primary key is the profile, so a person represents exactly one company — a consultant who works for two clients needs two accounts, and that is the honest answer rather than a join table nobody can reason about.';

-- `on delete restrict` on `client_id`, not cascade. Deleting a client company
-- that still has contacts should fail loudly; the alternative is a person whose
-- account survives with no company, which every query below would then have to
-- have an opinion about.

create index client_contacts_client_idx on public.client_contacts (client_id);

-- ---------------------------------------------------------------------------
-- The invitation.
--
-- This table exists so that `handle_new_user` has something SERVER-SIDE to read
-- when it decides an account's kind. `20260821180000_role_is_not_client_supplied.sql`
-- is the precedent and the warning: reading `raw_user_meta_data` let a sign-up
-- choose its own role, because that field is `options.data` on a public endpoint
-- that takes the anon key. An account kind chosen the same way would be the same
-- bug with a larger blast radius.
-- ---------------------------------------------------------------------------

create table public.client_invitations (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null check (position('@' in email) > 1),
  client_id           uuid not null references public.clients (id) on delete cascade,
  capabilities        client_capability[] not null default '{}',
  status              text not null default 'pending'
                        check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at          timestamptz not null default now() + interval '14 days',
  created_by          uuid references public.profiles (id) on delete set null,
  accepted_profile_id uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

comment on table public.client_invitations is
  'The server-side record of an intended client account: which company, which capabilities. Read by handle_new_user; never written from a sign-up request.';

-- One PENDING invitation per address at a time. A partial unique index rather
-- than a plain one, so the same person can be re-invited after a previous
-- invitation was revoked or expired without the history being deleted.
create unique index client_invitations_pending_email_idx
  on public.client_invitations (lower(email)) where status = 'pending';

create table public.client_invitation_projects (
  invitation_id uuid not null references public.client_invitations (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  primary key (invitation_id, project_id)
);

-- ---------------------------------------------------------------------------
-- The grant.
-- ---------------------------------------------------------------------------

create table public.client_project_grants (
  contact_profile_id uuid not null references public.client_contacts (profile_id) on delete cascade,
  project_id         uuid not null references public.projects (id) on delete cascade,
  capabilities       client_capability[] not null default '{}',
  granted_by         uuid references public.profiles (id) on delete set null,
  granted_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  primary key (contact_profile_id, project_id)
);

comment on table public.client_project_grants is
  'What one contact may do in one project. Revoked by stamping revoked_at rather than deleting, so "who could see this in March" stays answerable.';

-- The index the hot path actually uses: every client read asks "is there a live
-- grant for this contact and this project". Partial, because a revoked grant is
-- never the answer to that question.
create index client_project_grants_live_idx
  on public.client_project_grants (contact_profile_id, project_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Invariant 1, applied to access.
--
-- A grant may only ever name a project belonging to the contact's OWN company.
-- Without this the entire model rests on the application remembering, and "the
-- admin picked the wrong row out of a dropdown" is a cross-client data breach
-- rather than a validation error.
--
-- The same shape as `guard_work_item_component_project`, and for the same
-- reason: the join between two tables is where scope quietly gets lost.
-- ---------------------------------------------------------------------------

create or replace function public.guard_client_grant_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contact_client uuid;
  project_client uuid;
begin
  select c.client_id into contact_client
    from public.client_contacts c where c.profile_id = new.contact_profile_id;

  select p.client_id into project_client
    from public.projects p where p.id = new.project_id;

  if contact_client is null or project_client is null or contact_client <> project_client then
    raise exception
      'a client contact may only be granted projects belonging to their own company'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger client_project_grants_guard_company
  before insert or update of contact_profile_id, project_id on public.client_project_grants
  for each row execute function public.guard_client_grant_company();

-- ---------------------------------------------------------------------------
-- The one place access is decided.
--
-- `security definer`, because it reads `client_contacts` and `client_project_grants`
-- to answer a question that the policies ON those tables would otherwise have to
-- recurse through — the same reason `is_active_member()` is a definer function.
--
-- The caller is `auth.uid()`, always. There is deliberately NO parameter for
-- "which contact": a function that took one would be a way to ask about
-- somebody else's access, and every caller would have to be trusted to pass its
-- own id. It reads the session instead, so there is nothing to pass wrongly.
--
-- Returns false, never null. See the `is_admin_or_lead()` note in
-- `20260825110100_internal_only_reads.sql` for why that distinction is not
-- cosmetic.
-- ---------------------------------------------------------------------------

create or replace function public.client_has_capability(
  p_project_id uuid,
  p_capability client_capability
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.client_contacts  c
    join public.client_project_grants g on g.contact_profile_id = c.profile_id
    join public.projects           p on p.id = g.project_id
    join public.profiles           pr on pr.id = c.profile_id
    where c.profile_id   = (select auth.uid())
      and pr.is_active                       -- deactivating the account is enough
      and pr.account_kind = 'client'         -- an internal account has no client capabilities
      and c.status        = 'active'         -- revoking the contact is enough
      and g.project_id    = p_project_id
      and g.revoked_at   is null             -- revoking the grant is enough
      and p.client_id     = c.client_id      -- belt to the trigger's braces
      and p_capability    = any (g.capabilities)
  ), false)
$$;

comment on function public.client_has_capability is
  'The whole client access model, in one predicate: active client account, active contact, live grant on THIS project, project owned by the contact''s company, and the capability actually present. Reads auth.uid(); takes no contact parameter, so nobody can ask about anyone else.';

-- A definer function in `public` is granted EXECUTE to PUBLIC by default, which
-- makes it callable by `anon`. The same lockdown `allowlist_claimed()` carries.
revoke all on function public.client_has_capability(uuid, client_capability) from public, anon;
grant execute on function public.client_has_capability(uuid, client_capability) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

alter table public.client_contacts            enable row level security;
alter table public.client_invitations         enable row level security;
alter table public.client_invitation_projects enable row level security;
alter table public.client_project_grants      enable row level security;

grant select, insert, update, delete on
  public.client_contacts, public.client_invitations,
  public.client_invitation_projects, public.client_project_grants
to authenticated;

-- Contacts and grants: internal staff see all of it; a contact sees only her
-- own row, because the portal renders which company she represents and which
-- projects she has. Another contact's access is not enumerable from a client
-- session — including another contact at the SAME company.
create policy "read client contacts" on public.client_contacts
  for select to authenticated
  using (public.is_active_member() or profile_id = (select auth.uid()));

create policy "read client grants" on public.client_project_grants
  for select to authenticated
  using (public.is_active_member() or contact_profile_id = (select auth.uid()));

-- Writing access is an admin act, in every verb. A lead runs delivery and can
-- create clients and projects; deciding who OUTSIDE the company may see them is
-- a different question, and it sits with an admin — the same place the email
-- allowlist and role changes already sit.
create policy "admins write client contacts" on public.client_contacts
  for insert to authenticated with check (public.auth_role() = 'admin');
create policy "admins update client contacts" on public.client_contacts
  for update to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

create policy "admins write client grants" on public.client_project_grants
  for insert to authenticated with check (public.auth_role() = 'admin');
create policy "admins update client grants" on public.client_project_grants
  for update to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
create policy "admins delete client grants" on public.client_project_grants
  for delete to authenticated using (public.auth_role() = 'admin');

-- No delete policy on `client_contacts`, and the absence is the rule — the same
-- shape as `comments` and `sprint_payouts`. A contact who wrote messages is
-- referenced by them (`author_id` is `on delete restrict`), and revocation is
-- what withdrawal means here. Deleting the row would take the attribution off
-- her words, which is the one thing a conversation must not do.

-- Invitations are admin-only in full. A client contact reads NOTHING here, not
-- even the invitation that created her: it names capabilities she was not
-- given and, through the pending index, tells her who else is being invited.
create policy "admins read invitations" on public.client_invitations
  for select to authenticated using (public.auth_role() = 'admin');
create policy "admins write invitations" on public.client_invitations
  for insert to authenticated with check (public.auth_role() = 'admin');
create policy "admins update invitations" on public.client_invitations
  for update to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
create policy "admins delete invitations" on public.client_invitations
  for delete to authenticated using (public.auth_role() = 'admin');

create policy "admins read invitation projects" on public.client_invitation_projects
  for select to authenticated using (public.auth_role() = 'admin');
create policy "admins write invitation projects" on public.client_invitation_projects
  for insert to authenticated with check (public.auth_role() = 'admin');
create policy "admins delete invitation projects" on public.client_invitation_projects
  for delete to authenticated using (public.auth_role() = 'admin');


-- ===========================================================================
-- 20260825110300_client_publication.sql
-- ===========================================================================

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


-- ===========================================================================
-- 20260825110400_client_read_model.sql
-- ===========================================================================

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


-- ===========================================================================
-- 20260825110500_invitation_decides_account_kind.sql
-- ===========================================================================

-- Coditu — a new account's KIND comes from a server-side invitation, never from
-- the sign-up request.
--
-- ── Read `20260821180000_role_is_not_client_supplied.sql` first ─────────────
--
-- That migration exists because `handle_new_user` used to do this:
--
--     coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'engineer')
--
-- `raw_user_meta_data` is `options.data` on `supabase.auth.signUp` — entirely
-- client-controlled, on a public endpoint that takes the anon key, which ships
-- in the browser bundle. Anybody on the allowlist could hand themselves the
-- admin role by editing a JSON body, and it was reproduced against the local
-- stack before it was fixed.
--
-- `account_kind` has exactly the same exposure. It also has a larger blast
-- radius in the other direction: an account that talks its way into
-- `'internal'` reads every row of every table in this schema.
--
-- So the answer is the same answer. The request is not read. The trigger looks
-- up a row an ADMIN created, keyed on the email address the auth server itself
-- verified, and that row is the only thing that decides anything.
--
-- ── Why the whole grant is set up in the trigger ───────────────────────────
--
-- Because the alternative is a window. If the profile is created by the trigger
-- and the contact row by a Server Action afterwards, then between the two the
-- account exists, is `internal` by default, and `is_active_member()` is true
-- for it — a real interval during which a brand-new client account can read the
-- entire database. It is short and it is a race nobody would ever see, which is
-- the worst kind. Here it is all one statement in one transaction, and there is
-- no interval at all.
--
-- ── Failing toward less ────────────────────────────────────────────────────
--
-- Every branch below fails toward LESS access, never more. No invitation means
-- `internal` — which is right, because that is how every member of the team
-- signs up, and a client contact only ever exists because an admin made a row
-- for them first. An expired invitation is not an invitation: no contact, no
-- grant, and the person is left as an internal account with no role beyond
-- engineer, which an admin then has to fix deliberately.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_part text := split_part(new.email, '@', 1);
  display    text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), local_part);
  invite     public.client_invitations%rowtype;
  kind       public.account_kind := 'internal';
begin
  -- The lookup is on the email the AUTH SERVER holds, not on anything in the
  -- request body. `lower()` on both sides for the same reason
  -- `enforce_email_allowlist` does it: an invitation to `Cara@evim.de` must be
  -- claimable by `cara@evim.de`.
  --
  -- `order by created_at desc limit 1` even though a partial unique index
  -- already allows only one pending invitation per address. The index is the
  -- guarantee; this is what stops the function raising if that index is ever
  -- dropped or the condition is ever widened.
  select * into invite
    from public.client_invitations i
   where lower(i.email) = lower(new.email)
     and i.status     = 'pending'
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;

  if invite.id is not null then
    kind := 'client';
  end if;

  insert into public.profiles (id, full_name, initials, role, account_kind)
  values (
    new.id,
    display,
    upper(left(regexp_replace(display, '[^[:alpha:] ]', '', 'g'), 1)) ||
      upper(coalesce(substr(split_part(display, ' ', 2), 1, 1), '')),
    -- Still not negotiable, and still not `coalesce(…, 'engineer')`: reading
    -- the request at all is the bug. A client contact carries this role and it
    -- means nothing, because `auth_role()` returns null for a client account.
    'engineer'::public.app_role,
    kind
  )
  on conflict (id) do nothing;

  if invite.id is not null then
    -- Claimed. A second account cannot be created from the same invitation,
    -- and the row stays as the record of who was invited and by whom.
    update public.client_invitations
       set status = 'accepted', accepted_profile_id = new.id
     where id = invite.id;

    insert into public.client_contacts (profile_id, client_id, status, invited_by, accepted_at)
    values (new.id, invite.client_id, 'active', invite.created_by, now())
    on conflict (profile_id) do nothing;

    -- One grant per project the invitation named, all carrying the capability
    -- set the admin chose. `guard_client_grant_company` fires on each of these
    -- and refuses any project that is not the invitation's own company's — so
    -- an invitation built wrongly fails here, loudly, rather than creating a
    -- cross-company grant.
    insert into public.client_project_grants (contact_profile_id, project_id, capabilities, granted_by)
    select new.id, ip.project_id, invite.capabilities, invite.created_by
      from public.client_invitation_projects ip
     where ip.invitation_id = invite.id
    on conflict (contact_profile_id, project_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile for a new account. The role is always engineer and the account kind comes from a pending, unexpired client_invitations row — never from the sign-up request, which the client controls. When an invitation is claimed, the contact and its grants are created in the SAME transaction, so there is no interval in which a new client account is internal.';

-- ---------------------------------------------------------------------------
-- An invited address may sign up.
--
-- `enforce_email_allowlist` is a `before insert on auth.users` trigger and it
-- is the real gate. A client invitation has to open that gate too, or every
-- invitation would need a second row in `allowed_emails` kept in step by hand —
-- two lists, one of which is always the stale one.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.allowed_emails a
    where lower(a.email) = lower(new.email)
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.client_invitations i
    where lower(i.email) = lower(new.email)
      and i.status     = 'pending'
      and i.expires_at > now()
  ) then
    return new;
  end if;

  raise exception 'sign-up is not open: % is not on the allowlist', new.email
    using errcode = '42501';
end;
$$;

comment on function public.enforce_email_allowlist is
  'No public sign-up. An address gets in by being on allowed_emails, or by holding a pending unexpired client invitation — which is a row only an admin can create.';


-- ===========================================================================
-- 20260825110600_client_threads.sql
-- ===========================================================================

-- Coditu — client question threads.
--
-- ── Why this is not a flag on `comments` ────────────────────────────────────
--
-- `comments` is where engineers argue about implementation. Fifteen sprints of
-- it exist, the client report goes to real trouble to keep it out, and
-- `05-DECISIONS.md` records "the client PDF carries no work-item keys" for the
-- same instinct.
--
-- An `is_client_visible boolean` on that table would put ONE column between all
-- of it and a client's screen, and every query written afterwards would have to
-- remember the filter. The failure mode is not dramatic — it is a `select` in a
-- new feature eighteen months from now that forgets, and nobody notices because
-- the page looks right to the person testing it, who is internal.
--
-- These are different tables. There is nothing to remember, and a query that
-- forgets a filter here returns client messages to a client, which is what it
-- is for.
--
-- Existing comments are untouched and unmigrated. They were written under the
-- expectation of privacy, and nothing here changes that retrospectively.

create type client_thread_state as enum ('waiting_client', 'waiting_coditu', 'resolved');

comment on type client_thread_state is
  'Whose turn it is. waiting_client = we asked, they have not answered. waiting_coditu = they answered. resolved = done, and only Coditu may say so.';

create table public.client_threads (
  id           uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.components (id) on delete cascade,
  -- Derived from the component by trigger, never accepted from the caller.
  -- Denormalised because every read filters on it, and joining through
  -- `components` on the hot path to re-derive a value that cannot change is
  -- work for nothing.
  project_id   uuid not null references public.projects (id) on delete cascade,
  -- Optional context: "this is about that piece of work". Nullable because
  -- most questions are about the component as a whole.
  work_item_id uuid references public.work_items (id) on delete set null,
  title        text not null check (length(btrim(title)) between 1 and 200),
  state        client_thread_state not null default 'waiting_client',
  opened_by    uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

comment on table public.client_threads is
  'A question Coditu asked a client, attached to a component. Its project is derived from that component — invariant 1, in a trigger — so no caller can place a thread in a project it does not belong to.';

create index client_threads_project_state_idx on public.client_threads (project_id, state);
create index client_threads_component_idx     on public.client_threads (component_id, created_at desc);

create table public.client_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.client_threads (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete restrict,
  body_json  jsonb not null,
  body_text  text  not null,
  edited_at  timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.client_messages is
  'One message. Same ProseMirror document shape as comments.body_json, so lib/comments/schema.ts and comment-body.tsx are reused rather than a second renderer being written. author_id is on delete restrict: a withdrawn contact keeps her name on her own words.';

create index client_messages_thread_idx on public.client_messages (thread_id, created_at);

-- Who has read how far. One row per person per thread, so an unread count is a
-- comparison rather than a per-message join table.
create table public.client_thread_reads (
  thread_id    uuid not null references public.client_threads (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Invariant 1, on the thread.
-- ---------------------------------------------------------------------------

create or replace function public.derive_client_thread_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  component_project uuid;
  item_project      uuid;
begin
  select c.project_id into component_project
    from public.components c where c.id = new.component_id;

  if component_project is null then
    raise exception 'a client thread must name a component that exists' using errcode = '23503';
  end if;

  -- Assigned, not compared. A caller may send anything at all in this column
  -- and it is simply replaced — which is stronger than raising, because there
  -- is no path where a wrong value survives to be acted on.
  new.project_id := component_project;

  if new.work_item_id is not null then
    select s.project_id into item_project
      from public.work_items w
      join public.sprints s on s.id = w.sprint_id
     where w.id = new.work_item_id;

    if item_project is distinct from component_project then
      raise exception 'a client thread cannot reference a work item from another project'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger client_threads_derive_project
  before insert or update of component_id, work_item_id on public.client_threads
  for each row execute function public.derive_client_thread_project();

-- ---------------------------------------------------------------------------
-- Can this session see this thread at all?
--
-- One predicate, used by every policy below, so "which threads exist" has a
-- single answer. Internal members see all of them — including threads on
-- unpublished components, because those are OUR questions and we wrote them.
-- A client sees a thread only where the component is published to her AND she
-- holds `read_questions` on its project.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_client_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_active_member()
    or exists (
      select 1
      from public.client_threads t
      join public.components     c on c.id = t.component_id
      where t.id = p_thread_id
        and c.published_at is not null
        and public.client_has_capability(t.project_id, 'read_questions')
    ),
    false
  )
$$;

revoke all on function public.can_read_client_thread(uuid) from public, anon;
grant execute on function public.can_read_client_thread(uuid) to authenticated;

/**
 * And may this session WRITE into it.
 *
 * Separate from reading, and that separation is the `read_questions` /
 * `reply_questions` split doing its job: a client given read-only access can
 * follow a conversation and cannot join it. Internal members may always write
 * — it is their question.
 */
create or replace function public.can_write_client_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_active_member()
    or exists (
      select 1
      from public.client_threads t
      join public.components     c on c.id = t.component_id
      where t.id = p_thread_id
        and c.published_at is not null
        and public.client_has_capability(t.project_id, 'reply_questions')
    ),
    false
  )
$$;

revoke all on function public.can_write_client_thread(uuid) from public, anon;
grant execute on function public.can_write_client_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

alter table public.client_threads      enable row level security;
alter table public.client_messages     enable row level security;
alter table public.client_thread_reads enable row level security;

-- No DELETE in the grant for either of the first two. The absence is the rule,
-- exactly as it is for `comments` and `sprint_payouts`: a question that
-- vanishes is worse than one that is visibly resolved, and a message that
-- vanishes takes an answer somebody acted on with it.
grant select, insert, update on public.client_threads, public.client_messages to authenticated;
grant select, insert, update, delete on public.client_thread_reads to authenticated;

create policy "read client threads" on public.client_threads
  for select to authenticated using (public.can_read_client_thread(id));

-- Only internal staff open a thread, unless the client was given
-- `start_questions` explicitly. It is off in both presets: a portal a client can
-- post into from nothing is a support inbox, and nobody agreed to staff one.
create policy "open client threads" on public.client_threads
  for insert to authenticated
  with check (
    (public.is_active_member() and opened_by = (select auth.uid()))
    or (
      opened_by = (select auth.uid())
      and public.client_has_capability(
        (select c.project_id from public.components c where c.id = component_id),
        'start_questions'
      )
    )
  );

-- The STATE moves, and only Coditu may resolve. A client answering flips it to
-- `waiting_coditu` through the Server Action, which runs as her; marking a
-- question closed is a judgement about whether the answer was sufficient, and
-- that is ours.
create policy "move client thread state" on public.client_threads
  for update to authenticated
  using (public.can_write_client_thread(id))
  with check (
    public.is_active_member()
    or (state <> 'resolved' and public.can_write_client_thread(id))
  );

create policy "read client messages" on public.client_messages
  for select to authenticated
  using (public.can_read_client_thread(thread_id) and deleted_at is null);

create policy "write client messages" on public.client_messages
  for insert to authenticated
  with check (
    -- The author is the caller, always. Taking it from the row would make it a
    -- value the server has to distrust; this makes it one the database refuses.
    author_id = (select auth.uid())
    and public.can_write_client_thread(thread_id)
  );

-- Your own words. An admin may soft-delete anybody's — the same moderation
-- escape hatch `comments` has — and `editComment`'s history is the warning:
-- that action let an admin rewrite anybody's words while its own error sentence
-- said only the author could. Editing here is author-only in the policy, so the
-- sentence and the rule cannot drift apart.
create policy "edit own client message" on public.client_messages
  for update to authenticated
  using (author_id = (select auth.uid()) or public.auth_role() = 'admin')
  with check (author_id = (select auth.uid()) or public.auth_role() = 'admin');

create policy "own thread reads" on public.client_thread_reads
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));


-- ===========================================================================
-- 20260825110700_client_thread_read_model.sql
-- ===========================================================================

-- Coditu — reading threads, through the same boundary as everything else.
--
-- ── The bug this fixes, because it is instructive ──────────────────────────
--
-- `client_threads` and `client_messages` have no internal-only columns, so the
-- first version of `lib/data/client-threads.ts` read them with ordinary
-- PostgREST selects and let RLS decide the rows. That part was right, and the
-- pgTAP suite proved it: a client sees exactly the threads on components
-- published to her.
--
-- But the loader also embedded the things a thread is ABOUT:
--
--     components!inner ( name, slug ),
--     projects!inner   ( slug ),
--     profiles!client_messages_author_id_fkey ( full_name, initials )
--
-- and a client contact cannot read **any** of those base tables. That is not an
-- oversight, it is the boundary working: `is_active_member()` is false for her,
-- so `components`, `projects` and every profile but her own return zero rows.
--
-- `!inner` on a join that returns nothing drops the parent row. So the list came
-- back EMPTY — not an error, not a permission message, just nothing. The screen
-- rendered "Nothing to answer right now" while the database was perfectly happy
-- to say there was one waiting. The e2e spec caught it; no unit test could have,
-- and the pgTAP suite was green throughout because the SQL was never wrong.
--
-- The lesson generalises: **a client-safe table is not a client-safe QUERY.**
-- The moment a query joins outward it inherits the strictest policy it touches,
-- and with `!inner` it inherits it silently.
--
-- So thread reads join the rest of the client read model behind
-- `security definer` functions that name their columns. One pair serves both
-- sides, because `can_read_client_thread()` already answers correctly for an
-- internal member and for a contact, and the columns a thread list needs are
-- client-safe for everybody.

create or replace function public.client_thread_list(p_project_id uuid default null)
returns table (
  thread_id       uuid,
  title           text,
  state           text,
  component_id    uuid,
  component_name  text,
  component_slug  text,
  project_id      uuid,
  project_slug    text,
  created_at      timestamptz,
  last_message_at timestamptz,
  message_count   int,
  last_read_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.title,
    t.state::text,
    t.component_id,
    c.name,
    c.slug,
    t.project_id,
    p.slug,
    t.created_at,
    max(m.created_at) filter (where m.deleted_at is null),
    count(m.id) filter (where m.deleted_at is null)::int,
    r.last_read_at
  from public.client_threads t
  join public.components c on c.id = t.component_id
  join public.projects   p on p.id = t.project_id
  left join public.client_messages m on m.thread_id = t.id
  -- The caller's own read mark, and only ever the caller's. There is no
  -- parameter for whose mark to fetch, so there is nothing to pass wrongly.
  left join public.client_thread_reads r
    on r.thread_id = t.id and r.profile_id = (select auth.uid())
  where public.can_read_client_thread(t.id)
    and (p_project_id is null or t.project_id = p_project_id)
  group by t.id, t.title, t.state, t.component_id, c.name, c.slug, t.project_id, p.slug,
           t.created_at, r.last_read_at
$$;

comment on function public.client_thread_list is
  'Threads this session may read, with the component and project names a client cannot get from the base tables. can_read_client_thread() answers for internal members and contacts alike, so one function serves both sides.';

revoke all on function public.client_thread_list(uuid) from public, anon;
grant execute on function public.client_thread_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One thread's messages, with their authors.
--
-- `is_from_coditu` is computed from the author's `account_kind` here rather
-- than exposing the column: which side a message came from is all the reader
-- needs, and it is not the same thing as being told what kind of account
-- somebody has.
--
-- The author's NAME crosses for an internal author, and it should — a client
-- reading "Adam asked:" is being told something true and useful, and it is
-- already the case in the sprint notes she can see. What does not cross is
-- anything else about that profile: no email, no role, no avatar path, no id
-- beyond what the message already carries.
-- ---------------------------------------------------------------------------

create or replace function public.client_thread_messages(p_thread_id uuid)
returns table (
  message_id     uuid,
  author_id      uuid,
  author_name    text,
  author_initials text,
  is_from_coditu boolean,
  body_json      jsonb,
  body_text      text,
  created_at     timestamptz,
  edited_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.author_id,
    pr.full_name,
    pr.initials,
    pr.account_kind <> 'client',
    m.body_json,
    m.body_text,
    m.created_at,
    m.edited_at
  from public.client_messages m
  join public.profiles pr on pr.id = m.author_id
  where m.thread_id  = p_thread_id
    and m.deleted_at is null
    and public.can_read_client_thread(p_thread_id)
  order by m.created_at
$$;

comment on function public.client_thread_messages is
  'One thread''s live messages. The author''s display name and initials cross the boundary; nothing else about their profile does.';

revoke all on function public.client_thread_messages(uuid) from public, anon;
grant execute on function public.client_thread_messages(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- And whether this session may write into it, so the UI can decide whether to
-- draw a composer without guessing.
--
-- `can_write_client_thread` already exists and is already granted; this is only
-- here as the thing a page calls, so that "may I reply" has one answer on both
-- sides of the wall rather than one in SQL and a re-derivation in TypeScript.
-- ---------------------------------------------------------------------------

create or replace function public.client_thread_can_reply(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_write_client_thread(p_thread_id)
$$;

revoke all on function public.client_thread_can_reply(uuid) from public, anon;
grant execute on function public.client_thread_can_reply(uuid) to authenticated;


-- ===========================================================================
-- 20260825120000_work_item_components.sql
-- ===========================================================================

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


-- ===========================================================================
-- 20260825120100_tag_activity_survives_a_cascade.sql
-- ===========================================================================

-- Deleting a work item was impossible for about an hour.
--
-- `20260825120000` put an AFTER DELETE trigger on `work_item_components` that
-- records an untag in `activity`. Deleting a work item cascades to its tags, so
-- the trigger fired with the parent already gone and the insert violated
-- `activity_work_item_id_fkey`:
--
--   insert or update on table "activity" violates foreign key constraint
--   DETAIL: Key (work_item_id)=(d22501ae…) is not present in table "work_items".
--
-- The whole DELETE aborts, so nothing could remove a work item at all — not the
-- Server Action, not the e2e cleanup, not a psql session. It was found by
-- `e2e/components.spec.ts`'s `afterEach`, which deletes the rows it created,
-- and it presented as a spec failing in teardown rather than as anything to do
-- with components.
--
-- The fix is the standard cascade-ordering guard: an untag caused by the item
-- going away is not a fact about the item, and there is nothing left to hang it
-- on. A tag removed from an item that still exists is still recorded.
--
-- Worth stating because the shape recurs: **any AFTER DELETE trigger that writes
-- a row referencing the deleted row's parent has this bug**, and it is invisible
-- until something deletes a parent. `refresh_component_mirror` is the same
-- trigger and does not have it, only because its UPDATE matches zero rows and
-- an UPDATE that matches nothing is not an error.

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
    return null;
  end if;

  -- The item is being deleted and took its tags with it. There is no item left
  -- for this to be activity ON, and the FK says so.
  if not exists (select 1 from public.work_items w where w.id = old.work_item_id) then
    return null;
  end if;

  insert into public.activity (work_item_id, actor_id, verb, field, from_value)
  values (old.work_item_id, actor, 'cleared', 'component',
          (select name from public.components where id = old.component_id));

  return null;
end;
$$;


-- ===========================================================================
-- 20260825120200_client_reads_every_tag.sql
-- ===========================================================================

-- The client read boundary follows the join table.
--
-- `client_components` and `client_component_work` reached work through
-- `work_items.component_id`, which is now a mirror of the FIRST tag. Left as
-- they were, a story tagged with the Link Kachel and the Newspart would appear
-- under whichever of the two happened to sort first, and be missing from the
-- other — a client reading the Newspart's page would be told less work had been
-- done on it than actually had.
--
-- ## What deliberately does NOT change
--
-- **The returned columns.** `supabase/tests/read-boundary.sql` pins the exact
-- result shape of all four client functions, and it must still pass afterwards:
-- this is a change to which rows are found, not to what is said about them. A
-- rewrite that quietly widened the projection is the failure that test exists
-- for.
--
-- **The access rules.** Both functions still check `client_has_capability()` in
-- their own body, still take the project id as a request rather than a claim,
-- and still return an empty set for another company's project rather than an
-- error that would confirm it exists.
--
-- **Publication is still per item and per component.** Being tagged with a
-- published component does not publish an item, and being published does not
-- reveal it under an unpublished component. Both conditions are still required,
-- so appearing under several components broadens nothing: it is the same
-- published row, reachable from each permitted place it genuinely belongs.
--
-- The project agreement between an item and its tags is enforced at write time
-- by `guard_work_item_component_scope`, exactly as `comp.project_id` was trusted
-- here before.

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
    -- One tag row per (item, component), so a story cannot count twice here.
    count(w.id) filter (where w.id is not null)::int,
    count(w.id) filter (where w.status = 'done')::int,
    case
      when public.client_has_capability(p_project_id, 'view_effort')
        then coalesce(sum(w.minutes_logged), 0)::int
      else null
    end,
    max(w.updated_at)
  from public.components comp
  left join public.work_item_components wc
    on wc.component_id = comp.id
  left join public.work_items w
    on w.id                  = wc.work_item_id
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
  'Published components of one granted project, with counts computed over published work only, reached through work_item_components so a story tagged with several appears under each. Hours are null unless view_effort was granted — null rather than zero, because zero is a lie the UI would render as a fact.';

revoke all on function public.client_components(uuid) from public, anon;
grant execute on function public.client_components(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The published work under one component.
--
-- What is NOT selected here is still the point of the function: no `key`
-- (COD-229 means nothing to a client and everything to anyone guessing URLs),
-- no `description`, no `highlight`, no `assignee_id` or `reviewer_id`, no
-- `grouping`, no `estimate_minutes`, and no raw status.
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
    case when public.client_has_capability(p_project_id, 'view_current_sprint')
      then w.deadline else null end,
    w.client_published_at
  from public.work_item_components wc
  join public.work_items w   on w.id   = wc.work_item_id
  join public.components comp on comp.id = wc.component_id
  where wc.component_id       = p_component_id
    and comp.project_id       = p_project_id
    and comp.published_at    is not null
    and w.client_published_at is not null
    and w.deleted_at         is null
    and public.client_has_capability(p_project_id, 'view_work')
  order by w.client_published_at desc, w.order_index
$$;

comment on function public.client_component_work is
  'Published work under one component, reached through work_item_components. The status is humanised in SQL so the enum value never crosses the wire; there is no key, no description, no highlight, no assignee and no estimate in the result at all.';

revoke all on function public.client_component_work(uuid, uuid) from public, anon;
grant execute on function public.client_component_work(uuid, uuid) to authenticated;


-- ===========================================================================
-- 20260825130000_block_documents.sql
-- ===========================================================================

-- One document format, on every surface that holds writing.
--
-- `comments.body_json` and `acceptance_criteria.body_json` have been ProseMirror
-- documents for a while. `work_items.description`, `work_items.highlight` and
-- `sprints.notes` are plain text, and the design asks all five to be the same
-- thing: headings, lists, checklists, toggles, callouts, code, tables, images
-- and mentions, written with one editor and read by one renderer.
--
-- ## The text columns stay, and they are not a fallback
--
-- Each `*_json` column arrives BESIDE its text column, not instead of it. The
-- text is the **flattened projection**, written in the same statement, exactly
-- as `comments.body_text` has always been written beside `comments.body_json`.
--
-- That is not caution about the migration. It is what `04-EXPORT-SPEC.md` reads:
-- the CSV is a contract, the Markdown export is what an agent is handed, and
-- neither should have to walk a jsonb tree to find out what a story says. A
-- projection that is written in the same transaction cannot disagree with the
-- document; one that is derived at read time by whoever remembers to can.
--
-- ## Nothing is rewritten in bulk
--
-- 58 imported descriptions are requirement lists and 232 criteria have only ever
-- been a sentence. They stay as they are: `description_json` is null until
-- somebody edits that story, and the render edge falls back to the text column
-- when it is. A bulk conversion would be inventing a document structure for
-- prose nobody wrote as blocks — and it would touch every row in the table to
-- produce a paragraph the fallback already renders.
--
-- ## The version column
--
-- `DOC_VERSION` in `lib/blocks/schema.ts` is 1 and has never been anything else,
-- which is precisely when a version is worth storing: the moment a second value
-- exists, every row written before it is indistinguishable from one written
-- after, and the migration that needs to tell them apart is the one that cannot.
--
-- Adding a node type does not bump it. The renderer is fail-closed — an unknown
-- node contributes its text and nothing else — so an old reader meeting a new
-- block degrades rather than breaks. A bump is for a change that would make an
-- old document render *wrongly*.

alter table public.work_items
  add column description_json    jsonb,
  add column description_version smallint not null default 1,
  add column highlight_json      jsonb,
  add column highlight_version   smallint not null default 1;

comment on column public.work_items.description_json is
  'The story body as a block document. Null until somebody edits it — description holds the flattened projection and is what the exports read.';
comment on column public.work_items.highlight_json is
  'The discuss-before-implementing note as a block document. Exposed to a client by nothing, ever, exactly like the text column beside it.';

alter table public.sprints
  add column notes_json    jsonb,
  add column notes_version smallint not null default 1;

comment on column public.sprints.notes_json is
  'Sprint notes as a block document. notes holds the flattened projection; the sprint report and the Markdown export read that.';

-- The two that were already documents get their version stamp.
alter table public.acceptance_criteria add column body_version smallint not null default 1;
alter table public.comments            add column body_version smallint not null default 1;
alter table public.client_messages     add column body_version smallint not null default 1;

-- ---------------------------------------------------------------------------
-- The column guards.
--
-- `guard_work_item_columns` is an allowlist written as a DENYLIST: an engineer
-- may change `status` and `order_index`, and the guard enforces that by naming
-- everything else. So a new column is silently writable by any assignee until it
-- appears here — `component_id`, `body_json` and `deleted_at` each had to be
-- retrofitted after the fact, and `07-FIELD-NOTES.md` records it as a standing
-- trap.
--
-- Naming them in the migration that creates them is the only moment it is free.
-- `description` and `highlight` are admin-and-lead columns; the documents beside
-- them are the same columns in a different shape and carry the same rule.
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
    when new.description_json    is distinct from old.description_json    then 'description_json'
    when new.description_version is distinct from old.description_version then 'description_version'
    when new.highlight           is distinct from old.highlight           then 'highlight'
    when new.highlight_json      is distinct from old.highlight_json      then 'highlight_json'
    when new.highlight_version   is distinct from old.highlight_version   then 'highlight_version'
    when new.type                is distinct from old.type                then 'type'
    when new.component_id        is distinct from old.component_id        then 'component_id'
    when new.assignee_id         is distinct from old.assignee_id         then 'assignee_id'
    when new.reviewer_id         is distinct from old.reviewer_id         then 'reviewer_id'
    when new.deadline            is distinct from old.deadline            then 'deadline'
    when new.estimate_minutes    is distinct from old.estimate_minutes    then 'estimate_minutes'
    when new.grouping            is distinct from old.grouping            then 'grouping'
    when new.sprint_id           is distinct from old.sprint_id           then 'sprint_id'
    when new.key                 is distinct from old.key                 then 'key'
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

-- `guard_criteria_columns` is deliberately NOT touched, and that is worth a
-- sentence rather than silence. It is the same denylist shape, naming only
-- `work_item_id` and `order_index` — the two that MOVE a criterion rather than
-- edit it. `body` and `body_json` were taken off that list on 2026-08-25 so an
-- engineer who owns or reviews the item can say what the box says, and
-- `body_version` travels with them: it is the stamp on the document they are
-- already allowed to write, so leaving it unnamed is the correct answer rather
-- than an oversight.
--
-- The opposite is true on `work_items`, where `description` and `highlight` are
-- admin-and-lead columns — so the documents and stamps beside them are named
-- above.


-- ===========================================================================
-- 20260825140000_document_revisions.sql
-- ===========================================================================

-- Every version of every document, kept, and unable to be rewritten.
--
-- `activity` has recorded property changes since the first week — status moved,
-- assignee changed, hours logged. What it has never recorded is what a document
-- SAID before somebody changed it. A story's description could be replaced
-- wholesale and the only trace was a row saying the description changed.
--
-- ## Captured by a trigger, not by the action
--
-- The obvious place to write a revision is the Server Action that saves the
-- document, and it is the wrong place. There are already four actions that write
-- documents and there will be more; every one of them would have to remember,
-- and the one that forgets loses history silently and forever. A trigger cannot
-- forget. It also catches the writes no action makes — a migration, a fix
-- applied by hand in the SQL editor, the importer — which are exactly the
-- changes nobody can otherwise account for.
--
-- The cost is that a trigger knows WHAT changed and not WHY. `restored_from` is
-- the one piece of intent that matters, and it arrives through a transaction
-- setting the restore path sets; everything else a reader needs is in the row.
--
-- ## Append-only, enforced by what is absent
--
-- `authenticated` is granted SELECT and nothing else. There is no insert policy,
-- no update policy and no delete policy, so the only way a row reaches this
-- table is the `security definer` trigger below, and there is no way at all to
-- change or remove one. That is stronger than a guard trigger that raises: a
-- guard has to be written correctly, whereas a privilege that was never granted
-- cannot be got around by finding a path its author did not think of.
--
-- **A restore therefore writes a NEW revision.** It never rewinds the table,
-- because it cannot. Restoring version 3 over version 7 produces version 8 whose
-- content equals version 3 and whose `restored_from` says so, and 4 through 7
-- remain readable. This is the property the whole feature rests on: history that
-- can be edited is not history.
--
-- ## Client messages are deliberately not here
--
-- `client_messages` is the only document surface a client contact writes, and
-- `/app/history` is an internal screen. Admitting it would put a client-writable
-- path into a table whose read policy is `is_active_member()` — not a leak, but
-- a shape that invites one later. Client threads keep their own history in the
-- thread itself, where both sides can see it.

create type public.revision_surface as enum (
  'work_item_description',
  'work_item_highlight',
  'sprint_notes',
  'acceptance_criterion',
  'comment'
);

create table public.document_revisions (
  id            uuid primary key default gen_random_uuid(),
  surface       public.revision_surface not null,
  entity_id     uuid not null,
  revision_no   smallint not null,
  actor_id      uuid references public.profiles (id) on delete set null,

  -- The document as it stood AFTER this change, and its flattened text. Both,
  -- for the same reason the live tables keep both: the diff and the restore read
  -- `doc`, and history search reads `plain_text` without walking a jsonb tree.
  doc           jsonb,
  plain_text    text,
  doc_version   smallint not null default 1,

  -- Set only when this revision was produced by restoring an earlier one, and
  -- then it holds that earlier revision's number. Null for an ordinary edit.
  restored_from smallint,

  -- Denormalised scope, so the history screen can ask "everything about this
  -- story" without a five-way union. Written by the trigger from the row's own
  -- parent, never supplied by a caller — invariant 1 re-derived rather than
  -- trusted.
  work_item_id  uuid references public.work_items (id) on delete cascade,
  sprint_id     uuid references public.sprints (id) on delete cascade,

  created_at    timestamptz not null default now(),

  unique (surface, entity_id, revision_no)
);

comment on table public.document_revisions is
  'Append-only. Rows arrive only through record_document_revision(); nothing may update or delete one, including an admin.';
comment on column public.document_revisions.restored_from is
  'The revision number this one was restored from. A restore adds a version, it never removes the versions in between.';

create index document_revisions_entity_idx
  on public.document_revisions (surface, entity_id, revision_no desc);
create index document_revisions_work_item_idx
  on public.document_revisions (work_item_id, created_at desc)
  where work_item_id is not null;
create index document_revisions_sprint_idx
  on public.document_revisions (sprint_id, created_at desc)
  where sprint_id is not null;

-- ---------------------------------------------------------------------------
-- The capture trigger.
--
-- One function, five triggers. The surface and the two column names arrive in
-- `TG_ARGV` so that adding a sixth document surface is a `create trigger` and
-- not a sixth copy of this logic — the mistake `record_work_item_activity`
-- avoided by the same means.
--
-- `to_jsonb(new)` rather than dynamic SQL: it reads the columns by name with no
-- `execute`, no quoting question, and no plan cache to invalidate. NULL columns
-- become JSON `null` on both sides of the comparison, so `is not distinct from`
-- still means what it says.
-- ---------------------------------------------------------------------------

create or replace function public.record_document_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- `v_` because `surface` is also a column on the table this writes to, and a
  -- trigger function has no label to disambiguate them with.
  v_surface    public.revision_surface := tg_argv[0]::public.revision_surface;
  doc_col      text := tg_argv[1];
  text_col     text := tg_argv[2];
  version_col  text := tg_argv[3];

  new_row      jsonb := to_jsonb(new);
  old_row      jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  new_doc      jsonb := new_row -> doc_col;
  new_text     text  := new_row ->> text_col;

  scope_item   uuid;
  scope_sprint uuid;
  next_no      smallint;
  restored     smallint := nullif(current_setting('coditu.restored_from', true), '')::smallint;
begin
  -- Nothing changed about the writing. A status flip must not add a version to
  -- the description, or every story acquires a history of edits nobody made.
  if old_row is not null
     and (old_row -> doc_col) is not distinct from new_doc
     and (old_row ->> text_col) is not distinct from new_text then
    return null;
  end if;

  -- A row created with an empty document has no first version. Version 1 is
  -- what somebody wrote, not the blank they were given.
  if new_doc is null or new_doc = 'null'::jsonb then
    if new_text is null or btrim(new_text) = '' then
      return null;
    end if;
  end if;

  -- Where this document lives. Written out rather than passed in, so the
  -- mapping is checkable by reading it and a caller cannot claim a different
  -- parent than the row has.
  case v_surface
    when 'work_item_description' then scope_item := (new_row ->> 'id')::uuid;
    when 'work_item_highlight'   then scope_item := (new_row ->> 'id')::uuid;
    when 'acceptance_criterion'  then scope_item := (new_row ->> 'work_item_id')::uuid;
    when 'comment'               then scope_item := (new_row ->> 'work_item_id')::uuid;
    when 'sprint_notes'          then scope_sprint := (new_row ->> 'id')::uuid;
  end case;

  select coalesce(max(r.revision_no), 0) + 1
    into next_no
    from public.document_revisions r
   where r.surface = v_surface
     and r.entity_id = (new_row ->> 'id')::uuid;

  insert into public.document_revisions
    (surface, entity_id, revision_no, actor_id, doc, plain_text, doc_version,
     restored_from, work_item_id, sprint_id)
  values
    (v_surface,
     (new_row ->> 'id')::uuid,
     next_no,
     (select auth.uid()),
     case when new_doc = 'null'::jsonb then null else new_doc end,
     new_text,
     coalesce((new_row ->> version_col)::smallint, 1),
     restored,
     scope_item,
     scope_sprint);

  return null;
end;
$$;

comment on function public.record_document_revision() is
  'AFTER trigger. Writes one append-only revision when a document column actually changes. Reads coditu.restored_from for the restore path.';

create trigger record_description_revision
  after insert or update of description_json, description on public.work_items
  for each row execute function public.record_document_revision(
    'work_item_description', 'description_json', 'description', 'description_version');

create trigger record_highlight_revision
  after insert or update of highlight_json, highlight on public.work_items
  for each row execute function public.record_document_revision(
    'work_item_highlight', 'highlight_json', 'highlight', 'highlight_version');

create trigger record_sprint_notes_revision
  after insert or update of notes_json, notes on public.sprints
  for each row execute function public.record_document_revision(
    'sprint_notes', 'notes_json', 'notes', 'notes_version');

create trigger record_criterion_revision
  after insert or update of body_json, body on public.acceptance_criteria
  for each row execute function public.record_document_revision(
    'acceptance_criterion', 'body_json', 'body', 'body_version');

create trigger record_comment_revision
  after insert or update of body_json, body_text on public.comments
  for each row execute function public.record_document_revision(
    'comment', 'body_json', 'body_text', 'body_version');

-- ---------------------------------------------------------------------------
-- Restoring.
--
-- The restore is an ordinary UPDATE of the live row, which the capture trigger
-- then records like any other edit. All this function adds is the
-- `restored_from` stamp.
--
-- ## `security invoker`, and that is the whole authorization model
--
-- Almost every function in this schema is `security definer`. This one must not
-- be, and the reason is worth the paragraph: **who may restore a document is
-- exactly who may write it**, and that rule is already written down — in the
-- policies on `work_items`, `sprints`, `acceptance_criteria` and `comments`, and
-- in `guard_work_item_columns`. A definer function would have to state it a
-- second time, in a `case` over five surfaces, and the second copy is the one
-- that goes stale. The first draft of this function did exactly that and got it
-- wrong in a way that mattered: it let any active member restore a criterion
-- body, where editing one requires owning or reviewing the item.
--
-- Running as the caller means an engineer restoring a criterion on their own
-- story succeeds, the same engineer restoring one on somebody else's is refused,
-- and neither outcome is decided here. Nothing to keep in step.
--
-- The catch is that RLS refuses a write by matching no rows rather than by
-- raising, so a denied restore looks identical to a restore of something that
-- was already deleted. Hence the row count check — without it the caller is told
-- it worked.
-- ---------------------------------------------------------------------------

create or replace function public.restore_document_revision(
  p_surface public.revision_surface,
  p_entity_id uuid,
  p_revision_no smallint
)
returns table (revision_no smallint, work_item_id uuid, sprint_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target   public.document_revisions;
  affected int;
begin
  -- Reading the revision is governed by the table's own select policy, so a
  -- client account finds nothing here and gets the same answer as a bad id.
  select * into target
    from public.document_revisions r
   where r.surface = p_surface
     and r.entity_id = p_entity_id
     and r.revision_no = p_revision_no;

  if target is null then
    raise exception 'No such revision' using errcode = 'P0002';
  end if;

  -- Tells the capture trigger that the version it is about to write came from
  -- somewhere. `set local` dies with the transaction, so it cannot leak into the
  -- next statement on a pooled connection.
  perform set_config('coditu.restored_from', p_revision_no::text, true);

  case p_surface
    when 'work_item_description' then
      update public.work_items
         set description_json = target.doc, description = target.plain_text
       where id = p_entity_id;
    when 'work_item_highlight' then
      update public.work_items
         set highlight_json = target.doc, highlight = target.plain_text
       where id = p_entity_id;
    when 'sprint_notes' then
      update public.sprints
         set notes_json = target.doc, notes = target.plain_text
       where id = p_entity_id;
    when 'acceptance_criterion' then
      update public.acceptance_criteria
         set body_json = target.doc, body = target.plain_text
       where id = p_entity_id;
    when 'comment' then
      update public.comments
         set body_json = target.doc, body_text = target.plain_text
       where id = p_entity_id;
  end case;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  perform set_config('coditu.restored_from', '', true);

  return query
    select r.revision_no, r.work_item_id, r.sprint_id
      from public.document_revisions r
     where r.surface = p_surface
       and r.entity_id = p_entity_id
     order by r.revision_no desc
     limit 1;
end;
$$;

comment on function public.restore_document_revision is
  'Writes an earlier revision back onto the live row. Adds a version; never removes the versions in between.';

revoke all on function public.restore_document_revision(public.revision_surface, uuid, smallint) from public, anon;
grant execute on function public.restore_document_revision(public.revision_surface, uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading.
--
-- SELECT and nothing else. The absent policies are the append-only guarantee.
-- ---------------------------------------------------------------------------

alter table public.document_revisions enable row level security;

grant select on public.document_revisions to authenticated;

create policy "active members read document revisions" on public.document_revisions
  for select to authenticated using (public.is_active_member());


-- ===========================================================================
-- 20260825150000_writes_that_survive_a_retry.sql
-- ===========================================================================

-- A write that is sent twice happens once.
--
-- The composer already disables its own button while a send is in flight, so a
-- double CLICK was never the problem. What is unhandled is everything below the
-- button: the request that arrived and whose response was lost, the Server
-- Action that rejected because the network went away mid-flight (which skips the
-- client's rollback entirely — see `07-FIELD-NOTES.md`), the second tab, the
-- retry a reader makes because the first attempt appeared to do nothing. Every
-- one of those posts the same comment twice, and the thread is the record of a
-- conversation.
--
-- ## A column, not a claims table
--
-- `coditu-implementation-prompt.md` §5.4 proposed a general
-- `write_idempotency (key, profile_id, action, result)` table: claim the key,
-- do the write, record the result. That is the right shape for a system where
-- the write is not a single insert, and the wrong shape here, for three reasons.
--
-- **It is three round trips where there is one.** Claim, insert, complete —
-- against a composer whose own source says it is "already tuned" and that a
-- comment appearing half a second later is a regression paid for by the person
-- writing.
--
-- **It has states that this does not.** A claim written and a write that then
-- fails leaves a row saying "in flight" forever, so the honest retry is refused
-- until a sweep removes it, which means a TTL job, which means a thing that can
-- be down. A unique index has no such state: the key and the row are written by
-- the same statement, so either both exist or neither does.
--
-- **It answers a question nobody asked.** `result jsonb` exists to replay what
-- the first attempt returned. Both writes here return `{ ok: true }`; there is
-- nothing to replay.
--
-- ## Unique per author, not globally
--
-- `unique (author_id, idempotency_key)` rather than `unique (idempotency_key)`.
-- The keys are client-generated, and a globally unique one lets any account
-- reserve a key that somebody else's future write would then collide with. It
-- would take guessing a v4 UUID, so it is not a plausible attack — but scoping
-- the constraint to the author costs nothing and removes the question.
--
-- ## Null is the ordinary case
--
-- Both indexes are partial. Every row written before this migration, by the
-- seed, by the importer, or by any caller that does not supply a key, has a null
-- key and cannot collide with anything. Idempotency is offered, not required.

alter table public.comments     add column idempotency_key text;
alter table public.time_entries add column idempotency_key text;

comment on column public.comments.idempotency_key is
  'Client-generated, stable across retries of one submission. Null for anything written without one.';
comment on column public.time_entries.idempotency_key is
  'Client-generated, stable across retries of one submission. Null for anything written without one.';

create unique index comments_idempotency_key
  on public.comments (author_id, idempotency_key)
  where idempotency_key is not null;

create unique index time_entries_idempotency_key
  on public.time_entries (profile_id, idempotency_key)
  where idempotency_key is not null;

-- The key is a retry token and nothing else. Bounding it stops a caller storing
-- a document in it, and 200 is generous for the UUID everything actually sends.
alter table public.comments
  add constraint comments_idempotency_key_length
  check (idempotency_key is null or char_length(idempotency_key) between 8 and 200);

alter table public.time_entries
  add constraint time_entries_idempotency_key_length
  check (idempotency_key is null or char_length(idempotency_key) between 8 and 200);


-- ===========================================================================
-- 20260825160000_trash.sql
-- ===========================================================================

-- One place to find what has been deleted, and one place to put it back.
--
-- Soft delete already exists: `work_items.deleted_at` since
-- `20260825092000_editable_after_creation.sql`, `comments.deleted_at` since the
-- first thread migration. What has never existed is a way to SEE either of them.
-- `list_deleted_work_items(sprint_id)` is the closest thing, and it was written
-- for one job — stopping `deleteSprint` from cascading away a sprint that looks
-- empty because everything in it is binned. You have to already know which
-- sprint to ask about.
--
-- So a story deleted from the wrong sprint is recoverable in principle and
-- unfindable in practice, and a withdrawn comment is recoverable by nobody at
-- all. This adds the read.
--
-- ## Who sees what, and why it is not one rule
--
-- Items: admin and lead, matching `list_deleted_work_items` and matching who may
-- delete one in the first place.
--
-- Comments: the author, or an admin. **Not a lead**, and that is deliberate
-- rather than an oversight. The policy that governs a comment is `edit own
-- comment` — author or admin — and restoring somebody's withdrawn remark into a
-- thread is closer to editing it than to un-deleting a row. Widening this would
-- mean widening that policy, which would also let a lead rewrite anybody's
-- comment. Same principle as `restore_document_revision`: who may restore is who
-- may write, and it is decided in one place.
--
-- ## Purging is admin only, and it is the only destructive thing here
--
-- Everything else in this schema is recoverable. `purge_deleted` is not, which
-- is why it takes an explicit id rather than offering "empty the trash": there
-- is no control that destroys an unbounded amount of work in one press.

create or replace function public.trash_list()
returns table (
  kind          text,
  entity_id     uuid,
  title         text,
  item_key      text,
  project_slug  text,
  project_name  text,
  sprint_number int,
  minutes_logged int,
  deleted_at    timestamptz,
  can_restore   boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not public.is_active_member() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  return query
  -- Stories, for an admin or a lead.
  select
    'work_item'::text,
    w.id,
    w.title,
    w.key,
    p.slug,
    p.name,
    s.number,
    w.minutes_logged,
    w.deleted_at,
    true
  from public.work_items w
  join public.sprints s  on s.id = w.sprint_id
  join public.projects p on p.id = s.project_id
  where w.deleted_at is not null
    and public.is_admin_or_lead()

  union all

  -- Withdrawn comments. Everyone internal can SEE that one exists — the thread
  -- already shows its tombstone — but only the author or an admin gets the
  -- restore, so `can_restore` is computed here rather than guessed by the
  -- screen.
  --
  -- `body_text` is deliberately NOT returned. The thread hides a withdrawn
  -- comment's words from every reader including its author, and a trash screen
  -- that prints them would undo that with no one noticing. What is shown is
  -- where it was and when it went.
  select
    'comment'::text,
    c.id,
    -- Enough to tell two of your own apart, and nothing anybody said.
    'Comment on ' || w.key,
    w.key,
    p.slug,
    p.name,
    s.number,
    null::int,
    c.deleted_at,
    (c.author_id = actor or public.auth_role() = 'admin'::public.app_role)
  from public.comments c
  join public.work_items w on w.id = c.work_item_id
  join public.sprints s    on s.id = w.sprint_id
  join public.projects p   on p.id = s.project_id
  where c.deleted_at is not null
    and (
      public.is_admin_or_lead()
      or c.author_id = actor
    )

  order by 9 desc;
end;
$$;

comment on function public.trash_list is
  'Everything soft-deleted that the caller may see. Never returns a withdrawn comment''s words — only where it was and when it went.';

revoke all on function public.trash_list() from public, anon;
grant execute on function public.trash_list() to authenticated;

-- ---------------------------------------------------------------------------
-- Putting a comment back.
--
-- `security invoker`, so the `edit own comment` policy decides — author or
-- admin — exactly as it does when the same person withdrew it. Nothing here
-- restates the rule.
--
-- Stories already have `set_work_item_deleted(id, false)` and keep using it.
-- ---------------------------------------------------------------------------

create or replace function public.restore_comment(p_comment_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected int;
  item     uuid;
begin
  update public.comments
     set deleted_at = null
   where id = p_comment_id
     and deleted_at is not null
  returning work_item_id into item;

  get diagnostics affected = row_count;
  -- RLS refuses by matching no rows rather than by raising, so a denied restore
  -- would otherwise report success. Same trap as restore_document_revision.
  if affected = 0 then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  return item;
end;
$$;

revoke all on function public.restore_comment(uuid) from public, anon;
grant execute on function public.restore_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Purging. The one irreversible operation.
-- ---------------------------------------------------------------------------

create or replace function public.purge_deleted(p_kind text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Admin only, and stated here rather than left to RLS: a hard delete on
  -- `work_items` cascades to its criteria, its thread, its time entries and its
  -- revisions, and none of that comes back. This is the one place in the schema
  -- where "the policy happens to allow it" is not a good enough reason.
  if public.auth_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only an admin may purge' using errcode = '42501';
  end if;

  if p_kind = 'work_item' then
    -- Only something already in the bin. Purging is emptying the trash, never a
    -- shortcut past the soft delete — deleting a live story in one step is not
    -- an operation this offers.
    delete from public.work_items where id = p_entity_id and deleted_at is not null;
  elsif p_kind = 'comment' then
    delete from public.comments where id = p_entity_id and deleted_at is not null;
  else
    raise exception 'Not something that can be purged' using errcode = '22023';
  end if;
end;
$$;

comment on function public.purge_deleted is
  'Irreversible. Admin only, one row at a time, and only rows already soft-deleted.';

revoke all on function public.purge_deleted(text, uuid) from public, anon;
grant execute on function public.purge_deleted(text, uuid) to authenticated;


-- ===========================================================================
-- 20260825170000_private_realtime_channels.sql
-- ===========================================================================

-- Presence channels are private, and the database is what says who may join one.
--
-- ## The spike this settles
--
-- The plan made this phase's first task a question: does this Supabase expose
-- `realtime.messages` RLS — private channels authorized in SQL — or does it not,
-- in which case channels stay token-authenticated and must carry nothing that
-- RLS would otherwise be protecting?
--
-- Measured on 2026-08-25 against realtime **v2.112.6** and `@supabase/realtime-js`
-- **2.112.3**:
--
--   * `realtime.messages` exists, partitioned by day, `relrowsecurity = true`.
--   * It carries **zero policies**, so a private channel is currently denied to
--     everyone — RLS with no policy denies.
--   * `authenticated` holds `select`, `insert` and `update` grants on it.
--   * The client supports `config: { private: true }`.
--
-- So: yes. Private channels work, and the only thing missing is the policy this
-- migration adds. Recorded in `05-DECISIONS.md` with the versions, because the
-- answer is a property of those versions and not of the idea.
--
-- ## Why the check is `is_active_member()` and not per-entity
--
-- A topic-scoped policy — "you may join `presence:sprint:X` if you can read
-- sprint X" — looks stricter and is not, here. Every internal member can read
-- every sprint and every story: `sprints`, `work_items` and `comments` are all
-- gated on `is_active_member()` and nothing narrower. So per-entity scoping
-- would parse the topic, look up the row, and arrive at the answer
-- `is_active_member()` already gives — while adding a query per join and a
-- second place for the visibility rule to live.
--
-- **What it does exclude is the thing that matters.** `is_active_member()`
-- requires `account_kind = 'internal'`, so a client contact cannot join any of
-- these channels, and neither can `anon` — the policy is `to authenticated`
-- only. That is the boundary the client portal rests on, and it is the same
-- function every other internal table uses, rather than a second expression of
-- it that could drift.
--
-- If a future channel is ever scoped more narrowly than "the internal team" —
-- one person's notifications, say — it needs its own policy and its own topic
-- prefix. This one deliberately does not try to be that.
--
-- ## The prefix
--
-- Every private topic this application opens begins `coditu:`. Without it the
-- policy would authorize any private topic at all, including one an attacker
-- picked, which turns the workspace into a general-purpose message bus for
-- anybody with a session. The prefix is not a secret and is not doing security
-- on its own; it is what makes the policy answerable.
--
-- Note that `sprint:{id}` and `thread:{id}` — the existing `postgres_changes`
-- subscriptions — are NOT affected. Those never touch `realtime.messages`;
-- their authorization is the RLS on the tables they watch.

create policy "internal members join coditu channels"
  on realtime.messages
  for select
  to authenticated
  using (
    public.is_active_member()
    and realtime.topic() like 'coditu:%'
  );

create policy "internal members send on coditu channels"
  on realtime.messages
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and realtime.topic() like 'coditu:%'
  );


-- ===========================================================================
-- 20260825180000_purging_a_comment_takes_its_history.sql
-- ===========================================================================

-- Purging a comment removes its versions too.
--
-- `document_revisions.entity_id` is a plain uuid: it addresses five different
-- tables, so it can carry a foreign key to none of them. `work_item_id` and
-- `sprint_id` do have one and cascade, which is why purging a STORY already
-- takes its whole history with it — and why a comment's history was left
-- behind, silently, by the same operation.
--
-- The confirmation on the trash screen says a purge "removes the comment
-- permanently". It did not. The words stayed in `document_revisions` and the
-- version history panel went on rendering them, for ever, on a story anybody
-- internal could open. Found by `e2e/editable.spec.ts` — *"withdrawn, not
-- vanished — and its words never reach the browser"* — which reloads the page
-- and greps the source, so it caught a leak two phases after the phase that
-- introduced it.
--
-- The read side is fixed as well and independently: `lib/data/revisions.ts` now
-- shows a comment's revisions only while that comment is present and standing,
-- written as an allowlist. That covers rows orphaned before this migration; this
-- covers everything after it. Neither alone is enough — the reader would go on
-- carrying dead rows for ever, and a future reader that forgot the rule would
-- expose them again.
--
-- **Criteria are deliberately not treated this way.** A removed criterion's
-- history is a legitimate record of what the work asked for and when it
-- changed; no rule anywhere says those words must stop being readable. A
-- withdrawn comment is the opposite: withdrawing is *specifically* the act of
-- taking words back from every reader including their author.

create or replace function public.purge_deleted(p_kind text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Admin only, and stated here rather than left to RLS: a hard delete on
  -- `work_items` cascades to its criteria, its thread, its time entries and its
  -- revisions, and none of that comes back. This is the one place in the schema
  -- where "the policy happens to allow it" is not a good enough reason.
  if public.auth_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only an admin may purge' using errcode = '42501';
  end if;

  if p_kind = 'work_item' then
    -- Only something already in the bin. Purging is emptying the trash, never a
    -- shortcut past the soft delete — deleting a live story in one step is not
    -- an operation this offers.
    --
    -- Revisions go by cascade: `document_revisions.work_item_id` references
    -- this row, and that includes the revisions of its criteria and comments,
    -- which the trigger stamps with the story they belong to.
    delete from public.work_items where id = p_entity_id and deleted_at is not null;

  elsif p_kind = 'comment' then
    -- Nothing cascades here, so the history is removed explicitly — and BEFORE
    -- the comment, so a failure leaves the comment in the bin with its history
    -- rather than a comment that is gone with its words still readable. If only
    -- one of these two statements can happen, this is the safe order.
    delete from public.document_revisions
     where surface = 'comment'
       and entity_id = p_entity_id
       and exists (
         select 1 from public.comments c
          where c.id = p_entity_id and c.deleted_at is not null
       );

    delete from public.comments where id = p_entity_id and deleted_at is not null;

  else
    raise exception 'Not something that can be purged' using errcode = '22023';
  end if;
end;
$$;

comment on function public.purge_deleted is
  'Irreversible. Admin only, one row at a time, only rows already soft-deleted. Takes the entity''s document history with it.';


-- ===========================================================================
-- 20260826090000_saved_views.sql
-- ===========================================================================

-- A view is a saved question about a sprint, not a saved answer.
--
-- `spec` holds filter, sort and mode — the same vocabulary that already lives in
-- the URL — and never a row set. That is the whole design decision. A view that
-- stored twelve work-item ids would be a stale list the moment somebody moved a
-- story, and "Peer review queue" would quietly stop meaning peer review queue.
-- Storing the question means the answer is recomputed every time it is opened,
-- which is what anybody clicking a saved view actually expects.
--
-- It also keeps this table out of the scoping rules entirely: a spec cannot leak
-- a row, because it contains no rows. Whatever the reader is allowed to see is
-- decided where it always was — by the RLS on `work_items` — when the view is
-- applied.
--
-- ## Invariant 1, enforced by the schema rather than by the writer
--
-- A view belongs to a project. It may also name a sprint, and if it does, that
-- sprint must belong to the same project — otherwise `/app/projects/nile/…`
-- could hold a view pointing at EVIM's Week 17, which is exactly the shape of
-- leak invariant 1 exists to prevent.
--
-- A trigger could check that. A composite foreign key cannot be wrong: adding
-- `unique (id, project_id)` to `sprints` — redundant on its own, since `id` is
-- already the key — gives `(sprint_id, project_id)` something to reference, and
-- the database refuses the mismatch without anybody remembering to.
--
-- ## Who may do what, and why it matches comments
--
-- Read: any active internal member, if the view is shared or is their own.
-- Write: the owner, or an admin — the same rule as `edit own comment`, and for
-- the same reason. A shared view sits in everybody's menu; an admin has to be
-- able to take one down without asking the person who made it to come back from
-- leave. Widening it further would let a lead rename somebody's private view,
-- which is not a delivery decision.
--
-- Client contacts are excluded by `is_active_member()`, like every other
-- internal table. `anon` is excluded by `to authenticated`.

-- ---------------------------------------------------------------------------
-- The key the composite foreign key below needs. `id` is already unique on its
-- own; this exists so `(sprint_id, project_id)` has something to point at.
-- ---------------------------------------------------------------------------
alter table public.sprints
  add constraint sprints_id_project_id_key unique (id, project_id);

create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  -- Null means "this project, whichever sprint you are looking at". A view
  -- called `Peer review queue` is worth carrying from one week to the next; one
  -- called `Week 17 carry-over` is not.
  sprint_id   uuid,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  /**
   * The name, folded, so the uniqueness rule below can be an upsert target.
   *
   * A unique index on `lower(btrim(name))` expresses the same rule and cannot
   * be used by PostgREST: `on_conflict` takes column NAMES, and asking it for
   * an expression returns `42703 column "lower" does not exist`. A stored
   * generated column is the same fold, held in something PostgREST can point
   * at — so saving twice under `Peer review queue` and ` peer REVIEW queue `
   * is one overwrite rather than an error nobody can resolve.
   */
  name_key    text generated always as (lower(btrim(name))) stored,
  spec        jsonb not null default '{}'::jsonb,
  is_shared   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint saved_views_name_length
    check (length(btrim(name)) between 1 and 60),

  -- Belt and braces beneath the zod schema that validates this on both sides in
  -- TypeScript. It cannot check the shape, but it can refuse an array or a
  -- string, which is what a mistake looks like.
  constraint saved_views_spec_is_object
    check (jsonb_typeof(spec) = 'object'),

  -- The sprint, if named, belongs to this project. See the note above.
  constraint saved_views_sprint_in_project
    foreign key (sprint_id, project_id)
    references public.sprints (id, project_id)
    on delete cascade
);

-- One name per person per project. Two views both called `Mine` is a menu
-- nobody can use, and the second save should be an overwrite rather than a
-- duplicate. On the generated column, so `saveView` can name it in an upsert.
create unique index saved_views_owner_name_key
  on public.saved_views (project_id, owner_id, name_key);

-- The menu's query: this project's views, mine and everybody's shared ones.
create index saved_views_project_idx on public.saved_views (project_id, is_shared);
create index saved_views_owner_idx on public.saved_views (owner_id);

create trigger saved_views_set_updated_at
  before update on public.saved_views
  for each row execute function public.set_updated_at();

comment on table public.saved_views is
  'A saved question about a sprint — filter, sort and mode — never a saved row set. §5.5.';
comment on column public.saved_views.spec is
  'Filter/sort/mode only. Validated by zod on read AND write; a row set here would be stale the moment anything moved.';
comment on column public.saved_views.sprint_id is
  'Null means the view follows whichever sprint is open. When set, the composite FK guarantees the sprint belongs to project_id — invariant 1.';

-- ---------------------------------------------------------------------------
-- The grant, which RLS does not imply.
--
-- A policy says which ROWS a role may touch; a grant says whether the role may
-- touch the table at all. Without this every statement here fails with
-- `42501 permission denied for table saved_views` no matter how permissive the
-- policies are — and the failure looks like an RLS bug, which is the wrong
-- place to go looking. `work_item_components` carries the same line for the
-- same reason.
--
-- No `truncate`, no `references`: this table is written a row at a time.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.saved_views to authenticated;

alter table public.saved_views enable row level security;

create policy "members read shared and own views"
  on public.saved_views
  for select
  to authenticated
  using (
    public.is_active_member()
    and (is_shared or owner_id = (select auth.uid()))
  );

-- You may only create a view owned by you. An admin editing somebody else's is
-- covered below; an admin *creating* one in somebody else's name is not a thing
-- that should be possible.
create policy "members create their own views"
  on public.saved_views
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and owner_id = (select auth.uid())
  );

create policy "owner or admin updates a view"
  on public.saved_views
  for update
  to authenticated
  using (
    public.is_active_member()
    and (owner_id = (select auth.uid()) or public.auth_role() = 'admin')
  )
  with check (
    public.is_active_member()
    and (owner_id = (select auth.uid()) or public.auth_role() = 'admin')
  );

create policy "owner or admin deletes a view"
  on public.saved_views
  for delete
  to authenticated
  using (
    public.is_active_member()
    and (owner_id = (select auth.uid()) or public.auth_role() = 'admin')
  );


-- ===========================================================================
-- 20260826120000_favourites.sql
-- ===========================================================================

-- What one person keeps at the top of their sidebar.
--
-- Deferred from W6d and built now, in the order that decision recorded: the
-- design's three favourites are a saved filter view, a work item and a component
-- registry, and saved views did not exist until W7. Building this table then
-- would have meant either a schema that could hold two of its three kinds, or
-- inventing what a saved view is from a chip in a prototype.
--
-- ## Three columns, not one `target_id`
--
-- The obvious shape is `(kind, target_id)` and it is wrong here for the reason
-- `saved_views` chose a composite foreign key over a trigger: a polymorphic
-- `target_id` cannot have a foreign key, so deleting a story would leave a
-- favourite pointing at nothing, and the sidebar would render a row that goes
-- nowhere. Nobody would notice until they clicked it.
--
-- Three nullable columns, each with a real `on delete cascade`, and a check that
-- exactly one is set. Deleting the target deletes the favourite, and the
-- database does it without anybody remembering to. Adding a fourth kind is one
-- column, one FK and one term in the check — which is more typing than a
-- polymorphic id and cannot rot.
--
-- ## Invariant 1 is somebody else's job here, and that is deliberate
--
-- A favourite holds no project scope of its own because it holds no data of its
-- own: it is a pointer, and what it points at is already scoped. Whether the
-- reader may SEE a favourited story is decided where it always is — by the RLS
-- on `work_items` — when the row is read through the join. A favourite cannot
-- widen anything, because a person can only create one for a row they could
-- already read.
--
-- ## Who may do what
--
-- Yours alone. Not shared, not visible to a lead, not adjustable by an admin —
-- a favourite is a note about how one person works, and there is no operational
-- reason for anybody else to see or change it. That is stricter than
-- `saved_views`, which has a shared mode, and the difference is the point: a
-- shared view is a team artefact, a favourite is furniture in one person's room.
--
-- No `update` policy and no `update` grant: a favourite has nothing to change.
-- It is inserted or it is deleted.

create table public.favourites (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,

  -- Exactly one of these is set. See the note above on why this is not a
  -- polymorphic `target_id`.
  saved_view_id uuid references public.saved_views (id) on delete cascade,
  work_item_id  uuid references public.work_items (id)  on delete cascade,
  component_id  uuid references public.components (id)  on delete cascade,

  created_at    timestamptz not null default now(),

  constraint favourites_exactly_one_target check (
    (saved_view_id is not null)::int
    + (work_item_id is not null)::int
    + (component_id is not null)::int
    = 1
  )
);

-- One favourite per person per thing. Starring twice is the same star, and the
-- second insert should collide rather than making a duplicate row that the
-- un-star then only half removes.
--
-- Partial, because two favourites for different kinds both have nulls in the
-- other columns and a plain composite unique index would treat those nulls as
-- distinct — which is correct SQL and the wrong rule here.
create unique index favourites_one_view_idx
  on public.favourites (profile_id, saved_view_id) where saved_view_id is not null;
create unique index favourites_one_item_idx
  on public.favourites (profile_id, work_item_id) where work_item_id is not null;
create unique index favourites_one_component_idx
  on public.favourites (profile_id, component_id) where component_id is not null;

-- The sidebar's query: everything one person has starred, newest first.
create index favourites_profile_idx on public.favourites (profile_id, created_at desc);

comment on table public.favourites is
  'What one person keeps at the top of their sidebar. Private to them; a pointer, never a copy.';
comment on column public.favourites.saved_view_id is
  'Exactly one of saved_view_id / work_item_id / component_id is set. Real FKs, so a deleted target takes its favourites with it.';

-- ---------------------------------------------------------------------------
-- The grant, which RLS does not imply — see the same note on `saved_views`.
-- Without it every statement fails with `42501 permission denied for table
-- favourites` however permissive the policies are, and the failure reads as an
-- RLS bug, which is the wrong place to look.
--
-- No `update`: there is nothing on this row to change.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.favourites to authenticated;

alter table public.favourites enable row level security;

create policy "members read their own favourites"
  on public.favourites
  for select
  to authenticated
  using (public.is_active_member() and profile_id = (select auth.uid()));

-- You may only star something as yourself. Starring on somebody else's behalf
-- is not a thing that should be possible, so the check names the writer rather
-- than trusting the column.
create policy "members create their own favourites"
  on public.favourites
  for insert
  to authenticated
  with check (public.is_active_member() and profile_id = (select auth.uid()));

create policy "members remove their own favourites"
  on public.favourites
  for delete
  to authenticated
  using (public.is_active_member() and profile_id = (select auth.uid()));


-- ===========================================================================
-- 20260826140000_access_events.sql
-- ===========================================================================

-- Every change to who can see what, and who made it.
--
-- Deferred from W4 to here, in the order `05-DECISIONS.md` recorded: the table
-- had no writer and no reader until People & Access existed, and building it
-- early would have meant five phases of a table with no test that could fail.
--
-- ## Triggers, not Server Actions
--
-- Every write below could have been an `insert` beside the one it records. It is
-- a trigger instead, and the reason is what an audit log is FOR: a line in an
-- action can be forgotten by whoever adds the sixth way to grant access, and a
-- log with a hole in it is worse than no log, because the hole is invisible and
-- the rest still looks complete.
--
-- A trigger also catches what no action can: a write made from the SQL console,
-- from the service-role client, or by a migration. Those are exactly the writes
-- an audit trail is asked about after the fact. `05-DECISIONS.md` records the
-- same argument for the composite foreign key on `saved_views` — a trigger could
-- have checked it, a foreign key cannot be forgotten. This is the case where the
-- trigger is the thing that cannot be forgotten.
--
-- ## Nobody may write it, including an admin
--
-- There is no `insert`, `update` or `delete` grant on this table for
-- `authenticated` at all. The trigger functions are `security definer`, so they
-- write regardless; every other route in is closed. An audit row cannot be
-- forged, edited or removed through the application, which is the only property
-- that makes reading one worth anything.
--
-- ## Who may read it
--
-- Admin and lead. An engineer is refused, which matches the design and matches
-- `/app/clients`: what a lead runs is delivery, and who has access is not a
-- delivery decision — but a lead does need to see it, because they are the ones
-- who notice when something is wrong.

create type public.access_event_kind as enum (
  'role',
  'activation',
  'allowlist',
  'client_contact',
  'client_grant',
  'temporary_password'
);

create table public.access_events (
  id          uuid primary key default gen_random_uuid(),

  -- Null for a write with no session behind it: a migration, the service-role
  -- client, or the SQL console. Rendered as `system`, which is true.
  actor_id    uuid references public.profiles (id) on delete set null,

  -- Who it was about. Null for an allowlist row, which names an address that
  -- has no account yet — that is the whole point of an allowlist.
  subject_id  uuid references public.profiles (id) on delete set null,
  subject_label text not null,

  kind        public.access_event_kind not null,
  -- The same verb/from/to shape `activity` uses, so the two feeds can be worded
  -- by the same kind of function and neither invents a vocabulary.
  from_value  text,
  to_value    text,

  -- Set only for a grant, which is the one kind that is about a project.
  project_id  uuid references public.projects (id) on delete set null,

  created_at  timestamptz not null default now()
);

create index access_events_recent_idx on public.access_events (created_at desc);
create index access_events_subject_idx on public.access_events (subject_id, created_at desc);

comment on table public.access_events is
  'Append-only record of every access change. Written only by security-definer triggers; no write grant exists.';
comment on column public.access_events.actor_id is
  'Null means no session was behind the write — a migration, the service-role client, or the SQL console. Rendered as `system`.';

grant select on public.access_events to authenticated;

-- And take back what this project grants by DEFAULT, which is more than the
-- line above adds. `information_schema.role_table_grants` for `authenticated`
-- on any table here reads `REFERENCES, SELECT, TRIGGER, TRUNCATE` — the last of
-- which **bypasses row-level security entirely**. No policy can stop a
-- `truncate`, and an audit table somebody can empty in one statement is not
-- evidence of anything.
--
-- Not reachable through PostgREST, which has no way to issue one. Revoked
-- anyway: "append-only" should be true rather than nearly true, and the cost is
-- one line. `07-FIELD-NOTES.md` records that the default applies to every other
-- table too.
revoke truncate on public.access_events from authenticated;

alter table public.access_events enable row level security;

create policy "admins and leads read access history"
  on public.access_events
  for select
  to authenticated
  using (public.is_active_member() and public.auth_role() in ('admin'::public.app_role, 'lead'::public.app_role));

-- ---------------------------------------------------------------------------
-- The writers. One function per table, because the interesting column differs
-- and a single generic one would be a `case` statement pretending to be reuse.
-- ---------------------------------------------------------------------------

create or replace function public.record_profile_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Role and activation are two different events even when one statement
  -- changes both, because "made a lead" and "deactivated" are two different
  -- things to read in a list.
  if new.role is distinct from old.role then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), new.id, new.full_name, 'role', old.role::text, new.role::text);
  end if;

  if new.is_active is distinct from old.is_active then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), new.id, new.full_name, 'activation',
            case when old.is_active then 'active' else 'deactivated' end,
            case when new.is_active then 'active' else 'deactivated' end);
  end if;

  -- A temporary password is an access change even though nothing about the
  -- account's permissions moved: somebody who was not the owner can now sign in
  -- as them until they choose their own.
  if new.must_set_password and not old.must_set_password then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, to_value)
    values ((select auth.uid()), new.id, new.full_name, 'temporary_password', 'issued');
  end if;

  return new;
end;
$$;

create trigger profiles_record_access_events
  after update on public.profiles
  for each row execute function public.record_profile_access_event();

create or replace function public.record_allowlist_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.access_events (actor_id, subject_label, kind, to_value)
    values ((select auth.uid()), new.email, 'allowlist', 'invited');
    return new;
  end if;

  insert into public.access_events (actor_id, subject_label, kind, from_value, to_value)
  values ((select auth.uid()), old.email, 'allowlist', 'invited', 'withdrawn');
  return old;
end;
$$;

create trigger allowed_emails_record_access_events
  after insert or delete on public.allowed_emails
  for each row execute function public.record_allowlist_access_event();

create or replace function public.record_client_contact_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
begin
  select coalesce(p.full_name, 'a client contact') into who
  from public.profiles p
  where p.id = coalesce(new.profile_id, old.profile_id);

  if tg_op = 'INSERT' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, to_value)
    values ((select auth.uid()), new.profile_id, who, 'client_contact', new.status::text);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), old.profile_id, who, 'client_contact', old.status::text, 'removed');
    return old;
  end if;

  if new.status is distinct from old.status then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), new.profile_id, who, 'client_contact', old.status::text, new.status::text);
  end if;

  return new;
end;
$$;

create trigger client_contacts_record_access_events
  after insert or update or delete on public.client_contacts
  for each row execute function public.record_client_contact_access_event();

create or replace function public.record_client_grant_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  row_before public.client_project_grants;
  row_after  public.client_project_grants;
begin
  row_before := old;
  row_after  := coalesce(new, old);

  select coalesce(p.full_name, 'a client contact') into who
  from public.profiles p
  where p.id = row_after.contact_profile_id;

  -- A revocation is a `revoked_at` write, not a delete, so it is the change
  -- worth naming rather than the capability list moving.
  if tg_op = 'UPDATE'
     and (row_after.revoked_at is null) is distinct from (row_before.revoked_at is null) then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), row_after.contact_profile_id, who, 'client_grant',
            case when row_before.revoked_at is null then 'granted' else 'revoked' end,
            case when row_after.revoked_at is null then 'granted' else 'revoked' end,
            row_after.project_id);
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, to_value, project_id)
    values ((select auth.uid()), new.contact_profile_id, who, 'client_grant',
            array_to_string(new.capabilities::text[], ', '), new.project_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), old.contact_profile_id, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '), 'removed', old.project_id);
    return old;
  end if;

  -- Capabilities changed without the grant being revoked or restored.
  if new.capabilities is distinct from old.capabilities then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), new.contact_profile_id, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '),
            array_to_string(new.capabilities::text[], ', '), new.project_id);
  end if;

  return new;
end;
$$;

create trigger client_project_grants_record_access_events
  after insert or update or delete on public.client_project_grants
  for each row execute function public.record_client_grant_access_event();


-- ===========================================================================
-- 20260826170000_recovery_runs.sql
-- ===========================================================================

-- Coditu — rehearsing a recovery, without ever being able to damage one.
--
-- ## The thing this screen exists to answer
--
-- "Could we actually get it back?" is a question nobody should first ask on the
-- day they need the answer. `document_revisions`, `trash` and the attachment
-- rows are the three things application-level recovery rests on, and until now
-- nothing had ever exercised them together — they were three features that
-- each worked, which is not the same as a recovery that works.
--
-- ## The safety property, and how it is enforced rather than promised
--
-- **A rehearsal cannot write to `public`.** Not "does not"; cannot, by
-- construction:
--
--  * Every copy this function makes goes into a schema it creates itself, whose
--    name it generates from `gen_random_uuid()` and which is dropped before the
--    function returns. The caller never supplies a name, so there is no string
--    for a caller to aim somewhere else.
--  * The only statement in the whole body that targets `public` is the single
--    `insert into public.recovery_runs` that records what happened.
--  * `supabase/tests/recovery.sql` asserts it the only way worth asserting: it
--    takes a checksum of every live table before and after a rehearsal — one
--    that passes and one that fails — and requires both to be identical.
--
-- ## And the rehearsal deliberately does not write anything back
--
-- §9 of the brief ends "restore the selection as new versions/copies". That
-- step is **not** new code here, and that is the point: restoring a document as
-- a new version is `restore_revision`, which W4a built, W4c tested and RLS
-- already polices per surface. Reimplementing it inside a function that also
-- creates schemas would put the one genuinely destructive operation in this
-- application inside the one function that runs with the most privilege.
--
-- So the dangerous new machinery is strictly read-only against live data, and
-- the write-back is the ordinary restore somebody presses on the screen where
-- it already lives.

create type public.recovery_run_status as enum ('passed', 'failed');

create table public.recovery_runs (
  id             uuid primary key default gen_random_uuid(),

  -- `set null`, not `restrict`: a run is a record of a check, not of a debt.
  -- Deactivating somebody must not be blocked by a rehearsal they once ran,
  -- and the run stays readable without them.
  actor_id       uuid references public.profiles (id) on delete set null,

  started_at     timestamptz not null,
  finished_at    timestamptz not null default now(),
  status         public.recovery_run_status not null,

  -- Which checks ran. An array rather than a jsonb blob because it is a fixed
  -- vocabulary and the screen filters on it.
  scope          text[] not null,

  -- The schema the copies went into, recorded after it was dropped. Nothing
  -- reads it; it is here so that a leftover schema can be traced to the run
  -- that made it, which is the only way that bug would ever be diagnosable.
  preview_schema text not null,

  checked        int not null check (checked >= 0),
  failed         int not null check (failed >= 0),

  -- One object per problem: `{check, subject, detail}`. Capped by the function
  -- so a workspace with ten thousand broken attachments records a readable row
  -- rather than a megabyte of jsonb.
  findings       jsonb not null default '[]'::jsonb
);

comment on table public.recovery_runs is
  'One row per recovery rehearsal. Append-only: written only by rehearse_recovery(), which is security definer and holds the only insert path. A rehearsal copies into a schema it creates and drops, and never writes to public except here.';

create index recovery_runs_recent_idx on public.recovery_runs (finished_at desc);

-- ---------------------------------------------------------------------------
-- Append-only, the same way `document_revisions` and `access_events` are: by
-- what is absent. `authenticated` gets SELECT and nothing else, so there is no
-- insert, update or delete path at all outside the definer function below.
--
-- `truncate` is revoked explicitly. This project grants `REFERENCES, SELECT,
-- TRIGGER, TRUNCATE` to `authenticated` on every table by default, and a
-- truncate bypasses row-level security entirely — policies filter rows and a
-- truncate visits none. Not reachable through PostgREST, which cannot issue
-- one, but "append-only" should be true rather than nearly true. W9 found this
-- and `07-FIELD-NOTES.md` records that it applies to every table here.
-- ---------------------------------------------------------------------------

alter table public.recovery_runs enable row level security;

grant select on public.recovery_runs to authenticated;
revoke truncate on public.recovery_runs from authenticated;

-- Admin only, and reading is as far as it goes. A rehearsal names what is
-- broken across the whole workspace; it is an operations record, not a
-- delivery one.
create policy "admins read recovery runs" on public.recovery_runs
  for select to authenticated
  using (public.auth_role() = 'admin');

-- ---------------------------------------------------------------------------
-- The rehearsal.
-- ---------------------------------------------------------------------------

/**
 * Rehearse an application-level recovery, and record what it found.
 *
 * `p_scope` is a subset of `{documents, trash, attachments}`. Anything else is
 * refused rather than ignored — a rehearsal that silently skipped a check
 * somebody asked for would report "passed" about work it never did, which is
 * the worst possible answer from this particular screen.
 *
 * ## What each check actually proves
 *
 * **documents** — rebuilds the current text of every story description from
 * its newest revision, in the preview schema, and compares that to what the
 * live row says. This is the real question behind version history: not "are
 * there rows" but "would replaying them give us back what we have". A
 * mismatch means history has drifted from the document and a restore would
 * produce something nobody expects.
 *
 * **trash** — every soft-deleted story still has the sprint and project it
 * would be restored into. A deleted story whose sprint was later removed is
 * recoverable in principle and orphaned in practice.
 *
 * **attachments** — every `attachments.storage_path` resolves to an object in
 * the `work-attachments` bucket. Managed database backups do not cover storage
 * at all, so this is the one part of the workspace where the database being
 * fine says nothing about the files.
 */
create or replace function public.rehearse_recovery(p_scope text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started  timestamptz := clock_timestamp();
  v_schema   text;
  v_findings jsonb := '[]'::jsonb;
  v_checked  int := 0;
  v_failed   int := 0;
  v_id       uuid;
  v_unknown  text[];
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'only an admin may rehearse a recovery' using errcode = '42501';
  end if;

  if p_scope is null or array_length(p_scope, 1) is null then
    raise exception 'a rehearsal needs at least one check' using errcode = '22023';
  end if;

  select array_agg(s) into v_unknown
  from unnest(p_scope) as s
  where s not in ('documents', 'trash', 'attachments');

  if v_unknown is not null then
    raise exception 'unknown recovery check: %', array_to_string(v_unknown, ', ')
      using errcode = '22023';
  end if;

  -- The name is generated here and never comes from the caller. `format('%I')`
  -- would quote a hostile identifier safely anyway; not accepting one at all is
  -- better than quoting one correctly.
  v_schema := 'recovery_preview_' || replace(gen_random_uuid()::text, '-', '');
  execute format('create schema %I', v_schema);

  -- ── documents ────────────────────────────────────────────────────────────
  if 'documents' = any (p_scope) then
    -- The copy. Only the newest revision per document is needed to answer the
    -- question, and taking it in the preview schema rather than in a CTE is
    -- what makes this a restore rehearsal rather than a query.
    execute format(
      'create table %I.restored as
         select distinct on (r.entity_id)
                r.entity_id,
                r.plain_text
           from public.document_revisions r
          where r.surface = ''work_item_description''
          order by r.entity_id, r.revision_no desc',
      v_schema
    );

    execute format(
      'select count(*),
              coalesce(jsonb_agg(jsonb_build_object(
                ''check'', ''documents'',
                ''subject'', w.key,
                ''detail'', ''the newest revision does not reproduce the live description''
              )) filter (where w.id is not null), ''[]''::jsonb)
         from %I.restored p
         join public.work_items w on w.id = p.entity_id
        where coalesce(w.description, '''') is distinct from coalesce(p.plain_text, '''')',
      v_schema
    ) into v_checked, v_findings;

    -- `v_checked` above counted only the mismatches; the honest denominator is
    -- every document that had a revision to replay.
    v_failed := v_checked;
    execute format('select count(*) from %I.restored', v_schema) into v_checked;
  end if;

  -- ── trash ────────────────────────────────────────────────────────────────
  if 'trash' = any (p_scope) then
    declare
      v_t_checked int;
      v_t_failed  int;
      v_t_find    jsonb;
    begin
      execute format(
        'create table %I.binned as
           select w.id, w.key, w.sprint_id
             from public.work_items w
            where w.deleted_at is not null',
        v_schema
      );

      execute format('select count(*) from %I.binned', v_schema) into v_t_checked;

      execute format(
        'select count(*),
                coalesce(jsonb_agg(jsonb_build_object(
                  ''check'', ''trash'',
                  ''subject'', b.key,
                  ''detail'', ''the sprint this would be restored into no longer exists''
                )), ''[]''::jsonb)
           from %I.binned b
          where not exists (
            select 1 from public.sprints s
              join public.projects pr on pr.id = s.project_id
             where s.id = b.sprint_id)',
        v_schema
      ) into v_t_failed, v_t_find;

      v_checked := v_checked + v_t_checked;
      v_failed := v_failed + v_t_failed;
      v_findings := v_findings || v_t_find;
    end;
  end if;

  -- ── attachments ──────────────────────────────────────────────────────────
  if 'attachments' = any (p_scope) then
    declare
      v_a_checked int;
      v_a_failed  int;
      v_a_find    jsonb;
    begin
      execute format(
        'create table %I.files as
           select a.id, a.file_name, a.storage_path from public.attachments a',
        v_schema
      );

      execute format('select count(*) from %I.files', v_schema) into v_a_checked;

      -- Capped at fifty. A workspace whose storage never got uploaded produces
      -- one finding per file, and a row nobody can read is not a record.
      execute format(
        'select count(*),
                coalesce(jsonb_agg(jsonb_build_object(
                  ''check'', ''attachments'',
                  ''subject'', f.file_name,
                  ''detail'', ''no object at this path in work-attachments''
                )) filter (where f.rn <= 50), ''[]''::jsonb)
           from (select f.*, row_number() over (order by f.file_name) as rn
                   from %I.files f
                  where not exists (
                    select 1 from storage.objects o
                     where o.bucket_id = ''work-attachments''
                       and o.name = f.storage_path)) f',
        v_schema
      ) into v_a_failed, v_a_find;

      v_checked := v_checked + v_a_checked;
      v_failed := v_failed + v_a_failed;
      v_findings := v_findings || v_a_find;
    end;
  end if;

  -- Dropped before the row is written, so a run that is recorded is a run whose
  -- copies are already gone. The name survives in the row purely so a leftover
  -- schema could be traced back here.
  execute format('drop schema %I cascade', v_schema);

  insert into public.recovery_runs
    (actor_id, started_at, status, scope, preview_schema, checked, failed, findings)
  values (
    (select auth.uid()),
    v_started,
    case when v_failed = 0 then 'passed'::public.recovery_run_status
         else 'failed'::public.recovery_run_status end,
    p_scope,
    v_schema,
    v_checked,
    v_failed,
    v_findings
  )
  returning id into v_id;

  return v_id;
exception
  when others then
    -- A rehearsal that throws must not leave a schema behind. `drop ... if
    -- exists` because the failure may have happened before it was created.
    if v_schema is not null then
      execute format('drop schema if exists %I cascade', v_schema);
    end if;
    raise;
end;
$$;

revoke all on function public.rehearse_recovery(text[]) from public;
grant execute on function public.rehearse_recovery(text[]) to authenticated;

comment on function public.rehearse_recovery(text[]) is
  'Rehearses an application-level recovery into a schema it creates and drops, and records the result. Admin only. Writes nothing to public except its own recovery_runs row — supabase/tests/recovery.sql checksums every live table around a passing and a failing run to prove it.';


-- ===========================================================================
-- 20260826180000_revoke_truncate.sql
-- ===========================================================================

-- Coditu — take `truncate` away from `authenticated`, on everything.
--
-- ## The default nobody chose
--
-- This project grants `authenticated` `REFERENCES, SELECT, TRIGGER, TRUNCATE`
-- on every table it creates. Three of those are ordinary. The fourth is not:
-- **`truncate` bypasses row-level security entirely.** Policies filter rows,
-- and a truncate does not visit any — so every `using` clause, every
-- `is_active_member()`, every append-only guard in this schema is irrelevant to
-- it.
--
-- W9 found this while building `access_events` and revoked it there. W12 did
-- the same for `recovery_runs`. Both notes said, correctly, that it applies to
-- every other table too — and W13's sweep is what actually asked the question:
-- **thirty tables still had it**, including `document_revisions`, which is the
-- append-only history the entire version-control feature rests on, and
-- `sprint_payouts`, which is money somebody has been paid against.
--
-- ## It is not reachable today, and that is not the argument
--
-- PostgREST cannot issue a `truncate`, so nothing in the current application
-- can reach this. The reasons to revoke it anyway:
--
--  * "Append-only" is a claim this schema makes in six places, in comments and
--    in `docs/02-DATA-MODEL.md`, and it should be true rather than nearly true.
--    A row that no policy permits removing, that one statement removes all of,
--    is not append-only; it is append-only-through-the-front-door.
--  * The grant is what a future path would inherit. A `security invoker`
--    function, a direct session, a new client — none of them would think to
--    check, because nobody granted it deliberately in the first place.
--  * It costs nothing. Nothing in this application truncates anything; the
--    tests that need a clean table run as the owner.
--
-- `supabase/tests/rls.sql` sweeps every table in `public` and fails if one
-- carries it again, so a table added next year is covered by construction
-- rather than by somebody remembering this file exists.

do $$
declare
  target record;
begin
  for target in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       -- Tables, partitioned tables, and **views**. A view cannot be truncated,
       -- so revoking it there is a formality — but `role_table_grants` reports
       -- the grant on views all the same, and the assertion in
       -- `supabase/tests/rls.sql` is worth more as *"no `TRUNCATE` grant to
       -- `authenticated` anywhere in public"* than as the same sentence with
       -- three names carved out of it. A sweep with exceptions collects more.
       and c.relkind in ('r', 'p', 'v')
  loop
    execute format('revoke truncate on public.%I from authenticated', target.relname);
  end loop;
end;
$$;

-- And for everything created after this migration. `alter default privileges`
-- is the only way to stop the grant arriving in the first place; the loop above
-- only fixes what already exists.
--
-- Scoped to the role that creates the tables — default privileges are recorded
-- per granting role, so this has to name the one migrations run as.
alter default privileges in schema public revoke truncate on tables from authenticated;


-- ===========================================================================
-- 20260826210518_audit_events_survive_a_cascade.sql
-- ===========================================================================

-- An access event must never be the reason a delete fails.
--
-- ## What broke
--
-- Deleting a client contact's account failed outright:
--
--     null value in column "subject_label" of relation "access_events"
--     violates not-null constraint
--
-- Both writers in `20260826140000_access_events.sql` resolve the person's name
-- like this:
--
--     select coalesce(p.full_name, 'a client contact') into who
--     from public.profiles p where p.id = ...;
--
-- The `coalesce` is inside the select list, so it defends against a NULL
-- `full_name` and against nothing else. When the SELECT matches NO ROW it does
-- not run at all, `who` stays NULL, and the insert hits `subject_label not
-- null`.
--
-- The profile is missing for the one case that matters: a CASCADE. Postgres
-- deletes the parent first and fires the child's `after delete` trigger second,
-- so by the time this function asks for the profile, the profile is what is
-- being deleted. `delete from auth.users` cascades to `profiles` cascades to
-- `client_contacts`, which is every ordinary way an account is removed —
-- through the dashboard, through the admin API, or by a fixture cleaning up.
--
-- Deleting the `client_contacts` row on its own, while the profile is still
-- there, always worked. That is why the suite never caught it: the client
-- portal's fixture teardown deletes grants and contacts BEFORE the account, so
-- it walks around the hole every time.
--
-- ## `subject_id` is the same problem one column over
--
-- `subject_id` references `profiles (id)`. Writing the id of a row that is in
-- the middle of being deleted is a foreign-key violation for the same reason —
-- `on delete set null` fixes up rows that already exist, not one being inserted
-- now. So the id is only recorded when the profile is still there.
--
-- ## What is lost, said plainly
--
-- A contact removed by cascade is audited as `a client contact`, with no id.
-- The event, its actor, its time and its `from`/`to` are all still recorded —
-- what goes is the name, because nothing holds it any more at the moment the
-- trigger runs. That is a worse audit line than a named one and a much better
-- outcome than a delete that cannot happen, and it is only ever reached by a
-- cascade: every removal made through the application deletes the contact row
-- first and is still named.

create or replace function public.record_client_contact_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target  uuid := coalesce(new.profile_id, old.profile_id);
  subject uuid;
  who     text;
begin
  select p.id, coalesce(p.full_name, 'a client contact')
    into subject, who
    from public.profiles p
   where p.id = target;

  -- `not found` rather than `who is null`: the two are different questions and
  -- only this one is true when the profile is being cascaded away underneath us.
  if not found then
    subject := null;
    who     := 'a client contact';
  end if;

  if tg_op = 'INSERT' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, to_value)
    values ((select auth.uid()), subject, who, 'client_contact', new.status::text);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), subject, who, 'client_contact', old.status::text, 'removed');
    return old;
  end if;

  if new.status is distinct from old.status then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), subject, who, 'client_contact', old.status::text, new.status::text);
  end if;

  return new;
end;
$$;

create or replace function public.record_client_grant_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject    uuid;
  who        text;
  row_before public.client_project_grants;
  row_after  public.client_project_grants;
begin
  row_before := old;
  row_after  := coalesce(new, old);

  select p.id, coalesce(p.full_name, 'a client contact')
    into subject, who
    from public.profiles p
   where p.id = row_after.contact_profile_id;

  if not found then
    subject := null;
    who     := 'a client contact';
  end if;

  -- A revocation is a `revoked_at` write, not a delete, so it is the change
  -- worth naming rather than the capability list moving.
  if tg_op = 'UPDATE'
     and (row_after.revoked_at is null) is distinct from (row_before.revoked_at is null) then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            case when row_before.revoked_at is null then 'granted' else 'revoked' end,
            case when row_after.revoked_at is null then 'granted' else 'revoked' end,
            row_after.project_id);
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            array_to_string(new.capabilities::text[], ', '), new.project_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '), 'removed', old.project_id);
    return old;
  end if;

  -- Capabilities changed without the grant being revoked or restored.
  if new.capabilities is distinct from old.capabilities then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '),
            array_to_string(new.capabilities::text[], ', '), new.project_id);
  end if;

  return new;
end;
$$;

comment on function public.record_client_contact_access_event is
  'Audits a client contact appearing, changing status, or being removed. Survives a cascade: when the profile is already gone the event is still written, unnamed, rather than failing the delete.';
comment on function public.record_client_grant_access_event is
  'Audits a project grant being made, revoked, restored, re-scoped, or removed. Survives a cascade for the same reason as its sibling.';


-- ===========================================================================
-- 20260826211339_maintenance_rpc_is_not_an_endpoint.sql
-- ===========================================================================

-- `rebalance_project_keys()` was an unauthenticated write.
--
-- ## What it was
--
-- Postgres grants `EXECUTE` to `PUBLIC` on every new function, and `anon` and
-- `authenticated` both inherit from `PUBLIC`. PostgREST exposes every function
-- in an exposed schema as RPC. So a `security definer` function in `public`
-- that nobody granted anything is a public API endpoint that bypasses RLS, and
-- this schema has thirty-six of them.
--
-- Thirty-five are fine. Every one that reads or writes anything either checks
-- `is_admin_or_lead()` in its own body — `set_work_item_deleted` and
-- `list_deleted_work_items` both do, and both answer `anon` with 42501 — or is
-- a trigger function, which cannot be called directly at all, or returns a fact
-- about the caller that is null for a caller with no session.
--
-- `rebalance_project_keys()` is the one that is not. It takes no arguments,
-- checks nothing, and rewrites `key_prefix` and `next_key_number` on every row
-- of `public.projects`. Called with the anon key — which ships in the browser
-- bundle — it ran.
--
-- ## Why it looked safe
--
-- It aborted, so the call appeared to be refused:
--
--     {"code":"21000","message":"UPDATE requires a WHERE clause"}
--
-- That is `safeupdate`, which Supabase loads into the PostgREST session. It
-- fired on the LAST statement in the function, which updates every project's
-- counter with no `where`. The two updates before it have `where` clauses and
-- had already run; only the transaction rolling back undid them.
--
-- So the thing standing between an anonymous request and a write to `projects`
-- was a Supabase session setting reacting to a missing `where` clause. Add the
-- `where` — an ordinary tidy-up — and the function is simply callable. Reach it
-- as `anon` over a connection PostgREST is not holding and `safeupdate` is not
-- loaded at all. Neither of those is a security decision anybody made.
--
-- ## The fix is the grant, not a guard
--
-- Its siblings check `is_admin_or_lead()` because they exist to be called by
-- the application. This one does not: it is called from `seed.sql`, and from
-- the SQL `scripts/import-notion-export.mjs` generates, and from the migration
-- that created it. All three run as the owner, which keeps `EXECUTE` here.
--
-- Adding a guard would make it callable-but-refused and leave it in the
-- generated types as an endpoint. Revoking makes it what it always was: a
-- maintenance routine, reachable by whoever is running the maintenance.

revoke execute on function public.rebalance_project_keys() from public;

comment on function public.rebalance_project_keys is
  'Gives each project the key prefix its own items already use and lifts its counter above them. Maintenance, run by the owner from the seed and the importer — not an endpoint: EXECUTE is revoked from PUBLIC, which is what anon and authenticated inherit.';
