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
