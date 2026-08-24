-- Coditu — what a sprint pays.
--
-- The one workstream in the thread brief that adds a concept the app does not
-- have, so it gets an ADR in `docs/05-DECISIONS.md`, a section in
-- `docs/02-DATA-MODEL.md` and a section in `docs/03-APP-SPEC.md`. It does
-- **not** change `docs/04-EXPORT-SPEC.md`, and there is a test that proves it.
--
-- ## Invariant 2, restated for money
--
-- Integer minor units, everywhere. Cents for USD, piastres for EGP,
-- `rate x 1e6` for the exchange rate. A float never touches a stored value and
-- never touches a sum. Division happens at the render edge only, in
-- `lib/format.ts`, beside `hours()`. The pot is `minutes x rate / 60` with the
-- division last — `hours x rate` loses a cent at eleven minutes, which is a
-- number small enough that nobody would ever check it.
--
-- ## The rules, as the team stated them
--
--  1. The rate is USD 12.00/h **for the team as a whole** — and it is
--     `app_settings.hourly_rate_cents`, not a constant.
--  2. A sprint's pot is every minute logged against every item in it, times
--     the rate.
--  3. The pot is split **equally** among confirmed participants. Not
--     proportionally. That is a decision about fairness, and it is why a human
--     confirms it.
--  4. **Only a developer can be a participant** — a column an admin sets, never
--     a name or an email in code.
--  5. **Nothing is paid without an explicit confirmation.** The app proposes;
--     a person confirms.
--  6. Sprints before the effective-from sprint read "not tracked". Not zero —
--     zero is a claim, "not tracked" is the truth.
--
-- ## Why the payout tables are append-only
--
-- A confirmed distribution is a record of an agreement, not a cache of a
-- calculation. If the underlying minutes change afterwards the confirmation
-- goes **stale, loudly** — a banner — and an admin re-confirms, which writes a
-- new row and marks the old one superseded. The old row is never updated and
-- never deleted, because somebody was paid against it.

-- ---------------------------------------------------------------------------
-- 1. Who takes a share.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column is_developer boolean not null default false;

comment on column public.profiles.is_developer is
  'Whether this person takes a share of a sprint''s pot. Admin-set. A non-developer''s minutes still count toward the pot — the confirmation screen says so by name — but they take no share.';

-- The guard is an allowlist written as a denylist, so a new profile column is
-- writable by its owner until it is named here. `role`, `is_active`,
-- `weekly_capacity_minutes` and `must_set_password` are already named; this is
-- the fifth, and the one that decides money.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() = 'admin' or (select auth.uid()) is null then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'only an admin may change a profile role' using errcode = '42501';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'only an admin may activate or deactivate a profile' using errcode = '42501';
  end if;
  if new.weekly_capacity_minutes is distinct from old.weekly_capacity_minutes then
    raise exception 'only an admin may change weekly capacity' using errcode = '42501';
  end if;
  if new.must_set_password is distinct from old.must_set_password then
    raise exception 'only an admin may require a password change' using errcode = '42501';
  end if;
  if new.is_developer is distinct from old.is_developer then
    raise exception 'only an admin may decide who takes a share' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A confirmed distribution.
-- ---------------------------------------------------------------------------

create table public.sprint_payouts (
  id                  uuid primary key default gen_random_uuid(),
  sprint_id           uuid not null references public.sprints (id) on delete cascade,
  confirmed_by        uuid not null references public.profiles (id) on delete restrict,
  confirmed_at        timestamptz not null default now(),

  -- The snapshot. Everything below is what was true at the moment somebody
  -- agreed to it, and none of it is ever recomputed.
  total_minutes       int    not null check (total_minutes >= 0),
  hourly_rate_cents   int    not null check (hourly_rate_cents > 0),
  pot_cents           int    not null check (pot_cents >= 0),
  usd_egp_rate_micros bigint          check (usd_egp_rate_micros > 0),
  usd_egp_source      text            check (usd_egp_source in ('live','manual')),

  -- A later confirmation supersedes an earlier one. The earlier row is never
  -- updated by the app and never deleted; only this column moves, and only to
  -- a non-null value.
  superseded_at       timestamptz,
  superseded_by       uuid references public.sprint_payouts (id) on delete set null
);

comment on table public.sprint_payouts is
  'One confirmed distribution per sprint, append-only. A confirmed figure is a record of an agreement, not a cache — the FX rate and the rate per hour are snapshotted here and never move again.';

-- At most one LIVE payout per sprint. A partial unique index is the only place
-- that cannot be raced: two admins confirming at once means one of them loses,
-- and the loser gets a sentence rather than a Postgres error.
create unique index sprint_payouts_one_live_idx
  on public.sprint_payouts (sprint_id) where superseded_at is null;

