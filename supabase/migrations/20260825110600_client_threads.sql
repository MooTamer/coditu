-- Coditu — client question threads.
--
-- ── Why this is not a flag on `comments` ────────────────────────────────────
--
-- `comments` is where engineers argue about implementation. Fifteen sprints of
-- it exist, the client report goes to real trouble to keep it out, and
-- `05-DECISIONS.md` records "the client PDF carries no work-item keys" for the
-- same instinct.
--
-- An `is_client_visible boolean` on that table would put ONE column between all
-- of it and a client's screen, and every query written afterwards would have to
-- remember the filter. The failure mode is not dramatic — it is a `select` in a
-- new feature eighteen months from now that forgets, and nobody notices because
-- the page looks right to the person testing it, who is internal.
--
-- These are different tables. There is nothing to remember, and a query that
-- forgets a filter here returns client messages to a client, which is what it
-- is for.
--
-- Existing comments are untouched and unmigrated. They were written under the
-- expectation of privacy, and nothing here changes that retrospectively.

create type client_thread_state as enum ('waiting_client', 'waiting_coditu', 'resolved');

comment on type client_thread_state is
  'Whose turn it is. waiting_client = we asked, they have not answered. waiting_coditu = they answered. resolved = done, and only Coditu may say so.';

create table public.client_threads (
  id           uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.components (id) on delete cascade,
  -- Derived from the component by trigger, never accepted from the caller.
  -- Denormalised because every read filters on it, and joining through
  -- `components` on the hot path to re-derive a value that cannot change is
  -- work for nothing.
  project_id   uuid not null references public.projects (id) on delete cascade,
  -- Optional context: "this is about that piece of work". Nullable because
  -- most questions are about the component as a whole.
  work_item_id uuid references public.work_items (id) on delete set null,
  title        text not null check (length(btrim(title)) between 1 and 200),
  state        client_thread_state not null default 'waiting_client',
  opened_by    uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

comment on table public.client_threads is
  'A question Coditu asked a client, attached to a component. Its project is derived from that component — invariant 1, in a trigger — so no caller can place a thread in a project it does not belong to.';

create index client_threads_project_state_idx on public.client_threads (project_id, state);
create index client_threads_component_idx     on public.client_threads (component_id, created_at desc);

create table public.client_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.client_threads (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete restrict,
  body_json  jsonb not null,
  body_text  text  not null,
  edited_at  timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.client_messages is
  'One message. Same ProseMirror document shape as comments.body_json, so lib/comments/schema.ts and comment-body.tsx are reused rather than a second renderer being written. author_id is on delete restrict: a withdrawn contact keeps her name on her own words.';

create index client_messages_thread_idx on public.client_messages (thread_id, created_at);

-- Who has read how far. One row per person per thread, so an unread count is a
-- comparison rather than a per-message join table.
create table public.client_thread_reads (
  thread_id    uuid not null references public.client_threads (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Invariant 1, on the thread.
-- ---------------------------------------------------------------------------

create or replace function public.derive_client_thread_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  component_project uuid;
  item_project      uuid;
begin
  select c.project_id into component_project
    from public.components c where c.id = new.component_id;

  if component_project is null then
    raise exception 'a client thread must name a component that exists' using errcode = '23503';
  end if;

  -- Assigned, not compared. A caller may send anything at all in this column
  -- and it is simply replaced — which is stronger than raising, because there
  -- is no path where a wrong value survives to be acted on.
  new.project_id := component_project;

  if new.work_item_id is not null then
    select s.project_id into item_project
      from public.work_items w
      join public.sprints s on s.id = w.sprint_id
     where w.id = new.work_item_id;

    if item_project is distinct from component_project then
      raise exception 'a client thread cannot reference a work item from another project'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger client_threads_derive_project
  before insert or update of component_id, work_item_id on public.client_threads
  for each row execute function public.derive_client_thread_project();

-- ---------------------------------------------------------------------------
-- Can this session see this thread at all?
--
-- One predicate, used by every policy below, so "which threads exist" has a
-- single answer. Internal members see all of them — including threads on
-- unpublished components, because those are OUR questions and we wrote them.
-- A client sees a thread only where the component is published to her AND she
-- holds `read_questions` on its project.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_client_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_active_member()
    or exists (
      select 1
      from public.client_threads t
      join public.components     c on c.id = t.component_id
      where t.id = p_thread_id
        and c.published_at is not null
        and public.client_has_capability(t.project_id, 'read_questions')
    ),
    false
  )
$$;

revoke all on function public.can_read_client_thread(uuid) from public, anon;
grant execute on function public.can_read_client_thread(uuid) to authenticated;

/**
 * And may this session WRITE into it.
 *
 * Separate from reading, and that separation is the `read_questions` /
 * `reply_questions` split doing its job: a client given read-only access can
 * follow a conversation and cannot join it. Internal members may always write
 * — it is their question.
 */
create or replace function public.can_write_client_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_active_member()
    or exists (
      select 1
      from public.client_threads t
      join public.components     c on c.id = t.component_id
      where t.id = p_thread_id
        and c.published_at is not null
        and public.client_has_capability(t.project_id, 'reply_questions')
    ),
    false
  )
$$;

revoke all on function public.can_write_client_thread(uuid) from public, anon;
grant execute on function public.can_write_client_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

alter table public.client_threads      enable row level security;
alter table public.client_messages     enable row level security;
alter table public.client_thread_reads enable row level security;

-- No DELETE in the grant for either of the first two. The absence is the rule,
-- exactly as it is for `comments` and `sprint_payouts`: a question that
-- vanishes is worse than one that is visibly resolved, and a message that
-- vanishes takes an answer somebody acted on with it.
grant select, insert, update on public.client_threads, public.client_messages to authenticated;
grant select, insert, update, delete on public.client_thread_reads to authenticated;

create policy "read client threads" on public.client_threads
  for select to authenticated using (public.can_read_client_thread(id));

-- Only internal staff open a thread, unless the client was given
-- `start_questions` explicitly. It is off in both presets: a portal a client can
-- post into from nothing is a support inbox, and nobody agreed to staff one.
create policy "open client threads" on public.client_threads
  for insert to authenticated
  with check (
    (public.is_active_member() and opened_by = (select auth.uid()))
    or (
      opened_by = (select auth.uid())
      and public.client_has_capability(
        (select c.project_id from public.components c where c.id = component_id),
        'start_questions'
      )
    )
  );

-- The STATE moves, and only Coditu may resolve. A client answering flips it to
-- `waiting_coditu` through the Server Action, which runs as her; marking a
-- question closed is a judgement about whether the answer was sufficient, and
-- that is ours.
create policy "move client thread state" on public.client_threads
  for update to authenticated
  using (public.can_write_client_thread(id))
  with check (
    public.is_active_member()
    or (state <> 'resolved' and public.can_write_client_thread(id))
  );

create policy "read client messages" on public.client_messages
  for select to authenticated
  using (public.can_read_client_thread(thread_id) and deleted_at is null);

create policy "write client messages" on public.client_messages
  for insert to authenticated
  with check (
    -- The author is the caller, always. Taking it from the row would make it a
    -- value the server has to distrust; this makes it one the database refuses.
    author_id = (select auth.uid())
    and public.can_write_client_thread(thread_id)
  );

-- Your own words. An admin may soft-delete anybody's — the same moderation
-- escape hatch `comments` has — and `editComment`'s history is the warning:
-- that action let an admin rewrite anybody's words while its own error sentence
-- said only the author could. Editing here is author-only in the policy, so the
-- sentence and the rule cannot drift apart.
create policy "edit own client message" on public.client_messages
  for update to authenticated
  using (author_id = (select auth.uid()) or public.auth_role() = 'admin')
  with check (author_id = (select auth.uid()) or public.auth_role() = 'admin');

create policy "own thread reads" on public.client_thread_reads
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
