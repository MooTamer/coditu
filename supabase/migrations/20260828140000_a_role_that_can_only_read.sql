-- The nightly backup connects as `coditu_backup` and nothing else does.
--
-- ## Why a role at all
--
-- The alternative is the `postgres` role, whose password is the one credential
-- that can drop this database. A backup job runs unattended, on a schedule,
-- with its credential sitting in a GitHub secret that several people can rotate
-- and nobody watches. Giving that job the ability to write is giving it the
-- ability to destroy the thing it exists to protect.
--
-- `coditu_backup` can SELECT from every table and do nothing else. It cannot
-- INSERT, UPDATE, DELETE, CREATE, DROP or GRANT — not because a policy forbids
-- it but because no privilege was ever granted.
--
-- ## Why BYPASSRLS, which looks like the opposite of least privilege
--
-- It is the difference between a backup and an empty file. `pg_read_all_data`
-- grants SELECT; row-level security still filters what a non-owner sees, and
-- every table in this schema has RLS on. Without BYPASSRLS the dump connects,
-- succeeds, writes a file and the file contains no rows — a failure that
-- completed successfully, which is the failure this whole exercise exists to
-- prevent. `scripts/backup.sh` asserts the row counts afterwards precisely
-- because this attribute could be lost in a role edit and nothing else would
-- notice.
--
-- BYPASSRLS grants no write. It only stops policies hiding rows from a role
-- that already has SELECT.
--
-- ## The password is not here, and must never be
--
-- This creates the role with LOGIN and NO password, which Postgres treats as
-- "cannot authenticate" — SCRAM against a null password always fails. The role
-- is inert until somebody sets one, out of band, once:
--
--     alter role coditu_backup with password '<generated, 32+ chars>';
--
-- Run that in the Supabase SQL editor, put the same value in the repository
-- secret `BACKUP_DB_URL`, and never write it down anywhere else. See
-- `docs/09-BACKUP-PROPOSAL.md` §8.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'coditu_backup') then
    alter role coditu_backup with login bypassrls;
  else
    create role coditu_backup with login bypassrls;
  end if;
end
$$;

grant pg_read_all_data to coditu_backup;

do $$
begin
  execute format('grant connect on database %I to coditu_backup', current_database());
end
$$;

-- A dump of this database takes seconds today and will take longer as it grows.
-- Thirty minutes is generous; the point of the bound is that a wedged backup
-- releases its snapshot instead of holding one open against a live workspace.
alter role coditu_backup set statement_timeout = '30min';
alter role coditu_backup set idle_in_transaction_session_timeout = '5min';

-- The claim above, asserted rather than asserted-in-a-comment. If a future
-- migration or a hand edit in the SQL editor gives this role the ability to
-- write, the next `db reset` says so instead of the next incident.
do $$
declare
  offending text;
begin
  if has_schema_privilege('coditu_backup', 'public', 'CREATE') then
    raise exception 'coditu_backup can CREATE in public; it is meant to be read-only';
  end if;

  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into offending
    from pg_tables
   where schemaname in ('public', 'auth', 'storage')
     and (has_table_privilege('coditu_backup', format('%I.%I', schemaname, tablename), 'INSERT')
       or has_table_privilege('coditu_backup', format('%I.%I', schemaname, tablename), 'UPDATE')
       or has_table_privilege('coditu_backup', format('%I.%I', schemaname, tablename), 'DELETE'));

  if offending is not null then
    raise exception 'coditu_backup can write to: %', offending;
  end if;

  -- And the other direction: a read-only role that cannot read is the empty
  -- backup this file's header is about.
  if not has_table_privilege('coditu_backup', 'public.work_items', 'SELECT') then
    raise exception 'coditu_backup cannot read public.work_items';
  end if;
  if not (select rolbypassrls from pg_roles where rolname = 'coditu_backup') then
    raise exception 'coditu_backup does not have BYPASSRLS; its dumps would be empty';
  end if;
end
$$;
