-- Coditu — the story thread: comments, mentions, notifications, attachments,
-- and the activity feed.

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  -- The ProseMirror document. Rendered server-side by walking known node types
  -- only — never round-tripped to an HTML string and injected. See
  -- docs/05-DECISIONS.md.
  body_json    jsonb not null,
  -- A flattened projection written in the SAME transaction as body_json, used
  -- for search, CSV/Markdown export, and notification previews. Deriving it at
  -- read time would mean walking a jsonb document per row per render.
  body_text    text not null,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on column public.comments.body_json is
  'ProseMirror doc. Rendered by walking an allowlist of node types; never injected as HTML.';
comment on column public.comments.deleted_at is
  'Soft delete only. Nobody hard-deletes a comment — an argument that vanishes is worse than one that is struck through.';

create table public.comment_mentions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (comment_id, profile_id)
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('mention','assigned','review_requested')),
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Walks body_json for mention nodes and materialises them.
--
-- The stored node holds the profile UUID, not the display name, so renaming
-- someone never breaks a historical mention — and this trigger is what turns
-- that id into a row you can query and notify on.
create or replace function public.sync_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mentioned uuid;
begin
  delete from public.comment_mentions where comment_id = new.id;

  for mentioned in
    select distinct (node -> 'attrs' ->> 'id')::uuid
    from jsonb_path_query(new.body_json, '$.**{0 to 12} ? (@.type == "mention")') as node
    where (node -> 'attrs' ->> 'id') ~ '^[0-9a-fA-F-]{36}$'
  loop
    -- Only real, active profiles. A hand-crafted document must not be able to
    -- conjure a mention row for an id that is not a person.
    if exists (select 1 from public.profiles p where p.id = mentioned and p.is_active) then
      insert into public.comment_mentions (comment_id, profile_id)
      values (new.id, mentioned)
      on conflict do nothing;

      -- Never notify someone about their own comment.
      if mentioned <> new.author_id then
        insert into public.notifications (profile_id, kind, work_item_id, comment_id)
        values (mentioned, 'mention', new.work_item_id, new.id);
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create trigger comments_sync_mentions
  after insert or update of body_json on public.comments
  for each row execute function public.sync_comment_mentions();

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  bytes        int not null check (bytes >= 0),
  uploaded_by  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Activity. Read-only to everyone, written only by triggers, so the record of
-- what happened cannot be edited by whoever it happened to.
-- ---------------------------------------------------------------------------

create table public.activity (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  verb         text not null,
  field        text,
  from_value   text,
  to_value     text,
  created_at   timestamptz not null default now()
);

create or replace function public.record_work_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activity (work_item_id, actor_id, verb, field, to_value)
    values (new.id, actor, 'created', null, new.title);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'changed', 'status', old.status::text, new.status::text);
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'set', 'assignee',
            (select full_name from public.profiles where id = old.assignee_id),
            (select full_name from public.profiles where id = new.assignee_id));
  end if;

  if new.reviewer_id is distinct from old.reviewer_id then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'set', 'reviewer',
            (select full_name from public.profiles where id = old.reviewer_id),
            (select full_name from public.profiles where id = new.reviewer_id));
  end if;

  if new.deadline is distinct from old.deadline then
    insert into public.activity (work_item_id, actor_id, verb, field, from_value, to_value)
    values (new.id, actor, 'set', 'deadline', old.deadline::text, new.deadline::text);
  end if;

  return null;
end;
$$;

create trigger work_items_record_activity
  after insert or update of status, assignee_id, reviewer_id, deadline on public.work_items
  for each row execute function public.record_work_item_activity();
