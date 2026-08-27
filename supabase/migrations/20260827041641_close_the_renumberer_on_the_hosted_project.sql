-- `revoke … from public` did nothing on the hosted project.
--
-- ## What happened
--
-- `20260826211339` (now inside `20260826220000`) took `rebalance_project_keys`
-- off the public API with:
--
--     revoke execute on function public.rebalance_project_keys() from public;
--
-- Locally that worked, and it was verified: `anon` got `permission denied for
-- function`, and the function's ACL came back as `postgres=X/postgres` and
-- nothing else.
--
-- The hosted project's ACL after the very same migration:
--
--     REVOKE ALL ON FUNCTION "public"."rebalance_project_keys"() FROM PUBLIC;
--     GRANT  ALL ON FUNCTION "public"."rebalance_project_keys"() TO "anon";
--     GRANT  ALL ON FUNCTION "public"."rebalance_project_keys"() TO "authenticated";
--     GRANT  ALL ON FUNCTION "public"."rebalance_project_keys"() TO "service_role";
--
-- The revoke landed. It also achieved nothing, because `anon` does not reach
-- this function through `PUBLIC` there — it has a grant of its own. Taking
-- something away from `PUBLIC` does not touch a privilege granted directly to a
-- role, and on that project **fifty-nine** functions in `public` carry explicit
-- role grants where this checkout has zero. Something has run the equivalent of
-- `grant all on all functions in schema public to anon, authenticated,
-- service_role` against it, and a local `db reset` does not reproduce that.
--
-- So the local stack is not a faithful model of production's grant state, and
-- every `revoke … from public` this repository writes is inert there. That is
-- recorded in `07-FIELD-NOTES.md`, because it will be true of the next one too.
--
-- ## Two fixes, because one of them can be undone by a dashboard
--
-- **The grant, named.** `anon` and `authenticated` are the two roles reachable
-- from a browser, and they are revoked by name rather than through `PUBLIC`.
-- `service_role` is left: that key is server-only, it is never in a bundle, and
-- `lib/supabase/admin.ts` is the one module allowed to hold it.
--
-- **The guard, in the body.** The grant is the thing that was already wrong once
-- and can be re-granted by anybody with the dashboard open, so the function now
-- refuses on its own as well. Its five siblings — `set_work_item_deleted`,
-- `list_deleted_work_items`, `purge_deleted`, `trash_list`, `rehearse_recovery`
-- — all already do this, and all five answer `anon` correctly on the hosted
-- project *despite* being granted to it. That is the difference between a
-- privilege and a decision.
--
-- **The discriminator is the request, not the session.** The first attempt used
-- `guard_profile_privilege_columns`' shape — *no `auth.uid()` means the owner* —
-- and it was wrong here, which the test caught: an ANONYMOUS PostgREST call has
-- no `auth.uid()` either, so `anon` sailed straight through the guard the moment
-- the grant was restored. That idiom is safe on a trigger guarding a table
-- `anon` cannot write; it is not safe on a function `anon` can call.
--
-- What actually separates them was measured rather than assumed, with a
-- temporary echo function called both ways against the local stack:
--
--   anon, over PostgREST : session_user=authenticator  current_user=anon
--                          auth.uid()=null  claims={"role":"anon",…}
--   owner, over psql     : session_user=postgres       current_user=postgres
--                          auth.uid()=null  claims=null
--
-- So the question is *did this arrive as a request*, and the answer is the JWT
-- claims — set on every PostgREST call and absent from psql, a migration and the
-- seed. `session_user` is checked alongside it because one signal that can be
-- unset is one signal too few for the only thing standing between the anon key
-- and every project's key.
--
-- `seed.sql` and the SQL `scripts/import-notion-export.mjs` generates both call
-- this with no JWT at all, so `npm run db:reset` is unaffected — which is the
-- thing that would have made this fix look wrong rather than incomplete.

revoke execute on function public.rebalance_project_keys() from anon, authenticated;

create or replace function public.rebalance_project_keys()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  -- Arrived as a request, and is not an admin. Covers anon, every non-admin
  -- internal role, and a client account — `auth_role()` is null for that one,
  -- which is why the comparison is against the string rather than a role.
  if (nullif(current_setting('request.jwt.claims', true), '') is not null
      or session_user = 'authenticator')
     and coalesce(public.auth_role()::text, '') <> 'admin' then
    raise exception 'only an admin may renumber project keys' using errcode = '42501';
  end if;

  -- The project that owns the most items under a prefix keeps that prefix.
  -- `distinct on` twice: once so a prefix goes to one project, once so a
  -- project claims one prefix. In today's data both collapse to "MEINEvim
  -- keeps COD".
  with per_prefix as (
    select split_part(w.key, '-', 1) as prefix, s.project_id, count(*) as n
    from public.work_items w
    join public.sprints s on s.id = w.sprint_id
    where w.key ~ '^[A-Z][A-Z0-9]*-\d+$'
    group by 1, 2
  ),
  prefix_owner as (
    select distinct on (prefix) prefix, project_id, n from per_prefix
    order by prefix, n desc, project_id
  ),
  project_prefix as (
    select distinct on (project_id) project_id, prefix from prefix_owner
    order by project_id, n desc, prefix
  )
  update public.projects p
  set key_prefix = pp.prefix
  from project_prefix pp
  where pp.project_id = p.id
    and p.key_prefix is distinct from pp.prefix;

  -- Anything still without one — a project that has never held an item.
  for r in select id, slug from public.projects where key_prefix is null order by created_at, id loop
    update public.projects set key_prefix = public.derive_key_prefix(r.slug, r.id) where id = r.id;
  end loop;

  -- Start each counter above the highest number its prefix has ever issued —
  -- across every project, not just this one. `COD-243` belongs to Converso and
  -- `COD` belongs to MEINEvim; scoping this per project would hand out a key
  -- that already exists.
  --
  -- The `where` is new, and it is not cosmetic. Without it this is the statement
  -- `safeupdate` objected to, and that objection was the only thing standing
  -- between an anonymous request and a write to `projects` for as long as the
  -- grant was open. It should never have been load-bearing; now nothing is.
  update public.projects p
  set next_key_number = greatest(p.next_key_number, coalesce((
    select max((regexp_match(w.key, '^' || p.key_prefix || '-(\d+)$'))[1]::int)
    from public.work_items w
    where w.key like p.key_prefix || '-%'
  ), 0) + 1)
  where p.key_prefix is not null;
end;
$$;

comment on function public.rebalance_project_keys is
  'Gives each project the key prefix its own items already use and lifts its counter above them. Maintenance: refuses any caller with a session who is not an admin, and EXECUTE is revoked from anon and authenticated by name — revoking from PUBLIC is inert on a project that grants every function to those roles directly.';
