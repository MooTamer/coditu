-- One document format, on every surface that holds writing.
--
-- `comments.body_json` and `acceptance_criteria.body_json` have been ProseMirror
-- documents for a while. `work_items.description`, `work_items.highlight` and
-- `sprints.notes` are plain text, and the design asks all five to be the same
-- thing: headings, lists, checklists, toggles, callouts, code, tables, images
-- and mentions, written with one editor and read by one renderer.
--
-- ## The text columns stay, and they are not a fallback
--
-- Each `*_json` column arrives BESIDE its text column, not instead of it. The
-- text is the **flattened projection**, written in the same statement, exactly
-- as `comments.body_text` has always been written beside `comments.body_json`.
--
-- That is not caution about the migration. It is what `04-EXPORT-SPEC.md` reads:
-- the CSV is a contract, the Markdown export is what an agent is handed, and
-- neither should have to walk a jsonb tree to find out what a story says. A
-- projection that is written in the same transaction cannot disagree with the
-- document; one that is derived at read time by whoever remembers to can.
--
-- ## Nothing is rewritten in bulk
--
-- 58 imported descriptions are requirement lists and 232 criteria have only ever
-- been a sentence. They stay as they are: `description_json` is null until
-- somebody edits that story, and the render edge falls back to the text column
-- when it is. A bulk conversion would be inventing a document structure for
-- prose nobody wrote as blocks — and it would touch every row in the table to
-- produce a paragraph the fallback already renders.
--
-- ## The version column
--
-- `DOC_VERSION` in `lib/blocks/schema.ts` is 1 and has never been anything else,
-- which is precisely when a version is worth storing: the moment a second value
-- exists, every row written before it is indistinguishable from one written
-- after, and the migration that needs to tell them apart is the one that cannot.
--
-- Adding a node type does not bump it. The renderer is fail-closed — an unknown
-- node contributes its text and nothing else — so an old reader meeting a new
-- block degrades rather than breaks. A bump is for a change that would make an
-- old document render *wrongly*.

alter table public.work_items
  add column description_json    jsonb,
  add column description_version smallint not null default 1,
  add column highlight_json      jsonb,
  add column highlight_version   smallint not null default 1;

comment on column public.work_items.description_json is
  'The story body as a block document. Null until somebody edits it — description holds the flattened projection and is what the exports read.';
comment on column public.work_items.highlight_json is
  'The discuss-before-implementing note as a block document. Exposed to a client by nothing, ever, exactly like the text column beside it.';

alter table public.sprints
  add column notes_json    jsonb,
  add column notes_version smallint not null default 1;

comment on column public.sprints.notes_json is
  'Sprint notes as a block document. notes holds the flattened projection; the sprint report and the Markdown export read that.';

-- The two that were already documents get their version stamp.
alter table public.acceptance_criteria add column body_version smallint not null default 1;
alter table public.comments            add column body_version smallint not null default 1;
alter table public.client_messages     add column body_version smallint not null default 1;

-- ---------------------------------------------------------------------------
-- The column guards.
--
-- `guard_work_item_columns` is an allowlist written as a DENYLIST: an engineer
-- may change `status` and `order_index`, and the guard enforces that by naming
-- everything else. So a new column is silently writable by any assignee until it
-- appears here — `component_id`, `body_json` and `deleted_at` each had to be
-- retrofitted after the fact, and `07-FIELD-NOTES.md` records it as a standing
-- trap.
--
-- Naming them in the migration that creates them is the only moment it is free.
-- `description` and `highlight` are admin-and-lead columns; the documents beside
-- them are the same columns in a different shape and carry the same rule.
-- ---------------------------------------------------------------------------

create or replace function public.guard_work_item_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text;
begin
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;

  changed := case
    when new.title               is distinct from old.title               then 'title'
    when new.description         is distinct from old.description         then 'description'
    when new.description_json    is distinct from old.description_json    then 'description_json'
    when new.description_version is distinct from old.description_version then 'description_version'
    when new.highlight           is distinct from old.highlight           then 'highlight'
    when new.highlight_json      is distinct from old.highlight_json      then 'highlight_json'
    when new.highlight_version   is distinct from old.highlight_version   then 'highlight_version'
    when new.type                is distinct from old.type                then 'type'
    when new.component_id        is distinct from old.component_id        then 'component_id'
    when new.assignee_id         is distinct from old.assignee_id         then 'assignee_id'
    when new.reviewer_id         is distinct from old.reviewer_id         then 'reviewer_id'
    when new.deadline            is distinct from old.deadline            then 'deadline'
    when new.estimate_minutes    is distinct from old.estimate_minutes    then 'estimate_minutes'
    when new.grouping            is distinct from old.grouping            then 'grouping'
    when new.sprint_id           is distinct from old.sprint_id           then 'sprint_id'
    when new.key                 is distinct from old.key                 then 'key'
    when new.deleted_at          is distinct from old.deleted_at          then 'deleted_at'
    when new.client_published_at is distinct from old.client_published_at then 'client_published_at'
    when new.client_title        is distinct from old.client_title        then 'client_title'
    when new.client_summary      is distinct from old.client_summary      then 'client_summary'
    else null
  end;

  if changed is not null then
    raise exception 'an engineer may change only status and order_index (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- `guard_criteria_columns` is deliberately NOT touched, and that is worth a
-- sentence rather than silence. It is the same denylist shape, naming only
-- `work_item_id` and `order_index` — the two that MOVE a criterion rather than
-- edit it. `body` and `body_json` were taken off that list on 2026-08-25 so an
-- engineer who owns or reviews the item can say what the box says, and
-- `body_version` travels with them: it is the stamp on the document they are
-- already allowed to write, so leaving it unnamed is the correct answer rather
-- than an oversight.
--
-- The opposite is true on `work_items`, where `description` and `highlight` are
-- admin-and-lead columns — so the documents and stamps beside them are named
-- above.
