-- The rehearsal learns about pages.
--
-- `rehearse_recovery` answers three questions today — would replaying every
-- story description give back what we have, is every binned story restorable
-- into a sprint that still exists, does every attachment resolve to an object.
-- `20260827120100` added a sixth writing surface and the rehearsal did not know
-- about it, so the honest answer to *"could we get the pages back"* was that
-- nobody had asked.
--
-- ## Why a fourth check rather than widening `documents`
--
-- Because the checks are the **selective** half of selective recovery: the
-- Recovery Centre's control is a set of tick boxes, and an admin who wants to
-- know about pages and not about a workspace's worth of attachments has to be
-- able to say so. Folding pages into `documents` would have made that one
-- question two answers deep.
--
-- ## What it asks
--
-- The same question `documents` asks, and deliberately the same shape: rebuild
-- each page's flattened body from its newest revision, in a schema created for
-- the purpose and dropped afterwards, and compare it to the live row. Not *"are
-- there versions"* — **would replaying them give back what we have**. A page
-- whose newest revision does not reproduce its body is a page the history
-- cannot restore, and that is exactly the failure a rehearsal exists to find
-- before the day it matters.
--
-- Binned pages are included. A page in the bin is a page somebody may ask for
-- back, and its history has to hold up.

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
  where s not in ('documents', 'pages', 'trash', 'attachments');

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

    v_failed := v_checked;
    execute format('select count(*) from %I.restored', v_schema) into v_checked;
  end if;

  -- ── pages ────────────────────────────────────────────────────────────────
  if 'pages' = any (p_scope) then
    declare
      v_p_checked int;
      v_p_failed  int;
      v_p_find    jsonb;
    begin
      execute format(
        'create table %I.restored_pages as
           select distinct on (r.entity_id)
                  r.entity_id,
                  r.plain_text
             from public.document_revisions r
            where r.surface = ''page''
            order by r.entity_id, r.revision_no desc',
        v_schema
      );

      execute format('select count(*) from %I.restored_pages', v_schema) into v_p_checked;

      -- `coalesce(…, '''')` on both sides, because `pages.body` is `not null`
      -- and a revision's `plain_text` is not: a page whose every word was
      -- deleted stores `''` live and `null` in the revision, and calling that a
      -- mismatch would fail a rehearsal on a page that is perfectly restorable.
      execute format(
        'select count(*),
                coalesce(jsonb_agg(jsonb_build_object(
                  ''check'', ''pages'',
                  ''subject'', g.title,
                  ''detail'', ''the newest revision does not reproduce the live page''
                )), ''[]''::jsonb)
           from %I.restored_pages p
           join public.pages g on g.id = p.entity_id
          where coalesce(g.body, '''') is distinct from coalesce(p.plain_text, '''')',
        v_schema
      ) into v_p_failed, v_p_find;

      v_checked := v_checked + v_p_checked;
      v_failed := v_failed + v_p_failed;
      v_findings := v_findings || v_p_find;
    end;
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

      -- A binned PAGE has the same question with a different parent: a project
      -- page whose project went away is recoverable in principle and orphaned
      -- in practice, exactly as a story whose sprint went away is. A workspace
      -- page has no parent to lose, so it cannot be orphaned and is not counted
      -- as at risk.
      declare
        v_g_checked int;
        v_g_failed  int;
        v_g_find    jsonb;
      begin
        execute format(
          'create table %I.binned_pages as
             select g.id, g.title, g.project_id
               from public.pages g
              where g.deleted_at is not null',
          v_schema
        );

        execute format('select count(*) from %I.binned_pages', v_schema) into v_g_checked;

        execute format(
          'select count(*),
                  coalesce(jsonb_agg(jsonb_build_object(
                    ''check'', ''trash'',
                    ''subject'', b.title,
                    ''detail'', ''the project this page would be restored into no longer exists''
                  )), ''[]''::jsonb)
             from %I.binned_pages b
            where b.project_id is not null
              and not exists (select 1 from public.projects pr where pr.id = b.project_id)',
          v_schema
        ) into v_g_failed, v_g_find;

        v_t_checked := v_t_checked + v_g_checked;
        v_t_failed := v_t_failed + v_g_failed;
        v_t_find := v_t_find || v_g_find;
      end;

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
  'Rehearses an application-level recovery into a schema it creates and drops, and records the result. Admin only. Four checks: documents, pages, trash, attachments. Writes nothing to public except its own recovery_runs row — supabase/tests/recovery.sql checksums every live table around a passing and a failing run to prove it.';
