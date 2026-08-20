-- Fix a join fan-out in v_person_load.
--
-- The original joined `work_items` AND `time_entries` in one query and then
-- aggregated. Joining two independent one-to-many relations multiplies the
-- rows: every time entry appeared once per work item the person was attached
-- to, so `sum(t.minutes)` was the real total times the number of matching
-- items.
--
-- Mohamed holds or reviews five items in Week 17 and logged 750 minutes; the
-- view reported 3750. Abdelrahman: five items, 180 minutes, reported 900. The
-- counts were fine — they used `count(distinct w.id)`, which hides the
-- duplication — so only the hours were wrong, and wrong by a plausible-looking
-- multiple rather than something obviously broken.
--
-- Each aggregate is now its own scalar subquery, so nothing multiplies anything.
-- This is the same class of mistake the `minutes_logged` rollup avoids by
-- recomputing rather than incrementing: with sums, the wrong answer looks
-- exactly like the right one.

create or replace view public.v_person_load
with (security_invoker = on) as
select
  p.id                          as profile_id,
  p.full_name,
  p.initials,
  p.role,
  p.weekly_capacity_minutes,
  s.id                          as sprint_id,
  s.project_id,

  (select count(*)
   from public.work_items w
   where w.sprint_id = s.id
     and w.assignee_id = p.id
     and w.status <> 'done')                              as assigned_count,

  (select count(*)
   from public.work_items w
   where w.sprint_id = s.id
     and w.reviewer_id = p.id
     and w.status = 'ready_for_peer_review')              as review_queue_count,

  (select coalesce(sum(t.minutes), 0)
   from public.time_entries t
   join public.work_items w on w.id = t.work_item_id
   where w.sprint_id = s.id
     and t.profile_id = p.id)                             as minutes_logged

from public.profiles p
cross join public.sprints s
where p.is_active;

comment on view public.v_person_load is
  'Per-profile, per-sprint load. Each aggregate is an independent scalar subquery: joining work_items and time_entries together multiplies the hours by the item count. security_invoker: RLS follows the caller.';

grant select on public.v_person_load to authenticated;
