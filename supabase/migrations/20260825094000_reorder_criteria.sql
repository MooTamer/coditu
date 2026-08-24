-- Coditu — renumber one item's acceptance criteria in a single statement.
--
-- The same shape as `reorder_work_items`, for the same three reasons, and they
-- are all worth restating because a checklist looks like the harmless case:
--
--   * **Atomic.** N updates over the wire leave a half-renumbered checklist
--     when the fifth one fails, and the caller is told "nothing was lost".
--   * **RLS does not raise on a row it filters out** — it updates nothing. A
--     caller allowed to move some of a list and not the rest was told the whole
--     thing had saved, and the order left behind looks deliberate.
--   * **One round trip** rather than one per row.
--
-- `SECURITY INVOKER`, spelled out rather than left to the default: the whole
-- authorization model for this table is RLS plus `guard_criteria_columns`, and
-- a definer function would step around both.
--
-- Note the interaction with that guard. It refuses an `order_index` change from
-- an engineer, which is exactly right — reordering the checklist is the shape
-- of the scope and stays with admin and lead, even though an assignee may now
-- rewrite what a line says. So an engineer's call here raises `42501` from the
-- trigger rather than silently moving nothing, and the action turns that into a
-- sentence.

create or replace function public.reorder_criteria(
  p_criterion_id uuid,
  p_ordered_ids uuid[]
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item_id  uuid;
  v_expected int := coalesce(array_length(p_ordered_ids, 1), 0);
  v_moved    int;
begin
  if v_expected = 0 then
    return 'empty';
  end if;

  -- Invariant 1, by the same route as everywhere else: the item is re-derived
  -- from the dragged criterion. There is no item id in the payload to disagree
  -- with.
  select c.work_item_id into v_item_id
    from public.acceptance_criteria c
   where c.id = p_criterion_id;

  if v_item_id is null then
    return 'no-criterion';
  end if;

  if exists (
    select 1
      from unnest(p_ordered_ids) as requested(id)
     where not exists (
       select 1
         from public.acceptance_criteria c
        where c.id = requested.id
          and c.work_item_id = v_item_id
     )
  ) then
    return 'foreign-criterion';
  end if;

  -- Locks taken in id order before anything is written. Two people dragging in
  -- the same checklist would otherwise lock the same rows in whatever order
  -- their plans produced, which is how a deadlock starts.
  perform 1
     from public.acceptance_criteria c
    where c.id = any(p_ordered_ids)
    order by c.id
      for update;

  update public.acceptance_criteria c
     set order_index = ordered.ord - 1
    from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
   where c.id = ordered.id
     and c.work_item_id = v_item_id;

  get diagnostics v_moved = row_count;

  -- The only way to tell a blocked write from a successful one: RLS filters
  -- rows out silently, so a short count is the signal.
  if v_moved <> v_expected then
    raise exception 'only % of % criteria could be reordered', v_moved, v_expected
      using errcode = '42501';
  end if;

  return 'ok';
end;
$$;

comment on function public.reorder_criteria is
  'Renumbers one item''s criteria atomically, refusing a partial write. Invariant 1: the item comes from the dragged criterion, never from the caller.';

grant execute on function public.reorder_criteria to authenticated;
