-- Coditu — a rehearsal that cannot damage what it is rehearsing.
--
-- `rehearse_recovery` is the most privileged function in this schema: it is
-- `security definer`, it creates schemas, and it runs dynamic SQL. Every one of
-- those is there for a reason and every one of them is a way to write somewhere
-- nobody intended.
--
-- **The assertion that matters is the checksum pair.** Not "the story is still
-- there" — a targeted check passes while something else is quietly rewritten.
-- Every live table is hashed before a rehearsal and after it, for a run that
-- passes and a run that fails, and both hashes must be identical. That is the
-- only shape of assertion that would catch a future edit adding an `update
-- public.…` somewhere in two hundred lines of plpgsql.
--
-- The rest is the usual: who may run one, what an unknown scope does, and that
-- the table cannot be written by anybody through any path but the function.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(16);

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

/**
 * One hash over every live table this rehearsal could plausibly reach.
 *
 * Ordered inside each table, because `md5(string_agg(...))` over an unordered
 * scan is a hash of whatever order the planner felt like — it would differ
 * between two identical states and make this test a coin toss.
 */
create or replace function pg_temp.live_checksum() returns text
language sql as $$
  select md5(string_agg(t, '|' order by t))
  from (
    select 'work_items:' || coalesce(md5(string_agg(w.id::text || coalesce(w.description, '') || coalesce(w.highlight, '') || coalesce(w.deleted_at::text, ''), ',' order by w.id)), '') as t
      from public.work_items w
    union all
    select 'revisions:' || coalesce(md5(string_agg(r.id::text || coalesce(r.plain_text, ''), ',' order by r.id)), '')
      from public.document_revisions r
    union all
    select 'attachments:' || coalesce(md5(string_agg(a.id::text || a.storage_path, ',' order by a.id)), '')
      from public.attachments a
    union all
    select 'comments:' || coalesce(md5(string_agg(c.id::text || coalesce(c.body_text, '') || coalesce(c.deleted_at::text, ''), ',' order by c.id)), '')
      from public.comments c
    union all
    select 'sprints:' || coalesce(md5(string_agg(s.id::text || s.name, ',' order by s.id)), '')
      from public.sprints s
    union all
    select 'profiles:' || coalesce(md5(string_agg(p.id::text || p.role::text || p.is_active::text, ',' order by p.id)), '')
      from public.profiles p
  ) as parts(t);
$$;

-- The seeded people, read by role rather than hardcoded so a reseed that
-- renumbers ids does not silently test the wrong person.
--
-- Functions and not a temp table, matching `revisions.sql`: a temp table
-- created before `set local role authenticated` belongs to `postgres`, and
-- `authenticated` has no grant on it — which fails as
-- "permission denied for table who" three assertions after the one that
-- actually mattered.
create or replace function pg_temp.admin_id() returns uuid
language sql stable as $$ select id from public.profiles where role = 'admin' order by id limit 1 $$;

create or replace function pg_temp.lead_id() returns uuid
language sql stable as $$ select id from public.profiles where role = 'lead' order by id limit 1 $$;

create or replace function pg_temp.engineer_id() returns uuid
language sql stable as $$ select id from public.profiles where role = 'engineer' order by id limit 1 $$;

-- ---------------------------------------------------------------------------
-- 1. The table is append-only by what is absent.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'recovery_runs'
      and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'authenticated holds no insert, update, delete or truncate on recovery_runs'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'recovery_runs' and cmd <> 'SELECT'),
  0,
  'recovery_runs has no policy for anything but SELECT'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.recovery_runs'::regclass),
  'row level security is enabled on recovery_runs'
);

-- ---------------------------------------------------------------------------
-- 2. Who may rehearse.
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.engineer_id());
select throws_ok(
  $$ select public.rehearse_recovery(array['documents']) $$,
  '42501',
  'only an admin may rehearse a recovery',
  'an engineer cannot rehearse a recovery'
);

select pg_temp.act_as(pg_temp.lead_id());
select throws_ok(
  $$ select public.rehearse_recovery(array['documents']) $$,
  '42501',
  'only an admin may rehearse a recovery',
  'nor can a lead — this is an operations record, not a delivery one'
);

-- ---------------------------------------------------------------------------
-- 3. A scope this app does not have is refused, never ignored.
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.admin_id());

select throws_ok(
  $$ select public.rehearse_recovery(array['documents', 'everything']) $$,
  '22023',
  'unknown recovery check: everything',
  'an unknown check is refused rather than skipped'
);

select throws_ok(
  $$ select public.rehearse_recovery(array[]::text[]) $$,
  '22023',
  'a rehearsal needs at least one check',
  'an empty scope is refused — it would report passed about work it never did'
);

-- ---------------------------------------------------------------------------
-- 4. A rehearsal that PASSES changes nothing.
-- ---------------------------------------------------------------------------

-- Created and read as owner, both. A temp table's owner is whoever ran the
-- `create`, and this file changes role five times.
create temporary table snap as select pg_temp.live_checksum() as before;

-- `trash` over a seed with an empty bin: nothing to check, nothing to fail.
select pg_temp.act_as_owner();
update public.work_items set deleted_at = null where deleted_at is not null;
select pg_temp.act_as(pg_temp.admin_id());

create temporary table passing as
  select public.rehearse_recovery(array['trash']) as id;

select is(
  (select status::text from public.recovery_runs where id = (select id from passing)),
  'passed',
  'a rehearsal over a recoverable bin passes'
);

select is(
  (select failed from public.recovery_runs where id = (select id from passing)),
  0,
  'and it records no failures'
);

-- ---------------------------------------------------------------------------
-- 5. A rehearsal that FAILS also changes nothing.
--
-- The seeded attachments point at objects nobody has uploaded to this database
-- — `npm run db:attachments` is what puts them there — so the attachment check
-- fails here by default. That is a real finding about this database rather than
-- a fixture, which is the best kind of failing case to assert on.
-- ---------------------------------------------------------------------------

create temporary table failing as
  select public.rehearse_recovery(array['attachments']) as id;

select is(
  (select status::text from public.recovery_runs where id = (select id from failing)),
  'failed',
  'a rehearsal over attachments with no objects behind them fails'
);

select ok(
  (select failed from public.recovery_runs where id = (select id from failing)) > 0,
  'and it says how many'
);

select ok(
  (select jsonb_array_length(findings) from public.recovery_runs where id = (select id from failing)) > 0,
  'and names them rather than only counting'
);

select ok(
  (select jsonb_array_length(findings) from public.recovery_runs where id = (select id from failing)) <= 50,
  'and caps the list, so a wholly missing bucket records a readable row'
);

-- ---------------------------------------------------------------------------
-- 6. The assertion this whole file exists for.
-- ---------------------------------------------------------------------------

select pg_temp.act_as_owner();

select is(
  pg_temp.live_checksum(),
  (select before from snap),
  'every live table is byte-identical after a passing AND a failing rehearsal'
);

-- ---------------------------------------------------------------------------
-- 7. And it leaves nothing behind.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from information_schema.schemata
    where schema_name like 'recovery\_preview\_%'),
  0,
  'no preview schema survives the run that made it'
);

select ok(
  (select preview_schema like 'recovery\_preview\_%' from public.recovery_runs where id = (select id from failing)),
  'the run records which schema it used, so a leftover one could be traced'
);

select * from finish();
rollback;
