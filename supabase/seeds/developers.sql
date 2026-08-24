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
