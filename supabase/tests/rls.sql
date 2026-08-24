-- Coditu — RLS assertions.
--
-- Every policy gets a POSITIVE and a NEGATIVE case. A suite that only proves
-- the allowed thing works will pass just as happily against `using (true)`.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(84);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', uid, 'role', 'authenticated')::text);
end;
$$;

create or replace function pg_temp.act_as_anon() returns void
language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$$;

create or replace function pg_temp.act_as_owner() returns void
language plpgsql as $$
begin
  execute 'set local role postgres';
  execute 'set local request.jwt.claims = ''''';
end;
$$;

-- Creates an account AND gives it the role the fixture asks for.
--
-- The role is applied as a separate UPDATE rather than passed in
-- `raw_user_meta_data`, because `handle_new_user` deliberately ignores that —
-- it is client-controlled and reading it was a privilege escalation. See
-- `20260821180000_role_is_not_client_supplied.sql`. The fixture is a privileged
-- writer, so it states the role directly, exactly as the seed does.
create or replace function pg_temp.make_user(uid uuid, addr text, nm text, r public.app_role) returns void
language plpgsql as $$
begin
  insert into public.allowed_emails (email) values (addr);
  -- Empty strings, not NULL, on the token columns: GoTrue scans them into Go
  -- strings and a NULL breaks every sign-in. See supabase/seed.sql.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          addr, crypt('password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb,
          json_build_object('full_name', nm, 'role', r)::jsonb,
          '', '', '', '', '', '', '', '');

  update public.profiles set role = r where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures. Two clients, two projects, one sprint each — so "one project's data
-- must never surface under another's" has something to actually leak.
-- ---------------------------------------------------------------------------

select pg_temp.make_user('11111111-1111-1111-1111-111111111111', 'admin@rls.test',    'Ada Admin',      'admin');
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'lead@rls.test',     'Leo Lead',       'lead');
select pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'eng@rls.test',      'Eve Engineer',   'engineer');
select pg_temp.make_user('44444444-4444-4444-4444-444444444444', 'other@rls.test',    'Otto Other',     'engineer');
select pg_temp.make_user('55555555-5555-5555-5555-555555555555', 'inactive@rls.test', 'Ivy Inactive',   'engineer');

update public.profiles set is_active = false where id = '55555555-5555-5555-5555-555555555555';

insert into public.clients (id, name, website_url) values
  ('c1000000-0000-0000-0000-000000000001', 'EVIM',         'https://www.evim.de'),
  ('c2000000-0000-0000-0000-000000000002', 'Nile Atelier', 'https://nileatelier.com');

insert into public.projects (id, client_id, name, slug) values
  ('40000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'MEINEvim components', 'rls-meinevim'),
  ('40000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'Partner portal',      'rls-nile-portal');

insert into public.sprints (id, project_id, number, name, status, starts_on, ends_on) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 17, 'Sprint — Week 17', 'active', '2026-08-17', '2026-08-23'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',  1, 'Sprint — Week 1',  'active', '2026-08-17', '2026-08-23');

insert into public.work_items (id, sprint_id, key, title, status, assignee_id, reviewer_id, estimate_minutes, order_index) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'RLS-140', 'EVIM item, Eve assigned',  'dev_started', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 480, 0),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'RLS-141', 'EVIM item, Eve uninvolved', 'todo',       '44444444-4444-4444-4444-444444444444', null,                                   60,  1),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'RLS-900', 'Nile item',                 'todo',       null,                                   null,                                   120, 0);

-- NOTE: no setval here. Fixture keys are RLS-* so they cannot collide with the
-- seed's COD-*, and sequences are not transactional — a setval would survive
-- this test's rollback and permanently advance the real sequence. The lesson
-- about seeds needing setval is real; it belongs in the seed, not here.

insert into public.acceptance_criteria (id, work_item_id, body, order_index) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Toggle sits at the top of settings', 0);

insert into public.time_entries (id, work_item_id, profile_id, minutes, worked_on) values
  ('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 450, '2026-08-18'),
  ('80000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',  30, '2026-08-19');

-- =========================================================================
-- Invariant 2 — minutes, and the rollup that has to equal them
-- =========================================================================

select is(
  (select minutes_logged from public.work_items where id = '60000000-0000-0000-0000-000000000001'),
  480,
  'rollup: minutes_logged equals the sum of its time entries'
);

delete from public.time_entries where id = '80000000-0000-0000-0000-000000000002';
select is(
  (select minutes_logged from public.work_items where id = '60000000-0000-0000-0000-000000000001'),
  450,
  'rollup: deleting an entry lowers minutes_logged'
);
insert into public.time_entries (id, work_item_id, profile_id, minutes, worked_on)
values ('80000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 30, '2026-08-19');

select throws_ok(
  $$insert into public.time_entries (work_item_id, profile_id, minutes)
    values ('60000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 0)$$,
  '23514',
  null,
  'negative: a zero-minute time entry is rejected'
);

-- =========================================================================
-- Scope — one active sprint per project
-- =========================================================================

select throws_ok(
  $$insert into public.sprints (project_id, number, name, status)
    values ('40000000-0000-0000-0000-000000000001', 18, 'Second active', 'active')$$,
  '23505',
  null,
  'negative: a project cannot have two active sprints'
);

select lives_ok(
  $$insert into public.sprints (project_id, number, name, status)
    values ('40000000-0000-0000-0000-000000000001', 18, 'Planned', 'planned')$$,
  'positive: a second PLANNED sprint is fine'
);

-- =========================================================================
-- Invariant 1 — scoping
-- =========================================================================

select is(
  public.work_item_project_id('60000000-0000-0000-0000-000000000001'),
  '40000000-0000-0000-0000-000000000001'::uuid,
  'scoping: an item''s project is derived from its own sprint'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id
   where s.project_id = '40000000-0000-0000-0000-000000000001'),
  2,
  'scoping: a project-scoped query returns only that project''s items'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id
   where s.project_id = '40000000-0000-0000-0000-000000000001'
     and w.key = 'RLS-900'),
  0,
  'negative: another client''s item cannot be reached through a project-scoped query'
);

-- =========================================================================
-- Status order — SQL side. The TS side is asserted in tests/status-order.test.ts.
-- =========================================================================

select is(
  (select array_agg(s order by public.work_item_status_rank(s))
   from unnest(enum_range(null::public.work_item_status)) s)::text,
  '{dev_started,ready_for_peer_review,in_review,changes_requested,todo,draft,blocked,done}',
  'status order: the fixed display order, not the enum declaration order'
);

-- =========================================================================
-- Anonymous
-- =========================================================================

select pg_temp.act_as_anon();

-- Anon is blocked one layer BELOW RLS: the grant was revoked, so these raise
-- 42501 rather than politely returning zero rows. That is the stronger result,
-- and asserting the raise is what proves the grant is the thing doing the work.
select throws_ok('select count(*) from public.work_items',   '42501', null, 'negative: anonymous cannot read work items');
select throws_ok('select count(*) from public.profiles',     '42501', null, 'negative: anonymous cannot read profiles');
select throws_ok('select count(*) from public.time_entries', '42501', null, 'negative: anonymous cannot read time entries');

select pg_temp.act_as_owner();

-- =========================================================================
-- Read — an active member sees everything; an inactive one sees nothing
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
-- Scoped to the fixtures: the seed puts real rows in these tables too, and an
-- absolute count would turn this into a test of the seed's size.
select is(
  (select count(*)::int from public.work_items where key like 'RLS-%'),
  3, 'positive: an active engineer reads every item, including other projects''');
