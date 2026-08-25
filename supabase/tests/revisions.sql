-- Coditu — document revisions: append-only, and restore that adds rather than rewinds.
--
-- Two things are being proved here, and only one of them is about behaviour.
--
-- **That history cannot be rewritten** is a property of what is ABSENT — no
-- insert policy, no update policy, no delete policy, no grant beyond select. An
-- assertion that "an admin cannot delete a revision" passes today and would go
-- on passing if somebody added a delete policy tomorrow with a `using` clause
-- that happens to exclude the row the test picked. So the privileges and the
-- policy list are asserted directly, by name. Any future migration that grants
-- more has to come through here and say so.
--
-- **That a restore adds a version** is behaviour, and it is the property the
-- feature rests on: restoring version 1 over version 3 must produce version 4
-- and leave 2 and 3 readable. A restore that rewound the table would satisfy
-- every naive "the live row says what version 1 said" check.
--
-- The last two assertions exist because the first draft of
-- `restore_document_revision` was `security definer` and checked admin-or-lead
-- for three surfaces only — which let any active member restore a criterion body
-- on a story they cannot edit. It is invoker now, so the surface's own policies
-- decide. These two pin that: the engineer who owns the story may, the engineer
-- who does not may not.
--
-- ## Why this file builds its own story instead of using a seeded one
--
-- Revisions accumulate, and the e2e suite writes documents. A seeded story's
-- revision count is therefore whatever the last browser run left it at, so
-- `array[1, 2, 3]` would be asserting the history of the test suite rather than
-- of this feature — the "the suite leaves the seed changed" trap in
-- `07-FIELD-NOTES.md`, in a form worse than reading a row by position, because
-- absolute counts drift silently and only fail on the runs that come after a
-- browser run.
--
-- The fixture below creates its own story inside the transaction, so revision
-- numbering starts at 1 by construction and `rollback` takes all of it away.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', uid, 'role', 'authenticated')::text);
end;
$$;

