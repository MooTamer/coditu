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
