-- Coditu — RLS assertions.
--
-- Every policy gets a POSITIVE and a NEGATIVE case. A suite that only proves
-- the allowed thing works will pass just as happily against `using (true)`.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(211);

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
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'RLS-140', 'EVIM item, Eve assigned',  'in_progress', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 480, 0),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'RLS-141', 'EVIM item, Eve uninvolved', 'ready',       '44444444-4444-4444-4444-444444444444', null,                                   60,  1),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'RLS-900', 'Nile item',                 'ready',       null,                                   null,                                   120, 0);

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
  '{in_progress,in_peer_review,in_qa,changes_requested,ready,draft,blocked,done}',
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
  $$update public.work_items set status = 'in_peer_review'
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
  'ready'::public.work_item_status,
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
-- acceptance_criteria — the assignee ticks it AND says what it says
--
-- Widened on 2026-08-25 at the team's request: "everything important should be
-- editable, we are developers, don't lock anything as hardcoded." The set that
-- may already tick a box may now rewrite what the box says. Adding and removing
-- criteria stays with admin/lead, because that is the shape of the scope rather
-- than the wording of one line.
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$update public.acceptance_criteria set is_done = true where id = '70000000-0000-0000-0000-000000000001'$$,
  'positive: an assignee may tick an acceptance criterion'
);
select lives_ok(
  $$update public.acceptance_criteria set body = 'rewritten' where id = '70000000-0000-0000-0000-000000000001'$$,
  'positive: an assignee may rewrite what the criterion says'
);
select throws_ok(
  $$update public.acceptance_criteria set order_index = 9 where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an assignee cannot reorder the checklist'
);
select throws_ok(
  $$update public.acceptance_criteria set work_item_id = '60000000-0000-0000-0000-000000000002'
    where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an assignee cannot move a criterion to another item'
);
update public.acceptance_criteria set body = 'Toggle sits at the top of settings'
where id = '70000000-0000-0000-0000-000000000001';
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

-- ---------------------------------------------------------------------------
-- acceptance_criteria — a criterion can hold a document now.
--
-- The rule did not change: an engineer who owns or reviews the item may tick a
-- box, and rewriting what the box SAYS is a lead's call. What changed is that
-- there are two columns saying it, and `guard_criteria_columns` is another
-- allowlist written as a denylist — `body_json` is writable by an assignee
-- until it is named there.
-- ---------------------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$update public.acceptance_criteria
    set body = 'Toggle sits at the top of settings, with a screenshot',
        body_json = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"with a screenshot"}]}]}'::jsonb
    where id = '70000000-0000-0000-0000-000000000001'$$,
  'positive: a lead rewrites a criterion as a document'
);

-- Eve is the assignee of the item this criterion belongs to, so the POLICY lets
-- her at the row. The trigger is what stops her at the column.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$update public.acceptance_criteria set is_done = true
    where id = '70000000-0000-0000-0000-000000000001'$$,
  'positive: the assignee ticks the box'
);

select lives_ok(
  $$update public.acceptance_criteria
    set body_json = '{"type":"doc","content":[]}'::jsonb,
        body = 'something else'
    where id = '70000000-0000-0000-0000-000000000001'$$,
  'positive: the assignee rewrites the document and the text the exports read, together'
);

-- Otto is on neither end of this item. The POLICY is what stops him, and it
-- stops him by matching no row rather than by raising — so assert the value.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
update public.acceptance_criteria set body = 'Otto was here'
where id = '70000000-0000-0000-0000-000000000001';
select isnt(
  (select body from public.acceptance_criteria where id = '70000000-0000-0000-0000-000000000001'),
  'Otto was here',
  'negative: an engineer who neither owns nor reviews the item cannot rewrite its criteria'
);

select pg_temp.act_as_owner();

-- =========================================================================
-- app_settings — the home of every tunable
--
-- Everyone active reads them (the image cap is in an error message, the rate
-- is on the earnings screen); only an admin writes. There is no insert policy
-- and no delete policy on purpose: the row is created by its migration and is
-- not something the app makes or destroys.
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select is(
  (select hourly_rate_cents from public.app_settings where id = 1),
  1200,
  'positive: an engineer reads the settings row'
);

-- A row-filtering policy denies by matching nothing, so this succeeds and
-- changes nothing. Assert the value, never the row count.
update public.app_settings set hourly_rate_cents = 9999 where id = 1;
select is(
  (select hourly_rate_cents from public.app_settings where id = 1),
  1200,
  'negative: an engineer cannot change what an hour pays'
);

