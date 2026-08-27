-- `revoke … from public` was inert again, on the function this audit rewrote.
--
-- `20260827041641_close_the_renumberer_on_the_hosted_project.sql` established
-- the trap this morning: the hosted project grants functions in `public` to
-- `anon` **by name**, and taking a privilege away from `PUBLIC` does not touch
-- one granted directly to a role. Every `revoke … from public` this repository
-- writes is inert there, and the local stack — which has zero such grants —
-- cannot show it. `db diff` cannot see privileges at all; only `db dump` can.
--
-- `20260827120400_rehearse_pages.sql` replaced `rehearse_recovery` and carried
-- the original's `revoke all on function … from public` forward verbatim. So it
-- inherited the inert revoke, and the fix from earlier the same day was not
-- applied to the one function this audit had just rewritten.
--
-- Read off the hosted database with `supabase db dump --linked` after the five
-- migrations were applied. Ten functions this audit creates or replaces, and
-- the grants `anon` holds on each:
--
--     set_page_deleted             0   ← revoked from `public, anon` by name
--     restore_document_revision    0   ← same
--     trash_list                   0   ← same
--     purge_deleted                0   ← same
--     rehearse_recovery            1   ← revoked from `public` only
--     record_document_revision     1   ┐
--     record_restore_activity      1   │ trigger functions
--     prune_recent_views           1   │
--     pages_stamp_author           1   │
--     pages_guard_columns          1   ┘
--
-- Two things that table says. The four written with `from public, anon` are
-- clean, which is what naming the role buys. And the production project grants
-- `anon` execute on **new** functions in `public` automatically — every one of
-- these was created minutes earlier and none of them was granted by hand.
--
-- ## Only one of the six is reachable
--
-- PostgREST does not expose a function that returns `trigger`: there is no
-- argument shape a request can present, and it is invoked by the executor
-- rather than by a caller. Five of the six are trigger functions and are not an
-- exposure. They are revoked below anyway, because "not reachable through the
-- API we ship today" is a smaller promise than "not granted", and the cost of
-- the stronger one is six lines.
--
-- `rehearse_recovery(text[])` returns `uuid`. It **is** reachable, and it is
-- `security definer`: it creates a schema, copies from four tables into it, and
-- writes a `recovery_runs` row.
--
-- ## The body already refuses, and that is not a reason to leave the grant
--
-- Its first statement is the guard, and `auth_role()` is null for `anon`, so
-- `null is distinct from 'admin'` is true and it raises `42501` before creating
-- anything. That is the pattern the earlier migration established and it is
-- why this is a hardening rather than an incident.
--
-- Both halves, for the reason that one records: **a grant can be handed back
-- from a dashboard and a raise cannot.** The grant is the half that was already
-- wrong twice; the guard is the half that would still have been true on
-- production either time.

revoke all on function public.rehearse_recovery(text[]) from public, anon;
grant execute on function public.rehearse_recovery(text[]) to authenticated;

-- The trigger functions. Nothing calls these but the executor, and after this
-- nothing may.
revoke all on function public.record_document_revision() from public, anon, authenticated;
revoke all on function public.record_restore_activity() from public, anon, authenticated;
revoke all on function public.prune_recent_views() from public, anon, authenticated;
revoke all on function public.pages_stamp_author() from public, anon, authenticated;
revoke all on function public.pages_guard_columns() from public, anon, authenticated;

-- `set_page_deleted` is already clean on production, and is restated here so a
-- database restored from an older dump lands in the same place as this one.
revoke all on function public.set_page_deleted(uuid, boolean) from public, anon;
grant execute on function public.set_page_deleted(uuid, boolean) to authenticated;
