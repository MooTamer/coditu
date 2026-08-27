-- Coditu — pages: the sixth document surface, and the three things about it
-- that are not obvious from reading the migration.
--
-- **A page cannot move.** `project_id` and `slug` are frozen after creation, and
-- that is the one property here that is a boundary rather than a convenience: a
-- page that could change project is a page that could carry one client's
-- writing into another client's space. `lib/actions/pages.ts` also leaves both
-- out of every update payload, so this asserts the second of two locks.
--
-- **A never-published page is private to its author.** Not "not shown" — not
-- readable. `PLAN.md` §3 asks that unfinished content stay private, and the read
-- policy is what makes that true rather than a filter somebody has to remember.
--
-- **A page goes to the bin, never away.** There is no delete policy at all,
-- which is what makes `set_page_deleted` the only route out and `purge_deleted`
-- the only route past it.
--
-- The three assertions at the end are about the RESTORE, and they are here
-- rather than in `revisions.sql` because they are the audit's own findings:
-- restoring the version that is already current used to write nothing, and a
-- restore never reached the story's Activity feed.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(26);

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

-- The seeded cast — the real local team. Nothing is created for them here.
create or replace function pg_temp.admin_id() returns uuid language sql stable as
  $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create or replace function pg_temp.lead_id() returns uuid language sql stable as
  $$ select id from public.profiles where role = 'lead' and account_kind = 'internal' and is_active limit 1 $$;
create or replace function pg_temp.engineer_id() returns uuid language sql stable as
  $$ select 'a0000000-0000-4000-8000-000000000003'::uuid $$;

create or replace function pg_temp.evim_id() returns uuid language sql stable as
  $$ select id from public.projects where slug = 'meinevim' $$;
create or replace function pg_temp.other_project_id() returns uuid language sql stable as
  $$ select id from public.projects where slug <> 'meinevim' order by slug limit 1 $$;

-- ---------------------------------------------------------------------------
-- Shape and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'pages', 'the pages table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.pages'::regclass),
  'row level security is on'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'pages' and cmd = 'DELETE'),
  0,
  'there is no delete policy — the bin is the only route out, and purge_deleted the only route past it'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'pages'
      and cmd = 'SELECT' and qual like '%is_active_member%'),
  1,
  'the read policy is gated on is_active_member(), so a client contact reads no page at all'
);

select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'pages'
       and cmd = 'INSERT' and with_check like '%is_admin_or_lead%'
  ),
  'only an admin or lead may create a page'
);

-- `page` is the sixth revision surface, and the enum is where that is true.
select ok(
  'page' = any (enum_range(null::public.revision_surface)::text[]),
  'page is a revision surface'
);

-- ---------------------------------------------------------------------------
-- Writing one
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.admin_id());

-- A fixed id rather than a lookup by slug. A binned page is not readable — the
-- read policy is `deleted_at is null` — so a `select id from pages where slug =`
-- helper returns NULL the moment the bin assertions start, and every assertion
-- after that quietly asks about nothing. Found the hard way.
create or replace function pg_temp.page_id() returns uuid language sql stable as
  $$ select 'ffffffff-0000-4000-8000-0000000000dd'::uuid $$;

insert into public.pages (id, project_id, title, slug, body)
values (
  pg_temp.page_id(),
  pg_temp.evim_id(),
  'A project page for this test',
  'a-project-page-for-this-test',
  'the original words'
);

select is(
  (select created_by from public.pages where id = pg_temp.page_id()),
  pg_temp.admin_id(),
  'created_by comes from the session, not from the payload'
);

select is(
  (select count(*)::int from public.document_revisions
    where surface = 'page' and entity_id = pg_temp.page_id()),
  1,
  'writing a page records version 1'
);

select is(
  (select project_id from public.document_revisions
    where surface = 'page' and entity_id = pg_temp.page_id() and revision_no = 1),
  pg_temp.evim_id(),
  'the revision carries the project it belongs to, re-derived from the page rather than supplied'
);

select is(
  (select page_id from public.document_revisions
    where surface = 'page' and entity_id = pg_temp.page_id() and revision_no = 1),
  pg_temp.page_id(),
  'and the page it belongs to'
);

-- ---------------------------------------------------------------------------
-- A page cannot move
-- ---------------------------------------------------------------------------

update public.pages
   set project_id = pg_temp.other_project_id(), slug = 'somewhere-else', created_by = pg_temp.engineer_id()
 where id = pg_temp.page_id();

select is(
  (select project_id from public.pages where id = pg_temp.page_id()),
  pg_temp.evim_id(),
  'a page cannot be moved to another project — invariant 1, enforced by the trigger and not only by the payload'
);

