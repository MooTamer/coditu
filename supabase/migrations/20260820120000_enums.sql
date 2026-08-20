-- Coditu — enums, ordering, and the helper functions every policy leans on.
--
-- See docs/02-DATA-MODEL.md. The five invariants in CLAUDE.md are what this
-- schema exists to make true; where a choice here looks unusual, it is one of
-- them being enforced.

create type app_role         as enum ('admin','lead','engineer');
create type sprint_status    as enum ('planned','active','closed');
create type work_item_status as enum ('draft','todo','dev_started','ready_for_peer_review',
                                      'in_review','changes_requested','done','blocked');
create type work_item_type   as enum ('story','change_request','bug_fix','chore','spike');

-- Display order for boards, reports, exports, and sorting. Deliberately NOT the
-- enum declaration order: work in flight comes first, unstarted next, done last,
-- because the question the table answers is "what needs attention", not "what
-- happened".
--
-- The same order is defined in TypeScript as STATUS_DISPLAY_ORDER in
-- lib/work-items.ts. supabase/tests/rls.sql asserts the two agree — if you
-- change one, change both or the test fails.
create or replace function public.work_item_status_rank(s work_item_status)
returns int
language sql
immutable
parallel safe
as $$
  select case s
    when 'dev_started'            then 0
    when 'ready_for_peer_review'  then 1
    when 'in_review'              then 2
    when 'changes_requested'      then 3
    when 'todo'                   then 4
    when 'draft'                  then 5
    when 'blocked'                then 6
    when 'done'                   then 7
  end
$$;

comment on function public.work_item_status_rank is
  'Fixed display order for boards, reports and exports. Mirrored by STATUS_DISPLAY_ORDER in lib/work-items.ts; a test asserts they match.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