select is(
  (select count(*)::int from public.clients
   where id in ('c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000002')),
  2, 'positive: an active engineer reads every client');
select pg_temp.act_as_owner();

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.work_items), 0, 'negative: a DEACTIVATED profile reads nothing at all');
select pg_temp.act_as_owner();

-- =========================================================================
-- work_items — the two-part rule
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select lives_ok(
  $$update public.work_items set status = 'ready_for_peer_review'
    where id = '60000000-0000-0000-0000-000000000001'$$,
  'positive: an engineer may change status on an item they are assigned'
);

select throws_ok(
  $$update public.work_items set assignee_id = '44444444-4444-4444-4444-444444444444'
    where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an engineer cannot reassign an item, even their own'
);

select throws_ok(
  $$update public.work_items set title = 'renamed'
    where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an engineer cannot rename an item'
);

select throws_ok(
  $$update public.work_items set estimate_minutes = 1
    where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an engineer cannot change an estimate'
);

-- A row-filtering policy denies by matching nothing: the statement succeeds and
-- changes nothing. Assert the row is untouched rather than counting rows.
update public.work_items set status = 'blocked' where id = '60000000-0000-0000-0000-000000000002';
select is(
  (select status from public.work_items where id = '60000000-0000-0000-0000-000000000002'),
  'todo'::public.work_item_status,
  'negative: an engineer cannot edit an item they neither own nor review'
);

