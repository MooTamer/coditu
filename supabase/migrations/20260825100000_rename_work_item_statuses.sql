-- Rename four work_item_status values to one consistent shape.
--
--   todo                  -> ready            (a state, not an idiom)
--   dev_started           -> in_progress      (a state, not an event; no discipline prefix)
--   ready_for_peer_review -> in_peer_review   (matches the in_* shape)
--   in_review             -> in_qa            (says which review it is)
--
-- `draft`, `changes_requested`, `blocked` and `done` are unchanged.
-- See docs/05-DECISIONS.md, "The status vocabulary is one shape".
--
-- `alter type ... rename value` is metadata-only: no table rewrite, no rewrite
-- of the stored rows, and every dependent object that holds the value as a
-- PARSED expression follows the rename on its own. Verified against this
-- schema's dependents before writing this migration:
--
--   column defaults    (work_items.status default 'todo')       -> follows
--   partial indexes    (work_items_review_queue_idx)            -> follows
--   view predicates    (v_sprint_summary, v_person_load)        -> follows
--   check constraints                                           -> follows
--
-- Two kinds of dependent do NOT follow, and both are fixed below:
--
--   1. `work_item_status_rank` is an old-style SQL function — its body is
--      stored as text and re-parsed on each call, so the moment the values are
--      renamed every call raises `invalid input value for enum`. It has to be
--      replaced in the same transaction as the rename, or the board stops
--      sorting.
--
--   2. `activity.from_value` / `to_value` are plain `text`, written by
--      `log_work_item_change` as `old.status::text`. Renaming the enum cannot
--      reach them, so without the backfill at the bottom the history reads
--      "changed status from dev_started to in_progress" forever.

alter type work_item_status rename value 'todo'                  to 'ready';
alter type work_item_status rename value 'dev_started'           to 'in_progress';
alter type work_item_status rename value 'ready_for_peer_review' to 'in_peer_review';
alter type work_item_status rename value 'in_review'             to 'in_qa';

-- ---------------------------------------------------------------------------
-- 1. The rank function. Same order as before — only the names changed.
--
-- Still mirrored by STATUS_DISPLAY_ORDER in lib/work-items.ts, and
-- tests/status-order.test.ts still asserts the two agree. That test now folds
-- every migration in order rather than reading the first one, so a later
-- rename is picked up instead of silently compared against the original SQL.
-- ---------------------------------------------------------------------------
create or replace function public.work_item_status_rank(s work_item_status)
returns int
language sql
immutable
parallel safe
as $$
  select case s
    when 'in_progress'       then 0
    when 'in_peer_review'    then 1
    when 'in_qa'             then 2
    when 'changes_requested' then 3
    when 'ready'             then 4
    when 'draft'             then 5
    when 'blocked'           then 6
    when 'done'              then 7
  end
$$;

comment on function public.work_item_status_rank is
  'Fixed display order for boards, reports and exports. Mirrored by STATUS_DISPLAY_ORDER in lib/work-items.ts; a test asserts they match.';

-- ---------------------------------------------------------------------------
-- 2. v_sprint_summary's per-status column aliases.
--
-- The FILTER predicates inside the view already follow the rename; the output
-- column NAMES are just identifiers and do not. Left alone, the view would
-- expose `todo_count` counting `status = 'ready'` — the exact quiet lie this
-- rename exists to remove.
--
-- `alter view ... rename column` rather than a drop/recreate: it keeps the
-- grants and the security_invoker setting, and nothing downstream has to be
-- rebuilt. (No TypeScript reads these four columns today — lib/data/projects.ts
-- selects item_count, minutes_logged, estimate_minutes and days_remaining — so
-- this is a correctness fix for whoever queries the view next, not a break.)
-- ---------------------------------------------------------------------------
alter view public.v_sprint_summary rename column todo_count                  to ready_count;
alter view public.v_sprint_summary rename column dev_started_count           to in_progress_count;
alter view public.v_sprint_summary rename column ready_for_peer_review_count to in_peer_review_count;
alter view public.v_sprint_summary rename column in_review_count             to in_qa_count;

-- ---------------------------------------------------------------------------
-- 3. Backfill the activity history.
--
-- Scoped to `field = 'status'` so a comment or a title that legitimately
-- contains the word "todo" is never touched. The equality match is exact —
-- these columns only ever hold a bare enum label written by the trigger.
-- ---------------------------------------------------------------------------
update public.activity
set from_value = case from_value
      when 'todo'                  then 'ready'
      when 'dev_started'           then 'in_progress'
      when 'ready_for_peer_review' then 'in_peer_review'
      when 'in_review'             then 'in_qa'
      else from_value
    end,
    to_value = case to_value
      when 'todo'                  then 'ready'
      when 'dev_started'           then 'in_progress'
      when 'ready_for_peer_review' then 'in_peer_review'
      when 'in_review'             then 'in_qa'
      else to_value
    end
where field = 'status'
  and (from_value in ('todo', 'dev_started', 'ready_for_peer_review', 'in_review')
    or to_value   in ('todo', 'dev_started', 'ready_for_peer_review', 'in_review'));
