-- An access event must never be the reason a delete fails.
--
-- ## What broke
--
-- Deleting a client contact's account failed outright:
--
--     null value in column "subject_label" of relation "access_events"
--     violates not-null constraint
--
-- Both writers in `20260826140000_access_events.sql` resolve the person's name
-- like this:
--
--     select coalesce(p.full_name, 'a client contact') into who
--     from public.profiles p where p.id = ...;
--
-- The `coalesce` is inside the select list, so it defends against a NULL
-- `full_name` and against nothing else. When the SELECT matches NO ROW it does
-- not run at all, `who` stays NULL, and the insert hits `subject_label not
-- null`.
--
-- The profile is missing for the one case that matters: a CASCADE. Postgres
-- deletes the parent first and fires the child's `after delete` trigger second,
-- so by the time this function asks for the profile, the profile is what is
-- being deleted. `delete from auth.users` cascades to `profiles` cascades to
-- `client_contacts`, which is every ordinary way an account is removed —
-- through the dashboard, through the admin API, or by a fixture cleaning up.
--
-- Deleting the `client_contacts` row on its own, while the profile is still
-- there, always worked. That is why the suite never caught it: the client
-- portal's fixture teardown deletes grants and contacts BEFORE the account, so
-- it walks around the hole every time.
--
-- ## `subject_id` is the same problem one column over
--
-- `subject_id` references `profiles (id)`. Writing the id of a row that is in
-- the middle of being deleted is a foreign-key violation for the same reason —
-- `on delete set null` fixes up rows that already exist, not one being inserted
-- now. So the id is only recorded when the profile is still there.
--
-- ## What is lost, said plainly
--
-- A contact removed by cascade is audited as `a client contact`, with no id.
-- The event, its actor, its time and its `from`/`to` are all still recorded —
-- what goes is the name, because nothing holds it any more at the moment the
-- trigger runs. That is a worse audit line than a named one and a much better
-- outcome than a delete that cannot happen, and it is only ever reached by a
-- cascade: every removal made through the application deletes the contact row
-- first and is still named.

create or replace function public.record_client_contact_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target  uuid := coalesce(new.profile_id, old.profile_id);
  subject uuid;
  who     text;
begin
  select p.id, coalesce(p.full_name, 'a client contact')
    into subject, who
    from public.profiles p
   where p.id = target;

  -- `not found` rather than `who is null`: the two are different questions and
  -- only this one is true when the profile is being cascaded away underneath us.
  if not found then
    subject := null;
    who     := 'a client contact';
  end if;

  if tg_op = 'INSERT' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, to_value)
    values ((select auth.uid()), subject, who, 'client_contact', new.status::text);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), subject, who, 'client_contact', old.status::text, 'removed');
    return old;
  end if;

  if new.status is distinct from old.status then
    insert into public.access_events (actor_id, subject_id, subject_label, kind, from_value, to_value)
    values ((select auth.uid()), subject, who, 'client_contact', old.status::text, new.status::text);
  end if;

  return new;
end;
$$;

create or replace function public.record_client_grant_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject    uuid;
  who        text;
  row_before public.client_project_grants;
  row_after  public.client_project_grants;
begin
  row_before := old;
  row_after  := coalesce(new, old);

  select p.id, coalesce(p.full_name, 'a client contact')
    into subject, who
    from public.profiles p
   where p.id = row_after.contact_profile_id;

  if not found then
    subject := null;
    who     := 'a client contact';
  end if;

  -- A revocation is a `revoked_at` write, not a delete, so it is the change
  -- worth naming rather than the capability list moving.
  if tg_op = 'UPDATE'
     and (row_after.revoked_at is null) is distinct from (row_before.revoked_at is null) then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            case when row_before.revoked_at is null then 'granted' else 'revoked' end,
            case when row_after.revoked_at is null then 'granted' else 'revoked' end,
            row_after.project_id);
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            array_to_string(new.capabilities::text[], ', '), new.project_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '), 'removed', old.project_id);
    return old;
  end if;

  -- Capabilities changed without the grant being revoked or restored.
  if new.capabilities is distinct from old.capabilities then
    insert into public.access_events
      (actor_id, subject_id, subject_label, kind, from_value, to_value, project_id)
    values ((select auth.uid()), subject, who, 'client_grant',
            array_to_string(old.capabilities::text[], ', '),
            array_to_string(new.capabilities::text[], ', '), new.project_id);
  end if;

  return new;
end;
$$;

comment on function public.record_client_contact_access_event is
  'Audits a client contact appearing, changing status, or being removed. Survives a cascade: when the profile is already gone the event is still written, unnamed, rather than failing the delete.';
comment on function public.record_client_grant_access_event is
  'Audits a project grant being made, revoked, restored, re-scoped, or removed. Survives a cascade for the same reason as its sibling.';
