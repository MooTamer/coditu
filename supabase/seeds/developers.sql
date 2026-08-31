-- Coditu — who takes a share of a sprint's pot.
--
-- A seed and not a migration, deliberately. `profiles.is_developer` is a
-- decision an admin makes in the interface — the brief is explicit that it must
-- never be a name or an email in code — so this file is the *initial* answer,
-- the way `supabase/seeds/components.sql` is the initial component registry. An
-- admin changes it from `/app/settings` afterwards and this file is not
-- consulted again.
--
-- **Matched on `full_name`, not on email.** The two databases do not share
-- addresses: production is on the team's real Gmail accounts and local is
-- deliberately on `@coditu.com`, and `docs/07-FIELD-NOTES.md` records exactly
-- that trap. The names are the same in both.
--
-- Idempotent, and it only ever *sets* — a person an admin has already turned
-- off is not turned back on by re-running it.

update public.profiles
set is_developer = true
where full_name in ('Mohamed Tamer', 'Abdelrahman Elkhateeb', 'Ahmed Yehia')
  and is_developer = false;

-- Adam Nafie is not on that list, and that is the point rather than an
-- omission: his hours count toward a sprint's pot — the confirmation screen
-- names him and says so — and he takes no share of it.

-- ---------------------------------------------------------------------------
-- 2026-08-31 — how each person is paid, now that it is its own column.
--
-- `is_developer` above still means "is an engineer" and is left where it is.
-- `payout_basis` is the money, and Mohamed's decision is:
--
--   Ahmed Yehia                          hourly — his hours, out of the pot first
--   Mohamed Tamer, Abdelrahman, Adam     share  — the remainder, split equally
--
-- Adam is on the share list and is not on the `is_developer` list above, and
-- that is the whole point of splitting them: the two facts are independent now.
--
-- Same rules as the block above. A seed, not a migration; matched on
-- `full_name` because the two databases do not share addresses; and it only
-- ever moves somebody off the default, so an admin's later change stands.
-- `hourly_rate_cents` is deliberately left null — Ahmed is paid at the team
-- rate until somebody agrees a different one, and a rate invented here would
-- be a number nobody chose.
-- ---------------------------------------------------------------------------

update public.profiles
set payout_basis = 'hourly'
where full_name = 'Ahmed Yehia'
  and payout_basis <> 'hourly';

update public.profiles
set payout_basis = 'share'
where full_name in ('Mohamed Tamer', 'Abdelrahman Elkhateeb', 'Adam Nafie')
  and payout_basis = 'none';
