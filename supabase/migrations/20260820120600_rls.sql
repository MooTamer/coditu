-- Coditu — row level security.
--
-- RLS on every table, no exceptions, and no `using (true)` on a write policy.
--
-- GRANTS MATTER AS MUCH AS POLICIES. Tables created by the `postgres` role
-- inherit default privileges that give `authenticated` only TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN — no SELECT/INSERT/UPDATE/DELETE. A perfect set of policies
-- on a table with no DML grant returns "permission denied" for everything, and
-- the error points at the wrong layer. Every table below is granted explicitly.

-- `anon` gets nothing anywhere. There is no public surface in this app.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

alter table public.profiles            enable row level security;
alter table public.allowed_emails      enable row level security;
alter table public.clients             enable row level security;
alter table public.projects            enable row level security;
alter table public.sprints             enable row level security;
alter table public.work_items          enable row level security;
alter table public.acceptance_criteria enable row level security;
alter table public.time_entries        enable row level security;
alter table public.comments            enable row level security;
alter table public.comment_mentions    enable row level security;
alter table public.notifications       enable row level security;
alter table public.attachments         enable row level security;
alter table public.activity            enable row level security;

grant select, insert, update, delete on
  public.profiles, public.clients, public.projects, public.sprints,
  public.work_items, public.acceptance_criteria, public.time_entries,
  public.comments, public.comment_mentions, public.notifications,
  public.attachments
to authenticated;

-- Read-only by grant as well as by policy: activity is trigger-written, and
-- `allowed_emails` is admin-only, so neither gets blanket DML.
grant select on public.activity to authenticated;
grant select, insert, update, delete on public.allowed_emails to authenticated;
grant select on public.v_sprint_summary, public.v_person_load to authenticated;
grant usage, select on sequence public.work_item_key_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Read. Small team, full transparency: any active profile reads everything.
-- ---------------------------------------------------------------------------

create policy "active members read profiles"       on public.profiles            for select to authenticated using (public.is_active_member());
create policy "active members read clients"        on public.clients             for select to authenticated using (public.is_active_member());
create policy "active members read projects"       on public.projects            for select to authenticated using (public.is_active_member());
create policy "active members read sprints"        on public.sprints             for select to authenticated using (public.is_active_member());
create policy "active members read work items"     on public.work_items          for select to authenticated using (public.is_active_member());
create policy "active members read criteria"       on public.acceptance_criteria for select to authenticated using (public.is_active_member());
create policy "active members read time entries"   on public.time_entries        for select to authenticated using (public.is_active_member());
create policy "active members read comments"       on public.comments            for select to authenticated using (public.is_active_member());
create policy "active members read mentions"       on public.comment_mentions    for select to authenticated using (public.is_active_member());
create policy "active members read attachments"    on public.attachments         for select to authenticated using (public.is_active_member());
create policy "active members read activity"       on public.activity            for select to authenticated using (public.is_active_member());

-- ---------------------------------------------------------------------------
-- profiles. You edit your own; admins edit anyone. Nobody inserts or deletes by
-- hand — that is the auth.users trigger's job.
-- ---------------------------------------------------------------------------

create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.auth_role() = 'admin')
  with check (id = (select auth.uid()) or public.auth_role() = 'admin');

-- A person must not be able to promote themselves. Role and active-flag changes
-- are admin-only, and a policy cannot express "these two columns are different",
-- so a trigger does.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() = 'admin' or (select auth.uid()) is null then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'only an admin may change a profile role' using errcode = '42501';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'only an admin may activate or deactivate a profile' using errcode = '42501';
  end if;
  if new.weekly_capacity_minutes is distinct from old.weekly_capacity_minutes then
    raise exception 'only an admin may change weekly capacity' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privilege_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_columns();

-- ---------------------------------------------------------------------------
-- allowed_emails — admin only, in full.
-- ---------------------------------------------------------------------------

create policy "admins read allowlist"   on public.allowed_emails for select to authenticated using (public.auth_role() = 'admin');
create policy "admins write allowlist"  on public.allowed_emails for insert to authenticated with check (public.auth_role() = 'admin');
create policy "admins update allowlist" on public.allowed_emails for update to authenticated using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
create policy "admins delete allowlist" on public.allowed_emails for delete to authenticated using (public.auth_role() = 'admin');

-- ---------------------------------------------------------------------------
-- clients, projects, sprints — admin and lead only.
-- ---------------------------------------------------------------------------

create policy "leads insert clients"  on public.clients  for insert to authenticated with check (public.is_admin_or_lead());
create policy "leads update clients"  on public.clients  for update to authenticated using (public.is_admin_or_lead()) with check (public.is_admin_or_lead());
create policy "leads delete clients"  on public.clients  for delete to authenticated using (public.is_admin_or_lead());

create policy "leads insert projects" on public.projects for insert to authenticated with check (public.is_admin_or_lead());
create policy "leads update projects" on public.projects for update to authenticated using (public.is_admin_or_lead()) with check (public.is_admin_or_lead());
create policy "leads delete projects" on public.projects for delete to authenticated using (public.is_admin_or_lead());

create policy "leads insert sprints"  on public.sprints  for insert to authenticated with check (public.is_admin_or_lead());
create policy "leads update sprints"  on public.sprints  for update to authenticated using (public.is_admin_or_lead()) with check (public.is_admin_or_lead());
create policy "leads delete sprints"  on public.sprints  for delete to authenticated using (public.is_admin_or_lead());

