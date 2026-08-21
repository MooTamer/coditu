-- Which invited addresses have actually been used.
--
-- The settings page shows an admin whether an invite is still outstanding. That
-- answer lives in `auth.users`, which no application role may read — so this is
-- the narrowest possible window onto it: emails only, no ids, no metadata, no
-- tokens, and only for a caller who is already an admin.
--
-- `security definer` with an empty `search_path`, like every other helper here.
-- The admin check is inside the function rather than left to a policy, because
-- a `security definer` function bypasses RLS by construction — an unguarded one
-- is a public read of the user table wearing a friendly name.
create or replace function public.allowlist_claimed()
returns table (email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
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
  'Invited addresses that already have an account. Admin-only; returns nothing to anyone else.';
