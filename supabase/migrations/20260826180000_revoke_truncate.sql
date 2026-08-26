-- Coditu — take `truncate` away from `authenticated`, on everything.
--
-- ## The default nobody chose
--
-- This project grants `authenticated` `REFERENCES, SELECT, TRIGGER, TRUNCATE`
-- on every table it creates. Three of those are ordinary. The fourth is not:
-- **`truncate` bypasses row-level security entirely.** Policies filter rows,
-- and a truncate does not visit any — so every `using` clause, every
-- `is_active_member()`, every append-only guard in this schema is irrelevant to
-- it.
--
-- W9 found this while building `access_events` and revoked it there. W12 did
-- the same for `recovery_runs`. Both notes said, correctly, that it applies to
-- every other table too — and W13's sweep is what actually asked the question:
-- **thirty tables still had it**, including `document_revisions`, which is the
-- append-only history the entire version-control feature rests on, and
-- `sprint_payouts`, which is money somebody has been paid against.
--
-- ## It is not reachable today, and that is not the argument
--
-- PostgREST cannot issue a `truncate`, so nothing in the current application
-- can reach this. The reasons to revoke it anyway:
--
--  * "Append-only" is a claim this schema makes in six places, in comments and
--    in `docs/02-DATA-MODEL.md`, and it should be true rather than nearly true.
--    A row that no policy permits removing, that one statement removes all of,
--    is not append-only; it is append-only-through-the-front-door.
--  * The grant is what a future path would inherit. A `security invoker`
--    function, a direct session, a new client — none of them would think to
--    check, because nobody granted it deliberately in the first place.
--  * It costs nothing. Nothing in this application truncates anything; the
--    tests that need a clean table run as the owner.
--
-- `supabase/tests/rls.sql` sweeps every table in `public` and fails if one
-- carries it again, so a table added next year is covered by construction
-- rather than by somebody remembering this file exists.

do $$
declare
  target record;
begin
  for target in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       -- Tables, partitioned tables, and **views**. A view cannot be truncated,
       -- so revoking it there is a formality — but `role_table_grants` reports
       -- the grant on views all the same, and the assertion in
       -- `supabase/tests/rls.sql` is worth more as *"no `TRUNCATE` grant to
       -- `authenticated` anywhere in public"* than as the same sentence with
       -- three names carved out of it. A sweep with exceptions collects more.
       and c.relkind in ('r', 'p', 'v')
  loop
    execute format('revoke truncate on public.%I from authenticated', target.relname);
  end loop;
end;
$$;

-- And for everything created after this migration. `alter default privileges`
-- is the only way to stop the grant arriving in the first place; the loop above
-- only fixes what already exists.
--
-- Scoped to the role that creates the tables — default privileges are recorded
-- per granting role, so this has to name the one migrations run as.
alter default privileges in schema public revoke truncate on tables from authenticated;
