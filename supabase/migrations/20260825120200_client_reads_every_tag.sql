-- The client read boundary follows the join table.
--
-- `client_components` and `client_component_work` reached work through
-- `work_items.component_id`, which is now a mirror of the FIRST tag. Left as
-- they were, a story tagged with the Link Kachel and the Newspart would appear
-- under whichever of the two happened to sort first, and be missing from the
-- other — a client reading the Newspart's page would be told less work had been
-- done on it than actually had.
--
-- ## What deliberately does NOT change
--
-- **The returned columns.** `supabase/tests/read-boundary.sql` pins the exact
-- result shape of all four client functions, and it must still pass afterwards:
-- this is a change to which rows are found, not to what is said about them. A
-- rewrite that quietly widened the projection is the failure that test exists
-- for.
--
-- **The access rules.** Both functions still check `client_has_capability()` in
-- their own body, still take the project id as a request rather than a claim,
-- and still return an empty set for another company's project rather than an
-- error that would confirm it exists.
--
-- **Publication is still per item and per component.** Being tagged with a
-- published component does not publish an item, and being published does not
-- reveal it under an unpublished component. Both conditions are still required,
-- so appearing under several components broadens nothing: it is the same
-- published row, reachable from each permitted place it genuinely belongs.
--
-- The project agreement between an item and its tags is enforced at write time
-- by `guard_work_item_component_scope`, exactly as `comp.project_id` was trusted
-- here before.

create or replace function public.client_components(p_project_id uuid)
returns table (
  component_id   uuid,
  name           text,
  slug           text,
  summary        text,
  item_count     int,
  done_count     int,
  minutes_logged int,
  last_activity  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    comp.id,
    comp.name,
    comp.slug,
    comp.client_summary,
    -- Counted over published, undeleted work only. An unpublished item does not
    -- appear in the list and must not appear in the number beside it either.
    -- One tag row per (item, component), so a story cannot count twice here.
    count(w.id) filter (where w.id is not null)::int,
    count(w.id) filter (where w.status = 'done')::int,
    case
      when public.client_has_capability(p_project_id, 'view_effort')
        then coalesce(sum(w.minutes_logged), 0)::int
      else null
    end,
    max(w.updated_at)
  from public.components comp
  left join public.work_item_components wc
    on wc.component_id = comp.id
  left join public.work_items w
    on w.id                  = wc.work_item_id
   and w.client_published_at is not null
   and w.deleted_at          is null
  where comp.project_id   = p_project_id
    and comp.published_at is not null
    and not comp.is_archived
    and public.client_has_capability(p_project_id, 'view_components')
  group by comp.id, comp.name, comp.slug, comp.client_summary
  order by comp.name
$$;

comment on function public.client_components is
  'Published components of one granted project, with counts computed over published work only, reached through work_item_components so a story tagged with several appears under each. Hours are null unless view_effort was granted — null rather than zero, because zero is a lie the UI would render as a fact.';

revoke all on function public.client_components(uuid) from public, anon;
grant execute on function public.client_components(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The published work under one component.
--
-- What is NOT selected here is still the point of the function: no `key`
-- (COD-229 means nothing to a client and everything to anyone guessing URLs),
-- no `description`, no `highlight`, no `assignee_id` or `reviewer_id`, no
-- `grouping`, no `estimate_minutes`, and no raw status.
-- ---------------------------------------------------------------------------

create or replace function public.client_component_work(
  p_project_id   uuid,
  p_component_id uuid
)
returns table (
  work_item_id uuid,
  title        text,
  summary      text,
  status_label text,
  is_done      boolean,
  deadline     date,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.id,
    coalesce(nullif(btrim(w.client_title), ''), w.title),
    w.client_summary,
    case w.status
      when 'draft'             then 'Not scoped yet'
      when 'ready'             then 'Not started'
      when 'in_progress'       then 'In progress'
      when 'in_peer_review'    then 'In peer review'
      when 'in_qa'             then 'In QA'
      when 'changes_requested' then 'Changes requested'
      when 'done'              then 'Done'
      when 'blocked'           then 'Blocked'
    end,
    w.status = 'done',
    case when public.client_has_capability(p_project_id, 'view_current_sprint')
      then w.deadline else null end,
    w.client_published_at
  from public.work_item_components wc
  join public.work_items w   on w.id   = wc.work_item_id
  join public.components comp on comp.id = wc.component_id
  where wc.component_id       = p_component_id
    and comp.project_id       = p_project_id
    and comp.published_at    is not null
    and w.client_published_at is not null
    and w.deleted_at         is null
    and public.client_has_capability(p_project_id, 'view_work')
  order by w.client_published_at desc, w.order_index
$$;

comment on function public.client_component_work is
  'Published work under one component, reached through work_item_components. The status is humanised in SQL so the enum value never crosses the wire; there is no key, no description, no highlight, no assignee and no estimate in the result at all.';

revoke all on function public.client_component_work(uuid, uuid) from public, anon;
grant execute on function public.client_component_work(uuid, uuid) to authenticated;
