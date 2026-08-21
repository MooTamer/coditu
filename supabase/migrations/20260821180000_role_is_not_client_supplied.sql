-- Coditu — a new account's role is never taken from the sign-up request.
--
-- `handle_new_user` used to read it straight out of the request:
--
--     coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'engineer')
--
-- `raw_user_meta_data` is `options.data` on `supabase.auth.signUp` — entirely
-- client-controlled, and the sign-up endpoint is public and takes the anon key,
-- which ships in the browser bundle. So anybody on the allowlist could hand
-- themselves the admin role on the way in:
--
--     POST /auth/v1/signup
--     {"email":"…","password":"…","data":{"role":"admin"}}
--
-- Reproduced against the local stack before writing this: the account came back
-- with `profiles.role = 'admin'`. The app's own form never sends a role, which
-- is why nothing looked wrong — but the form is not the boundary, the endpoint
-- is, and the endpoint believed whatever it was told.
--
-- The allowlist limits this to invited addresses, so it is escalation rather
-- than a way in from the street. That is still an engineer becoming an admin by
-- editing a JSON body: admins change roles, deactivate people and control who
-- may sign up at all.
--
-- Every new account is an engineer now. Promotion is an explicit act by an
-- existing admin on `/app/people`, which is the only place a role should ever
-- change — one path, guarded server-side and by RLS, with a row in `activity`.
--
-- `full_name` is still read from the request, and that is fine: a display name
-- is not a privilege, and an admin can correct it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_part text := split_part(new.email, '@', 1);
  display    text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), local_part);
begin
  insert into public.profiles (id, full_name, initials, role)
  values (
    new.id,
    display,
    upper(left(regexp_replace(display, '[^[:alpha:] ]', '', 'g'), 1)) ||
      upper(coalesce(substr(split_part(display, ' ', 2), 1, 1), '')),
    -- Not negotiable, and deliberately not `coalesce(… , 'engineer')`: reading
    -- the request at all is the bug. `public.app_role` stays fully qualified —
    -- an unqualified cast under `search_path = ''` is what broke every sign-up
    -- once already, see 02-DATA-MODEL.md.
    'engineer'::public.app_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile for a new account. The role is always `engineer`: it is never read from the sign-up request, which the client controls. Promotion happens on /app/people.';
