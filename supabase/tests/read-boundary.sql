-- Coditu — the client read boundary, pinned by SHAPE rather than by behaviour.
--
-- ## Why this file exists
--
-- `rls.sql` proves what the four client functions *return* for a given session:
-- the right project, only published components, hours null without `view_effort`,
-- nothing at all for another company. That is the important half and it is not
-- the whole thing.
--
-- What no assertion covered until now is the **shape**. `02-DATA-MODEL.md` says
-- it plainly — *"there is no `select *` in any of them and there must never be:
-- `select *` is how a column added next year becomes a leak nobody wrote"* — and
-- that rule had no test. A `select *` in `client_component_work` would still
-- return the right rows to the right contact, so every behavioural assertion in
-- `rls.sql` would stay green while `description` and `highlight` crossed the
-- wire.
--
-- So this file asserts the returned column list of each function, verbatim. It
-- is deliberately brittle: any change to a client-facing projection has to be
-- restated here, in one place, by somebody who has read what they are adding.
--
-- ## And why it exists NOW
--
-- The many-to-many component work re-points `client_components` and
-- `client_component_work` at a join table. These assertions are the
-- characterisation taken *before* that move: they must still pass afterwards, or
-- the rewrite changed what a client can see, which was never the intent.
--
-- Run with: npm run db:test

create extension if not exists pgtap with schema extensions;

begin;

select plan(20);

-- ---------------------------------------------------------------------------
-- 1. The four functions exist, and return exactly these columns.
--
-- `pg_get_function_result` is the catalog's own rendering of the RETURNS TABLE
-- clause, so this compares against what Postgres actually has rather than
-- against a copy of the migration.
-- ---------------------------------------------------------------------------

select is(
  pg_get_function_result('public.client_projects()'::regprocedure),
  'TABLE(project_id uuid, name text, slug text, client_name text, accent_hex text)',
  'client_projects returns id, name, slug, client name and accent — not scope, not key_prefix'
);

select is(
  pg_get_function_result('public.client_components(uuid)'::regprocedure),
  'TABLE(component_id uuid, name text, slug text, summary text, item_count integer, '
  || 'done_count integer, minutes_logged integer, last_activity timestamp with time zone)',
  'client_components returns the curated summary and counts over published work only'
);

select is(
  pg_get_function_result('public.client_component_work(uuid,uuid)'::regprocedure),
  'TABLE(work_item_id uuid, title text, summary text, status_label text, is_done boolean, '
  || 'deadline date, published_at timestamp with time zone)',
  'client_component_work returns a humanised status_label — the enum value never crosses the wire'
);

select is(
  pg_get_function_result('public.client_current_sprint(uuid)'::regprocedure),
  'TABLE(name text, goal text, starts_on date, ends_on date, total_items integer, '
  || 'done_items integer, minutes_logged integer)',
  'client_current_sprint returns the window and progress, and never the notes'
);

-- The columns that must never appear in a client projection, named so the
-- assertion says what it is protecting rather than "shape changed".
select is(
  (select count(*)::int
     from unnest(array['description', 'highlight', 'assignee_id', 'reviewer_id',
                       'estimate_minutes', 'key', 'notes', 'scope', 'key_prefix',
                       'order_index', 'grouping']) as leaked(col)
    where exists (
      select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname like 'client\_%'
         and pg_get_function_result(p.oid) ~ ('\m' || leaked.col || '\M'))),
  0,
  'no client-facing function returns a column that is internal by name'
);

-- ---------------------------------------------------------------------------
-- 2. No `select *` anywhere in a client-facing function body.
--
-- `count(*)` and `select 1 from …` are fine; a bare star in the select list is
-- the thing being refused. Checked against the stored body, so it covers
-- functions added later that nobody thought to list here.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'client\_%'
      and p.prosrc ~ 'select[[:space:]]+\*'),
  0,
  'no client-facing function contains a bare `select *` — a column added next year is not a leak nobody wrote'
);

