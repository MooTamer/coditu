-- A view is a saved question about a sprint, not a saved answer.
--
-- `spec` holds filter, sort and mode — the same vocabulary that already lives in
-- the URL — and never a row set. That is the whole design decision. A view that
-- stored twelve work-item ids would be a stale list the moment somebody moved a
-- story, and "Peer review queue" would quietly stop meaning peer review queue.
-- Storing the question means the answer is recomputed every time it is opened,
-- which is what anybody clicking a saved view actually expects.
--
-- It also keeps this table out of the scoping rules entirely: a spec cannot leak
-- a row, because it contains no rows. Whatever the reader is allowed to see is
-- decided where it always was — by the RLS on `work_items` — when the view is
-- applied.
--
-- ## Invariant 1, enforced by the schema rather than by the writer
--
-- A view belongs to a project. It may also name a sprint, and if it does, that
-- sprint must belong to the same project — otherwise `/app/projects/nile/…`
-- could hold a view pointing at EVIM's Week 17, which is exactly the shape of
-- leak invariant 1 exists to prevent.
--
-- A trigger could check that. A composite foreign key cannot be wrong: adding
-- `unique (id, project_id)` to `sprints` — redundant on its own, since `id` is
-- already the key — gives `(sprint_id, project_id)` something to reference, and
-- the database refuses the mismatch without anybody remembering to.
--
-- ## Who may do what, and why it matches comments
--
-- Read: any active internal member, if the view is shared or is their own.
-- Write: the owner, or an admin — the same rule as `edit own comment`, and for
-- the same reason. A shared view sits in everybody's menu; an admin has to be
-- able to take one down without asking the person who made it to come back from
-- leave. Widening it further would let a lead rename somebody's private view,
-- which is not a delivery decision.
--
-- Client contacts are excluded by `is_active_member()`, like every other
-- internal table. `anon` is excluded by `to authenticated`.

-- ---------------------------------------------------------------------------
-- The key the composite foreign key below needs. `id` is already unique on its
-- own; this exists so `(sprint_id, project_id)` has something to point at.
-- ---------------------------------------------------------------------------
alter table public.sprints
  add constraint sprints_id_project_id_key unique (id, project_id);

create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  -- Null means "this project, whichever sprint you are looking at". A view
  -- called `Peer review queue` is worth carrying from one week to the next; one
  -- called `Week 17 carry-over` is not.
  sprint_id   uuid,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  /**
   * The name, folded, so the uniqueness rule below can be an upsert target.
   *
   * A unique index on `lower(btrim(name))` expresses the same rule and cannot
   * be used by PostgREST: `on_conflict` takes column NAMES, and asking it for
   * an expression returns `42703 column "lower" does not exist`. A stored
   * generated column is the same fold, held in something PostgREST can point
   * at — so saving twice under `Peer review queue` and ` peer REVIEW queue `
   * is one overwrite rather than an error nobody can resolve.
   */
  name_key    text generated always as (lower(btrim(name))) stored,
  spec        jsonb not null default '{}'::jsonb,
  is_shared   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint saved_views_name_length
    check (length(btrim(name)) between 1 and 60),

  -- Belt and braces beneath the zod schema that validates this on both sides in
  -- TypeScript. It cannot check the shape, but it can refuse an array or a
  -- string, which is what a mistake looks like.
  constraint saved_views_spec_is_object
    check (jsonb_typeof(spec) = 'object'),

  -- The sprint, if named, belongs to this project. See the note above.
  constraint saved_views_sprint_in_project
    foreign key (sprint_id, project_id)
    references public.sprints (id, project_id)
    on delete cascade
);

-- One name per person per project. Two views both called `Mine` is a menu
-- nobody can use, and the second save should be an overwrite rather than a
-- duplicate. On the generated column, so `saveView` can name it in an upsert.
create unique index saved_views_owner_name_key
  on public.saved_views (project_id, owner_id, name_key);

-- The menu's query: this project's views, mine and everybody's shared ones.
create index saved_views_project_idx on public.saved_views (project_id, is_shared);
create index saved_views_owner_idx on public.saved_views (owner_id);

create trigger saved_views_set_updated_at
  before update on public.saved_views
  for each row execute function public.set_updated_at();

comment on table public.saved_views is
  'A saved question about a sprint — filter, sort and mode — never a saved row set. §5.5.';
comment on column public.saved_views.spec is
  'Filter/sort/mode only. Validated by zod on read AND write; a row set here would be stale the moment anything moved.';
comment on column public.saved_views.sprint_id is
  'Null means the view follows whichever sprint is open. When set, the composite FK guarantees the sprint belongs to project_id — invariant 1.';

-- ---------------------------------------------------------------------------
-- The grant, which RLS does not imply.
--
-- A policy says which ROWS a role may touch; a grant says whether the role may
-- touch the table at all. Without this every statement here fails with
-- `42501 permission denied for table saved_views` no matter how permissive the
-- policies are — and the failure looks like an RLS bug, which is the wrong
-- place to go looking. `work_item_components` carries the same line for the
-- same reason.
--
-- No `truncate`, no `references`: this table is written a row at a time.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.saved_views to authenticated;

alter table public.saved_views enable row level security;

create policy "members read shared and own views"
  on public.saved_views
  for select
  to authenticated
  using (
    public.is_active_member()
    and (is_shared or owner_id = (select auth.uid()))
  );

-- You may only create a view owned by you. An admin editing somebody else's is
-- covered below; an admin *creating* one in somebody else's name is not a thing
-- that should be possible.
create policy "members create their own views"
  on public.saved_views
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and owner_id = (select auth.uid())
  );

create policy "owner or admin updates a view"
  on public.saved_views
  for update
  to authenticated
  using (
    public.is_active_member()
    and (owner_id = (select auth.uid()) or public.auth_role() = 'admin')
  )
  with check (
    public.is_active_member()
    and (owner_id = (select auth.uid()) or public.auth_role() = 'admin')
  );

create policy "owner or admin deletes a view"
  on public.saved_views
  for delete
  to authenticated
  using (
    public.is_active_member()
    and (owner_id = (select auth.uid()) or public.auth_role() = 'admin')
  );
