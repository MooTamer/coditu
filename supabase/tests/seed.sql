-- Coditu — the seed must reproduce the Notion export exactly.
--
-- Every number below was read off the export, not off the database: 104 items
-- across fifteen EVIM sprints and one Converso sprint, 275 acceptance criteria,
-- 280 hours logged. If one of these fails, either the seed drifted or somebody
-- "corrected" a figure that was right. Re-generate with
-- `node scripts/import-notion-export.mjs <export-dir>` rather than editing
-- supabase/seed.sql by hand.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;
-- Identify a seeded person by the one thing that is actually unique: their
-- email. `initials` is a display detail — the moment a second "Mohamed Tamer"
-- exists, every `initials = 'MT'` lookup returns two rows and the assertion
-- fails for a reason that has nothing to do with what it was testing.
create or replace function public.seeded_profile(p_email text)
returns uuid
language sql
stable
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email);
$$;

select plan(26);

-- ---------------------------------------------------------------------------
-- The headline numbers
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.work_items),
  104,
  '104 work items came across — 103 EVIM, 1 Converso'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  14,
  'Week 17 has 14 items'
);

select is(
  (select round(sum(w.minutes_logged) / 60.0, 1) from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  17.5,
  'the Week 17 footer reads 17.5 hours logged'
);

select is(
  (select round(sum(minutes) / 60.0, 1) from public.time_entries),
  280.0,
  '280 hours of logged effort across every sprint'
);

-- Invariant 2, end to end: the denormalised rollup must equal the entries it
-- summarises. A drift here is invisible in the UI and fatal to the report.
select is(
  (select sum(minutes_logged)::int from public.work_items),
  (select sum(minutes)::int from public.time_entries),
  'the rollup equals the sum of the time entries it rolls up'
);

-- Notion holds one number per item — hours *worked*. There is no estimate
-- anywhere in the export, and none was invented. This assertion exists so that
-- somebody filling the column in later has to mean it.
select is(
  (select count(*)::int from public.work_items where estimate_minutes is not null),
  0,
  'no item carries an estimate, because the export has none'
);

-- ---------------------------------------------------------------------------
-- Per person — the sprint header's avatar tooltips
-- ---------------------------------------------------------------------------

select is(
  (select round(sum(t.minutes) / 60.0, 1) from public.time_entries t
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id
   where s.number = 17 and t.profile_id = public.seeded_profile('mohamed@coditu.com')),
  13.5,
  'per person: Mohamed logged 13.5h in Week 17'
);

select is(
  (select round(sum(t.minutes) / 60.0, 1) from public.time_entries t
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id
   where s.number = 17 and t.profile_id = public.seeded_profile('abdelrahman@coditu.com')),
  4.0,
  'per person: Abdelrahman logged 4.0h in Week 17'
);

-- Time is attributed to the person who did the work, never to whoever ran the
-- import. Ahmed carried Week 16 almost alone, and that has to be visible.
select is(
  (select round(sum(t.minutes) / 60.0, 1) from public.time_entries t
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id
   where s.number = 16 and t.profile_id = public.seeded_profile('ahmed@coditu.com')),
  39.5,
  'per person: Ahmed logged 39.5h in Week 16'
);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.work_items
   where key ~ '^COD-\d+$'
     and substring(key from 5)::int between 140 and 243),
  104,
  'keys run COD-140 to COD-243 with no gaps'
);

-- The sequence has to be ahead of every transcribed key or the first new item
-- collides with one of them.
select cmp_ok(
  (select last_value from public.work_item_key_seq),
  '>=',
  (select max(substring(key from 5)::int) from public.work_items)::bigint,
  'the key sequence is ahead of the highest seeded key'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17 and w.grouping = 1),
  2, 'grouping 1 covers two Week 17 items'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17 and w.grouping = 2),
  2, 'grouping 2 covers two Week 17 items'
);

select is(
  (select count(*)::int from public.work_items where highlight is not null),
  2, 'two items carry a discuss-before-implementing highlight'
);

select is(
  (select count(*)::int from public.acceptance_criteria),
  275, '275 acceptance criteria came across'
);

select is(
  (select count(*)::int from public.acceptance_criteria where is_done),
  95, '95 of them were already ticked in Notion'
);

select is(
  (select count(*)::int from public.attachments),
  104, '104 attachments — every image, GIF and PDF embedded in an item'
);

-- An attachment row whose path is empty points at nothing, and the item detail
-- would render a broken link rather than an error.
select is(
  (select count(*)::int from public.attachments
   where storage_path is null or storage_path = '' or file_name = ''),
  0, 'every attachment names a real object path and file'
);

-- Activity is trigger-written, so a seeded item that never got one means the
-- trigger is not firing.
select cmp_ok(
  (select count(*)::int from public.activity),
  '>=', 104,
  'every seeded item produced at least a created activity row'
);

-- ---------------------------------------------------------------------------
-- Sprint and project shape
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.sprints),
  16, 'fifteen EVIM sprints plus one for Converso'
);

-- Six sprint windows are evidenced by the export — Weeks 3, 4, 7, 15, 16, 17.
-- The other nine are NULL on purpose: the sprints are not weekly-contiguous, so
-- there is nothing to interpolate from and a filled-in range would be a
-- fabrication that reads as fact.
select is(
  (select count(*)::int from public.sprints where starts_on is not null),
  6, 'only the six datable sprints carry a window'
);

select matches(
  (select notes from public.sprints where number = 17),
  'highlighted sections',
  'sprint notes carry the highlight convention verbatim'
);

select is(
  (select count(*)::int from public.sprints s
   join public.projects p on p.id = s.project_id
   where p.slug = 'meinevim' and s.status = 'active'),
  1, 'EVIM has exactly one active sprint'
);

-- Nile Atelier, Ops Console and NVRMiss hold no work. They exist so the
-- no-sprint empty state and the project switcher have something to show.
select is(
  (select count(*)::int from public.projects p
   where not exists (select 1 from public.sprints s where s.project_id = p.id)),
  3, 'three projects deliberately have no sprint at all'
);

-- The view must never drift from the table it summarises.
select is(
  (select minutes_logged::int from public.v_sprint_summary where number = 17),
  (select sum(w.minutes_logged)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  'v_sprint_summary agrees with the underlying table'
);

-- =========================================================================
-- The export carried live secrets — a SharePoint password, an OpenAI key, an
-- OpenRouter key, a test login — in prose that otherwise belongs in the
-- database. scripts/import-notion-export.mjs redacts them and re-checks its own
-- output; this checks the database itself, which is the thing that actually
-- gets read by four people and exported to clients.
-- =========================================================================

select is(
  (select count(*)::int from (
     select notes as t from public.sprints
     union all select scope from public.projects
     union all select description from public.work_items
     union all select highlight from public.work_items
     union all select body from public.acceptance_criteria
   ) prose
   where t ~ 'sk-proj-[A-Za-z0-9_-]{16,}'
      or t ~ 'sk-or-v1-[A-Za-z0-9]{16,}'
      or t ~ 'sk-ant-[A-Za-z0-9_-]{16,}'
      or t ~ 'gh[pousr]_[A-Za-z0-9]{20,}'),
  0,
  'no API key survived the import into any prose column'
);

select * from finish();
rollback;