select throws_ok(
  $$insert into public.work_items (sprint_id, title)
    values ('50000000-0000-0000-0000-000000000001', 'sneaky')$$,
  '42501',
  null,
  'negative: an engineer cannot create a work item'
);

delete from public.work_items where id = '60000000-0000-0000-0000-000000000002';
select isnt_empty(
  $$select 1 from public.work_items where id = '60000000-0000-0000-0000-000000000002'$$,
  'negative: an engineer cannot delete a work item'
);

select pg_temp.act_as_owner();

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$update public.work_items set title = 'renamed by lead', assignee_id = null
    where id = '60000000-0000-0000-0000-000000000001'$$,
  'positive: a lead may change any column on any item'
);
select lives_ok(
  $$insert into public.work_items (sprint_id, title) values ('50000000-0000-0000-0000-000000000001', 'lead item')$$,
  'positive: a lead may create a work item'
);
select pg_temp.act_as_owner();

update public.work_items set assignee_id = '33333333-3333-3333-3333-333333333333'
where id = '60000000-0000-0000-0000-000000000001';

-- =========================================================================
-- A sign-up cannot choose its own role
--
-- `raw_user_meta_data` is `options.data` on `supabase.auth.signUp` — the client
-- writes it, and the sign-up endpoint is public and takes the anon key. Reading
-- a role out of it meant anyone on the allowlist could arrive as an admin by
-- editing a JSON body. Reproduced against a real local sign-up before the fix.
-- =========================================================================

insert into public.allowed_emails (email) values ('climber@rls.test');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'climber@rls.test', crypt('password', gen_salt('bf')),
        now(), now(), now(), '{}'::jsonb,
        '{"full_name":"Ivan Climber","role":"admin"}'::jsonb,
        '', '', '', '', '', '', '', '');

select is(
  (select role from public.profiles where id = '99999999-9999-9999-9999-999999999999'),
  'engineer'::public.app_role,
  'negative: a sign-up asking for `role: admin` is created as an engineer anyway'
);

-- =========================================================================
-- reorder_work_items — one statement, all of it or none of it
--
-- The action this replaces sent one UPDATE per item and awaited them together.
-- RLS does not raise on a row it filters out, so a caller who could write half
-- the list wrote half the list and was told it had saved. The function counts
-- the rows it moved and refuses to leave a partial order behind.
-- =========================================================================

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select is(
  public.reorder_work_items(
    '60000000-0000-0000-0000-000000000001',
    array['60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001']::uuid[]
  ),
  'ok',
  'positive: an admin renumbers a whole sprint in one call'
);
select is(
  (select array_agg(order_index order by id)
     from public.work_items
    where id in ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002')),
  array[1, 0],
  'positive: every listed item takes its new index'
);

select is(
  public.reorder_work_items(
    '60000000-0000-0000-0000-000000000001',
    array['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003']::uuid[]
  ),
  'foreign-item',
  'negative: an id from another project''s sprint is refused'
);
select is(
  (select order_index from public.work_items where id = '60000000-0000-0000-0000-000000000003'),
  0,
  'negative: and the other project''s item keeps its index'
);

select is(
  public.reorder_work_items(
    '00000000-0000-0000-0000-0000000000ff',
    array['60000000-0000-0000-0000-000000000001']::uuid[]
  ),
  'no-item',
  'negative: an item that does not exist reorders nothing'
);
select pg_temp.act_as_owner();

-- Eve is assignee on 001 and nothing on 002, so RLS lets her move exactly one
-- of the two. That is the case the old loop got wrong.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.reorder_work_items(
      '60000000-0000-0000-0000-000000000001',
      array['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002']::uuid[]
    )$$,
  '42501',
  null,
  'negative: an engineer who may move only some of the rows moves none of them'
);
select pg_temp.act_as_owner();

