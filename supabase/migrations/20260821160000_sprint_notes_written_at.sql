-- Coditu — when the sprint notes were actually written.
--
-- The notes panel has always rendered "written by <author> · <date>", and the
-- date it rendered was `starts_on` — the sprint's first day. That was true
-- while notes could only be seeded, because a sprint's notes were written when
-- the sprint was opened. It stops being true the moment someone can edit them:
-- the author column follows the editor, the date does not, and the panel
-- confidently reports that today's note was written last Monday.
--
-- Nullable and additive. Nothing reads it without a fallback.

alter table public.sprints
  add column notes_written_at timestamptz;

comment on column public.sprints.notes_written_at is
  'When the notes were last written. Falls back to starts_on for rows that predate editing.';

-- Existing rows keep the date they have been showing all along, so nothing in
-- the UI or the exports moves on deploy.
update public.sprints
set notes_written_at = starts_on::timestamptz
where notes is not null and starts_on is not null;
