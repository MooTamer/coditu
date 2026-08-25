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