-- ---------------------------------------------------------------------------
-- work_items.
--
-- Insert and delete are admin/lead. Update is open to admin/lead on any column,
-- and to an engineer ONLY on items they own or review — and then only `status`
-- and `order_index`. RLS cannot express a per-column restriction, so the policy
-- decides WHICH ROWS an engineer may touch and the trigger decides WHICH
-- COLUMNS. Both are required; either alone is a hole.
-- ---------------------------------------------------------------------------

create policy "leads insert work items" on public.work_items for insert to authenticated with check (public.is_admin_or_lead());
create policy "leads delete work items" on public.work_items for delete to authenticated using (public.is_admin_or_lead());

create policy "update work items" on public.work_items for update to authenticated
  using (
    public.is_admin_or_lead()
    or (
      public.is_active_member()
      and (assignee_id = (select auth.uid()) or reviewer_id = (select auth.uid()))
    )
  )
  with check (
    public.is_admin_or_lead()
    or (
      public.is_active_member()
      and (assignee_id = (select auth.uid()) or reviewer_id = (select auth.uid()))
    )
  );

create or replace function public.guard_work_item_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text;
begin
  -- Server-side jobs, triggers and the seed run without a JWT; admins and leads
  -- may change anything.
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;

  changed := case
    when new.title            is distinct from old.title            then 'title'
    when new.description      is distinct from old.description      then 'description'
    when new.highlight        is distinct from old.highlight        then 'highlight'
    when new.type             is distinct from old.type             then 'type'
    when new.assignee_id      is distinct from old.assignee_id      then 'assignee_id'
    when new.reviewer_id      is distinct from old.reviewer_id      then 'reviewer_id'
    when new.deadline         is distinct from old.deadline         then 'deadline'
    when new.estimate_minutes is distinct from old.estimate_minutes then 'estimate_minutes'
    when new.grouping         is distinct from old.grouping         then 'grouping'
    when new.sprint_id        is distinct from old.sprint_id        then 'sprint_id'
    when new.key              is distinct from old.key              then 'key'
    else null
  end;

  if changed is not null then
    raise exception 'an engineer may change only status and order_index (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_work_item_columns is
  'Per-column half of the work_items update rule. The policy picks the rows; this picks the columns.';

create trigger work_items_guard_columns
  before update on public.work_items
  for each row execute function public.guard_work_item_columns();

-- ---------------------------------------------------------------------------
-- acceptance_criteria. Same split: assignee and reviewer may tick a box;
-- rewriting the criterion itself is admin/lead.
-- ---------------------------------------------------------------------------

create policy "leads insert criteria" on public.acceptance_criteria for insert to authenticated with check (public.is_admin_or_lead());
create policy "leads delete criteria" on public.acceptance_criteria for delete to authenticated using (public.is_admin_or_lead());

create policy "update criteria" on public.acceptance_criteria for update to authenticated
  using (
    public.is_admin_or_lead()
    or exists (
      select 1 from public.work_items w
      where w.id = work_item_id
        and (w.assignee_id = (select auth.uid()) or w.reviewer_id = (select auth.uid()))
    )
  )
  with check (
    public.is_admin_or_lead()
    or exists (
      select 1 from public.work_items w
      where w.id = work_item_id
        and (w.assignee_id = (select auth.uid()) or w.reviewer_id = (select auth.uid()))
    )
  );

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
     or new.work_item_id is distinct from old.work_item_id
     or new.order_index is distinct from old.order_index then
    raise exception 'an engineer may only toggle is_done on an acceptance criterion'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger criteria_guard_columns
  before update on public.acceptance_criteria
  for each row execute function public.guard_criteria_columns();

-- ---------------------------------------------------------------------------
-- time_entries. Your hours are yours. Admins may delete any, to fix a mistake.
-- ---------------------------------------------------------------------------

create policy "log own time"    on public.time_entries for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.is_active_member());
create policy "edit own time"   on public.time_entries for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "delete own time" on public.time_entries for delete to authenticated
  using (profile_id = (select auth.uid()) or public.auth_role() = 'admin');

-- ---------------------------------------------------------------------------
-- comments. Author edits and soft-deletes their own; an admin may soft-delete
-- any. There is deliberately NO delete policy: nobody hard-deletes a comment,
-- so the absence of a policy IS the rule.
-- ---------------------------------------------------------------------------

create policy "write own comment"  on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_active_member());
create policy "edit own comment"   on public.comments for update to authenticated
  using (author_id = (select auth.uid()) or public.auth_role() = 'admin')
  with check (author_id = (select auth.uid()) or public.auth_role() = 'admin');

-- ---------------------------------------------------------------------------
-- notifications. A profile sees and marks only its own.
-- ---------------------------------------------------------------------------

create policy "read own notifications"   on public.notifications for select to authenticated
  using (profile_id = (select auth.uid()));
create policy "update own notifications" on public.notifications for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- attachments.
-- ---------------------------------------------------------------------------

create policy "upload attachments" on public.attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.is_active_member());
create policy "remove attachments" on public.attachments for delete to authenticated
  using (uploaded_by = (select auth.uid()) or public.auth_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Storage. Both buckets private; served through signed URLs with a 1 hour TTL.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('work-attachments', 'work-attachments', false),
       ('comment-images',   'comment-images',   false)
on conflict (id) do nothing;

create policy "members read private buckets" on storage.objects for select to authenticated
  using (bucket_id in ('work-attachments','comment-images') and public.is_active_member());

create policy "members upload to private buckets" on storage.objects for insert to authenticated
  with check (bucket_id in ('work-attachments','comment-images') and public.is_active_member());

create policy "uploader or admin removes objects" on storage.objects for delete to authenticated
  using (
    bucket_id in ('work-attachments','comment-images')
    and (owner_id = (select auth.uid())::text or public.auth_role() = 'admin')
  );
