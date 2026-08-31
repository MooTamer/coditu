-- ---------------------------------------------------------------------------
-- `is_developer` was answering two questions, and Ahmed Yehia is the person for
-- whom the answers differ.
--
-- ## The overload
--
-- `20260825095000_earnings.sql` added `profiles.is_developer` and commented it
-- *"whether this person takes a share of a sprint's pot"*. The name says one
-- thing and the comment says another, and for three of the four people on this
-- team they happen to coincide, so nothing noticed.
--
-- Ahmed Yehia is a **developer** and is paid **hourly**. Whichever value the
-- single column holds, his row is wrong:
--
--   `true`  -> he is an engineer (right) and takes a share of the pot (wrong)
--   `false` -> he takes no share (right) and is not an engineer (wrong)
--
-- On hosted today it is `false`, and the seed sets it `true`. The disagreement
-- was recorded on 2026-08-31 as a thing to decide; it is not a disagreement
-- about a fact, it is two facts sharing one column.
--
-- ## The split
--
--   `is_developer`  keeps its literal meaning: is this person an engineer.
--                   It no longer decides money.
--   `payout_basis`  how this person is paid out of a sprint's pot:
--                   `hourly`, `share`, or `none`.
--
-- ## The model, from Mohamed, 2026-08-31
--
--     pot        = the sprint's total, as it always was
--     hourly_pay = SUM(rate x minutes_logged) for everybody on the hourly basis
--     remainder  = pot - hourly_pay
--     split      = remainder distributed among the share people
--
-- An hourly person's pay comes **out of** the pot, before the split. It is not
-- an additional cost on top of it. `lib/payout.ts` is the arithmetic and
-- `tests/payout.test.ts` is where the identity `SUM(everything paid) == pot` is
-- asserted on awkward numbers.
--
-- ## Why `hourly_rate_cents` per person
--
-- Because without it the refusal path is unreachable and therefore untestable.
-- With one team rate, an hourly person's minutes are a subset of the sprint's
-- minutes, so their pay can never exceed a pot struck at that same rate — and
-- "refuse when hourly pay exceeds the pot" would be a branch no input could
-- enter. A per-person rate is also the ordinary reason somebody is on the
-- hourly basis at all: an agreed rate that is not the team's. Null means the
-- team rate, so nothing changes for anybody until an admin sets one.
--
-- ## The backfill preserves today's money exactly
--
-- `is_developer` currently means "takes a share", so `true -> share` and
-- `false -> none` reproduces the present behaviour row for row. Nobody's
-- payout changes as a result of this migration.
--
-- **No person is named here.** Rule 4 of the earnings model is that who takes
-- what is a column an admin sets, never a name or an email in code. Ahmed's
-- basis, and the correction to his `is_developer`, are an admin action —
-- `supabase/seeds/developers.sql` carries the initial answer for a fresh local
-- database and nothing else does.
-- ---------------------------------------------------------------------------

create type public.payout_basis as enum ('share', 'hourly', 'none');

comment on type public.payout_basis is
  'How a person is paid out of a sprint pot. `hourly` is paid first, out of the pot; `share` splits what is left; `none` takes nothing and their minutes still count toward the pot.';

alter table public.profiles
  add column payout_basis public.payout_basis not null default 'none',
  add column hourly_rate_cents int
    check (hourly_rate_cents is null or hourly_rate_cents > 0);

update public.profiles
set payout_basis = case when is_developer then 'share'::public.payout_basis
                        else 'none'::public.payout_basis end;

comment on column public.profiles.is_developer is
  'Whether this person is an engineer. Literal, and it decides nothing about money — `payout_basis` does that. Until 2026-08-31 this column meant both, which made Ahmed Yehia''s row wrong whichever value it held.';

comment on column public.profiles.payout_basis is
  'How this person is paid out of a sprint pot: `hourly` (rate x minutes, taken out of the pot before the split), `share` (an equal part of what is left, whether or not they logged anything), or `none` (their minutes count toward the pot and they take nothing). Admin-set.';

comment on column public.profiles.hourly_rate_cents is
  'What this person is paid per hour when their basis is `hourly`, in cents. Null means the team rate in `app_settings.hourly_rate_cents`. Admin-set, and the reason a sprint can be unpayable: an agreed rate above the team rate can cost more than the pot it is taken from.';

-- ---------------------------------------------------------------------------
-- A share row records WHY somebody was paid, not only how much.
--
-- Free today and expensive later: there are zero payouts and zero shares, on
-- hosted and locally, verified before this migration was written. Once a real
-- payout exists, back-filling the basis of an agreement somebody was paid
-- against is guesswork with money on it.
--
-- `sum(share_cents) = pot_cents` still holds across the whole table for a
-- payout: hourly pay and split shares are both stored here, because both are
-- money the pot paid out.
-- ---------------------------------------------------------------------------

alter table public.sprint_payout_shares
  add column basis public.payout_basis not null default 'share'
    check (basis <> 'none');

comment on column public.sprint_payout_shares.basis is
  'Whether this row is hourly pay taken out of the pot or a part of the split that followed. `none` is refused: a row here means money was paid.';

-- ---------------------------------------------------------------------------
-- The profile guard becomes an allowlist, which is the whole reason this
-- migration is safe to write.
--
-- `guard_profile_privilege_columns` is a denylist: it names `role`,
-- `is_active`, `weekly_capacity_minutes`, `must_set_password` and
-- `is_developer`, and everything it does not name is writable by the row's
-- owner. So `payout_basis` and `hourly_rate_cents` — two columns that decide
-- what somebody is paid — would arrive **writable by that same somebody**, and
-- the way that would have been noticed is somebody reading this file.
--
-- ADR 2026-08-30 inverted exactly this shape on `work_items` and
-- `acceptance_criteria` after finding that an engineer could write
-- `minutes_logged`. It did not reach `profiles`. This is that table.
--
-- The inversion also closes one that was already open: **`account_kind` is not
-- in the denylist**, so a client contact could set their own row to `internal`.
-- Nothing in this pass went looking for it; it fell out of writing the list of
-- what a person may legitimately change about themselves, which is the
-- argument for allowlists in one sentence.
--
-- What a person may change about themselves: their name, their initials, their
-- picture. `updated_at` is in the list because `profiles_set_updated_at` is a
-- BEFORE trigger on the same statement and this guard sorts ahead of it.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text;
begin
  if public.auth_role() = 'admin' or (select auth.uid()) is null then
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
     and c.table_name = 'profiles'
     and c.column_name not in ('full_name', 'initials', 'avatar_url', 'updated_at')
     and to_jsonb(new) -> c.column_name is distinct from to_jsonb(old) -> c.column_name;

  if changed is not null then
    raise exception 'you may change your name, initials and picture; an admin changes the rest (tried to change %)', changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;
