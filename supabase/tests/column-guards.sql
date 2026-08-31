-- Coditu — the column guards are allowlists, and the proof does not depend on
-- anybody remembering to update a list.
--
-- ## Why this file exists
--
-- `guard_work_item_columns` used to raise only for columns NAMED in a case
-- expression. Its message said "an engineer may change only status and
-- order_index" and that was false: seven of the table's twenty-seven columns
-- were not named, and an engineer could write them. `minutes_logged` was one of
-- them — the trigger-maintained rollup invariant 2 exists to protect, and the
-- number every earnings and payout figure is derived from.
--
-- The test that was supposed to catch this had the same defect. It asserted
-- that the guard's SOURCE TEXT contained each of nineteen hard-coded column
-- names. A new column was absent from the guard and absent from the test, so
-- both stayed green about a column neither had ever heard of.
--
-- So this asks the database instead of reading the function: for EVERY column
-- outside the allowlist, can an engineer change it? A column added tomorrow is
-- in this loop the moment it exists.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

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

-- Every column outside `allowed` that this role can still change, with the
-- SQLSTATE that stopped it when something did.
--
-- The probe writes NULL because it needs one value that is different from
-- whatever is there for every type at once. A BEFORE ROW trigger runs before
-- NOT NULL and CHECK are evaluated, so the guard always gets first refusal —
-- which is the whole question. A column that is already NULL on the target row
-- is skipped and named separately, because `null is distinct from null` is
-- false and the probe would be a no-op rather than a test.
--
-- Anything other than 42501 counts as NOT guarded, deliberately. A NOT NULL
-- violation happens to stop this particular write and says nothing about the
-- next one; only the guard is the guard.
create or replace function pg_temp.engineer_can_change(tbl text, allowed text[], target uuid)
returns text[] language plpgsql as $$
declare
  probe record;
  leaked text[] := '{}';
begin
  for probe in
    select c.column_name
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = tbl
       and c.column_name <> all (allowed)
     order by c.ordinal_position
  loop
    declare
      is_null boolean;
    begin
      execute format('select %I is null from public.%I where id = $1', probe.column_name, tbl)
        into is_null using target;
      if is_null is not false then
        continue;
      end if;
      begin
        execute format('update public.%I set %I = null where id = $1', tbl, probe.column_name)
          using target;
        leaked := leaked || probe.column_name;
        raise exception 'unwind' using errcode = 'ZZ999';
      exception
        when sqlstate '42501' then null;
        when sqlstate 'ZZ999' then null;
        when others then leaked := leaked || (probe.column_name || ':' || sqlstate);
      end;
    end;
  end loop;
  return leaked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: an item the engineer is assigned to, so the ROW policy lets the
-- update through and the guard is the thing being measured.
-- ---------------------------------------------------------------------------
select pg_temp.act_as_owner();

create temporary table probe_target as
select w.id
  from public.work_items w
 where w.deleted_at is null
   and w.assignee_id = 'a0000000-0000-4000-8000-000000000003'::uuid
 limit 1;

select isnt_empty(
  'select id from probe_target',
  'the seed gives the engineer at least one assigned work item to probe'
);

create temporary table criterion_target as
select c.id
  from public.acceptance_criteria c
  join public.work_items w on w.id = c.work_item_id
 where w.deleted_at is null
   and w.assignee_id = 'a0000000-0000-4000-8000-000000000003'::uuid
 limit 1;

select isnt_empty(
  'select id from criterion_target',
  'the seed gives the engineer at least one acceptance criterion to probe'
);

-- The probes below run as `authenticated`, and a temporary table belongs to the
-- session role that made it. Without this the sweep dies on "permission denied
-- for table probe_target", which reads as a broken guard and is a broken test.
grant select on probe_target, criterion_target to authenticated;

-- ---------------------------------------------------------------------------
-- The sweep. This is the assertion the old one should have been.
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a0000000-0000-4000-8000-000000000003'::uuid);

select is(
  pg_temp.engineer_can_change('work_items', array['status', 'order_index'], (select id from probe_target)),
  '{}'::text[],
  'an engineer can change NO column of work_items except status and order_index'
);

select is(
  pg_temp.engineer_can_change('acceptance_criteria', array['body', 'body_json', 'is_done'], (select id from criterion_target)),
  '{}'::text[],
  'an engineer can change NO column of acceptance_criteria except body, body_json and is_done'
);

