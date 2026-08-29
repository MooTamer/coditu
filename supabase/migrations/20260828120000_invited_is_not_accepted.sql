-- Which invited addresses have actually been USED, not merely created.
--
-- `allowlist_claimed()` answered "is there an account for this address", and
-- until now that was the same question: the only way an account came into
-- existence was somebody signing up with it. The invite path in
-- `lib/actions/allowlist.ts` breaks that equivalence. `inviteUserByEmail`
-- inserts the `auth.users` row at the moment the mail is SENT, so the profile
-- exists — via `handle_new_user`, unchanged — before the person has opened
-- anything. The old predicate would have put "signed up" against the name of
-- somebody who has never seen the invitation.
--
-- `last_sign_in_at` is the honest signal, and it is the one GoTrue sets when
-- the invite link is exchanged for a session. Nothing else in this function
-- changes: still admin-only inside the body, still `security definer` with an
-- empty `search_path`, still emails and one boolean — no ids, no metadata, no
-- tokens.
--
-- The return type is widening, so this is a drop and recreate rather than a
-- `create or replace`; Postgres refuses to change a function's result type in
-- place. The `revoke`/`grant` pair has to be restated for the same reason — a
-- dropped function takes its grants with it, and `docs/07-FIELD-NOTES.md`
-- records what an unrestated grant costs.

drop function if exists public.allowlist_claimed();

create function public.allowlist_claimed()
returns table (email text, accepted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text, (u.last_sign_in_at is not null) as accepted
  from auth.users u
  where public.auth_role() = 'admin'
    and exists (
      select 1 from public.allowed_emails a
      where lower(a.email) = lower(u.email)
    );
$$;

revoke all on function public.allowlist_claimed() from public, anon;
grant execute on function public.allowlist_claimed() to authenticated;

comment on function public.allowlist_claimed() is
  'Invited addresses that already have an account, and whether that account has ever been signed in to. Admin-only; returns nothing to anyone else.';
