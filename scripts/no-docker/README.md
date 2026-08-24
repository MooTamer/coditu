# Verifying the database layer without Docker

`npm run db:test` is `supabase test db`, which starts the whole Supabase stack in Docker. On a machine
that has no Docker daemon — a cloud session, a locked-down CI box — most of the gate is still
reachable, because the database half of this repository depends on remarkably little of Supabase.

`grep -rhoE '\b(auth|storage|realtime|extensions)\.[a-z_]+' supabase/migrations/` returns **six**
names: `auth.uid`, `auth.users`, `auth.sign`, `storage.buckets`, `storage.objects`,
`storage.foldername`. `supabase-shim.sql` creates those, the four roles, the `extensions` schema and
the `supabase_realtime` publication — and with them every migration applies in order, the seed loads,
and `supabase/tests/*.sql` runs through `psql` with the same TAP output `supabase test db` prints.

```bash
apt-get install -y postgresql-16-pgtap          # the only real dependency
PGDIR=/var/lib/postgresql/coditu
mkdir -p "$PGDIR" && chown postgres:postgres "$PGDIR" && chmod 700 "$PGDIR"
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p 54422' -w start"

export PGHOST=127.0.0.1 PGPORT=54422 PGUSER=postgres PGDATABASE=postgres
psql -v ON_ERROR_STOP=1 -f scripts/no-docker/supabase-shim.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
psql -f supabase/seed.sql && for f in supabase/seeds/*.sql; do psql -f "$f"; done

psql -f supabase/tests/rls.sql   | grep -E '^not ok' && echo FAILED || echo ok
psql -f supabase/tests/seed.sql  | grep -E '^not ok' && echo FAILED || echo ok
psql -f supabase/rehearsal.sql   # the F1 walkthrough; opens a transaction and rolls back
```

`initdb` refuses to run as root, which is why the commands above go through `su postgres`.

## What this does NOT give you, and it is the important half

- **No PostgREST.** So no `PGRST204` — the code that a *write* to a missing column returns, which is
  half of `lib/supabase/schema.ts` and the reason that fix needed two attempts.
- **No GoTrue.** Nothing can sign in, so `npm run e2e` cannot run at all: `e2e/fixtures.ts` signs in
  on every spec.
- **No storage HTTP API.** An upload cannot be exercised end to end, only its rows.
- **`supabase gen types` still fails**, because it starts `postgres-meta` in a container regardless of
  `--db-url`. `lib/supabase/database.types.ts` has to be hand-edited; `docs/07-FIELD-NOTES.md` records
  the generator's conventions so the next real `db:types` does not produce a spurious diff.

Use it to prove the schema, the policies and the triggers. Do not use it to conclude the app works.