select is(
  (select slug from public.pages where id = pg_temp.page_id()),
  'a-project-page-for-this-test',
  'a page cannot be renamed in the URL — a pasted link keeps working'
);

select is(
  (select created_by from public.pages where id = pg_temp.page_id()),
  pg_temp.admin_id(),
  'and its author cannot be reassigned'
);

-- ---------------------------------------------------------------------------
-- A never-published page is private to its author
-- ---------------------------------------------------------------------------

select is(
  (select published_at from public.pages where id = pg_temp.page_id()),
  null,
  'a page starts unpublished'
);

select pg_temp.act_as(pg_temp.engineer_id());

select is(
  (select count(*)::int from public.pages where id = pg_temp.page_id()),
  0,
  'an unpublished page is not readable by anybody but its author — not hidden, not readable'
);

select pg_temp.act_as(pg_temp.admin_id());
update public.pages set published_at = now() where id = pg_temp.page_id();

select is(
  (select published_by from public.pages where id = pg_temp.page_id()),
  pg_temp.admin_id(),
  'publishing stamps who did it, from the session'
);

select pg_temp.act_as(pg_temp.engineer_id());

select is(
  (select count(*)::int from public.pages where id = pg_temp.page_id()),
  1,
  'a published page is readable by every internal member'
);

-- An engineer reads it and cannot change it.
update public.pages set title = 'renamed by an engineer' where id = pg_temp.page_id();

select is(
  (select title from public.pages where id = pg_temp.page_id()),
  'A project page for this test',
  'an engineer cannot edit a page — RLS refuses by matching no rows'
);

-- ---------------------------------------------------------------------------
-- Un-publishing is not an operation
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.admin_id());
update public.pages set published_at = null where id = pg_temp.page_id();

select isnt(
  (select published_at from public.pages where id = pg_temp.page_id()),
  null,
  'a published page cannot be un-published — it is deleted or it stands'
);

-- ---------------------------------------------------------------------------
-- The bin
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.engineer_id());
select throws_ok(
  format('select public.set_page_deleted(%L, true)', pg_temp.page_id()),
  '42501',
  'Only an admin or lead may delete a page',
  'an engineer cannot bin a page'
);

select pg_temp.act_as(pg_temp.admin_id());
select public.set_page_deleted(pg_temp.page_id(), true);

select is(
  (select count(*)::int from public.trash_list() where kind = 'page' and entity_id = pg_temp.page_id()),
  1,
  'a binned page is in the bin'
);

select is(
  (select sprint_number from public.trash_list() where kind = 'page' and entity_id = pg_temp.page_id()),
  null,
  'and it reports no sprint, because a page has never belonged to one'
);

select public.set_page_deleted(pg_temp.page_id(), false);

select is(
  (select deleted_at from public.pages where id = pg_temp.page_id()),
  null,
  'and it comes back'
);

-- ---------------------------------------------------------------------------
-- The restore, and the two things this audit found wrong with it
-- ---------------------------------------------------------------------------

-- A story of this file's own, so revision numbering starts at 1 by construction
-- rather than at whatever the last browser run left behind — the trap
-- `revisions.sql` records at length.
select pg_temp.act_as_owner();
insert into public.work_items (id, sprint_id, title, description)
values (
  'ffffffff-0000-4000-8000-0000000000ee'::uuid,
  (select id from public.sprints order by number limit 1),
  'A story for the restore audit',
  'version one'
);

select pg_temp.act_as(pg_temp.admin_id());

create or replace function pg_temp.audit_story() returns uuid language sql stable as
  $$ select 'ffffffff-0000-4000-8000-0000000000ee'::uuid $$;

-- Restore version 1 while version 1 IS the live text. Before this audit the
-- capture trigger's "nothing changed" guard swallowed it: no version was
-- written, and the RPC returned the pre-existing latest as though it had just
-- made it.
select public.restore_document_revision('work_item_description', pg_temp.audit_story(), 1::smallint);

select is(
  (select max(revision_no)::int from public.document_revisions
    where surface = 'work_item_description' and entity_id = pg_temp.audit_story()),
  2,
  'restoring the version that is already current still writes a new version — a restore is always a version'
);

select is(
  (select restored_from::int from public.document_revisions
    where surface = 'work_item_description' and entity_id = pg_temp.audit_story() and revision_no = 2),
  1,
  'and it names the version it came from'
);

select is(
  (select count(*)::int from public.activity
    where work_item_id = pg_temp.audit_story() and verb = 'restored'
      and field = 'description' and from_value = 'v1' and to_value = 'v2'),
  1,
  'and the restore reaches the story''s Activity feed, written by a trigger nobody can forge'
);

select * from finish();
rollback;
