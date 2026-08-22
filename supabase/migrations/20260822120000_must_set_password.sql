-- Coditu — a password an admin handed you has to be replaced before you get in.
--
-- ## What this replaces
--
-- Every email-based recovery path is gone. There is no SMTP and there is not
-- going to be one: Vercel's free tier allows two emails an hour and Supabase's
-- shared sender is rate-limited and explicitly not for production. `/login` had
-- four forms and three email fields, and two of those forms depended on mail
-- that was never going to arrive reliably.
--
-- What replaces them is deliberately low-tech: an admin generates a temporary
-- password on `/app/people`, reads it out to the person, and the account cannot
-- be used for anything else until they change it. This column is the "until".
--
-- ## The honest description of what that is
--
-- An admin setting another person's password IS account takeover of that
-- person. It is accepted here, with its eyes open, because the alternative is a
-- mail dependency the team cannot operate — and because the same four people
-- already administer each other's roles and access. `docs/05-DECISIONS.md`
-- records it. What this migration can enforce is the part that is enforceable:
-- the flag is admin-only, and its owner cannot clear it by any route except
-- actually setting a password.
--
-- ## Why the default is `false` and must stay `false`
--
-- Defaulting it `true` would lock out every account that already exists — the
-- four production ones and every seeded one — and bounce the entire e2e suite to
-- the password screen at its first fixture. An account is only flagged by the
-- action that just changed its password out from under its owner.

alter table public.profiles
  add column must_set_password boolean not null default false;

comment on column public.profiles.must_set_password is
  'Set by an admin handing out a temporary password. While true the app redirects to /auth/update-password and nothing under /app renders. Cleared only by setPassword, after the password is actually changed. Never true by default: defaulting it true locks out every existing account.';

-- ---------------------------------------------------------------------------
-- The flag is a privilege column, so it joins the trigger that guards the rest.
--
-- Without this, clearing it is one PostgREST call away — the "own profile
-- update" policy lets a person write their own row, and the anon key that
-- authorises it ships in the browser bundle. A forced password change that the
-- person being forced can switch off is not a forced password change.
--
-- Rewritten in full rather than patched: `create or replace function` needs the
-- whole body, and the three existing rules are reproduced verbatim.
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
  -- The new one. `setPassword` clears it through the service-role client, which
  -- has `auth.uid()` of null and takes the early return above.
  if new.must_set_password is distinct from old.must_set_password then
    raise exception 'only an admin may require a password change' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_profile_privilege_columns() is
  'Refuses a non-admin write to role, is_active, weekly_capacity_minutes or must_set_password. A policy cannot say "these particular columns are different", so a trigger does. full_name and avatar_url are absent on purpose: how a person presents themselves is not a privilege.';

-- ---------------------------------------------------------------------------
-- The server needs to write this column, and only this column's worth of it.
--
-- `service_role` bypasses RLS POLICIES but not table GRANTs — the same fact
-- `20260821150000_allowlist_service_grant.sql` was written for, and it fails
-- the same way: a bare 42501 that reaches the admin as "that did not save".
--
-- Two callers, both `server-only`, both already the privileged half of an
-- operation that is admin-gated in the application:
--
--   setTemporaryPassword  sets the flag beside a password change
--   setPassword           clears it, for a person who by definition is not an
--                         admin and therefore cannot clear it any other way
--
-- SELECT and UPDATE only. No INSERT, no DELETE: a profile row belongs to an
-- `auth.users` row and the insert trigger is what creates it, while deleting
-- one cascades through the time entries that sprint totals and sent invoices
-- are built from. Neither is something a service key should be able to do by
-- accident.
grant select, update on public.profiles to service_role;
