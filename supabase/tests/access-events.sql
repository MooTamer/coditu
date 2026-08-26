-- Coditu — the audit trail may not be the reason a delete fails.
--
-- `20260826140000_access_events.sql` writes an access event from an `after`
-- trigger on `client_contacts` and on `client_project_grants`, and both of them
-- look the person's name up in `profiles` to fill `subject_label`, which is
-- `not null`.
--
-- On a CASCADE there is no name to find. Postgres deletes the parent first and
-- fires the child's trigger second, so `delete from auth.users` — the dashboard,
-- the admin API, a fixture tidying up — reaches this trigger with the profile
-- already gone. The original wrote `select coalesce(p.full_name, '…') into who`,
-- which defends against a NULL column and not against a missing ROW, so `who`
-- came back NULL and the whole delete was refused with a not-null violation.
--
-- Removing the contact row FIRST always worked, which is exactly why nothing
-- caught this: the client-portal fixture's teardown does that, every time.
--
-- So the assertion is deliberately about the cascade, and it asserts both
-- halves: that the delete happens, and that the event is still written.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- ---------------------------------------------------------------------------
-- One client contact, with a grant, built the way an invitation would.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.make_contact(uid uuid, addr text, nm text) returns void
language plpgsql as $$
begin
  insert into public.allowed_emails (email, note) values (addr, 'access-events test');

  -- Empty strings, not NULL, on the token columns — supabase/seed.sql.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          addr, crypt('password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb,
          json_build_object('full_name', nm)::jsonb,
          '', '', '', '', '', '', '', '');

  update public.profiles set account_kind = 'client' where id = uid;

  insert into public.client_contacts (profile_id, client_id, status)
  values (uid, (select id from public.clients order by created_at, id limit 1), 'active');

  insert into public.client_project_grants (contact_profile_id, project_id, capabilities)
  select uid, p.id, '{view_project}'::public.client_capability[]
    from public.projects p
   where p.client_id = (select id from public.clients order by created_at, id limit 1)
   order by p.id
   limit 1;
end;
$$;

select pg_temp.make_contact(
  '11111111-2222-3333-4444-555555555551',
  'cascade@access-events.test',
  'Cascade Probe'
);

-- ---------------------------------------------------------------------------
-- 1. The cascade itself. This is the regression: it raised
--    `null value in column "subject_label"` and the account could not be
--    removed at all.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$delete from auth.users where id = '11111111-2222-3333-4444-555555555551'$$,
  'deleting the account cascades through the contact and its grant'
);

select is(
  (select count(*)::int from auth.users where id = '11111111-2222-3333-4444-555555555551'),
  0,
  'and the account is actually gone, not rolled back'
);

-- ---------------------------------------------------------------------------
-- 2. The event survives too. A delete that succeeds by not auditing anything
--    would pass the test above and be a worse bug than the one it replaced.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.access_events
    where kind = 'client_contact' and to_value = 'removed'
      and created_at > now() - interval '1 minute'),
  1,
  'the contact removal is still recorded'
);

select is(
  (select count(*)::int from public.access_events
    where kind = 'client_grant' and to_value = 'removed'
      and created_at > now() - interval '1 minute'),
  1,
  'and so is the grant removal'
);

select is(
  (select subject_label from public.access_events
    where kind = 'client_contact' and to_value = 'removed'
      and created_at > now() - interval '1 minute'),
  'a client contact',
  'unnamed, because nothing holds the name once the profile is gone — but written'
);

-- ---------------------------------------------------------------------------
-- 3. The ordinary path is unchanged and still names the person. Every removal
--    made through the application deletes the contact row while the profile is
--    still there, and that one must not have been degraded by the fix.
-- ---------------------------------------------------------------------------

select pg_temp.make_contact(
  '11111111-2222-3333-4444-555555555552',
  'named@access-events.test',
  'Named Probe'
);

delete from public.client_contacts where profile_id = '11111111-2222-3333-4444-555555555552';

select is(
  (select subject_label from public.access_events
    where kind = 'client_contact' and to_value = 'removed'
      and subject_id = '11111111-2222-3333-4444-555555555552'),
  'Named Probe',
  'a contact removed while their profile exists is still named'
);

select is(
  (select subject_id from public.access_events
    where kind = 'client_contact' and to_value = 'removed'
      and subject_id = '11111111-2222-3333-4444-555555555552'),
  '11111111-2222-3333-4444-555555555552'::uuid,
  'and still points at them'
);

select * from finish();
rollback;
