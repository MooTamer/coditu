-- Coditu — rehearsing a recovery, without ever being able to damage one.
--
-- ## The thing this screen exists to answer
--
-- "Could we actually get it back?" is a question nobody should first ask on the
-- day they need the answer. `document_revisions`, `trash` and the attachment
-- rows are the three things application-level recovery rests on, and until now
-- nothing had ever exercised them together — they were three features that
-- each worked, which is not the same as a recovery that works.
--
-- ## The safety property, and how it is enforced rather than promised
--
-- **A rehearsal cannot write to `public`.** Not "does not"; cannot, by
-- construction:
--
--  * Every copy this function makes goes into a schema it creates itself, whose
--    name it generates from `gen_random_uuid()` and which is dropped before the
--    function returns. The caller never supplies a name, so there is no string
--    for a caller to aim somewhere else.
--  * The only statement in the whole body that targets `public` is the single
--    `insert into public.recovery_runs` that records what happened.
--  * `supabase/tests/recovery.sql` asserts it the only way worth asserting: it
--    takes a checksum of every live table before and after a rehearsal — one
--    that passes and one that fails — and requires both to be identical.
--
-- ## And the rehearsal deliberately does not write anything back
--
-- §9 of the brief ends "restore the selection as new versions/copies". That
-- step is **not** new code here, and that is the point: restoring a document as
-- a new version is `restore_revision`, which W4a built, W4c tested and RLS
-- already polices per surface. Reimplementing it inside a function that also
-- creates schemas would put the one genuinely destructive operation in this
-- application inside the one function that runs with the most privilege.
--
-- So the dangerous new machinery is strictly read-only against live data, and
-- the write-back is the ordinary restore somebody presses on the screen where
-- it already lives.

create type public.recovery_run_status as enum ('passed', 'failed');

create table public.recovery_runs (
  id             uuid primary key default gen_random_uuid(),

  -- `set null`, not `restrict`: a run is a record of a check, not of a debt.
  -- Deactivating somebody must not be blocked by a rehearsal they once ran,
  -- and the run stays readable without them.
  actor_id       uuid references public.profiles (id) on delete set null,

  started_at     timestamptz not null,
  finished_at    timestamptz not null default now(),
  status         public.recovery_run_status not null,

  -- Which checks ran. An array rather than a jsonb blob because it is a fixed
  -- vocabulary and the screen filters on it.
  scope          text[] not null,

  -- The schema the copies went into, recorded after it was dropped. Nothing
  -- reads it; it is here so that a leftover schema can be traced to the run
  -- that made it, which is the only way that bug would ever be diagnosable.
  preview_schema text not null,

  checked        int not null check (checked >= 0),
  failed         int not null check (failed >= 0),

  -- One object per problem: `{check, subject, detail}`. Capped by the function
  -- so a workspace with ten thousand broken attachments records a readable row
  -- rather than a megabyte of jsonb.
  findings       jsonb not null default '[]'::jsonb
);

comment on table public.recovery_runs is
  'One row per recovery rehearsal. Append-only: written only by rehearse_recovery(), which is security definer and holds the only insert path. A rehearsal copies into a schema it creates and drops, and never writes to public except here.';

create index recovery_runs_recent_idx on public.recovery_runs (finished_at desc);

-- ---------------------------------------------------------------------------
-- Append-only, the same way `document_revisions` and `access_events` are: by
-- what is absent. `authenticated` gets SELECT and nothing else, so there is no
-- insert, update or delete path at all outside the definer function below.
--
-- `truncate` is revoked explicitly. This project grants `REFERENCES, SELECT,
-- TRIGGER, TRUNCATE` to `authenticated` on every table by default, and a
-- truncate bypasses row-level security entirely — policies filter rows and a
-- truncate visits none. Not reachable through PostgREST, which cannot issue
-- one, but "append-only" should be true rather than nearly true. W9 found this
-- and `07-FIELD-NOTES.md` records that it applies to every table here.
-- ---------------------------------------------------------------------------

