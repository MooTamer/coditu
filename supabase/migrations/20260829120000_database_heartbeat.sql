-- A free Supabase project pauses after roughly seven days of low user database
-- activity, and a paused database is application downtime with no deploy
-- involved and no rollback that helps. The provider's own remedy is "a few
-- database requests per day".
--
-- ## Why the existing monitors do not count
--
-- A Keyword monitor on `/login` reaches Supabase **Auth**. Auth is a separate
-- service in front of the same database, and whether the provider counts that
-- request as user database activity is not a fact this repository can assert.
-- `/api/backup-health` is worse: it is evidence that a real off-site archive was
-- read, and pinging it to keep a database awake would make the Recovery Centre
-- lie. See the ADR of 2026-08-28.
--
-- So: one function whose entire purpose is to be an unmistakable, explicit query
-- against a user table, that returns nothing about that table.
--
-- ## Why it reads a real table rather than `select 1`
--
-- `select 1` is answered without touching user data and there is no way to be
-- sure the provider counts it. `public.app_settings` is a singleton the app
-- already has, so the read is real, cheap and bounded at one row.
--
-- ## Why `security definer`, which is the thing one normally argues against
--
-- The first version of this was `security invoker`, on the reasoning that RLS
-- would then hide every row from `anon`. It does not get that far: `anon` has no
-- `SELECT` **grant** on `public.app_settings` at all, so the call fails with
-- `42501 permission denied for table app_settings` before any policy is
-- consulted. The two ways forward were to grant `anon` select on a real table —
-- widening access to production data so that a liveness probe can run — or to
-- let this one function read on the owner's behalf.
--
-- `security definer` is safe *here*, and the reason is structural rather than
-- careful: the function takes **no arguments**, and its only `return` is a
-- string literal. There is no input to inject through and no path by which a
-- row can leave it. `set search_path = ''` fixes what `public.app_settings`
-- resolves to. The alternative would have handed `anon` a standing read on a
-- settings table forever, which is a much larger and much quieter permission.

create or replace function public.database_heartbeat()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_rows int;
begin
  select count(*) into heartbeat_rows from public.app_settings;
  -- Deliberately discarded. Reading it is what makes this real database
  -- activity; returning it would turn a keepalive into a data leak.
  perform heartbeat_rows;
  return 'coditu-database-awake';
end
$$;

revoke all on function public.database_heartbeat() from public;
grant execute on function public.database_heartbeat() to anon, authenticated, service_role;

comment on function public.database_heartbeat() is
  'Keepalive probe. Performs one bounded read of a user table so the provider counts user database activity, and returns a fixed string carrying no project data. Reached through /api/health/database.';

-- The claims above, asserted rather than asserted-in-a-comment.
do $$
declare
  heartbeat_src text;
begin
  if not has_function_privilege('anon', 'public.database_heartbeat()', 'execute') then
    raise exception 'anon cannot execute database_heartbeat; an unauthenticated monitor could not call it';
  end if;
  if public.database_heartbeat() <> 'coditu-database-awake' then
    raise exception 'database_heartbeat does not return its keyword';
  end if;

  -- A `security definer` function is only as safe as its body. If a future edit
  -- gives it an argument or a second `return`, this stops the migration rather
  -- than shipping a definer function that can be steered.
  select p.prosrc into heartbeat_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'database_heartbeat';
  if (select pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'database_heartbeat') <> 0 then
    raise exception 'database_heartbeat takes arguments; a security definer probe must take none';
  end if;
  if (length(heartbeat_src) - length(replace(heartbeat_src, 'return ', ''))) / length('return ') <> 1 then
    raise exception 'database_heartbeat has more than one return; it must only ever answer its keyword';
  end if;
  if strpos(heartbeat_src, 'return ''coditu-database-awake''') = 0 then
    raise exception 'database_heartbeat does not return the literal keyword';
  end if;

  -- And the permission this exists to avoid needing.
  if has_table_privilege('anon', 'public.app_settings', 'select') then
    raise exception 'anon has been granted select on app_settings; the definer probe exists so that is not necessary';
  end if;
end
$$;