create or replace function pg_temp.act_as_owner() returns void
language plpgsql as $$
begin
  execute 'set local role postgres';
  execute 'set local request.jwt.claims = ''''';
end;
$$;

-- The seeded cast. Nothing is created here: these four are the real local team
-- and every assertion below is about work that already exists.
create or replace function pg_temp.admin_id() returns uuid language sql stable as
  $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create or replace function pg_temp.engineer_id() returns uuid language sql stable as
  $$ select 'a0000000-0000-4000-8000-000000000003'::uuid $$;
create or replace function pg_temp.other_engineer_id() returns uuid language sql stable as
  $$ select 'a0000000-0000-4000-8000-000000000004'::uuid $$;

-- A story of this file's own, in a real sprint, assigned to the engineer whose
-- permissions the last two assertions are about. `key` is left to the trigger
-- that allocates it.
create or replace function pg_temp.story_id() returns uuid language sql stable as
  $$ select 'ffffffff-0000-4000-8000-0000000000ff'::uuid $$;

insert into public.work_items (id, sprint_id, title, description, assignee_id)
values (
  pg_temp.story_id(),
  (select id from public.sprints order by number limit 1),
  'A story that exists only for this test',
  'the original text',
  pg_temp.engineer_id()
);

insert into public.acceptance_criteria (work_item_id, body, order_index)
values (pg_temp.story_id(), 'the original criterion', 0);

-- ---------------------------------------------------------------------------
-- Append-only, asserted as the absence of a privilege
-- ---------------------------------------------------------------------------

select has_table('public', 'document_revisions', 'the revisions table exists');

select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.document_revisions'::regclass),
  'row level security is on'
);

select ok(
  has_table_privilege('authenticated', 'public.document_revisions', 'SELECT'),
  'an internal member may read history'
);

select ok(
  not has_table_privilege('authenticated', 'public.document_revisions', 'INSERT'),
  'nobody may insert a revision directly — only the capture trigger writes'
);

select ok(
  not has_table_privilege('authenticated', 'public.document_revisions', 'UPDATE'),
  'nobody may rewrite a revision, including an admin'
);

select ok(
  not has_table_privilege('authenticated', 'public.document_revisions', 'DELETE'),
  'nobody may delete a revision, including an admin'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'document_revisions'
      and cmd <> 'SELECT'),
  0,
  'there is no policy for anything but SELECT — the absence is the guarantee'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'document_revisions'
      and cmd = 'SELECT'
      and qual like '%is_active_member%'),
  1,
  'the read policy is gated on is_active_member(), so a client account sees none of it'
);

-- ---------------------------------------------------------------------------
-- Capture
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.admin_id());

-- The fixture arrived with a description, so it arrived with revision 1.
select is(
  (select count(*)::int from public.document_revisions
    where surface = 'work_item_description'
      and entity_id = pg_temp.story_id()),
  1,
  'a story created with a description has exactly one revision — its original text'
);

select pg_temp.act_as_owner();
update public.work_items set description = 'a first edit'
  where id = pg_temp.story_id();
update public.work_items set description = 'a second edit'
  where id = pg_temp.story_id();
select pg_temp.act_as(pg_temp.admin_id());

select is(
  (select array_agg(revision_no order by revision_no)::int[]
     from public.document_revisions
    where surface = 'work_item_description'
      and entity_id = pg_temp.story_id()),
  array[1, 2, 3],
  'two edits add two revisions, numbered per document'
);

select pg_temp.act_as_owner();
update public.work_items set status = 'in_progress'
  where id = pg_temp.story_id();
select pg_temp.act_as(pg_temp.admin_id());

select is(
  (select count(*)::int from public.document_revisions
    where surface = 'work_item_description'
      and entity_id = pg_temp.story_id()),
  3,
  'changing a column that is not the document adds nothing — no phantom versions'
);

select pg_temp.act_as_owner();
update public.work_items set description = 'a second edit'
  where id = pg_temp.story_id();
select pg_temp.act_as(pg_temp.admin_id());

select is(
  (select count(*)::int from public.document_revisions
    where surface = 'work_item_description'
      and entity_id = pg_temp.story_id()),
  3,
  'writing the same text again adds nothing'
);

-- ---------------------------------------------------------------------------
-- Restore adds a version. It does not rewind.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.restore_document_revision(
       'work_item_description',
       pg_temp.story_id(),
       2::smallint) $$,
  'an admin may restore a story description'
);

select is(
  (select array_agg(revision_no order by revision_no)::int[]
     from public.document_revisions
    where surface = 'work_item_description'
      and entity_id = pg_temp.story_id()),
  array[1, 2, 3, 4],
  'the restore ADDED version 4 — versions 2 and 3 are still there to read'
);

select is(
  (select restored_from::int from public.document_revisions
    where surface = 'work_item_description'
      and entity_id = pg_temp.story_id()
      and revision_no = 4),
  2,
  'the new version records which one it came from'
);

select is(
  (select description from public.work_items
    where id = pg_temp.story_id()),
  'a first edit',
  'and the live row now says what version 2 said'
);

-- ---------------------------------------------------------------------------
-- Who may restore is who may write. Nothing here decides it twice.
-- ---------------------------------------------------------------------------

-- The fixture is already assigned to this engineer. `rls.sql` proves the edit
-- rule itself, so what is checked here is only that restore inherits it.
select pg_temp.act_as(pg_temp.engineer_id());

select throws_ok(
  $$ select public.restore_document_revision(
       'work_item_description',
       pg_temp.story_id(),
       1::smallint) $$,
  '42501',
  'an engineer may change only status and order_index (tried to change description)',
  'an engineer cannot restore a story description even on their own item — and the COLUMN GUARD is what refuses, not a rule restated in the restore function'
);

select pg_temp.act_as(pg_temp.other_engineer_id());

select throws_ok(
  $$ select public.restore_document_revision(
       'acceptance_criterion',
       (select id from public.acceptance_criteria
         where work_item_id = pg_temp.story_id()
         order by order_index limit 1),
       1::smallint) $$,
  '42501',
  'Not permitted',
  'an engineer cannot restore a criterion on a story that is not theirs'
);

select * from finish();
rollback;
