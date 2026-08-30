-- ---------------------------------------------------------------------------
-- The column guards were allowlists written as denylists. Now they are
-- allowlists.
--
-- ## What was wrong, measured rather than reasoned
--
-- `guard_work_item_columns` raised only when a column *named in a case
-- expression* changed. Its message said "an engineer may change only status and
-- order_index" and that sentence was false: `work_items` has 27 columns, the
-- list named 20, and the seven it did not name were writable by any engineer on
-- any row their row policy let them touch. Measured on a clean local stack,
-- signed in as `engineer`, on an item assigned to them:
--
--     update … set title          = …   ->  ERROR 42501  (the guard, correctly)
--     update … set order_index    = …   ->  UPDATE 1     (intended)
--     update … set minutes_logged = …   ->  UPDATE 1     <- invariant 2
--     update … set closed_at      = …   ->  UPDATE 1
--     update … set created_at     = …   ->  UPDATE 1
--     update … set id             = …   ->  refused, but by an incidental
--                                            foreign key from `activity`,
--                                            not by this guard
--
-- `minutes_logged` is the one that matters. It is the trigger-maintained rollup
-- that invariant 2 exists to protect, and every sprint total, earnings figure
-- and payout is derived from it. An engineer could set their own to any number
-- and nothing in the database would object.
--
-- The mechanism is the point, and it is the same one this pass found in three
-- CI controls on the same day: **the guard was quiet when it was not
-- configured** — where "configured" means "somebody remembered to add the new
-- column to the list". `component_id` and `body_json` were each added
-- retrospectively for exactly this reason, which is the pattern announcing
-- itself twice before anybody named it. A control that is silent about what it
-- does not cover is indistinguishable from one that covers everything.
--
-- ## What it is now
--
-- Stated as the contract: an engineer may change these columns and no others.
-- A column added tomorrow is refused by default, and opening it is a deliberate
-- edit to this list rather than an omission from another one. The error names
-- the column, so the fix is obvious from the message.
--
-- ## `pg_trigger_depth()`, and why it is not a hole
--
-- Some of these columns are written by triggers on the caller's behalf:
-- `refresh_minutes_logged` fires on `time_entries` and updates `work_items`;
-- `record_document_revision` writes the `*_version` counters back. Those
-- functions are `security definer`, but `auth.uid()` reads a GUC that
-- `security definer` does not reset, so inside them this guard still sees the
-- engineer and would refuse the write — breaking time logging for everyone who
-- is not a lead.
--
-- `pg_trigger_depth() > 1` means "another trigger is already running, so this
-- statement was not issued by the caller". That is the exact distinction
-- needed, it is not attacker-controlled from SQL a client can send, and the
-- nested writers are all in this schema.
-- ---------------------------------------------------------------------------

create or replace function public.guard_work_item_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text;
begin
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;

  -- Written by a trigger on the caller's behalf, not by the caller.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select string_agg(c.column_name, ', ' order by c.ordinal_position)
    into changed
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'work_items'
     and c.column_name not in ('status', 'order_index')
     and to_jsonb(new) -> c.column_name is distinct from to_jsonb(old) -> c.column_name;

  if changed is not null then
    raise exception 'an engineer may change only status and order_index (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Same inversion. An engineer may say what an acceptance criterion says and
-- tick it; moving it to another item or reordering the checklist is the shape
-- of the scope rather than the content of one line, and stays a lead's call.
-- `body_version` is written by `record_document_revision`, which is why the
-- depth escape above is in this one too.
create or replace function public.guard_criteria_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text;
begin
  if (select auth.uid()) is null or public.is_admin_or_lead() then
    return new;
  end if;

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select string_agg(c.column_name, ', ' order by c.ordinal_position)
    into changed
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'acceptance_criteria'
     and c.column_name not in ('body', 'body_json', 'is_done')
     and to_jsonb(new) -> c.column_name is distinct from to_jsonb(old) -> c.column_name;

  if changed is not null then
    raise exception 'an engineer may change a criterion''s body and tick it, nothing else (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;
