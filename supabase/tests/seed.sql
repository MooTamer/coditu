-- Coditu — the seed must reproduce the design bundle exactly.
--
-- Week 17 is transcribed from the ITEMS constant in
-- design/project/Coditu App.dc.html, and the sprint table footer has to read
-- 16.0 / 46.0 across 12 items. If any of these fail, either the seed drifted or
-- somebody "corrected" a number that was right.
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

select plan(23);

-- ---------------------------------------------------------------------------
-- The headline numbers
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  12,
  'Week 17 has 12 items'
);

select is(
  (select round(sum(w.minutes_logged) / 60.0, 1) from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  16.0,
  'the footer sum reads 16.0 hours logged'
);

select is(
  (select round(sum(w.estimate_minutes) / 60.0, 1) from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  46.0,
  'the footer sum reads 46.0 hours estimated'
);

-- Invariant 2, end to end: the denormalised rollup must equal the entries it
-- summarises. A drift here is invisible in the UI and fatal to the report.
select is(
  (select sum(w.minutes_logged)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  (select sum(t.minutes)::int from public.time_entries t
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  'the rollup equals the sum of the time entries it rolls up'
);

-- ---------------------------------------------------------------------------
-- Per person — the sprint header's avatar tooltips
-- ---------------------------------------------------------------------------

select is(
  (select round(sum(t.minutes) / 60.0, 1) from public.time_entries t
   join public.profiles p on p.id = t.profile_id
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id
   where s.number = 17 and p.id = public.seeded_profile('mohamed@coditu.com')),
  12.5,
  'per person: Mohamed logged 12.5h'
);

select is(
  (select round(sum(t.minutes) / 60.0, 1) from public.time_entries t
   join public.profiles p on p.id = t.profile_id
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id
   where s.number = 17 and p.id = public.seeded_profile('abdelrahman@coditu.com')),
  3.0,
  'per person: Abdelrahman logged 3.0h'
);

select is(
  (select round(sum(t.minutes) / 60.0, 1) from public.time_entries t
   join public.profiles p on p.id = t.profile_id
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id
   where s.number = 17 and p.id = public.seeded_profile('ahmed@coditu.com')),
  0.5,
  'per person: Ahmed logged 0.5h'
);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(w.key order by w.key)::text from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  '{COD-140,COD-141,COD-142,COD-143,COD-144,COD-145,COD-146,COD-147,COD-148,COD-149,COD-150,COD-151}',
  'keys run COD-140 to COD-151 with no gaps'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17 and w.grouping = 1),
  2, 'grouping 1 covers two items'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id where s.number = 17 and w.grouping = 2),
  2, 'grouping 2 covers two items'
);

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id
   where s.number = 17 and w.highlight is not null),
  2, 'two items carry a discuss-before-implementing highlight'
);

select is(
  (select count(*)::int from public.acceptance_criteria c
   join public.work_items w on w.id = c.work_item_id
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  14, 'fourteen acceptance criteria across the sprint'
);

select is(
  (select count(*)::int from public.comments c
   join public.work_items w on w.id = c.work_item_id
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  4, 'four comments across the sprint'
);

-- Activity is trigger-written, so a seeded item that never got one means the
-- trigger is not firing.
select cmp_ok(
  (select count(*)::int from public.activity a
   join public.work_items w on w.id = a.work_item_id
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  '>=', 12,
  'every seeded item produced at least a created activity row'
);

-- ---------------------------------------------------------------------------
-- Sprint and project shape
-- ---------------------------------------------------------------------------

select is(
  (select notes_author_id from public.sprints where number = 17),
  public.seeded_profile('adam@coditu.com'),
  'sprint notes are attributed to Adam'
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

select is(
  (select count(*)::int from public.work_items w
   join public.sprints s on s.id = w.sprint_id
   where s.number = 16 and w.status = 'done'),
  9, 'Week 16 carries nine closed items as history'
);

-- Only EVIM is on a sprint cadence. The other three projects exist so the
-- no-sprint empty state and the project switcher have something real to show.
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
-- v_person_load must not multiply hours by item count
--
-- Joining work_items and time_entries in one query and then aggregating does
-- exactly that: Mohamed holds or reviews five items and logged 750 minutes, and
-- the first version of this view reported 3750. The counts looked right the
-- whole time, because they used count(distinct).
-- =========================================================================

select is(
  (select v.minutes_logged::int from public.v_person_load v
   join public.profiles p on p.id = v.profile_id
   join public.sprints s on s.id = v.sprint_id
   where s.number = 17 and p.id = public.seeded_profile('mohamed@coditu.com')),
  750,
  'person load: Mohamed logged 750 minutes, not a multiple of it'
);

select is(
  (select sum(v.minutes_logged)::int from public.v_person_load v
   join public.sprints s on s.id = v.sprint_id where s.number = 17),
  (select sum(t.minutes)::int from public.time_entries t
   join public.work_items w on w.id = t.work_item_id
   join public.sprints s on s.id = w.sprint_id where s.number = 17),
  'person load: the per-person hours add up to the sprint total'
);

select is(
  (select v.assigned_count::int || '/' || v.review_queue_count::int
   from public.v_person_load v
   join public.profiles p on p.id = v.profile_id
   join public.sprints s on s.id = v.sprint_id
   where s.number = 17 and p.id = public.seeded_profile('abdelrahman@coditu.com')),
  '1/3',
  'person load: Abdelrahman has 1 assigned and 3 in his review queue'
);

select * from finish();
rollback;
