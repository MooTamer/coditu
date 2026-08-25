-- Coditu — reading threads, through the same boundary as everything else.
--
-- ── The bug this fixes, because it is instructive ──────────────────────────
--
-- `client_threads` and `client_messages` have no internal-only columns, so the
-- first version of `lib/data/client-threads.ts` read them with ordinary
-- PostgREST selects and let RLS decide the rows. That part was right, and the
-- pgTAP suite proved it: a client sees exactly the threads on components
-- published to her.
--
-- But the loader also embedded the things a thread is ABOUT:
--
--     components!inner ( name, slug ),
--     projects!inner   ( slug ),
--     profiles!client_messages_author_id_fkey ( full_name, initials )
--
-- and a client contact cannot read **any** of those base tables. That is not an
-- oversight, it is the boundary working: `is_active_member()` is false for her,
-- so `components`, `projects` and every profile but her own return zero rows.
--
-- `!inner` on a join that returns nothing drops the parent row. So the list came
-- back EMPTY — not an error, not a permission message, just nothing. The screen
-- rendered "Nothing to answer right now" while the database was perfectly happy
-- to say there was one waiting. The e2e spec caught it; no unit test could have,
-- and the pgTAP suite was green throughout because the SQL was never wrong.
--
-- The lesson generalises: **a client-safe table is not a client-safe QUERY.**
-- The moment a query joins outward it inherits the strictest policy it touches,
-- and with `!inner` it inherits it silently.
--
-- So thread reads join the rest of the client read model behind
-- `security definer` functions that name their columns. One pair serves both
-- sides, because `can_read_client_thread()` already answers correctly for an
-- internal member and for a contact, and the columns a thread list needs are
-- client-safe for everybody.

create or replace function public.client_thread_list(p_project_id uuid default null)
returns table (
  thread_id       uuid,
  title           text,
  state           text,
  component_id    uuid,
  component_name  text,
  component_slug  text,
  project_id      uuid,
  project_slug    text,
  created_at      timestamptz,
  last_message_at timestamptz,
  message_count   int,
  last_read_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.title,
    t.state::text,
    t.component_id,
    c.name,
    c.slug,
    t.project_id,
    p.slug,
    t.created_at,
    max(m.created_at) filter (where m.deleted_at is null),
    count(m.id) filter (where m.deleted_at is null)::int,
    r.last_read_at
  from public.client_threads t
  join public.components c on c.id = t.component_id
  join public.projects   p on p.id = t.project_id
  left join public.client_messages m on m.thread_id = t.id
  -- The caller's own read mark, and only ever the caller's. There is no
  -- parameter for whose mark to fetch, so there is nothing to pass wrongly.
  left join public.client_thread_reads r
    on r.thread_id = t.id and r.profile_id = (select auth.uid())
  where public.can_read_client_thread(t.id)
    and (p_project_id is null or t.project_id = p_project_id)
  group by t.id, t.title, t.state, t.component_id, c.name, c.slug, t.project_id, p.slug,
           t.created_at, r.last_read_at
$$;

comment on function public.client_thread_list is
  'Threads this session may read, with the component and project names a client cannot get from the base tables. can_read_client_thread() answers for internal members and contacts alike, so one function serves both sides.';

revoke all on function public.client_thread_list(uuid) from public, anon;
grant execute on function public.client_thread_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One thread's messages, with their authors.
--
-- `is_from_coditu` is computed from the author's `account_kind` here rather
-- than exposing the column: which side a message came from is all the reader
-- needs, and it is not the same thing as being told what kind of account
-- somebody has.
--
-- The author's NAME crosses for an internal author, and it should — a client
-- reading "Adam asked:" is being told something true and useful, and it is
-- already the case in the sprint notes she can see. What does not cross is
-- anything else about that profile: no email, no role, no avatar path, no id
-- beyond what the message already carries.
-- ---------------------------------------------------------------------------

create or replace function public.client_thread_messages(p_thread_id uuid)
returns table (
  message_id     uuid,
  author_id      uuid,
  author_name    text,
  author_initials text,
  is_from_coditu boolean,
  body_json      jsonb,
  body_text      text,
  created_at     timestamptz,
  edited_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.author_id,
    pr.full_name,
    pr.initials,
    pr.account_kind <> 'client',
    m.body_json,
    m.body_text,
    m.created_at,
    m.edited_at
  from public.client_messages m
  join public.profiles pr on pr.id = m.author_id
  where m.thread_id  = p_thread_id
    and m.deleted_at is null
    and public.can_read_client_thread(p_thread_id)
  order by m.created_at
$$;

comment on function public.client_thread_messages is
  'One thread''s live messages. The author''s display name and initials cross the boundary; nothing else about their profile does.';

revoke all on function public.client_thread_messages(uuid) from public, anon;
grant execute on function public.client_thread_messages(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- And whether this session may write into it, so the UI can decide whether to
-- draw a composer without guessing.
--
-- `can_write_client_thread` already exists and is already granted; this is only
-- here as the thing a page calls, so that "may I reply" has one answer on both
-- sides of the wall rather than one in SQL and a re-derivation in TypeScript.
-- ---------------------------------------------------------------------------

create or replace function public.client_thread_can_reply(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_write_client_thread(p_thread_id)
$$;

revoke all on function public.client_thread_can_reply(uuid) from public, anon;
grant execute on function public.client_thread_can_reply(uuid) to authenticated;
