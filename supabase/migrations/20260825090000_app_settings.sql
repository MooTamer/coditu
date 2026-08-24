-- Coditu — the home of every tunable.
--
-- ## Why
--
-- The team's standing instruction, 2026-08-24: *"nothing is hardcoded,
-- everything that is a decision is editable in the interface."* A rate, a
-- threshold, a cap, a default, a cut-off — every one of them is a decision
-- somebody may reasonably want to change, and a decision that lives in a
-- `const` is a change request that needs a deploy. This team deploys their own
-- tool, so a deploy is exactly the cost the instruction is about.
--
-- So the numbers live here, in a row an admin edits, and the code reads them.
-- Where the brief names a number it is the INITIAL VALUE of one of these
-- columns, never a constant.
--
-- ## Why one row
--
-- These are settings for Coditu, not per project and not per person. A second
-- row would immediately raise "which one is live?", and the honest answer would
-- be "whichever the query happened to order first". `check (id = 1)` makes the
-- question unaskable.
--
-- ## Why every reader still needs a fallback
--
-- The hosted database is behind local and always has been (see
-- docs/07-FIELD-NOTES.md). Code that reads a setting has to work on a database
-- that does not have this table yet, which is why `lib/settings.ts` carries the
-- same defaults this migration does and treats an absent table as "not
-- configured" rather than as an error. A page that 500s because a settings row
-- is missing is the `sprints.notes_written_at` outage again.

create table public.app_settings (
  id                              smallint     primary key default 1 check (id = 1),

  -- E1.1 — the rate, for the team as a whole. Cents, because invariant 2 is
  -- about money too: integer minor units everywhere, divided only at the render
  -- edge. USD 12.00/h is exactly 20 cents a minute, so a sprint's pot is an
  -- exact integer with no rounding anywhere.
  hourly_rate_cents               int          not null default 1200
                                               check (hourly_rate_cents > 0),

  -- E1.5 — who the app PROPOSES as a participant. A suggestion engine, not the
  -- truth: the confirmed set is whatever the admin ticks.
  payout_share_threshold_pct      int          not null default 25
                                               check (payout_share_threshold_pct between 0 and 100),

  -- E1.6 — the first sprint earnings are tracked for. Sprints before it read
  -- "not tracked", which is the truth; zero would be a claim.
  payout_from_sprint_id           uuid         references public.sprints(id) on delete set null,

  -- E3 — the exchange rate, as an integer. rate × 1,000,000. A float never
  -- touches a stored value.
  usd_egp_rate_micros             bigint       check (usd_egp_rate_micros > 0),
  usd_egp_fetched_at              timestamptz,
  usd_egp_source                  text         check (usd_egp_source in ('live','manual')),

  -- C3 — the upload cap. 8 MB to start with.
  max_image_bytes                 int          not null default 8388608
                                               check (max_image_bytes > 0),

  -- F2.5 — what a new profile gets. 2400 minutes is a 40-hour week.
  default_weekly_capacity_minutes int          not null default 2400
                                               check (default_weekly_capacity_minutes > 0),

  updated_at                      timestamptz  not null default now(),
  updated_by                      uuid         references public.profiles(id) on delete set null
);

comment on table public.app_settings is
  'Every tunable in Coditu, in one admin-editable row. A number that lives in a const is a change request that needs a deploy; these do not.';
comment on column public.app_settings.hourly_rate_cents is
  'What an hour pays, for the team as a whole. Minor units — invariant 2 applies to money.';
comment on column public.app_settings.payout_share_threshold_pct is
  'A developer at or above this share of a sprint''s minutes is pre-ticked on the confirmation screen. A proposal, not a rule.';
comment on column public.app_settings.usd_egp_rate_micros is
  'USD→EGP × 1e6. Integer on purpose. The stored value is what every page renders from; the live fetch only ever updates it.';

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- The row itself. `on conflict do nothing` so re-running this against a
-- database that already has it is a no-op rather than a failed migration.
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS. Everyone active reads them — the rate is on the earnings screen and the
-- image cap is in an error message, so a reader needs both. Only an admin
-- writes. There is deliberately no delete policy and no insert policy: the row
-- is created here and is not something the app creates or destroys.
-- ---------------------------------------------------------------------------

alter table public.app_settings enable row level security;

create policy "active members read settings" on public.app_settings
  for select to authenticated using (public.is_active_member());

create policy "admins update settings" on public.app_settings
  for update to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

grant select on public.app_settings to authenticated;
grant update on public.app_settings to authenticated;
