-- Every change to who can see what, and who made it.
--
-- Deferred from W4 to here, in the order `05-DECISIONS.md` recorded: the table
-- had no writer and no reader until People & Access existed, and building it
-- early would have meant five phases of a table with no test that could fail.
--
-- ## Triggers, not Server Actions
--
-- Every write below could have been an `insert` beside the one it records. It is
-- a trigger instead, and the reason is what an audit log is FOR: a line in an
-- action can be forgotten by whoever adds the sixth way to grant access, and a
-- log with a hole in it is worse than no log, because the hole is invisible and
-- the rest still looks complete.
--
-- A trigger also catches what no action can: a write made from the SQL console,
-- from the service-role client, or by a migration. Those are exactly the writes
-- an audit trail is asked about after the fact. `05-DECISIONS.md` records the
-- same argument for the composite foreign key on `saved_views` — a trigger could
-- have checked it, a foreign key cannot be forgotten. This is the case where the
-- trigger is the thing that cannot be forgotten.
--
-- ## Nobody may write it, including an admin
--
-- There is no `insert`, `update` or `delete` grant on this table for
-- `authenticated` at all. The trigger functions are `security definer`, so they
-- write regardless; every other route in is closed. An audit row cannot be
-- forged, edited or removed through the application, which is the only property
-- that makes reading one worth anything.
--
-- ## Who may read it
--
-- Admin and lead. An engineer is refused, which matches the design and matches
-- `/app/clients`: what a lead runs is delivery, and who has access is not a
-- delivery decision — but a lead does need to see it, because they are the ones
-- who notice when something is wrong.

create type public.access_event_kind as enum (
  'role',
  'activation',
  'allowlist',
  'client_contact',
  'client_grant',
  'temporary_password'
);

create table public.access_events (
  id          uuid primary key default gen_random_uuid(),

  -- Null for a write with no session behind it: a migration, the service-role
  -- client, or the SQL console. Rendered as `system`, which is true.
  actor_id    uuid references public.profiles (id) on delete set null,

  -- Who it was about. Null for an allowlist row, which names an address that
  -- has no account yet — that is the whole point of an allowlist.
  subject_id  uuid references public.profiles (id) on delete set null,
  subject_label text not null,

  kind        public.access_event_kind not null,
  -- The same verb/from/to shape `activity` uses, so the two feeds can be worded
  -- by the same kind of function and neither invents a vocabulary.
  from_value  text,
  to_value    text,

  -- Set only for a grant, which is the one kind that is about a project.
  project_id  uuid references public.projects (id) on delete set null,

  created_at  timestamptz not null default now()
);

create index access_events_recent_idx on public.access_events (created_at desc);
create index access_events_subject_idx on public.access_events (subject_id, created_at desc);

comment on table public.access_events is
  'Append-only record of every access change. Written only by security-definer triggers; no write grant exists.';
comment on column public.access_events.actor_id is
  'Null means no session was behind the write — a migration, the service-role client, or the SQL console. Rendered as `system`.';

grant select on public.access_events to authenticated;

-- And take back what this project grants by DEFAULT, which is more than the
-- line above adds. `information_schema.role_table_grants` for `authenticated`
-- on any table here reads `REFERENCES, SELECT, TRIGGER, TRUNCATE` — the last of
-- which **bypasses row-level security entirely**. No policy can stop a
-- `truncate`, and an audit table somebody can empty in one statement is not
-- evidence of anything.
--
-- Not reachable through PostgREST, which has no way to issue one. Revoked
-- anyway: "append-only" should be true rather than nearly true, and the cost is
-- one line. `07-FIELD-NOTES.md` records that the default applies to every other
-- table too.
revoke truncate on public.access_events from authenticated;

alter table public.access_events enable row level security;

create policy "admins and leads read access history"
  on public.access_events
  for select
  to authenticated
  using (public.is_active_member() and public.auth_role() in ('admin'::public.app_role, 'lead'::public.app_role));

