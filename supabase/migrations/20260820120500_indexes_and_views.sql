-- Coditu — indexes and the two read models.

create index work_items_sprint_order_idx  on public.work_items (sprint_id, order_index);
create index work_items_open_assignee_idx on public.work_items (assignee_id) where status <> 'done';
create index work_items_review_queue_idx  on public.work_items (reviewer_id) where status = 'ready_for_peer_review';
create index acceptance_criteria_item_idx on public.acceptance_criteria (work_item_id, order_index);
create index time_entries_item_idx        on public.time_entries (work_item_id);
create index time_entries_person_day_idx  on public.time_entries (profile_id, worked_on);
create index comments_item_idx            on public.comments (work_item_id, created_at);
create index activity_item_idx            on public.activity (work_item_id, created_at desc);
create index notifications_unread_idx     on public.notifications (profile_id) where read_at is null;
create index sprints_project_idx          on public.sprints (project_id, number desc);
create index projects_client_idx          on public.projects (client_id);

-- ---------------------------------------------------------------------------
-- Views. `security_invoker = on` so a view is not a hole around RLS: the
-- policies of the underlying tables apply to whoever is querying, not to the
-- view's owner. Without it these two would happily return every project's rows
-- to anyone who can select from the view.
-- ---------------------------------------------------------------------------

create view public.v_sprint_summary
with (security_invoker = on) as
select
  s.id                                            as sprint_id,
  s.project_id,
  s.number,
  s.name,
  s.status,
  s.starts_on,
  s.ends_on,
  count(w.id)                                     as item_count,
  count(w.id) filter (where w.status = 'draft')                 as draft_count,
  count(w.id) filter (where w.status = 'todo')                  as todo_count,
  count(w.id) filter (where w.status = 'dev_started')           as dev_started_count,
  count(w.id) filter (where w.status = 'ready_for_peer_review') as ready_for_peer_review_count,
  count(w.id) filter (where w.status = 'in_review')             as in_review_count,
  count(w.id) filter (where w.status = 'changes_requested')     as changes_requested_count,
  count(w.id) filter (where w.status = 'done')                  as done_count,
  count(w.id) filter (where w.status = 'blocked')               as blocked_count,
  coalesce(sum(w.estimate_minutes), 0)            as estimate_minutes,
  coalesce(sum(w.minutes_logged), 0)              as minutes_logged,
  -- Invariant 5: `ends_on` is a calendar date, so days remaining is plain date
  -- arithmetic. Never a timestamp difference — that shifts by a day either side
  -- of midnight depending on the reader's zone.
  greatest((s.ends_on - current_date), 0)         as days_remaining
from public.sprints s
left join public.work_items w on w.sprint_id = s.id
group by s.id;

comment on view public.v_sprint_summary is
  'Per-sprint rollup for the sprint header and the report cover. security_invoker: RLS follows the caller.';

create view public.v_person_load
with (security_invoker = on) as
select
  p.id                          as profile_id,
  p.full_name,
  p.initials,
  p.role,
  p.weekly_capacity_minutes,
  s.id                          as sprint_id,
  s.project_id,
  count(distinct w.id) filter (where w.assignee_id = p.id and w.status <> 'done') as assigned_count,
  count(distinct w.id) filter (where w.reviewer_id = p.id
                                 and w.status = 'ready_for_peer_review')          as review_queue_count,
  coalesce(sum(t.minutes), 0)   as minutes_logged
from public.profiles p
cross join public.sprints s
left join public.work_items w on w.sprint_id = s.id and (w.assignee_id = p.id or w.reviewer_id = p.id)
left join public.time_entries t on t.profile_id = p.id and t.work_item_id in (
  select id from public.work_items where sprint_id = s.id
)
where p.is_active
group by p.id, s.id;

comment on view public.v_person_load is
  'Per-profile, per-sprint load for /app/people. security_invoker: RLS follows the caller.';
