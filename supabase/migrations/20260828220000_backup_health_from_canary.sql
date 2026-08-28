-- The Recovery Centre may state an infrastructure fact only after the R2
-- canary has read it back. This singleton is that narrow hand-off: GitHub
-- reports through one authenticated application endpoint, and signed-in
-- internal members may read the resulting evidence.

create table public.backup_health (
  id                 smallint primary key default 1,
  source             text not null default 'r2-canary',
  backup_id          text not null,
  checked_at         timestamptz not null,
  last_modified_at   timestamptz not null,
  encrypted_bytes    bigint not null,
  sha256             text not null,
  database_tables    int not null,
  database_rows      bigint not null,
  storage_buckets    int not null,
  storage_objects    bigint not null,

  constraint backup_health_is_singleton check (id = 1),
  constraint backup_health_source_is_canary check (source = 'r2-canary'),
  constraint backup_health_id_is_timestamp check (
    backup_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$'
  ),
  constraint backup_health_has_bytes check (encrypted_bytes > 0),
  constraint backup_health_has_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint backup_health_has_tables check (database_tables > 0),
  constraint backup_health_has_rows check (database_rows >= 0),
  constraint backup_health_has_buckets check (storage_buckets >= 0),
  constraint backup_health_has_objects check (storage_objects >= 0),
  constraint backup_health_clock_is_plausible check (
    last_modified_at <= checked_at + interval '5 minutes'
  )
);

comment on table public.backup_health is
  'The newest off-site recovery set independently read by the R2 freshness canary. One row only. Absence means the application must make no off-site backup claim.';
comment on column public.backup_health.checked_at is
  'When the production report endpoint accepted the canary result; used to detect a stopped reporter rather than trusting old green evidence forever.';

alter table public.backup_health enable row level security;

-- Supabase projects can grant broad default table privileges. State the
-- boundary explicitly: people read, only the server-side capability reports.
revoke all on table public.backup_health from anon, authenticated;
grant select on table public.backup_health to authenticated;
grant select, insert, update on table public.backup_health to service_role;
revoke delete, truncate on table public.backup_health from service_role;

create policy "active members read backup health" on public.backup_health
  for select to authenticated
  using (public.is_active_member());

-- One statement makes an out-of-order retry harmless. A canary that somehow
-- observed an older object after a newer report may refresh nothing, but it
-- can never move the Recovery Centre's evidence backwards.
create or replace function public.record_backup_health(
  p_backup_id text,
  p_checked_at timestamptz,
  p_last_modified_at timestamptz,
  p_encrypted_bytes bigint,
  p_sha256 text,
  p_database_tables int,
  p_database_rows bigint,
  p_storage_buckets int,
  p_storage_objects bigint
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with written as (
    insert into public.backup_health (
      id, source, backup_id, checked_at, last_modified_at, encrypted_bytes, sha256,
      database_tables, database_rows, storage_buckets, storage_objects
    ) values (
      1, 'r2-canary', p_backup_id, p_checked_at, p_last_modified_at, p_encrypted_bytes, p_sha256,
      p_database_tables, p_database_rows, p_storage_buckets, p_storage_objects
    )
    on conflict (id) do update set
      source = excluded.source,
      backup_id = excluded.backup_id,
      checked_at = excluded.checked_at,
      last_modified_at = excluded.last_modified_at,
      encrypted_bytes = excluded.encrypted_bytes,
      sha256 = excluded.sha256,
      database_tables = excluded.database_tables,
      database_rows = excluded.database_rows,
      storage_buckets = excluded.storage_buckets,
      storage_objects = excluded.storage_objects
    where excluded.last_modified_at >= public.backup_health.last_modified_at
    returning true
  )
  select coalesce((select true from written), false)
$$;

revoke all on function public.record_backup_health(text, timestamptz, timestamptz, bigint, text, int, bigint, int, bigint)
  from public, anon, authenticated;
grant execute on function public.record_backup_health(text, timestamptz, timestamptz, bigint, text, int, bigint, int, bigint)
  to service_role;

comment on function public.record_backup_health(text, timestamptz, timestamptz, bigint, text, int, bigint, int, bigint) is
  'Atomically records a canary-read recovery set without allowing an out-of-order report to replace newer evidence. Service role only; the external caller reaches it through the scoped report endpoint.';