select is(
  (select array_agg(order_index order by id)
     from public.work_items
    where id in ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002')),
  array[1, 0],
  'negative: the refused reorder left the order exactly as it was'
);

select pg_temp.act_as_anon();
select throws_ok(
  $$select public.reorder_work_items(
      '60000000-0000-0000-0000-000000000001',
      array['60000000-0000-0000-0000-000000000001']::uuid[]
    )$$,
  '42501',
  null,
  'negative: a signed-out visitor has no EXECUTE on the function'
);
select pg_temp.act_as_owner();

-- Put the fixture back the way the rest of the suite expects to find it.
update public.work_items set order_index = 0 where id = '60000000-0000-0000-0000-000000000001';
update public.work_items set order_index = 1 where id = '60000000-0000-0000-0000-000000000002';

-- =========================================================================
-- acceptance_criteria — tick yes, rewrite no
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$update public.acceptance_criteria set is_done = true where id = '70000000-0000-0000-0000-000000000001'$$,
  'positive: an assignee may tick an acceptance criterion'
);
select throws_ok(
  $$update public.acceptance_criteria set body = 'rewritten' where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an engineer cannot rewrite an acceptance criterion'
);
select pg_temp.act_as_owner();

-- =========================================================================
-- time_entries — your hours are yours
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select lives_ok(
  $$insert into public.time_entries (work_item_id, profile_id, minutes)
    values ('60000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 60)$$,
  'positive: a profile may log its own time'
);

select throws_ok(
  $$insert into public.time_entries (work_item_id, profile_id, minutes)
    values ('60000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 60)$$,
  '42501',
  null,
  'negative: a profile cannot log time as somebody else'
);

delete from public.time_entries where id = '80000000-0000-0000-0000-000000000002';
select isnt_empty(
  $$select 1 from public.time_entries where id = '80000000-0000-0000-0000-000000000002'$$,
  'negative: a profile cannot delete another person''s time entry'
);

select pg_temp.act_as_owner();

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
delete from public.time_entries where id = '80000000-0000-0000-0000-000000000002';
select is_empty(
  $$select 1 from public.time_entries where id = '80000000-0000-0000-0000-000000000002'$$,
  'positive: an admin may delete anybody''s time entry'
);
select pg_temp.act_as_owner();

-- =========================================================================
-- profiles — nobody promotes themselves
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$update public.profiles set full_name = 'Eve E.' where id = '33333333-3333-3333-3333-333333333333'$$,
  'positive: a profile may edit its own name'
);
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  'negative: an engineer cannot promote themselves to admin'
);
select pg_temp.act_as_owner();

-- =========================================================================
-- comments — soft delete only, and mentions are materialised
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
insert into public.comments (id, work_item_id, author_id, body_json, body_text)
values ('90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333',
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"mention","attrs":{"id":"22222222-2222-2222-2222-222222222222"}}]}]}'::jsonb,
        '@Leo Lead');

delete from public.comments where id = '90000000-0000-0000-0000-000000000001';
select isnt_empty(
  $$select 1 from public.comments where id = '90000000-0000-0000-0000-000000000001'$$,
  'negative: nobody hard-deletes a comment — there is no delete policy at all'
);
select pg_temp.act_as_owner();

select is(
  (select count(*)::int from public.comment_mentions where comment_id = '90000000-0000-0000-0000-000000000001'),
  1,
  'positive: a mention node in body_json materialises a comment_mentions row'
);

select is(
  (select count(*)::int from public.notifications
   where comment_id = '90000000-0000-0000-0000-000000000001'
     and profile_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'positive: a mention notifies the mentioned profile'
);

-- =========================================================================
-- notifications — own rows only
-- =========================================================================

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select is((select count(*)::int from public.notifications), 0, 'negative: a profile cannot read another''s notifications');
-- (Otto is mentioned by nobody; if this ever returns >0 it means the own-rows
--  policy stopped filtering, not that the fixture changed.)
select pg_temp.act_as_owner();

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.notifications), 1, 'positive: a profile reads its own notifications');
select pg_temp.act_as_owner();

