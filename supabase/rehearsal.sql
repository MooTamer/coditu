-- Coditu — the F1 rehearsal from the thread brief, as a script.
--
-- "Before writing a line of new code, run the whole flow and write down every
-- place it stops." This is the half of that walkthrough which can be executed
-- without a browser: every step below is the write the Server Action makes,
-- under the same RLS the action runs under, as each of the three roles in turn.
--
-- It does NOT prove the button exists, that the sheet fits at 390px, or that a
-- thumb can reach it. That is `npm run e2e`, and it is the half that matters
-- for the interface. Both halves are needed and neither replaces the other.
--
-- **Deliberately not in `supabase/tests/`.** `supabase test db` runs everything
-- in that directory as pgTAP, and this has no plan and no assertions — it is a
-- walkthrough that reports what happened. Run it directly:
--
--   psql "$DB_URL" -f supabase/rehearsal.sql
--
-- It opens a transaction and rolls back, so it leaves nothing behind. Re-run it
-- whenever the flow changes; the table it prints is what belongs in
-- `docs/06-PROGRESS.md`.
\set ON_ERROR_STOP off
\timing off

begin;

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', uid, 'role', 'authenticated')::text);
end;
$$;
create or replace function pg_temp.owner() returns void
language plpgsql as $$
begin
  execute 'set local role postgres';
  execute 'set local request.jwt.claims = ''''';
end;
$$;

create temporary table result (step text, outcome text);
-- The rehearsal switches roles constantly, and a temp table is owned by the
-- session's login role. Without this the notes fail as `authenticated`.
grant all on result to public;
create or replace function pg_temp.note(s text, o text) returns void
language sql as $$ insert into result values (s, o) $$;

-- Who we are.
create temporary table who as
select
  (select id from public.profiles where full_name = 'Mohamed Tamer')         as admin,
  (select id from public.profiles where full_name = 'Adam Nafie')            as lead,
  (select id from public.profiles where full_name = 'Ahmed Yehia')           as engineer;
grant select on who to public;

-- =========================================================================
-- 2. Create a client and a project.
-- =========================================================================
do $$
declare v record; c uuid; p uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  insert into public.clients (name, website_url) values ('Rehearsal Ltd', 'https://example.com') returning id into c;
  insert into public.projects (client_id, name, slug, scope) values (c, 'Rehearsal portal', 'rehearsal-portal', 'A walkthrough') returning id into p;
  perform pg_temp.note('2. create a client and a project',
    'worked — prefix ' || (select key_prefix from public.projects where id = p));
exception when others then
  perform pg_temp.note('2. create a client and a project', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 3. Create the next sprint, with a goal.
-- =========================================================================
do $$
declare v record; p uuid; s uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select id into p from public.projects where slug = 'rehearsal-portal';
  insert into public.sprints (project_id, number, name, starts_on, ends_on, goal)
  values (p, 1, 'Sprint — Week 1', current_date, current_date + 6, 'Ship the settings panel')
  returning id into s;
  perform pg_temp.note('3. create the sprint, with a goal',
    'worked — goal reads "' || (select goal from public.sprints where id = s) || '"');
exception when others then
  perform pg_temp.note('3. create the sprint, with a goal', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 4. Start it, then try to start a second.
-- =========================================================================
do $$
declare v record; p uuid; s uuid; s2 uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select id into p from public.projects where slug = 'rehearsal-portal';
  select id into s from public.sprints where project_id = p and number = 1;
  update public.sprints set status = 'active' where id = s;

  insert into public.sprints (project_id, number, name, status) values (p, 2, 'Sprint — Week 2', 'planned') returning id into s2;
  begin
    update public.sprints set status = 'active' where id = s2;
    perform pg_temp.note('4. start it; a second active sprint', 'PROBLEM — two active sprints were allowed');
  exception when unique_violation then
    perform pg_temp.note('4. start it; a second active sprint', 'worked — the partial unique index refused the second');
  end;
exception when others then
  perform pg_temp.note('4. start it; a second active sprint', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 5. Ten work items in one sitting, with criteria.
-- =========================================================================
do $$
declare v record; s uuid; n int; keys text[];
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 1;

  insert into public.work_items (sprint_id, title, type, status, description, highlight, assignee_id, reviewer_id, deadline, estimate_minutes, grouping)
  select s, 'Rehearsal item ' || g, 'story', 'todo', 'A description' || chr(10) || 'over two lines',
         case when g = 1 then 'Discuss the migration order first' else null end,
         v.engineer, v.lead, current_date + 3, 120, 1
  from generate_series(1, 10) g;

  insert into public.acceptance_criteria (work_item_id, body)
  select w.id, 'It works' from public.work_items w where w.sprint_id = s;

  select count(*), array_agg(key order by key) into n, keys from public.work_items where sprint_id = s;
  perform pg_temp.note('5. ten items in one sitting',
    'worked — ' || n || ' items, keys ' || keys[1] || '…' || keys[array_length(keys,1)] ||
    ', order_index ' || (select array_agg(order_index order by order_index)::text from public.work_items where sprint_id = s));
exception when others then
  perform pg_temp.note('5. ten items in one sitting', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 6. Change your mind: rename, fix the description, rewrite the highlight,
--    move one to another sprint, delete one.
-- =========================================================================
do $$
declare v record; s uuid; s2 uuid; w uuid; w2 uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 1;
  select sp.id into s2 from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 2;
  select id into w from public.work_items where sprint_id = s order by order_index limit 1;
  select id into w2 from public.work_items where sprint_id = s order by order_index desc limit 1;

  update public.work_items set title = 'Renamed the morning after', description = 'Corrected.', highlight = 'Rewritten.' where id = w;
  update public.work_items set sprint_id = s2 where id = w2;
  perform public.set_work_item_deleted(w, true);

  perform pg_temp.note('6. rename, correct, rewrite, move, delete',
    'worked — moved item now at order_index ' || (select order_index from public.work_items where id = w2) ||
    '; the deleted one is ' || (case when exists (select 1 from public.work_items where id = w) then 'STILL VISIBLE' else 'invisible to every select' end));

  perform public.set_work_item_deleted(w, false);
exception when others then
  perform pg_temp.note('6. rename, correct, rewrite, move, delete', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 7. Components: create one in place, rename it, archive it.
-- =========================================================================
do $$
declare v record; p uuid; c uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select id into p from public.projects where slug = 'rehearsal-portal';
  insert into public.components (project_id, name, slug, kind) values (p, 'Settings panel', 'settings-panel', 'react') returning id into c;
  update public.components set name = 'Settings panel v2' where id = c;
  update public.components set is_archived = true where id = c;
  perform pg_temp.note('7. component: create, rename, archive', 'worked — slug stayed "' || (select slug from public.components where id = c) || '" through the rename');
exception when others then
  perform pg_temp.note('7. component: create, rename, archive', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 8. Assign and reassign, then deactivate the person.
-- =========================================================================
do $$
declare v record; s uuid; w uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 1;
  select id into w from public.work_items where sprint_id = s order by order_index limit 1;
  update public.work_items set assignee_id = v.lead where id = w;
  update public.work_items set assignee_id = v.engineer where id = w;
  perform pg_temp.note('8. assign and reassign', 'worked');
exception when others then
  perform pg_temp.note('8. assign and reassign', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 9. Log time as three people, then correct one and delete one.
-- =========================================================================
do $$
declare v record; s uuid; w uuid; e uuid; rolled int;
begin
  select * into v from who;
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 1;
  select id into w from public.work_items where sprint_id = s order by order_index limit 1;

  perform pg_temp.act_as(v.engineer);
  insert into public.time_entries (work_item_id, profile_id, minutes, worked_on) values (w, v.engineer, 480, current_date) returning id into e;
  -- The correction: 8.0 h was meant to be 0.5 h.
  update public.time_entries set minutes = 30 where id = e;

  perform pg_temp.act_as(v.lead);
  insert into public.time_entries (work_item_id, profile_id, minutes, worked_on) values (w, v.lead, 120, current_date);
  perform pg_temp.act_as(v.admin);
  insert into public.time_entries (work_item_id, profile_id, minutes, worked_on) values (w, v.admin, 90, current_date);

  select minutes_logged into rolled from public.work_items where id = w;
  perform pg_temp.note('9. log time as three people, correct one',
    'worked — rollup is ' || rolled || ' minutes, which is 30 + 120 + 90');
exception when others then
  perform pg_temp.note('9. log time as three people, correct one', 'FAILED — ' || sqlerrm);
end$$;

-- An engineer must not be able to rewrite somebody else's hours.
do $$
declare v record; e uuid; after int;
begin
  select * into v from who;
  select t.id into e from public.time_entries t join public.work_items w on w.id = t.work_item_id
    join public.sprints s on s.id = w.sprint_id join public.projects p on p.id = s.project_id
   where p.slug = 'rehearsal-portal' and t.profile_id = v.admin limit 1;
  perform pg_temp.act_as(v.engineer);
  update public.time_entries set minutes = 999 where id = e;
  perform pg_temp.owner();
  select minutes into after from public.time_entries where id = e;
  perform pg_temp.note('9b. an engineer rewrites another person''s hours',
    case when after = 90 then 'refused, silently and correctly — the row policy matched nothing'
         else 'PROBLEM — it changed to ' || after end);
end$$;

-- =========================================================================
-- 10. Comment, edit it, withdraw it.
-- =========================================================================
do $$
declare v record; s uuid; w uuid; c uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.engineer);
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 1;
  select id into w from public.work_items where sprint_id = s order by order_index limit 1;

  insert into public.comments (work_item_id, author_id, body_json, body_text)
  values (w, v.engineer,
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Started on this"}]}]}'::jsonb,
    'Started on this') returning id into c;

  update public.comments set body_text = 'Started on this, properly', edited_at = now() where id = c;
  update public.comments set deleted_at = now() where id = c;

  perform pg_temp.note('10. comment, edit, withdraw',
    'worked — edited_at set, deleted_at set, and the row is ' ||
    (case when exists (select 1 from public.comments where id = c) then 'still in the table' else 'GONE' end));
exception when others then
  perform pg_temp.note('10. comment, edit, withdraw', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 11. Tick criteria as the assignee, and rewrite one.
-- =========================================================================
do $$
declare v record; s uuid; w uuid; k uuid;
begin
  select * into v from who;
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 1;
  select id into w from public.work_items where sprint_id = s order by order_index limit 1;
  select id into k from public.acceptance_criteria where work_item_id = w limit 1;

  perform pg_temp.act_as(v.engineer);
  update public.acceptance_criteria set is_done = true where id = k;
  update public.acceptance_criteria set body = 'It works, and the panel remembers', body_json = '{"type":"doc","content":[]}'::jsonb where id = k;
  begin
    update public.acceptance_criteria set order_index = 9 where id = k;
    perform pg_temp.note('11. tick a criterion and rewrite it', 'PROBLEM — an engineer reordered the checklist');
  exception when insufficient_privilege then
    perform pg_temp.note('11. tick a criterion and rewrite it',
      'worked — the assignee ticked it and rewrote it; reordering was refused, which is the line the team drew');
  end;
exception when others then
  perform pg_temp.note('11. tick a criterion and rewrite it', 'FAILED — ' || sqlerrm);
end$$;

-- =========================================================================
-- 13. Close the sprint and confirm the payout.
-- =========================================================================
do $$
declare v record; s uuid; total int; pot int; payout uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 1;

  update public.sprints set status = 'closed' where id = s;
  update public.app_settings set payout_from_sprint_id = s where id = 1;

  select coalesce(sum(minutes_logged), 0) into total from public.v_sprint_minutes where sprint_id = s;
  pot := (total * (select hourly_rate_cents from public.app_settings where id = 1)) / 60;

  insert into public.sprint_payouts (sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents, usd_egp_rate_micros, usd_egp_source)
  values (s, v.admin, total, 1200, pot, 50860000, 'live') returning id into payout;

  insert into public.sprint_payout_shares (payout_id, profile_id, minutes_logged, share_cents)
  select payout, p.id, coalesce(m.minutes_logged, 0),
         pot / (select count(*) from public.profiles where is_developer)
         + case when row_number() over (order by p.id) <= pot % (select count(*) from public.profiles where is_developer) then 1 else 0 end
  from public.profiles p
  left join public.v_sprint_minutes m on m.profile_id = p.id and m.sprint_id = s
  where p.is_developer;

  perform pg_temp.note('13. close the sprint and confirm the payout',
    'worked — ' || total || ' minutes, pot ' || pot || ' cents, shares sum to ' ||
    (select sum(share_cents) from public.sprint_payout_shares where payout_id = payout));
exception when others then
  perform pg_temp.note('13. close the sprint and confirm the payout', 'FAILED — ' || sqlerrm);
end$$;

-- An engineer must not be able to confirm anything.
do $$
declare v record; s uuid;
begin
  select * into v from who;
  select sp.id into s from public.sprints sp join public.projects pr on pr.id = sp.project_id
   where pr.slug = 'rehearsal-portal' and sp.number = 2;
  perform pg_temp.act_as(v.engineer);
  begin
    insert into public.sprint_payouts (sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents)
    values (s, v.engineer, 60, 1200, 1200);
    perform pg_temp.note('13b. an engineer confirms a payout', 'PROBLEM — it was allowed');
  exception when insufficient_privilege then
    perform pg_temp.note('13b. an engineer confirms a payout', 'refused, as it must be');
  end;
end$$;

-- A slug rename must not break the old address.
do $$
declare v record; p uuid;
begin
  select * into v from who;
  perform pg_temp.act_as(v.admin);
  select id into p from public.projects where slug = 'rehearsal-portal';
  update public.projects set slug = 'rehearsal-portal-v2' where id = p;
  insert into public.project_slug_aliases (slug, project_id) values ('rehearsal-portal', p);
  perform pg_temp.note('F2.1b. rename a project, keep the old address',
    'worked — /app/projects/rehearsal-portal still resolves to ' ||
    (select name from public.projects where id = (select project_id from public.project_slug_aliases where slug = 'rehearsal-portal')));
exception when others then
  perform pg_temp.note('F2.1b. rename a project, keep the old address', 'FAILED — ' || sqlerrm);
end$$;

do $$ begin perform pg_temp.owner(); end$$;

select step, outcome from result order by step;

rollback;
