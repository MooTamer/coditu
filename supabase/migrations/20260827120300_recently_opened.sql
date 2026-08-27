-- Recently opened.
--
-- `PLAN.md` §2 asks Workspace Home for *"Recently opened stories, projects, and
-- notes"*, and the returned prototype puts a **Recently opened** panel in the
-- sidebar with five rows: a story, sprint notes, a project, another story, a
-- payout. Neither existed. Favourites did — which is the deliberate list — and
-- there was nothing for the accidental one.
--
-- ## Why a table rather than `localStorage`
--
-- Because the thing being remembered is *where this person was*, and this
-- person has a phone and a laptop. A recents list that resets when you pick up
-- the other device is a list nobody learns to trust, and the whole value of the
-- panel is that the thing you were reading twenty minutes ago is one press away.
--
-- The cost is one upsert per page view, per person, on a four-person workspace.
-- That is not a load-bearing cost, and the write is `on conflict do update`, so
-- a person who opens the same story eleven times has one row.
--
-- ## It is a pointer, never a copy
--
-- `label` is a story key and title, a page title, a project name. Nothing here
-- is content, and nothing here outlives what it points at: `href` is a route,
-- and a row whose target has been deleted is pruned by the reader rather than
-- kept as a link to a 404. Same rule `favourites` follows, one step looser
-- because a recent is not worth a foreign key per kind — a page, a story, a
-- sprint's notes and a project are four different tables and the panel does not
-- care which.

create table if not exists public.recent_views (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  href       text not null,
  label      text not null,
  /** `COD` · `note` · `page` · `proj`. The prototype's own four-letter glyphs. */
  glyph      text not null,
  opened_at  timestamptz not null default now(),

  primary key (profile_id, href),

  -- Routes only, and app routes at that. This column is rendered as an `href`
  -- and it arrives from a client, so its shape is checked in the database as
  -- well as in the action — the rule `role_is_not_client_supplied` established
  -- for a column that decides something.
  constraint recent_views_href_shape check (href ~ '^/app/[A-Za-z0-9/_-]*$' and length(href) <= 200),
  constraint recent_views_label_shape check (btrim(label) <> '' and length(label) <= 160),
  constraint recent_views_glyph_shape check (glyph in ('COD', 'note', 'page', 'proj'))
);

comment on table public.recent_views is
  'Where one person has been, most recent first. Private to them; a pointer, never a copy.';

create index if not exists recent_views_profile_idx
  on public.recent_views (profile_id, opened_at desc);

-- ---------------------------------------------------------------------------
-- Bounded, in the database.
--
-- Without this the table grows for ever and the panel reads the newest twenty
-- of ten thousand rows. A trigger rather than a scheduled job, because the only
-- moment the bound can be exceeded is the moment a row is added, and a job is
-- one more thing that has to be running for a guarantee to hold.
-- ---------------------------------------------------------------------------

create or replace function public.prune_recent_views()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.recent_views r
   where r.profile_id = new.profile_id
     and r.opened_at < (
       select v.opened_at
         from public.recent_views v
        where v.profile_id = new.profile_id
        order by v.opened_at desc
        offset 20
        limit 1
     );
  return null;
end;
$$;

comment on function public.prune_recent_views is
  'AFTER INSERT OR UPDATE. Keeps the twenty most recent rows per person. The bound is here so it cannot depend on a job being alive.';

drop trigger if exists recent_views_prune on public.recent_views;
create trigger recent_views_prune
  after insert or update on public.recent_views
  for each row execute function public.prune_recent_views();

-- ---------------------------------------------------------------------------
-- Yours and nobody else's.
--
-- The grant is separate from the policies and is not implied by them — without
-- it every statement fails `42501 permission denied for table recent_views`
-- however permissive the policies are, and the failure reads as an RLS bug,
-- which is the wrong place to look. `saved_views` and `favourites` both carry
-- this note for the same reason.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.recent_views to authenticated;

alter table public.recent_views enable row level security;

drop policy if exists "members read their own recents" on public.recent_views;
create policy "members read their own recents"
  on public.recent_views
  for select
  to authenticated
  using (public.is_active_member() and profile_id = (select auth.uid()));

-- You may only record a visit as yourself. Recording on somebody else's behalf
-- is not a thing that should be possible, so the check names the writer rather
-- than trusting the column.
drop policy if exists "members record their own recents" on public.recent_views;
create policy "members record their own recents"
  on public.recent_views
  for insert
  to authenticated
  with check (public.is_active_member() and profile_id = (select auth.uid()));

drop policy if exists "members refresh their own recents" on public.recent_views;
create policy "members refresh their own recents"
  on public.recent_views
  for update
  to authenticated
  using (public.is_active_member() and profile_id = (select auth.uid()))
  with check (public.is_active_member() and profile_id = (select auth.uid()));

drop policy if exists "members forget their own recents" on public.recent_views;
create policy "members forget their own recents"
  on public.recent_views
  for delete
  to authenticated
  using (public.is_active_member() and profile_id = (select auth.uid()));