alter table public.recovery_runs enable row level security;

grant select on public.recovery_runs to authenticated;
revoke truncate on public.recovery_runs from authenticated;

-- Admin only, and reading is as far as it goes. A rehearsal names what is
-- broken across the whole workspace; it is an operations record, not a
-- delivery one.
create policy "admins read recovery runs" on public.recovery_runs
  for select to authenticated
  using (public.auth_role() = 'admin');

-- ---------------------------------------------------------------------------
-- The rehearsal.
-- ---------------------------------------------------------------------------

/**
 * Rehearse an application-level recovery, and record what it found.
 *
 * `p_scope` is a subset of `{documents, trash, attachments}`. Anything else is
 * refused rather than ignored — a rehearsal that silently skipped a check
 * somebody asked for would report "passed" about work it never did, which is
 * the worst possible answer from this particular screen.
 *
 * ## What each check actually proves
 *
 * **documents** — rebuilds the current text of every story description from
 * its newest revision, in the preview schema, and compares that to what the
 * live row says. This is the real question behind version history: not "are
 * there rows" but "would replaying them give us back what we have". A
 * mismatch means history has drifted from the document and a restore would
 * produce something nobody expects.
 *
 * **trash** — every soft-deleted story still has the sprint and project it
 * would be restored into. A deleted story whose sprint was later removed is
 * recoverable in principle and orphaned in practice.
 *
 * **attachments** — every `attachments.storage_path` resolves to an object in
 * the `work-attachments` bucket. Managed database backups do not cover storage
 * at all, so this is the one part of the workspace where the database being
 * fine says nothing about the files.
 */
