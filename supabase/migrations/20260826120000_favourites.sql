-- What one person keeps at the top of their sidebar.
--
-- Deferred from W6d and built now, in the order that decision recorded: the
-- design's three favourites are a saved filter view, a work item and a component
-- registry, and saved views did not exist until W7. Building this table then
-- would have meant either a schema that could hold two of its three kinds, or
-- inventing what a saved view is from a chip in a prototype.
--
-- ## Three columns, not one `target_id`
--
-- The obvious shape is `(kind, target_id)` and it is wrong here for the reason
-- `saved_views` chose a composite foreign key over a trigger: a polymorphic
-- `target_id` cannot have a foreign key, so deleting a story would leave a
-- favourite pointing at nothing, and the sidebar would render a row that goes
-- nowhere. Nobody would notice until they clicked it.
--
-- Three nullable columns, each with a real `on delete cascade`, and a check that
-- exactly one is set. Deleting the target deletes the favourite, and the
-- database does it without anybody remembering to. Adding a fourth kind is one
-- column, one FK and one term in the check — which is more typing than a
-- polymorphic id and cannot rot.
--
-- ## Invariant 1 is somebody else's job here, and that is deliberate
--
-- A favourite holds no project scope of its own because it holds no data of its
-- own: it is a pointer, and what it points at is already scoped. Whether the
-- reader may SEE a favourited story is decided where it always is — by the RLS
-- on `work_items` — when the row is read through the join. A favourite cannot
-- widen anything, because a person can only create one for a row they could
-- already read.
--
-- ## Who may do what
--
-- Yours alone. Not shared, not visible to a lead, not adjustable by an admin —
-- a favourite is a note about how one person works, and there is no operational
-- reason for anybody else to see or change it. That is stricter than
-- `saved_views`, which has a shared mode, and the difference is the point: a
-- shared view is a team artefact, a favourite is furniture in one person's room.
--
-- No `update` policy and no `update` grant: a favourite has nothing to change.
-- It is inserted or it is deleted.

create table public.favourites (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,

  -- Exactly one of these is set. See the note above on why this is not a
  -- polymorphic `target_id`.
  saved_view_id uuid references public.saved_views (id) on delete cascade,
  work_item_id  uuid references public.work_items (id)  on delete cascade,
  component_id  uuid references public.components (id)  on delete cascade,

  created_at    timestamptz not null default now(),

  constraint favourites_exactly_one_target check (
    (saved_view_id is not null)::int
    + (work_item_id is not null)::int
    + (component_id is not null)::int
    = 1
  )
);

-- One favourite per person per thing. Starring twice is the same star, and the
-- second insert should collide rather than making a duplicate row that the
-- un-star then only half removes.
--
-- Partial, because two favourites for different kinds both have nulls in the
-- other columns and a plain composite unique index would treat those nulls as
-- distinct — which is correct SQL and the wrong rule here.
create unique index favourites_one_view_idx
  on public.favourites (profile_id, saved_view_id) where saved_view_id is not null;
create unique index favourites_one_item_idx
  on public.favourites (profile_id, work_item_id) where work_item_id is not null;
create unique index favourites_one_component_idx
  on public.favourites (profile_id, component_id) where component_id is not null;

-- The sidebar's query: everything one person has starred, newest first.
create index favourites_profile_idx on public.favourites (profile_id, created_at desc);

comment on table public.favourites is
  'What one person keeps at the top of their sidebar. Private to them; a pointer, never a copy.';
comment on column public.favourites.saved_view_id is
  'Exactly one of saved_view_id / work_item_id / component_id is set. Real FKs, so a deleted target takes its favourites with it.';

-- ---------------------------------------------------------------------------
-- The grant, which RLS does not imply — see the same note on `saved_views`.
-- Without it every statement fails with `42501 permission denied for table
-- favourites` however permissive the policies are, and the failure reads as an
-- RLS bug, which is the wrong place to look.
--
-- No `update`: there is nothing on this row to change.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.favourites to authenticated;

alter table public.favourites enable row level security;

create policy "members read their own favourites"
  on public.favourites
  for select
  to authenticated
  using (public.is_active_member() and profile_id = (select auth.uid()));

-- You may only star something as yourself. Starring on somebody else's behalf
-- is not a thing that should be possible, so the check names the writer rather
-- than trusting the column.
create policy "members create their own favourites"
  on public.favourites
  for insert
  to authenticated
  with check (public.is_active_member() and profile_id = (select auth.uid()));

create policy "members remove their own favourites"
  on public.favourites
  for delete
  to authenticated
  using (public.is_active_member() and profile_id = (select auth.uid()));