-- ---------------------------------------------------------------------------
-- The writers. One function per table, because the interesting column differs
-- and a single generic one would be a `case` statement pretending to be reuse.
-- ---------------------------------------------------------------------------

create or replace function public.record_profile_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Role and activation are two different events even when one statement
  -- changes both, because "made a lead" and "deactivated" are two different
  -- things to read in a list.
  if new.role is distinct from old.role then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), new.id, new.full_name, 'role', old.role::text, new.role::text);
  end if;

  if new.is_active is distinct from old.is_active then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), new.id, new.full_name, 'activation',
            case when old.is_active then 'active' else 'deactivated' end,
            case when new.is_active then 'active' else 'deactivated' end);
  end if;

  -- A temporary password is an access change even though nothing about the
  -- account's permissions moved: somebody who was not the owner can now sign in
  -- as them until they choose their own.
  if new.must_set_password and not old.must_set_password then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, to_value)
    values ((select auth.uid()), new.id, new.full_name, 'temporary_password', 'issued');
  end if;

  return new;
end;
$$;

create trigger profiles_record_access_events
  after update on public.profiles
  for each row execute function public.record_profile_access_event();

create or replace function public.record_allowlist_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.access_events (actor_id, subject_label, kind, to_value)
    values ((select auth.uid()), new.email, 'allowlist', 'invited');
    return new;
  end if;

  insert into public.access_events (actor_id, subject_label, kind, from_value, to_value)
  values ((select auth.uid()), old.email, 'allowlist', 'invited', 'withdrawn');
  return old;
end;
$$;

create trigger allowed_emails_record_access_events
  after insert or delete on public.allowed_emails
  for each row execute function public.record_allowlist_access_event();

create or replace function public.record_client_contact_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
begin
  select coalesce(p.full_name, 'a client contact') into who
  from public.profiles p
  where p.id = coalesce(new.profile_id, old.profile_id);

  if tg_op = 'INSERT' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, to_value)
    values ((select auth.uid()), new.profile_id, who, 'client_contact', new.status::text);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), old.profile_id, who, 'client_contact', old.status::text, 'removed');
    return old;
  end if;

  if new.status is distinct from old.status then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), new.profile_id, who, 'client_contact', old.status::text, new.status::text);
  end if;

  return new;
end;
$$;

create trigger client_contacts_record_access_events
  after insert or update or delete on public.client_contacts
  for each row execute function public.record_client_contact_access_event();

create or replace function public.record_client_grant_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  row_before public.client_project_grants;
  row_after  public.client_project_grants;
begin
  row_before := old;
  row_after  := coalesce(new, old);

  select coalesce(p.full_name, 'a client contact') into who
  from public.profiles p
  where p.id = row_after.contact_profile_id;

  -- A revocation is a `revoked_at` write, not a delete, so it is the change
  -- worth naming rather than the capability list moving.
  if tg_op = 'UPDATE'
     and (row_after.revoked_at is null) is distinct from (row_before.revoked_at is null) then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), row_after.contact_profile_id, who, 'client_grant',
            case when row_before.revoked_at is null then 'granted' else 'revoked' end,
            case when row_after.revoked_at is null then 'granted' else 'revoked' end,
            row_after.project_id);
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, to_value, project_id)
    values ((select auth.uid()), new.contact_profile_id, who, 'client_grant',
            array_to_string(new.capabilities::text[], ', '), new.project_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), old.contact_profile_id, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '), 'removed', old.project_id);
    return old;
  end if;

  -- Capabilities changed without the grant being revoked or restored.
  if new.capabilities is distinct from old.capabilities then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), new.contact_profile_id, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '),
            array_to_string(new.capabilities::text[], ', '), new.project_id);
  end if;

  return new;
end;
$$;

create trigger client_project_grants_record_access_events
  after insert or update or delete on public.client_project_grants
  for each row execute function public.record_client_grant_access_event();
