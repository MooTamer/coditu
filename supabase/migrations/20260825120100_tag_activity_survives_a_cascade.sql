-- Deleting a work item was impossible for about an hour.
--
-- `20260825120000` put an AFTER DELETE trigger on `work_item_components` that
-- records an untag in `activity`. Deleting a work item cascades to its tags, so
-- the trigger fired with the parent already gone and the insert violated
-- `activity_work_item_id_fkey`:
--
--   insert or update on table "activity" violates foreign key constraint
--   DETAIL: Key (work_item_id)=(d22501ae…) is not present in table "work_items".
--
-- The whole DELETE aborts, so nothing could remove a work item at all — not the
-- Server Action, not the e2e cleanup, not a psql session. It was found by
-- `e2e/components.spec.ts`'s `afterEach`, which deletes the rows it created,
-- and it presented as a spec failing in teardown rather than as anything to do
-- with components.
--
-- The fix is the standard cascade-ordering guard: an untag caused by the item
-- going away is not a fact about the item, and there is nothing left to hang it
-- on. A tag removed from an item that still exists is still recorded.
--
-- Worth stating because the shape recurs: **any AFTER DELETE trigger that writes
-- a row referencing the deleted row's parent has this bug**, and it is invisible
-- until something deletes a parent. `refresh_component_mirror` is the same
-- trigger and does not have it, only because its UPDATE matches zero rows and
-- an UPDATE that matches nothing is not an error.

create or replace function public.record_component_tag_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activity (work_item_id, actor_id, verb, field, to_value)
    values (new.work_item_id, actor, 'set', 'component',
            (select name from public.components where id = new.component_id));
    return null;
  end if;

  -- The item is being deleted and took its tags with it. There is no item left
  -- for this to be activity ON, and the FK says so.
  if not exists (select 1 from public.work_items w where w.id = old.work_item_id) then
    return null;
  end if;

  insert into public.activity (work_item_id, actor_id, verb, field, from_value)
  values (old.work_item_id, actor, 'cleared', 'component',
          (select name from public.components where id = old.component_id));

  return null;
end;
$$;