select throws_ok(
  $$insert into public.app_settings (id, hourly_rate_cents) values (2, 500)$$,
  null,
  null,
  'negative: an engineer cannot insert a settings row'
);

-- `anon` gets nothing anywhere in this app — the grant is revoked, not merely
-- policed, so this is a permission error rather than an empty result.
select pg_temp.act_as_anon();
select throws_ok(
  $$select 1 from public.app_settings$$,
  '42501',
  null,
  'negative: a signed-out caller reads no settings at all'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

update public.app_settings set hourly_rate_cents = 1500, payout_share_threshold_pct = 30 where id = 1;
select is(
  (select hourly_rate_cents from public.app_settings where id = 1),
  1500,
  'positive: an admin changes what an hour pays'
);

select throws_ok(
  $$update public.app_settings set hourly_rate_cents = 0 where id = 1$$,
  '23514',
  null,
  'negative: an hour cannot be worth nothing'
);

select pg_temp.act_as_owner();
update public.app_settings set hourly_rate_cents = 1200, payout_share_threshold_pct = 25 where id = 1;

select throws_ok(
  $$insert into public.app_settings (id) values (2)$$,
  '23514',
  null,
  'negative: there cannot be a second settings row'
);

-- =========================================================================
-- Item keys come from the project, not from one global sequence
-- =========================================================================

insert into public.work_items (id, sprint_id, title) values
  ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'first unkeyed');

-- The number is not asserted, only the prefix and the step. A refused insert
-- burns a number exactly as a sequence does — `assign_work_item_key` advances
-- the counter before the policy gets a say — and a test that pins the first
-- number would break the moment somebody adds another negative case above.
select matches(
  (select key from public.work_items where id = '61000000-0000-0000-0000-000000000001'),
  (select '^' || key_prefix || '-\d+$' from public.projects where id = '40000000-0000-0000-0000-000000000001'),
  'positive: an item with no key takes its own project''s prefix'
);

