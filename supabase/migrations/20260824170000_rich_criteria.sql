-- Coditu — an acceptance criterion can hold a document, not just a sentence.
--
-- ## Why
--
-- A criterion is where "how will we know this is done" is written, and half the
-- time the honest answer is a screenshot with an arrow on it, or the four lines
-- of SCSS that have to end up in the file. Until now it was `text`, so those
-- went into the comment thread instead and the criterion said "see comments".
--
-- The thread already solves this: `comments.body_json` is a ProseMirror document
-- rendered by walking an allowlist of node types, never injected as HTML. This
-- is the same column on the same terms — same editor, same renderer, same
-- sanitiser, same storage bucket for the pictures.
--
-- ## Why `body` stays
--
-- `body` becomes the flattened projection of `body_json`, written in the same
-- statement, exactly as `comments.body_text` is. It is not legacy:
--
--   * The CSV and Markdown exports render criteria as text and are a CONTRACT
--     (docs/04-EXPORT-SPEC.md). They keep reading `body` and keep producing the
--     same bytes for every criterion that is a sentence.
--   * 232 imported criteria have no `body_json` and never will. A NOT NULL here
--     would mean inventing a document for each of them; instead `body_json` is
--     null and every reader falls back to the text, which is what it always was.
--
-- Nothing migrates. A criterion written before today keeps its text and gains a
-- document the first time somebody edits it.

alter table public.acceptance_criteria
  add column body_json jsonb;

comment on column public.acceptance_criteria.body_json is
  'ProseMirror document, or null for a criterion that has only ever been a sentence. Rendered by walking an allowlist — never injected as HTML. `body` is its flattened projection and stays the source for exports.';

comment on column public.acceptance_criteria.body is
  'The criterion as plain text. Written by the server from body_json when there is one, so the CSV and Markdown exports keep reading one column and keep producing the same bytes.';

-- ---------------------------------------------------------------------------
-- The engineer column guard, extended.
--
-- Same shape as `guard_work_item_columns`, and the same trap: it is an
-- allowlist ("is_done") written as a denylist, so `body_json` is silently
-- writable by an assignee until it is named here. An engineer may tick a box.
-- Rewriting what the box says is still a lead's call.
-- ---------------------------------------------------------------------------

create or replace function public.guard_criteria_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;
  if new.body is distinct from old.body
     or new.body_json is distinct from old.body_json
     or new.work_item_id is distinct from old.work_item_id
     or new.order_index is distinct from old.order_index then
    raise exception 'an engineer may only toggle is_done on an acceptance criterion'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
