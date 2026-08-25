-- Presence channels are private, and the database is what says who may join one.
--
-- ## The spike this settles
--
-- The plan made this phase's first task a question: does this Supabase expose
-- `realtime.messages` RLS — private channels authorized in SQL — or does it not,
-- in which case channels stay token-authenticated and must carry nothing that
-- RLS would otherwise be protecting?
--
-- Measured on 2026-08-25 against realtime **v2.112.6** and `@supabase/realtime-js`
-- **2.112.3**:
--
--   * `realtime.messages` exists, partitioned by day, `relrowsecurity = true`.
--   * It carries **zero policies**, so a private channel is currently denied to
--     everyone — RLS with no policy denies.
--   * `authenticated` holds `select`, `insert` and `update` grants on it.
--   * The client supports `config: { private: true }`.
--
-- So: yes. Private channels work, and the only thing missing is the policy this
-- migration adds. Recorded in `05-DECISIONS.md` with the versions, because the
-- answer is a property of those versions and not of the idea.
--
-- ## Why the check is `is_active_member()` and not per-entity
--
-- A topic-scoped policy — "you may join `presence:sprint:X` if you can read
-- sprint X" — looks stricter and is not, here. Every internal member can read
-- every sprint and every story: `sprints`, `work_items` and `comments` are all
-- gated on `is_active_member()` and nothing narrower. So per-entity scoping
-- would parse the topic, look up the row, and arrive at the answer
-- `is_active_member()` already gives — while adding a query per join and a
-- second place for the visibility rule to live.
--
-- **What it does exclude is the thing that matters.** `is_active_member()`
-- requires `account_kind = 'internal'`, so a client contact cannot join any of
-- these channels, and neither can `anon` — the policy is `to authenticated`
-- only. That is the boundary the client portal rests on, and it is the same
-- function every other internal table uses, rather than a second expression of
-- it that could drift.
--
-- If a future channel is ever scoped more narrowly than "the internal team" —
-- one person's notifications, say — it needs its own policy and its own topic
-- prefix. This one deliberately does not try to be that.
--
-- ## The prefix
--
-- Every private topic this application opens begins `coditu:`. Without it the
-- policy would authorize any private topic at all, including one an attacker
-- picked, which turns the workspace into a general-purpose message bus for
-- anybody with a session. The prefix is not a secret and is not doing security
-- on its own; it is what makes the policy answerable.
--
-- Note that `sprint:{id}` and `thread:{id}` — the existing `postgres_changes`
-- subscriptions — are NOT affected. Those never touch `realtime.messages`;
-- their authorization is the RLS on the tables they watch.

create policy "internal members join coditu channels"
  on realtime.messages
  for select
  to authenticated
  using (
    public.is_active_member()
    and realtime.topic() like 'coditu:%'
  );

create policy "internal members send on coditu channels"
  on realtime.messages
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and realtime.topic() like 'coditu:%'
  );