create index sprint_payouts_sprint_idx on public.sprint_payouts (sprint_id, confirmed_at desc);

create table public.sprint_payout_shares (
  payout_id      uuid not null references public.sprint_payouts (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete restrict,
  minutes_logged int  not null check (minutes_logged >= 0),
  share_cents    int  not null check (share_cents >= 0),
  primary key (payout_id, profile_id)
);

comment on table public.sprint_payout_shares is
  'One row per participant per payout. sum(share_cents) equals the payout''s pot_cents exactly — the remainder is distributed one cent at a time by ascending profile id, and `tests/earnings.test.ts` asserts the identity on awkward numbers.';

-- `on delete restrict` on both `profile_id` columns above, deliberately.
-- Deleting a profile already cascades through ten tables (see
-- docs/07-FIELD-NOTES.md) and the answer there was "merge duplicates, never
-- delete them". A share is a record of money owed to a person; it must not be
-- the eleventh thing that quietly disappears with them. Deactivating is what
-- this app means by removing somebody, and a deactivated person keeps every
-- share they were confirmed for.

-- ---------------------------------------------------------------------------
-- 3. RLS. Everyone active reads; only an admin writes; nobody updates a share.
-- ---------------------------------------------------------------------------

alter table public.sprint_payouts       enable row level security;
alter table public.sprint_payout_shares enable row level security;

grant select, insert on public.sprint_payouts, public.sprint_payout_shares to authenticated;
-- UPDATE is granted for exactly one column's worth of work — marking a row
-- superseded — and the policy below is what limits it to an admin.
grant update on public.sprint_payouts to authenticated;

create policy "active members read payouts" on public.sprint_payouts
  for select to authenticated using (public.is_active_member());
create policy "active members read shares" on public.sprint_payout_shares
  for select to authenticated using (public.is_active_member());

create policy "admins confirm payouts" on public.sprint_payouts
  for insert to authenticated
  with check (public.auth_role() = 'admin' and confirmed_by = (select auth.uid()));
create policy "admins write shares" on public.sprint_payout_shares
  for insert to authenticated
  with check (public.auth_role() = 'admin');

create policy "admins supersede payouts" on public.sprint_payouts
  for update to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

-- There is deliberately NO delete policy on either table, and the absence is
-- the rule — the same shape as `comments`. A confirmed payout is not deletable
-- by anybody through this app.

/**
 * A confirmed payout is a record. Only `superseded_at` and `superseded_by` may
 * ever change, and only from null.
 *
 * The UPDATE policy above says who; this says what. Without it an admin could
 * rewrite `pot_cents` on a row somebody has already been paid against, which is
 * the one thing this table exists to make impossible.
 */
create or replace function public.guard_payout_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.sprint_id           is distinct from old.sprint_id
     or new.confirmed_by     is distinct from old.confirmed_by
     or new.confirmed_at     is distinct from old.confirmed_at
     or new.total_minutes    is distinct from old.total_minutes
     or new.hourly_rate_cents is distinct from old.hourly_rate_cents
     or new.pot_cents        is distinct from old.pot_cents
     or new.usd_egp_rate_micros is distinct from old.usd_egp_rate_micros
     or new.usd_egp_source   is distinct from old.usd_egp_source then
    raise exception 'a confirmed payout is a record — only superseding it may change it'
      using errcode = '42501';
  end if;
  if old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at then
    raise exception 'a superseded payout stays superseded' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sprint_payouts_guard_immutable
  before update on public.sprint_payouts
  for each row execute function public.guard_payout_immutable();

-- ---------------------------------------------------------------------------
-- 4. What a sprint has logged, right now.
--
-- One place, so the provisional figure on the earnings screen and the snapshot
-- taken at confirmation cannot disagree about which minutes count. Deleted
-- items are excluded automatically: the read policy on `work_items` hides them,
-- and this joins through it.
-- ---------------------------------------------------------------------------

create view public.v_sprint_minutes
with (security_invoker = on) as
select
  s.id as sprint_id,
  t.profile_id,
  sum(t.minutes)::int as minutes_logged
from public.sprints s
join public.work_items w on w.sprint_id = s.id
join public.time_entries t on t.work_item_id = w.id
group by s.id, t.profile_id;

comment on view public.v_sprint_minutes is
  'Minutes per person per sprint. security_invoker, so a soft-deleted work item drops out through the read policy on work_items rather than through a filter somebody has to remember.';

grant select on public.v_sprint_minutes to authenticated;
