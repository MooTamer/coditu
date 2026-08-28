-- The UI is allowed to believe this row, so its write boundary and every
-- value constraint are part of the recovery contract.

create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

create or replace function pg_temp.act_as(role_name text, uid uuid default null) returns void
language plpgsql as $$
begin
  execute format('set local role %I', role_name);
  execute format(
    'set local request.jwt.claims = %L',
    case when uid is null then '{}' else json_build_object('sub', uid, 'role', role_name)::text end
  );
end;
$$;

create or replace function pg_temp.admin_id() returns uuid
language sql stable as $$
  select id from public.profiles
   where role = 'admin' and account_kind = 'internal' and is_active
   order by id limit 1
$$;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.backup_health'::regclass),
  'backup health has row-level security'
);

select ok(
  has_table_privilege('authenticated', 'public.backup_health', 'SELECT'),
  'authenticated may read backup health'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'backup_health'
      and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'authenticated holds no backup-health write privilege'
);

select ok(
  has_table_privilege('service_role', 'public.backup_health', 'INSERT')
  and has_table_privilege('service_role', 'public.backup_health', 'UPDATE')
  and not has_table_privilege('service_role', 'public.backup_health', 'DELETE')
  and not has_table_privilege('service_role', 'public.backup_health', 'TRUNCATE'),
  'the server capability may report but cannot delete or truncate evidence'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.record_backup_health(text,timestamp with time zone,timestamp with time zone,bigint,text,integer,bigint,integer,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_backup_health(text,timestamp with time zone,timestamp with time zone,bigint,text,integer,bigint,integer,bigint)',
    'EXECUTE'
  ),
  'only the server capability can call the reporter function'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'backup_health' and cmd <> 'SELECT'),
  0,
  'backup health has no user write policy'
);

select throws_ok(
  $$ insert into public.backup_health values (2, 'r2-canary', '2026-08-28T210000Z', now(), now(), 1, repeat('a', 64), 1, 0, 0, 0) $$,
  '23514', null,
  'a second singleton id is refused'
);

select throws_ok(
  $$ insert into public.backup_health values (1, 'r2-canary', 'not-a-backup', now(), now(), 1, repeat('a', 64), 1, 0, 0, 0) $$,
  '23514', null,
  'a malformed backup id is refused'
);

select throws_ok(
  $$ insert into public.backup_health values (1, 'r2-canary', '2026-08-28T210000Z', now(), now(), 0, repeat('a', 64), 1, 0, 0, 0) $$,
  '23514', null,
  'an empty ciphertext is refused'
);

select throws_ok(
  $$ insert into public.backup_health values (1, 'r2-canary', '2026-08-28T210000Z', now(), now(), 1, 'not-sha', 1, 0, 0, 0) $$,
  '23514', null,
  'a malformed checksum is refused'
);

select throws_ok(
  $$ insert into public.backup_health values (1, 'manual', '2026-08-28T210000Z', now(), now(), 1, repeat('a', 64), 1, 0, 0, 0) $$,
  '23514', null,
  'a source other than the canary is refused'
);

select throws_ok(
  $$ insert into public.backup_health values (1, 'r2-canary', '2026-08-28T210000Z', now(), now() + interval '6 minutes', 1, repeat('a', 64), 1, 0, 0, 0) $$,
  '23514', null,
  'an implausibly future object is refused'
);

insert into public.backup_health (
  backup_id, checked_at, last_modified_at, encrypted_bytes, sha256,
  database_tables, database_rows, storage_buckets, storage_objects
) values (
  '2026-08-28T210000Z', now(), now() - interval '1 hour', 16603288, repeat('a', 64),
  130, 5245, 3, 115
);

select pg_temp.act_as('authenticated', pg_temp.admin_id());
select is(
  (select count(*)::int from public.backup_health),
  1,
  'an active internal member reads the one canary record'
);

select throws_ok(
  $$ insert into public.backup_health (backup_id, checked_at, last_modified_at, encrypted_bytes, sha256, database_tables, database_rows, storage_buckets, storage_objects)
     values ('2026-08-28T220000Z', now(), now(), 1, repeat('b', 64), 1, 0, 0, 0) $$,
  '42501', null,
  'an authenticated member cannot report health directly'
);

select pg_temp.act_as('anon');
select throws_ok(
  $$ select count(*) from public.backup_health $$,
  '42501', null,
  'anonymous callers cannot read recovery evidence'
);

select pg_temp.act_as('postgres');
select is(
  (select count(*)::int from public.backup_health),
  1,
  'invalid attempts did not replace or multiply the singleton'
);

select pg_temp.act_as('service_role');
select is(
  public.record_backup_health(
    '2026-08-28T190000Z', now(), now() - interval '2 hours', 1, repeat('b', 64),
    1, 1, 1, 1
  ),
  false,
  'an out-of-order report is ignored atomically'
);

select pg_temp.act_as('postgres');
select is(
  (select backup_id from public.backup_health),
  '2026-08-28T210000Z',
  'the older report did not move recovery evidence backwards'
);

select * from finish();
rollback;