insert into public.work_items (id, sprint_id, title) values
  ('61000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'second unkeyed');

select is(
  (select substring(key from '\d+$')::int from public.work_items where id = '61000000-0000-0000-0000-000000000002'),
  (select substring(key from '\d+$')::int + 1 from public.work_items where id = '61000000-0000-0000-0000-000000000001'),
  'positive: the next one takes the next number, under the row lock that makes ten at once safe'
);

insert into public.work_items (id, sprint_id, title) values
  ('61000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'other project');

select isnt(
  (select substring(key from '^[A-Z0-9]+') from public.work_items where id = '61000000-0000-0000-0000-000000000003'),
  (select substring(key from '^[A-Z0-9]+') from public.work_items where id = '61000000-0000-0000-0000-000000000001'),
  'positive: another project''s item carries another project''s prefix'
);

select is(
  (select key from public.work_items where id = '60000000-0000-0000-0000-000000000001'),
  'RLS-140',
  'positive: a stated key is left exactly as it was stated'
);

select throws_ok(
  $$insert into public.work_items (sprint_id, key, title)
    values ('50000000-0000-0000-0000-000000000001', 'lowercase-1', 'malformed')$$,
  '23514',
  null,
  'negative: a key that is not PREFIX-number is refused'
);

select throws_ok(
  format(
    $$update public.projects set key_prefix = %L where id = '40000000-0000-0000-0000-000000000002'$$,
    (select key_prefix from public.projects where id = '40000000-0000-0000-0000-000000000001')
  ),
  '23505',
  null,
  'negative: two projects cannot share a key prefix'
);

-- =========================================================================
-- Slug aliases — a rename must not 404 every bookmark the team has
-- =========================================================================

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select lives_ok(
  $$insert into public.project_slug_aliases (slug, project_id)
    values ('rls-meinevim-old', '40000000-0000-0000-0000-000000000001')$$,
  'positive: a lead keeps a renamed project''s old address alive'
);

select throws_ok(
  $$insert into public.project_slug_aliases (slug, project_id)
    values ('rls-nile-portal', '40000000-0000-0000-0000-000000000001')$$,
  '23505',
  null,
  'negative: an alias cannot shadow a live project address'
);

select throws_ok(
  $$update public.projects set slug = 'rls-meinevim-old'
    where id = '40000000-0000-0000-0000-000000000002'$$,
  '23505',
  null,
  'negative: a live address cannot take over another project''s alias'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$insert into public.project_slug_aliases (slug, project_id)
    values ('rls-sneaky', '40000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'negative: an engineer cannot invent a project address'
);

-- =========================================================================
-- order_index appends under a lock rather than defaulting to 0
-- =========================================================================

select pg_temp.act_as_owner();

select is(
  (select order_index from public.work_items where id = '61000000-0000-0000-0000-000000000002'),
  (select max(order_index) from public.work_items where sprint_id = '50000000-0000-0000-0000-000000000001'),
  'positive: an item created without a position lands at the end, not on top of the first one'
);

insert into public.acceptance_criteria (id, work_item_id, body) values
  ('71000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'appended');

select is(
  (select order_index from public.acceptance_criteria where id = '71000000-0000-0000-0000-000000000001'),
  1,
  'positive: a criterion created without a position lands after the one already there'
);


-- =========================================================================
-- A work item is deleted softly, and the read policy is what makes that true
--
-- The rule lives in one place on purpose. Fifteen queries read work items;
-- a filter in each of them is fifteen chances to forget one, and the one you
-- forget is the export.
-- =========================================================================

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select isnt_empty(
  $$select public.set_work_item_deleted('60000000-0000-0000-0000-000000000002', true)$$,
  'positive: a lead deletes a work item'
);

select is_empty(
  $$select 1 from public.work_items where id = '60000000-0000-0000-0000-000000000002'$$,
  'positive: a deleted item is invisible even to the lead who deleted it'
);

select is(
  (select count(*)::int from public.work_items w
   where w.sprint_id = '50000000-0000-0000-0000-000000000001'),
  (select count(*)::int from public.work_items w
   where w.sprint_id = '50000000-0000-0000-0000-000000000001' and w.deleted_at is null),
  'positive: every count over the sprint already excludes it, with no filter written anywhere'
);

select is(
  (select count(*)::int from public.list_deleted_work_items('50000000-0000-0000-0000-000000000001')),
  1,
  'positive: the bin has it, so "reversible" outlasts the toast'
);

select isnt_empty(
  $$select public.set_work_item_deleted('60000000-0000-0000-0000-000000000002', false)$$,
  'positive: restoring brings it back'
);

select isnt_empty(
  $$select 1 from public.work_items where id = '60000000-0000-0000-0000-000000000002'$$,
  'positive: and it is readable again'
);

-- No delete policy exists at all now, so a hard delete matches no rows rather
-- than raising. Assert the row, never the count.
delete from public.work_items where id = '60000000-0000-0000-0000-000000000002';
select isnt_empty(
  $$select 1 from public.work_items where id = '60000000-0000-0000-0000-000000000002'$$,
  'negative: not even a lead hard-deletes a work item'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select throws_ok(
  $$select public.set_work_item_deleted('60000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'negative: an engineer cannot delete a work item'
);

select throws_ok(
  $$select public.list_deleted_work_items('50000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'negative: an engineer cannot look in the bin'
);

select throws_ok(
  $$update public.work_items set deleted_at = now()
    where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: nor reach the column directly — the guard names it'
);

-- =========================================================================
-- Moving an item between sprints, and the project boundary it must not cross
-- =========================================================================

select pg_temp.act_as_owner();
insert into public.sprints (id, project_id, number, name, status) values
  ('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000001', 99, 'Sprint — Week 99', 'planned');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select lives_ok(
  $$update public.work_items set sprint_id = '50000000-0000-0000-0000-000000000009'
    where id = '60000000-0000-0000-0000-000000000002'$$,
  'positive: a lead carries an item over to the next sprint'
);

select is(
  (select order_index from public.work_items where id = '60000000-0000-0000-0000-000000000002'),
  0,
  'positive: it lands at the end of its new sprint rather than keeping a position that meant something elsewhere'
);

select throws_ok(
  $$update public.work_items set sprint_id = '50000000-0000-0000-0000-000000000002'
    where id = '60000000-0000-0000-0000-000000000002'$$,
  '23514',
  null,
  'negative: an item cannot move to another project''s sprint — its key would name a client it left'
);

select pg_temp.act_as_owner();
update public.work_items set sprint_id = '50000000-0000-0000-0000-000000000001', order_index = 1
where id = '60000000-0000-0000-0000-000000000002';


-- =========================================================================
-- Earnings — who takes a share, and what a confirmed distribution is
--
-- A confirmed payout is a record of an agreement, not a cache of a
-- calculation. Everything below is about making that true in the database
-- rather than in the application: the numbers cannot be rewritten, the row
-- cannot be deleted, and a second live payout for one sprint cannot exist.
-- =========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

-- `guard_profile_privilege_columns` is an allowlist written as a denylist, and
-- this is the fifth column added to it. Without the entry, an engineer could
-- decide they take a share.
select throws_ok(
  $$update public.profiles set is_developer = true
    where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  'negative: an engineer cannot decide that they take a share'
);

select throws_ok(
  $$insert into public.sprint_payouts
      (sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents)
    values ('50000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
            480, 1200, 9600)$$,
  '42501',
  null,
  'negative: an engineer cannot confirm a distribution'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$insert into public.sprint_payouts
      (sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents)
    values ('50000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
            480, 1200, 9600)$$,
  '42501',
  null,
  'negative: nor can a lead — confirming money is an admin''s alone'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$update public.profiles set is_developer = true
    where id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333')$$,
  'positive: an admin decides who takes a share'
);

select lives_ok(
  $$insert into public.sprint_payouts
      (id, sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents,
       usd_egp_rate_micros, usd_egp_source)
    values ('90000000-0000-0000-0000-000000000001',
            '50000000-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111',
            480, 1200, 9600, 50860000, 'live')$$,
  'positive: an admin confirms a distribution'
);

select lives_ok(
  $$insert into public.sprint_payout_shares (payout_id, profile_id, minutes_logged, share_cents)
    values ('90000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 30, 4800),
           ('90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 450, 4800)$$,
  'positive: and its shares'
);

-- The identity the whole feature rests on, asserted against the stored rows
-- rather than only against the TypeScript that computed them.
select is(
  (select sum(share_cents)::int from public.sprint_payout_shares
   where payout_id = '90000000-0000-0000-0000-000000000001'),
  (select pot_cents from public.sprint_payouts
   where id = '90000000-0000-0000-0000-000000000001'),
  'positive: the shares sum to the pot exactly'
);

select throws_ok(
  $$insert into public.sprint_payouts
      (sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents)
    values ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
            600, 1200, 12000)$$,
  '23505',
  null,
  'negative: a sprint cannot have two live payouts — two admins confirming at once, and one loses'
);

select throws_ok(
  $$update public.sprint_payouts set pot_cents = 999999
    where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: a confirmed pot cannot be rewritten, not even by the admin who confirmed it'
);

select lives_ok(
  $$update public.sprint_payouts set superseded_at = now()
    where id = '90000000-0000-0000-0000-000000000001'$$,
  'positive: it can be superseded, which is the only thing that may change it'
);

select throws_ok(
  $$update public.sprint_payouts set superseded_at = null
    where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: and a superseded payout stays superseded'
);

select lives_ok(
  $$insert into public.sprint_payouts
      (sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents)
    values ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
            600, 1200, 12000)$$,
  'positive: superseding the first is what makes room for the second'
);

-- Refused by the GRANT, not by a policy — `authenticated` was never given
-- DELETE on this table, so Postgres stops it before RLS is consulted at all.
-- Two layers, and this is the outer one; the missing policy is the inner.
select throws_ok(
  $$delete from public.sprint_payouts where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: nobody deletes a confirmed payout'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select isnt_empty(
  $$select 1 from public.sprint_payouts where id = '90000000-0000-0000-0000-000000000001'$$,
  'positive: everyone active reads everyone''s — that is the team''s rule'
);

select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- Account kind — the client portal's first boundary.
--
-- A client contact is NOT a fourth `app_role`. It is an orthogonal column, and
-- the reason is the shape of every authorization check already in this
-- repository: twenty-two call sites in `lib/actions/**` reject `role ===
-- "engineer"` and treat everything else as privileged. A fourth enum value
-- would make a client "not an engineer" and fall straight through all of them.
--
-- `account_kind` cannot fall through anything, because nothing reads it as a
-- negative.
-- ---------------------------------------------------------------------------

select has_type('public', 'account_kind', 'account_kind is an enum in its own right, not a role');
select has_column('public', 'profiles', 'account_kind', 'every profile declares which side of the wall it is on');
select col_not_null('public', 'profiles', 'account_kind', 'and it is never null — an unknown side is the dangerous side');

-- Cara is a client contact. She is created exactly like everybody else — the
-- app_role she carries is deliberately `engineer`, the same value
-- `handle_new_user` hands every new account, because the point is that her ROLE
-- is not what holds her back. `account_kind` is.
select pg_temp.make_user('66666666-6666-6666-6666-666666666666', 'client@rls.test', 'Cara Client', 'engineer');
update public.profiles set account_kind = 'client' where id = '66666666-6666-6666-6666-666666666666';

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');

-- The three helpers every policy in this schema is built out of. If these are
-- right, the eleven read policies are right without being edited.
select is(public.is_active_member(), false, 'a client is not an active MEMBER — the word means internal now');
select is(public.auth_role()::text,  null,  'a client has no app_role at all, so no role comparison can favour her');
select is(public.is_admin_or_lead(), false, 'and she is therefore neither admin nor lead');

-- The whole internal surface, one table at a time. `is_empty` rather than a
-- count, because the failure this guards against is "one row leaked", not
-- "the number changed".
select is_empty($$select 1 from public.work_items$$,          'a client reads no work items');
select is_empty($$select 1 from public.comments$$,            'a client reads no internal comments');
select is_empty($$select 1 from public.acceptance_criteria$$, 'a client reads no acceptance criteria');
select is_empty($$select 1 from public.time_entries$$,        'a client reads no time entries — hours are internal');
select is_empty($$select 1 from public.activity$$,            'a client reads no activity log');
select is_empty($$select 1 from public.components$$,          'a client reads no components through the base table');
select is_empty($$select 1 from public.projects$$,            'a client reads no projects through the base table');
select is_empty($$select 1 from public.clients$$,             'a client reads no client companies — not even her own');
select is_empty($$select 1 from public.sprints$$,             'a client reads no sprints through the base table');
select is_empty($$select 1 from public.attachments$$,         'a client reads no attachments');
select is_empty($$select 1 from public.sprint_payouts$$,      'a client reads no payouts — money is never client-visible');
select is_empty($$select 1 from public.app_settings$$,        'a client reads no settings, including the hourly rate');

-- Her own row, and only her own. `getClientContact()` has to be able to read
-- her name, so "reads nothing at all" would be wrong — but every OTHER profile
-- is somebody she must not be able to enumerate.
select is(
  (select count(*) from public.profiles)::int, 1,
  'a client reads exactly one profile: her own'
);
select is(
  (select id from public.profiles), '66666666-6666-6666-6666-666666666666'::uuid,
  'and it is hers — the team is not enumerable from a client session'
);

-- The escalation this whole design exists to prevent.
select throws_ok(
  $$update public.profiles set account_kind = 'internal'
    where id = '66666666-6666-6666-6666-666666666666'$$,
  '42501',
  null,
  'negative: a client cannot promote herself to an internal account'
);

-- Regression: nothing above changed what an internal engineer can do.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select isnt_empty($$select 1 from public.work_items$$, 'positive: an internal engineer still reads the whole board');
select isnt_empty($$select 1 from public.comments$$,   'positive: and the whole thread — full transparency is unchanged');
select is(public.is_active_member(), true, 'positive: an internal account is still an active member');

select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- Client access — company membership, project grants, and capabilities.
--
-- Access is the intersection of four things, and every one of them has to be
-- true at once:
--
--   1. the account is a client contact at all, and not revoked
--   2. the contact belongs to the client company that owns the project
--   3. a live grant exists for that specific project
--   4. the grant carries the specific capability being asked for
--
-- `client_has_capability()` is the ONE place that intersection is computed.
-- Every client-facing RPC calls it, so these assertions are the whole access
-- model rather than one policy's worth of it.
-- ---------------------------------------------------------------------------

select has_type('public', 'client_capability',     'the capability vocabulary is an enum, so a typo is a type error');
select has_type('public', 'client_contact_status', 'a contact is invited, active or revoked');
select has_table('public', 'client_contacts',          'a contact belongs to exactly one client company');
select has_table('public', 'client_invitations',       'an invitation is a server-side record, never sign-up metadata');
select has_table('public', 'client_project_grants',    'and access is granted per project, not per company');
select has_function('public', 'client_has_capability', 'the one place the intersection is computed');

-- Dana represents the OTHER company, so "one client cannot see another" has
-- something real to leak rather than an empty set that would pass either way.
select pg_temp.make_user('77777777-7777-7777-7777-777777777777', 'dana@nile.test', 'Dana Contact', 'engineer');
update public.profiles set account_kind = 'client' where id = '77777777-7777-7777-7777-777777777777';

insert into public.client_contacts (profile_id, client_id, status, invited_by) values
  ('66666666-6666-6666-6666-666666666666', 'c1000000-0000-0000-0000-000000000001', 'active', '11111111-1111-1111-1111-111111111111'),
  ('77777777-7777-7777-7777-777777777777', 'c2000000-0000-0000-0000-000000000002', 'active', '11111111-1111-1111-1111-111111111111');

insert into public.client_project_grants (contact_profile_id, project_id, capabilities, granted_by) values
  ('66666666-6666-6666-6666-666666666666', '40000000-0000-0000-0000-000000000001',
   '{view_project,view_components,read_questions}'::public.client_capability[], '11111111-1111-1111-1111-111111111111'),
  ('77777777-7777-7777-7777-777777777777', '40000000-0000-0000-0000-000000000002',
   '{view_project}'::public.client_capability[], '11111111-1111-1111-1111-111111111111');

-- Invariant 1, applied to access: a grant may only name a project that belongs
-- to the contact's OWN company. Without this the whole model rests on the
-- application remembering, and "the admin picked the wrong row from a dropdown"
-- becomes a cross-client data breach.
select throws_ok(
  $$insert into public.client_project_grants (contact_profile_id, project_id, capabilities)
    values ('66666666-6666-6666-6666-666666666666', '40000000-0000-0000-0000-000000000002',
            '{view_project}'::public.client_capability[])$$,
  '23514',
  null,
  'negative: a contact cannot be granted a project belonging to another company'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');

select is(public.client_has_capability('40000000-0000-0000-0000-000000000001', 'view_project'),   true,
  'positive: a live grant carrying the capability says yes');
select is(public.client_has_capability('40000000-0000-0000-0000-000000000001', 'view_effort'),    false,
  'negative: a capability the grant does not carry says no — hours are not implied by access');
select is(public.client_has_capability('40000000-0000-0000-0000-000000000002', 'view_project'),   false,
  'negative: the other company''s project says no, whatever the capability');

-- The tables themselves, from her session.
select is(
  (select count(*) from public.client_contacts)::int, 1,
  'a contact reads exactly one client_contacts row: her own'
);
select is(
  (select count(*) from public.client_project_grants)::int, 1,
  'and exactly her own grants — another contact''s access is not enumerable'
);
select is_empty(
  $$select 1 from public.client_invitations$$,
  'a contact reads no invitations at all, including the one that created her'
);

-- She must not be able to widen her own access, which is the obvious attack.
--
-- The UPDATE does not RAISE, and that is worth being exact about: a row-filtering
-- policy denies by matching nothing, so the statement succeeds and reports zero
-- rows. Asserting a 42501 here would be asserting a failure mode Postgres does
-- not have. What matters is that the stored capabilities did not move, so that
-- is what is checked — from the owner's session, because hers cannot see the
-- row it failed to change.
select lives_ok(
  $$update public.client_project_grants
       set capabilities = '{view_effort}'::public.client_capability[]
     where contact_profile_id = '66666666-6666-6666-6666-666666666666'$$,
  'a contact''s UPDATE against her own grant runs — RLS filters rather than raises'
);

select pg_temp.act_as_owner();
select is(
  (select capabilities from public.client_project_grants
    where contact_profile_id = '66666666-6666-6666-6666-666666666666'),
  '{view_project,view_components,read_questions}'::public.client_capability[],
  'negative: and it changed nothing — she cannot grant herself a capability'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select throws_ok(
  $$insert into public.client_project_grants (contact_profile_id, project_id, capabilities)
    values ('66666666-6666-6666-6666-666666666666', '40000000-0000-0000-0000-000000000001',
            '{view_effort}'::public.client_capability[])$$,
  '42501',
  null,
  'negative: nor write herself a second grant'
);

-- Revocation has to bite an ALREADY-OPEN session, so it is asserted from inside
-- one rather than by signing in again.
select pg_temp.act_as_owner();
update public.client_project_grants set revoked_at = now()
 where contact_profile_id = '66666666-6666-6666-6666-666666666666';

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select is(public.client_has_capability('40000000-0000-0000-0000-000000000001', 'view_project'), false,
  'negative: a revoked grant stops answering immediately — no cached claim to expire');

select pg_temp.act_as_owner();
update public.client_project_grants set revoked_at = null
 where contact_profile_id = '66666666-6666-6666-6666-666666666666';
update public.client_contacts set status = 'revoked'
 where profile_id = '66666666-6666-6666-6666-666666666666';

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select is(public.client_has_capability('40000000-0000-0000-0000-000000000001', 'view_project'), false,
  'negative: revoking the CONTACT is enough on its own — the grants need not be touched');

select pg_temp.act_as_owner();
update public.client_contacts set status = 'active'
 where profile_id = '66666666-6666-6666-6666-666666666666';

-- Dana's side of the wall, so the negative above is not merely an empty database.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
select is(public.client_has_capability('40000000-0000-0000-0000-000000000002', 'view_project'), true,
  'positive: the other contact still reaches her own company''s project');
select is(public.client_has_capability('40000000-0000-0000-0000-000000000001', 'view_project'), false,
  'negative: and not the first contact''s, which is the cross-client case stated the other way round');

-- Internal side.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select isnt_empty($$select 1 from public.client_contacts$$,     'positive: an admin sees who has access');
select isnt_empty($$select 1 from public.client_project_grants$$, 'positive: and what they may do with it');

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$insert into public.client_contacts (profile_id, client_id)
    values ('77777777-7777-7777-7777-777777777777', 'c1000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'negative: an engineer does not decide who gets client access'
);
select is(public.client_has_capability('40000000-0000-0000-0000-000000000001', 'view_project'), false,
  'negative: and an internal account has no client capabilities — it reads through its own policies, not these'
);

select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- Publication.
--
-- A granted project does NOT mean everything in it is client-visible. Being
-- inside a project a client can reach is not the same as having been shown to
-- them on purpose, and the difference is a column rather than a convention.
--
-- Curated at the component, reused at the item: a component needs a written
-- client summary before it can be published, and a work item defaults to its
-- own title with an optional rewrite. `description` and `highlight` are never
-- exposed by anything — `highlight` in particular is the
-- discuss-before-implementing note, written by engineers for engineers.
-- ---------------------------------------------------------------------------

select has_column('public', 'components',  'client_summary',      'a component carries the summary written for the client');
select has_column('public', 'components',  'published_at',        'and the moment it was deliberately shown to them');
select has_column('public', 'work_items',  'client_published_at', 'a work item is published on purpose, not by belonging to a project');
select has_column('public', 'work_items',  'client_title',        'with an optional client-safe rewrite of its title');
select has_column('public', 'work_items',  'client_summary',      'and an optional summary — never the internal description');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

insert into public.components (id, project_id, name, slug, kind) values
  ('e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Publishable part', 'publishable-part', 'spfx');

select throws_ok(
  $$update public.components set published_at = now()
     where id = 'e0000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'negative: a component cannot be published without a summary written for the client'
);

select throws_ok(
  $$update public.components set published_at = now(), client_summary = '   '
     where id = 'e0000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'negative: and whitespace is not a summary'
);

select lives_ok(
  $$update public.components
       set client_summary = 'The part of the intranet that lists news.', published_at = now()
     where id = 'e0000000-0000-0000-0000-000000000001'$$,
  'positive: with a real summary, a lead may publish it'
);

select lives_ok(
  $$update public.work_items set client_published_at = now()
     where id = '60000000-0000-0000-0000-000000000001'$$,
  'positive: a lead may publish a work item, which needs no summary of its own'
);

-- The column guard is an allowlist written as a denylist, so each of these
-- three is writable by an assignee until it is NAMED. `component_id`,
-- `body_json` and `deleted_at` each had to be added after the fact; these are
-- being added at the same time as the columns, which is the only moment it is
-- cheap.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

-- Unpublishing, not publishing, and the reason is a property of the test
-- harness worth writing down: pgTAP runs inside one transaction, and `now()` is
-- the TRANSACTION timestamp. An engineer setting `client_published_at = now()`
-- one statement after the lead did writes the identical value, `is distinct
-- from` is false, and the guard correctly does not fire — so the assertion
-- would have passed only by never reaching the code it was written to test.
--
-- Hiding an item from the client is the sharper attack anyway: it is how a late
-- piece of work disappears from a report the client is reading.
select throws_ok(
  $$update public.work_items set client_published_at = null
     where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: an engineer cannot decide whether a client sees their item'
);
select throws_ok(
  $$update public.work_items set client_title = 'Something friendlier'
     where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: nor rewrite what the client would read'
);
select throws_ok(
  $$update public.work_items set client_summary = 'Anything at all'
     where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'negative: nor write the summary'
);

-- And the thing an engineer IS still allowed to do, so the guard has not been
-- tightened past what the team agreed.
select lives_ok(
  $$update public.work_items set status = 'in_qa'
     where id = '60000000-0000-0000-0000-000000000001'$$,
  'positive: an engineer still moves the status of an item they are assigned'
);

select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- The client read boundary.
--
-- RLS filters ROWS, not COLUMNS. `work_items` carries `description`,
-- `highlight`, `assignee_id`, `minutes_logged` and `key` in the same row as the
-- title, so no policy on that table can be the client's read path — a policy
-- that let her see the row would let her see all of it.
--
-- So the base tables stay closed (proved earlier: a client reads zero rows from
-- every one of them) and the client's reads go through `security definer`
-- functions that SELECT only client-safe columns and check the capability
-- inside their own body. That is the `allowlist_claimed()` pattern, and these
-- functions are the entire client-facing surface of the database.
--
-- The assertions below are therefore the ones that matter most in this file.
-- ---------------------------------------------------------------------------

-- Fixture: one published component with one published item, and one of each
-- left unpublished — so "hidden things do not leak" has something to leak.
--
-- The publication section above published `Publishable part` into this same
-- project, and pgTAP runs the whole file in ONE transaction, so it is still
-- there. Unpublished here rather than worked around, because the counts below
-- are the assertions — a test that says "1" while meaning "1 of the 2 I know
-- about" is a test that stops being readable the moment somebody adds a third.
update public.components set published_at = null
 where id = 'e0000000-0000-0000-0000-000000000001';

insert into public.components (id, project_id, name, slug, kind, client_summary, published_at) values
  ('e0000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000001',
   'News Web Part', 'news-web-part', 'spfx', 'Where the intranet lists news.', now()),
  ('e0000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001',
   'Secret Spike', 'secret-spike', 'react', null, null);

update public.work_items
   set component_id = 'e0000000-0000-0000-0000-000000000010',
       client_published_at = now()
 where id = '60000000-0000-0000-0000-000000000001';

update public.work_items
   set component_id = 'e0000000-0000-0000-0000-000000000010'
 where id = '60000000-0000-0000-0000-000000000002';

select has_function('public', 'client_projects',   'the projects a contact may see');
select has_function('public', 'client_components', 'the published components of one of them');

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');

select is(
  (select count(*) from public.client_projects())::int, 1,
  'positive: a contact sees the one project she was granted'
);
select is(
  (select slug from public.client_projects()), 'rls-meinevim',
  'and it is the right one'
);

select is(
  (select count(*) from public.client_components('40000000-0000-0000-0000-000000000001'))::int, 1,
  'positive: only the PUBLISHED component — the unpublished one is not in the list'
);
select is(
  (select name from public.client_components('40000000-0000-0000-0000-000000000001')), 'News Web Part',
  'and it is the published one, by name'
);

-- The leak that a filter-at-the-render-edge design produces: the hidden row is
-- gone from the list and still counted in the total beside it. A client who can
-- read "3 pieces of work" against a list of one has been told the other two
-- exist.
select is(
  (select item_count from public.client_components('40000000-0000-0000-0000-000000000001'))::int, 1,
  'negative: the item count counts only PUBLISHED work — an unpublished item does not raise the total'
);

-- Cross-company and cross-project, from a real session rather than in theory.
select is_empty(
  $$select 1 from public.client_components('40000000-0000-0000-0000-000000000002')$$,
  'negative: asking for another company''s project by id returns nothing, not an error that confirms it exists'
);

-- The capability, not merely the grant. Cara has view_components; she does not
-- have view_effort, and the effort column must be null rather than absent —
-- absent would mean two shapes of row and a caller that has to know which.
select is(
  (select minutes_logged from public.client_components('40000000-0000-0000-0000-000000000001')), null,
  'negative: without view_effort the hours come back null, not zero and not a number'
);

select pg_temp.act_as_owner();
update public.client_project_grants
   set capabilities = capabilities || '{view_effort}'::public.client_capability[]
 where contact_profile_id = '66666666-6666-6666-6666-666666666666';

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select isnt(
  (select minutes_logged from public.client_components('40000000-0000-0000-0000-000000000001')), null,
  'positive: granted view_effort, the same call now carries the aggregate'
);

-- Revocation, through the RPC rather than through the helper.
select pg_temp.act_as_owner();
update public.client_contacts set status = 'revoked'
 where profile_id = '66666666-6666-6666-6666-666666666666';

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select is_empty($$select 1 from public.client_projects()$$,
  'negative: a revoked contact''s next call returns nothing — the session she already had is not a way back in');

select pg_temp.act_as_owner();
update public.client_contacts set status = 'active'
 where profile_id = '66666666-6666-6666-6666-666666666666';

-- Dana, whose company owns neither of those components.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
select is_empty(
  $$select 1 from public.client_components('40000000-0000-0000-0000-000000000001')$$,
  'negative: the other contact gets nothing from the first company''s project'
);

-- An internal account calling the client RPCs. Not an attack — a mistake, of
-- the kind that happens when somebody reuses a loader on the wrong page. It
-- must return nothing rather than quietly work, or an internal screen could
-- start rendering the client projection and nobody would notice.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select is_empty($$select 1 from public.client_projects()$$,
  'negative: an admin gets nothing from the client RPCs — they answer for client sessions only');

select pg_temp.act_as_anon();
select throws_ok(
  $$select 1 from public.client_projects()$$,
  '42501',
  null,
  'negative: and anonymous is refused by the grant, one layer below the function'
);

select pg_temp.act_as_owner();

select * from finish();
rollback;