-- ---------------------------------------------------------------------------
-- The four that were measurably writable before 20260830140000. Named as well
-- as swept, because a sweep that silently stopped looping would still be green
-- and these are the ones that were actually reachable.
-- ---------------------------------------------------------------------------
select throws_ok(
  format('update public.work_items set minutes_logged = 99999 where id = %L', (select id from probe_target)),
  '42501',
  null,
  'invariant 2: an engineer cannot write the minutes_logged rollup by hand'
);

select throws_ok(
  format('update public.work_items set closed_at = now() where id = %L', (select id from probe_target)),
  '42501',
  null,
  'an engineer cannot backdate closed_at'
);

select throws_ok(
  format('update public.work_items set created_at = now() - interval ''5 years'' where id = %L', (select id from probe_target)),
  '42501',
  null,
  'an engineer cannot rewrite created_at'
);

-- ---------------------------------------------------------------------------
-- `profiles`, which 20260831120000 inverted for the same reason — and which is
-- now the table that decides what somebody is paid.
--
-- Before that migration this guard was a denylist naming five columns, so
-- `payout_basis` and `hourly_rate_cents` would have arrived writable by the
-- person they pay. The sweep below is what makes that impossible to reintroduce
-- by omission: a money column added tomorrow is in this loop the moment it
-- exists, and nobody has to remember it.
--
-- It also closed one that was already open. `account_kind` was never in the
-- denylist, so a client contact could set their own row to `internal`.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.engineer_can_change(
    'profiles',
    array['full_name', 'initials', 'avatar_url', 'updated_at'],
    'a0000000-0000-4000-8000-000000000003'::uuid
  ),
  '{}'::text[],
  'a person can change NO column of their own profile except their name, initials and picture'
);

-- Named as well as swept. The sweep writes NULL, so a column that is ALREADY
-- null on the target row is skipped — `hourly_rate_cents` is null for
-- everybody, which is exactly the shape of column a sweep alone would miss.
-- Written as a CASE so the probe is always a real change. `is distinct from`
-- is how the guard decides, so setting a column to the value it already holds
-- raises nothing and the assertion would pass for the wrong reason — which is
-- exactly what the first version of this test did.
select throws_ok(
  $$update public.profiles
       set payout_basis = case when payout_basis = 'share' then 'hourly' else 'share' end::public.payout_basis
     where id = 'a0000000-0000-4000-8000-000000000003'::uuid$$,
  '42501',
  null,
  'nobody can change the basis they are paid on'
);

select throws_ok(
  $$update public.profiles set hourly_rate_cents = 100000
     where id = 'a0000000-0000-4000-8000-000000000003'::uuid$$,
  '42501',
  null,
  'nobody can set their own hourly rate'
);

select throws_ok(
  $$update public.profiles
       set account_kind = case when account_kind = 'internal' then 'client' else 'internal' end::public.account_kind
     where id = 'a0000000-0000-4000-8000-000000000003'::uuid$$,
  '42501',
  null,
  'nobody can change their own account kind — open until the guard was inverted'
);

-- ---------------------------------------------------------------------------
-- The positive cases. A guard that refuses everything passes every negative
-- assertion above and is useless.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.profiles set full_name = 'Renamed Themself'
     where id = 'a0000000-0000-4000-8000-000000000003'::uuid$$,
  'a person may still change their own name'
);
select lives_ok(
  format('update public.work_items set order_index = order_index + 1 where id = %L', (select id from probe_target)),
  'an engineer may still reorder their own item'
);

-- The nested-trigger path, and the reason `pg_trigger_depth()` is in the guard.
-- `refresh_minutes_logged` fires on `time_entries` and updates
-- `work_items.minutes_logged` — the column the assertion above forbids. It is
-- `security definer`, but `auth.uid()` reads a GUC that `security definer` does
-- not reset, so without the depth escape this write would be refused and no
-- engineer could log time at all.
select lives_ok(
  format(
    'insert into public.time_entries (work_item_id, profile_id, worked_on, minutes) values (%L, %L, current_date, 30)',
    (select id from probe_target),
    'a0000000-0000-4000-8000-000000000003'::uuid
  ),
  'an engineer may still log time, which updates minutes_logged through a trigger'
);

select * from finish();
rollback;