-- =========================================================================
-- activity — trigger-written, read-only
-- =========================================================================

select cmp_ok(
  (select count(*)::int from public.activity where work_item_id = '60000000-0000-0000-0000-000000000001'),
  '>', 0,
  'positive: status and assignee changes are recorded in activity'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$insert into public.activity (work_item_id, verb) values ('60000000-0000-0000-0000-000000000001', 'forged')$$,
  '42501',
  null,
  'negative: not even an admin may write activity by hand'
);
select pg_temp.act_as_owner();

-- =========================================================================
-- Sign-up allowlist
-- =========================================================================

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'stranger@example.com', 'x', now(), now())$$,
  '42501',
  null,
  'negative: sign-up is refused for an address that is not on the allowlist'
);

-- =========================================================================
-- Storage — profile pictures
--
-- `avatars` is the one PUBLIC bucket, which makes reads a non-question and the
-- WRITE side the whole of the access control. Every case below is about the
-- path prefix, because that is the only thing standing between "I set my
-- picture" and "I set yours".
-- =========================================================================

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'positive: the avatars bucket is public — a stable URL, not a signed one that expires mid-session'
);

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  (2 * 1024 * 1024)::bigint,
  'positive: the bucket enforces its own 2MB cap, independently of the server action'
);

select ok(
  not ('image/svg+xml' = any (select unnest(allowed_mime_types) from storage.buckets where id = 'avatars')),
  'negative: SVG is not an accepted picture — it is a document format that can carry script'
);

-- Eve sets her own picture.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('avatars', '33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.webp',
            '33333333-3333-3333-3333-333333333333')$$,
  'positive: a member uploads into their own folder'
);

-- ...and cannot set Otto's.
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('avatars', '44444444-4444-4444-4444-444444444444/aaaaaaaa-0000-0000-0000-000000000002.webp',
            '33333333-3333-3333-3333-333333333333')$$,
  '42501',
  null,
  'negative: a member cannot upload into somebody else''s folder'
);
select pg_temp.act_as_owner();

-- Otto cannot delete the picture Eve just set. Replacing a picture deletes the
-- one it replaces, so this is the policy that stops one member erasing another.
-- Two guards sit in front of a delete and only the second one is the policy.
-- `storage.protect_objects_delete` refuses ANY hand-written DELETE unless
-- `storage.allow_delete_query` is set — which is what the Storage API sets, and
-- what `removeStoredAvatar` therefore goes through. Setting it here is not
-- weakening the test; it is getting past the "you meant to use the API" guard so
-- the RLS policy underneath can be the thing being tested.
--
-- And RLS refuses a delete by making the row invisible, not by raising — so the
-- statement "succeeds" and removes nothing. Assert on what is LEFT, never on the
-- absence of an error.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
set local storage.allow_delete_query = 'true';
delete from storage.objects
where bucket_id = 'avatars'
  and name = '33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.webp';
select pg_temp.act_as_owner();

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'avatars'
     and name = '33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.webp'),
  1,
  'negative: a member cannot delete another member''s picture'
);

-- An admin can, which is the same moderation escape hatch the other two
-- buckets have: somebody has to be able to take down a picture that should not
-- be on the screen.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local storage.allow_delete_query = 'true';
delete from storage.objects
where bucket_id = 'avatars'
  and name = '33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.webp';
select pg_temp.act_as_owner();

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'avatars'
     and name = '33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.webp'),
  0,
  'positive: an admin can remove anyone''s picture'
);
set local storage.allow_delete_query = 'false';

-- A picture is not a privilege: `guard_profile_privilege_columns` names role,
-- is_active and capacity, and deliberately does not name avatar_url.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$update public.profiles set avatar_url =
      'http://127.0.0.1:54421/storage/v1/object/public/avatars/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000003.webp'
    where id = '33333333-3333-3333-3333-333333333333'$$,
  'positive: a member sets their own avatar_url without an admin'
);

-- The column is writable through PostgREST with the anon key, so an arbitrary
-- URL here would render in an <img> on every teammate's screen.
select throws_ok(
  $$update public.profiles set avatar_url = 'https://evil.example/tracker.gif'
    where id = '33333333-3333-3333-3333-333333333333'$$,
  '23514',
  null,
  'negative: a profile picture cannot point anywhere but our own avatars bucket'
);

