-- Coditu — RLS assertions.
--
-- Every policy gets a POSITIVE and a NEGATIVE case. A suite that only proves
-- the allowed thing works will pass just as happily against `using (true)`.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(48);

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

select * from finish();
rollback;