create or replace function public.rehearse_recovery(p_scope text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started  timestamptz := clock_timestamp();
  v_schema   text;
  v_findings jsonb := '[]'::jsonb;
  v_checked  int := 0;
  v_failed   int := 0;
  v_id       uuid;
  v_unknown  text[];
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'only an admin may rehearse a recovery' using errcode = '42501';
  end if;

  if p_scope is null or array_length(p_scope, 1) is null then
    raise exception 'a rehearsal needs at least one check' using errcode = '22023';
  end if;

  select array_agg(s) into v_unknown
  from unnest(p_scope) as s
  where s not in ('documents', 'trash', 'attachments');

  if v_unknown is not null then
    raise exception 'unknown recovery check: %', array_to_string(v_unknown, ', ')
      using errcode = '22023';
  end if;

  -- The name is generated here and never comes from the caller. `format('%I')`
  -- would quote a hostile identifier safely anyway; not accepting one at all is
  -- better than quoting one correctly.
  v_schema := 'recovery_preview_' || replace(gen_random_uuid()::text, '-', '');
  execute format('create schema %I', v_schema);

  -- ── documents ────────────────────────────────────────────────────────────
  if 'documents' = any (p_scope) then
    -- The copy. Only the newest revision per document is needed to answer the
    -- question, and taking it in the preview schema rather than in a CTE is
    -- what makes this a restore rehearsal rather than a query.
    execute format(
      'create table %I.restored as
         select distinct on (r.entity_id)
                r.entity_id,
                r.plain_text
           from public.document_revisions r
          where r.surface = ''work_item_description''
          order by r.entity_id, r.revision_no desc',
      v_schema
    );

    execute format(
      'select count(*),
              coalesce(jsonb_agg(jsonb_build_object(
                ''check'', ''documents'',
                ''subject'', w.key,
                ''detail'', ''the newest revision does not reproduce the live description''
              )) filter (where w.id is not null), ''[]''::jsonb)
         from %I.restored p
         join public.work_items w on w.id = p.entity_id
        where coalesce(w.description, '''') is distinct from coalesce(p.plain_text, '''')',
      v_schema
    ) into v_checked, v_findings;

    -- `v_checked` above counted only the mismatches; the honest denominator is
    -- every document that had a revision to replay.
    v_failed := v_checked;
    execute format('select count(*) from %I.restored', v_schema) into v_checked;
  end if;

  -- ── trash ────────────────────────────────────────────────────────────────
  if 'trash' = any (p_scope) then
    declare
      v_t_checked int;
      v_t_failed  int;
      v_t_find    jsonb;
    begin
      execute format(
        'create table %I.binned as
           select w.id, w.key, w.sprint_id
             from public.work_items w
            where w.deleted_at is not null',
        v_schema
      );

      execute format('select count(*) from %I.binned', v_schema) into v_t_checked;

      execute format(
        'select count(*),
                coalesce(jsonb_agg(jsonb_build_object(
                  ''check'', ''trash'',
                  ''subject'', b.key,
                  ''detail'', ''the sprint this would be restored into no longer exists''
                )), ''[]''::jsonb)
           from %I.binned b
          where not exists (
            select 1 from public.sprints s
              join public.projects pr on pr.id = s.project_id
             where s.id = b.sprint_id)',
        v_schema
      ) into v_t_failed, v_t_find;

      v_checked := v_checked + v_t_checked;
      v_failed := v_failed + v_t_failed;
      v_findings := v_findings || v_t_find;
    end;
  end if;

  -- ── attachments ──────────────────────────────────────────────────────────
  if 'attachments' = any (p_scope) then
    declare
      v_a_checked int;
      v_a_failed  int;
      v_a_find    jsonb;
    begin
      execute format(
        'create table %I.files as
           select a.id, a.file_name, a.storage_path from public.attachments a',
        v_schema
      );

      execute format('select count(*) from %I.files', v_schema) into v_a_checked;

      -- Capped at fifty. A workspace whose storage never got uploaded produces
      -- one finding per file, and a row nobody can read is not a record.
      execute format(
        'select count(*),
                coalesce(jsonb_agg(jsonb_build_object(
                  ''check'', ''attachments'',
                  ''subject'', f.file_name,
                  ''detail'', ''no object at this path in work-attachments''
                )) filter (where f.rn <= 50), ''[]''::jsonb)
           from (select f.*, row_number() over (order by f.file_name) as rn
                   from %I.files f
                  where not exists (
                    select 1 from storage.objects o
                     where o.bucket_id = ''work-attachments''
                       and o.name = f.storage_path)) f',
        v_schema
      ) into v_a_failed, v_a_find;

      v_checked := v_checked + v_a_checked;
      v_failed := v_failed + v_a_failed;
      v_findings := v_findings || v_a_find;
    end;
  end if;

  -- Dropped before the row is written, so a run that is recorded is a run whose
  -- copies are already gone. The name survives in the row purely so a leftover
  -- schema could be traced back here.
  execute format('drop schema %I cascade', v_schema);

  insert into public.recovery_runs
    (actor_id, started_at, status, scope, preview_schema, checked, failed, findings)
  values (
    (select auth.uid()),
    v_started,
    case when v_failed = 0 then 'passed'::public.recovery_run_status
         else 'failed'::public.recovery_run_status end,
    p_scope,
    v_schema,
    v_checked,
    v_failed,
    v_findings
  )
  returning id into v_id;

  return v_id;
exception
  when others then
    -- A rehearsal that throws must not leave a schema behind. `drop ... if
    -- exists` because the failure may have happened before it was created.
    if v_schema is not null then
      execute format('drop schema if exists %I cascade', v_schema);
    end if;
    raise;
end;
$$;

revoke all on function public.rehearse_recovery(text[]) from public;
grant execute on function public.rehearse_recovery(text[]) to authenticated;

comment on function public.rehearse_recovery(text[]) is
  'Rehearses an application-level recovery into a schema it creates and drops, and records the result. Admin only. Writes nothing to public except its own recovery_runs row — supabase/tests/recovery.sql checksums every live table around a passing and a failing run to prove it.';