update public.profiles set avatar_url = 'http://example.test/nope.webp'
where id = '44444444-4444-4444-4444-444444444444';
select pg_temp.act_as_owner();

select is(
  (select avatar_url from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  null,
  'negative: a member cannot set another member''s picture'
);

-- ---------------------------------------------------------------------------
-- must_set_password — the forced password change.
--
-- The whole mechanism rests on one property: the person being forced cannot
-- switch it off. Everything else about it is application code, and application
-- code is not what stops a PATCH sent straight to PostgREST with the anon key
-- that ships in the browser bundle.
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$update public.profiles set must_set_password = true
    where id = '33333333-3333-3333-3333-333333333333'$$,
  'positive: an admin can require a password change'
);
select pg_temp.act_as_owner();

select is(
  (select must_set_password from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  true,
  'positive: the flag is set'
);

-- The one that matters. Eve is flagged, Eve is signed in, and Eve may write her
-- own row — `own profile update` allows it and she has just proved it by
-- setting her own avatar. The flag is what she must not be able to reach.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$update public.profiles set must_set_password = false
    where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  'negative: the owner cannot clear their own forced password change'
);

-- And it is not a "your own row" rule either — nobody but an admin sets it.
--
-- This one refuses one layer earlier and it is worth being precise about which:
-- `own profile update` will not let Eve see Otto's row at all, so the UPDATE
-- matches nothing and the trigger never runs. No exception, no rows, no change.
-- That silence is exactly the failure mode this repository has been caught by
-- before — an action reporting success after RLS wrote nothing — so the
-- assertion is on the stored value, not on the absence of an error.
select lives_ok(
  $$update public.profiles set must_set_password = true
    where id = '44444444-4444-4444-4444-444444444444'$$,
  'negative: a non-admin''s write to somebody else''s flag matches no rows'
);
select pg_temp.act_as_owner();

select is(
  (select must_set_password from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  false,
  'negative: and it changed nothing'
);

-- ---------------------------------------------------------------------------
-- push_subscriptions — one row is a live channel into somebody's lock screen.
--
-- The read case is the least interesting one here. What matters is that a
-- person cannot INSERT a subscription against somebody else's profile — which
-- would be a way to have this application push their mentions to a device you
-- hold — and cannot DELETE theirs, which would be a way to switch their
-- notifications off without them noticing.
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select lives_ok(
  $$insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
    values ('33333333-3333-3333-3333-333333333333',
            'https://push.example/eve', 'eve-key', 'eve-auth')$$,
  'positive: a member subscribes their own device'
);

select throws_ok(
  $$insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
    values ('44444444-4444-4444-4444-444444444444',
            'https://push.example/otto-forged', 'forged', 'forged')$$,
  '42501',
  null,
  'negative: a member cannot subscribe a device against somebody else''s profile'
);

-- Otto's own row, written as Otto, so there is something of his to try to read.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('44444444-4444-4444-4444-444444444444', 'https://push.example/otto', 'otto-key', 'otto-auth');

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select is(
  (select count(*)::int from public.push_subscriptions),
  1,
  'negative: a member sees only their own devices, never anybody else''s'
);

-- Not an error — RLS simply matches no rows, which is the failure mode this
-- repository has been caught by before: an action reporting success after
-- writing nothing. The assertion is on what survived.
delete from public.push_subscriptions where endpoint = 'https://push.example/otto';
select pg_temp.act_as_owner();

select is(
  (select count(*)::int from public.push_subscriptions
   where endpoint = 'https://push.example/otto'),
  1,
  'negative: a member cannot delete somebody else''s subscription'
);

-- An admin is not special here, and that is deliberate: role and access are an
-- admin's to administer, but a device somebody registered is not.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.push_subscriptions),
  0,
  'negative: not even an admin reads another person''s subscriptions'
);
select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- components — the registry, and the column that ties work to it.
--
-- Three separate rules are in play and they fail in three different ways:
-- the POLICY decides who may write a component at all, the GRANT decides that
-- nobody may delete one, and a TRIGGER decides that an item and its component
-- must agree about which project they belong to. Each gets both cases.
-- ---------------------------------------------------------------------------