-- ---------------------------------------------------------------------------
-- 3. Every client-facing function is definer, pinned, and not granted to the world.
--
-- A `security definer` function created in `public` is granted EXECUTE to PUBLIC
-- by default. That is the trap `allowlist_claimed()` documents, and it applies
-- to every one of these.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'client\_%' and not p.prosecdef),
  0,
  'every client-facing function is security definer'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'client\_%'
      and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  0,
  'and pins search_path to the empty string, so a caller cannot shadow public'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'client\_%'
      and (has_function_privilege('anon',   p.oid, 'execute')
        or has_function_privilege('public', p.oid, 'execute'))),
  0,
  'and is revoked from anon and from PUBLIC'
);

-- ---------------------------------------------------------------------------
-- 4. Invariant 1 on the component join, asserted over the real seeded data.
--
-- Not a count — counts over seeded rows drift the moment a browser suite runs
-- against the same database. This is a violation count, and the only correct
-- value for it is zero, before and after the join table exists.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
     from public.work_items w
     join public.sprints s    on s.id = w.sprint_id
     join public.components c on c.id = w.component_id
    where c.project_id is distinct from s.project_id),
  0,
  'invariant 1: no item names a component from outside its own sprint''s project'
);

select is(
  (select count(*)::int
     from public.components c
     left join public.projects p on p.id = c.project_id
    where p.id is null),
  0,
  'and every component belongs to a project — nothing in the registry is global'
);

-- The guard that makes the line above true for writes and not merely for the
-- rows that happen to be there. Phase 2 restates it for the join table; if it
-- ever stops being attached, this is where that shows.
select is(
  (select count(*)::int from pg_trigger
    where tgrelid = 'public.work_items'::regclass
      and tgname = 'work_items_guard_component_project'
      and not tgisinternal),
  1,
  'guard_work_item_component_project is attached to work_items, not merely defined'
);

select is(
  (select count(*)::int from pg_trigger
    where tgrelid = 'public.client_threads'::regclass
      and tgname = 'client_threads_derive_project'
      and not tgisinternal),
  1,
  'and the thread scope trigger is attached too — it derives a thread''s project from its component'
);

-- ---------------------------------------------------------------------------
-- 5. Publication is a column, not a convention.
-- ---------------------------------------------------------------------------

select has_column('public', 'work_items', 'client_published_at',
  'an item is client-visible only once somebody published it on purpose');
select has_column('public', 'work_items', 'client_title',
  'with an optional client-safe rewrite of the title');
select has_column('public', 'work_items', 'client_summary',
  'and an optional summary');
select has_column('public', 'components', 'client_summary',
  'a component carries the sentence written for the client');
select has_column('public', 'components', 'published_at',
  'and the moment it was shown to them');

-- The check constraint, not form validation: a Server Action, a psql session and
-- a future importer all reach this table and only one of them has the form.
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.components'::regclass
      and conname = 'components_published_needs_summary'),
  1,
  'a component cannot be published without a summary — enforced by a constraint'
);

-- ---------------------------------------------------------------------------
-- 6. The engineer column guard is an allowlist written as a denylist, so every
--    client-facing column has to be NAMED in it. This is the assertion that
--    fails when a new column is added and nobody remembers.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
     from unnest(array['client_published_at', 'client_title', 'client_summary',
                       'component_id', 'title', 'description', 'highlight',
                       'assignee_id', 'reviewer_id', 'deadline', 'estimate_minutes',
                       'grouping', 'sprint_id', 'key', 'type',
                       -- The block documents and their version stamps. Same rule
                       -- as the text columns they sit beside: what a story SAYS
                       -- is an admin-and-lead decision, in either shape.
                       'description_json', 'description_version',
                       'highlight_json', 'highlight_version']) as guarded(col)
    where (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'guard_work_item_columns')
          not like '%' || guarded.col || '%'),
  0,
  'guard_work_item_columns names every column an engineer must not write'
);

select * from finish();
rollback;
