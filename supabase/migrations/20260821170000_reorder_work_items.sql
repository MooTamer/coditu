-- Coditu — renumber a sprint's work items in one statement.
--
-- `reorderWorkItems` used to send one UPDATE per item through PostgREST and
-- await them together: for a twelve-item sprint that is fifteen round trips to
-- move one row, and on a hosted database most of that is latency. It also had
-- two defects that the loop was hiding.
--
-- Nothing tied the writes into a transaction, so a failure part-way left the
-- sprint half-renumbered while the action said "Nothing was lost — try again".
--
-- And row-level security does not raise on a row it filters out; the UPDATE
-- simply affects nothing. An engineer reordering a sprint they do not own wrote
-- the rows they happen to be assigned, skipped everyone else's, and was told it
-- had worked.
--
-- One statement fixes both. `unnest … with ordinality` hands every id its new
-- index, and the row count says whether every row we were asked to move
-- actually moved.

create or replace function public.reorder_work_items(
  p_item_id uuid,
  p_ordered_ids uuid[]
)
returns text
language plpgsql
-- SECURITY INVOKER, spelled out rather than left to the default. The entire
-- authorization model for this table is RLS; a definer function would run with
-- the owner's rights and step around every policy on `work_items`.
security invoker
set search_path = ''
as $$
declare
  v_sprint_id uuid;
  v_expected  int := coalesce(array_length(p_ordered_ids, 1), 0);
  v_moved     int;
begin
  if v_expected = 0 then
    return 'empty';
  end if;

  -- Invariant 1: the sprint is re-derived from the dragged item itself. There
  -- is no sprint id in the payload for a caller to disagree with.
  select w.sprint_id into v_sprint_id
    from public.work_items w
   where w.id = p_item_id;

  if v_sprint_id is null then
    return 'no-item';
  end if;

  -- Every id must belong to that same sprint. `order_index` is one of the two
  -- columns an engineer may write at all, so without this check a crafted
  -- payload could renumber another client's backlog.
  if exists (
    select 1
      from unnest(p_ordered_ids) as requested(id)
     where not exists (
       select 1
         from public.work_items w
        where w.id = requested.id
          and w.sprint_id = v_sprint_id
     )
  ) then
    return 'foreign-item';
  end if;

  -- Take the row locks in id order before touching anything. Two people
  -- dragging in the same sprint would otherwise lock the same rows in whatever
  -- order their plans happened to produce, which is how a deadlock starts.
  perform 1
     from public.work_items w
    where w.id = any(p_ordered_ids)
    order by w.id
      for update;

  update public.work_items w
     set order_index = ordered.ord - 1
    from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
   where w.id = ordered.id
     and w.sprint_id = v_sprint_id;

  get diagnostics v_moved = row_count;

  -- Short means RLS filtered rows out. Raising rolls the whole statement back,
  -- which is the point: a reorder that lands on some rows is worse than one
  -- that lands on none, because the order it leaves behind looks deliberate.
  if v_moved <> v_expected then
    raise exception 'reorder would have moved % of % items', v_moved, v_expected
      using errcode = '42501';
  end if;

  return 'ok';
end;
$$;

comment on function public.reorder_work_items(uuid, uuid[]) is
  'Renumbers order_index across one sprint in a single statement. SECURITY INVOKER: RLS decides which rows may move, and the row count decides whether the reorder stands at all.';

-- `public` includes `anon`. Reordering is not something a signed-out visitor
-- does, and EXECUTE is granted to PUBLIC by default on a new function.
revoke all on function public.reorder_work_items(uuid, uuid[]) from public;
grant execute on function public.reorder_work_items(uuid, uuid[]) to authenticated;