insert into public.components (id, project_id, name, slug, kind, icon) values
  ('cc000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'EVIM Themen Kachel', 'evim-themen-kachel', 'spfx', 'GridViewMedium'),
  ('cc000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Partner dashboard',  'partner-dashboard',  'react', null);

-- Scoped to the fixture projects: this database is also carrying the seeded
-- MEINEvim registry, and an unscoped count would be asserting the seed's size.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from public.components
   where project_id in ('40000000-0000-0000-0000-000000000001',
                        '40000000-0000-0000-0000-000000000002')),
  2,
  'positive: an active member reads the registry'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select is(
  (select count(*)::int from public.components),
  0,
  'negative: a deactivated member reads no components at all'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$insert into public.components (project_id, name, slug, kind)
    values ('40000000-0000-0000-0000-000000000001', 'EVIM Newspart', 'evim-newspart', 'spfx')$$,
  'positive: a lead adds a component'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$insert into public.components (project_id, name, slug, kind)
    values ('40000000-0000-0000-0000-000000000001', 'Engineer''s idea', 'engineers-idea', 'spfx')$$,
  '42501',
  null,
  'negative: an engineer cannot add a component'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$update public.components set name = 'EVIM Themen Kachel (renamed)'
    where id = 'cc000000-0000-0000-0000-000000000001'$$,
  'positive: a lead renames a component'
);

-- The engineer's UPDATE refuses one layer earlier than the INSERT above: the
-- policy's USING clause hides the row, so the statement matches nothing and
-- raises nothing. That silence is the failure mode this suite exists for, so
-- the assertion is on the stored value rather than on an error.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$update public.components set name = 'Engineer was here'
    where id = 'cc000000-0000-0000-0000-000000000001'$$,
  'negative: an engineer''s rename matches no rows'
);
select pg_temp.act_as_owner();
select is(
  (select name from public.components where id = 'cc000000-0000-0000-0000-000000000001'),
  'EVIM Themen Kachel (renamed)',
  'negative: and it changed nothing'
);

-- No delete policy AND no delete grant — a component holds the history of what
-- happened to it, and deleting one would blank the column on every item that
-- named it. Retiring is `is_archived`.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$delete from public.components where id = 'cc000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: nobody deletes a component, not even a lead'
);

select throws_ok(
  $$insert into public.components (project_id, name, slug, kind)
    values ('40000000-0000-0000-0000-000000000001', 'Themen Kachel again', 'evim-themen-kachel', 'spfx')$$,
  '23505',
  null,
  'negative: one project cannot hold the same slug twice'
);

select lives_ok(
  $$insert into public.components (project_id, name, slug, kind)
    values ('40000000-0000-0000-0000-000000000002', 'Themen Kachel', 'evim-themen-kachel', 'react')$$,
  'positive: the same slug under a DIFFERENT project is another component'
);

select throws_ok(
  $$insert into public.components (project_id, name, slug, kind)
    values ('40000000-0000-0000-0000-000000000001', 'Not A Slug', 'Not A Slug', 'spfx')$$,
  '23514',
  null,
  'negative: a slug that is not URL-shaped is refused by the column'
);

-- Invariant 1, on the join between the two tables.
select lives_ok(
  $$update public.work_items set component_id = 'cc000000-0000-0000-0000-000000000001'
    where id = '60000000-0000-0000-0000-000000000001'$$,
  'positive: an item takes a component from its own project'
);

select throws_ok(
  $$update public.work_items set component_id = 'cc000000-0000-0000-0000-000000000002'
    where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'negative: an item cannot take another client''s component'
);

select pg_temp.act_as_owner();
select is(
  (select count(*)::int from public.activity
   where work_item_id = '60000000-0000-0000-0000-000000000001' and field = 'component'),
  1,
  'positive: retagging an item is recorded in its activity'
);

-- The engineer column guard. `component_id` had to be NAMED in it: the guard is
-- an allowlist written as a denylist, so a new column is silently writable by
-- an engineer until somebody adds it there.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$update public.work_items set component_id = null
    where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an engineer cannot retag even their own item'
);
select pg_temp.act_as_owner();

select * from finish();
rollback;
