-- Purging a comment removes its versions too.
--
-- `document_revisions.entity_id` is a plain uuid: it addresses five different
-- tables, so it can carry a foreign key to none of them. `work_item_id` and
-- `sprint_id` do have one and cascade, which is why purging a STORY already
-- takes its whole history with it — and why a comment's history was left
-- behind, silently, by the same operation.
--
-- The confirmation on the trash screen says a purge "removes the comment
-- permanently". It did not. The words stayed in `document_revisions` and the
-- version history panel went on rendering them, for ever, on a story anybody
-- internal could open. Found by `e2e/editable.spec.ts` — *"withdrawn, not
-- vanished — and its words never reach the browser"* — which reloads the page
-- and greps the source, so it caught a leak two phases after the phase that
-- introduced it.
--
-- The read side is fixed as well and independently: `lib/data/revisions.ts` now
-- shows a comment's revisions only while that comment is present and standing,
-- written as an allowlist. That covers rows orphaned before this migration; this
-- covers everything after it. Neither alone is enough — the reader would go on
-- carrying dead rows for ever, and a future reader that forgot the rule would
-- expose them again.
--
-- **Criteria are deliberately not treated this way.** A removed criterion's
-- history is a legitimate record of what the work asked for and when it
-- changed; no rule anywhere says those words must stop being readable. A
-- withdrawn comment is the opposite: withdrawing is *specifically* the act of
-- taking words back from every reader including their author.

create or replace function public.purge_deleted(p_kind text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Admin only, and stated here rather than left to RLS: a hard delete on
  -- `work_items` cascades to its criteria, its thread, its time entries and its
  -- revisions, and none of that comes back. This is the one place in the schema
  -- where "the policy happens to allow it" is not a good enough reason.
  if public.auth_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only an admin may purge' using errcode = '42501';
  end if;

  if p_kind = 'work_item' then
    -- Only something already in the bin. Purging is emptying the trash, never a
    -- shortcut past the soft delete — deleting a live story in one step is not
    -- an operation this offers.
    --
    -- Revisions go by cascade: `document_revisions.work_item_id` references
    -- this row, and that includes the revisions of its criteria and comments,
    -- which the trigger stamps with the story they belong to.
    delete from public.work_items where id = p_entity_id and deleted_at is not null;

  elsif p_kind = 'comment' then
    -- Nothing cascades here, so the history is removed explicitly — and BEFORE
    -- the comment, so a failure leaves the comment in the bin with its history
    -- rather than a comment that is gone with its words still readable. If only
    -- one of these two statements can happen, this is the safe order.
    delete from public.document_revisions
     where surface = 'comment'
       and entity_id = p_entity_id
       and exists (
         select 1 from public.comments c
          where c.id = p_entity_id and c.deleted_at is not null
       );

    delete from public.comments where id = p_entity_id and deleted_at is not null;

  else
    raise exception 'Not something that can be purged' using errcode = '22023';
  end if;
end;
$$;

comment on function public.purge_deleted is
  'Irreversible. Admin only, one row at a time, only rows already soft-deleted. Takes the entity''s document history with it.';
