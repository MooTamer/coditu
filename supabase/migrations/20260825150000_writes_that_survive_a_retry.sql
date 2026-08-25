-- A write that is sent twice happens once.
--
-- The composer already disables its own button while a send is in flight, so a
-- double CLICK was never the problem. What is unhandled is everything below the
-- button: the request that arrived and whose response was lost, the Server
-- Action that rejected because the network went away mid-flight (which skips the
-- client's rollback entirely — see `07-FIELD-NOTES.md`), the second tab, the
-- retry a reader makes because the first attempt appeared to do nothing. Every
-- one of those posts the same comment twice, and the thread is the record of a
-- conversation.
--
-- ## A column, not a claims table
--
-- `coditu-implementation-prompt.md` §5.4 proposed a general
-- `write_idempotency (key, profile_id, action, result)` table: claim the key,
-- do the write, record the result. That is the right shape for a system where
-- the write is not a single insert, and the wrong shape here, for three reasons.
--
-- **It is three round trips where there is one.** Claim, insert, complete —
-- against a composer whose own source says it is "already tuned" and that a
-- comment appearing half a second later is a regression paid for by the person
-- writing.
--
-- **It has states that this does not.** A claim written and a write that then
-- fails leaves a row saying "in flight" forever, so the honest retry is refused
-- until a sweep removes it, which means a TTL job, which means a thing that can
-- be down. A unique index has no such state: the key and the row are written by
-- the same statement, so either both exist or neither does.
--
-- **It answers a question nobody asked.** `result jsonb` exists to replay what
-- the first attempt returned. Both writes here return `{ ok: true }`; there is
-- nothing to replay.
--
-- ## Unique per author, not globally
--
-- `unique (author_id, idempotency_key)` rather than `unique (idempotency_key)`.
-- The keys are client-generated, and a globally unique one lets any account
-- reserve a key that somebody else's future write would then collide with. It
-- would take guessing a v4 UUID, so it is not a plausible attack — but scoping
-- the constraint to the author costs nothing and removes the question.
--
-- ## Null is the ordinary case
--
-- Both indexes are partial. Every row written before this migration, by the
-- seed, by the importer, or by any caller that does not supply a key, has a null
-- key and cannot collide with anything. Idempotency is offered, not required.

alter table public.comments     add column idempotency_key text;
alter table public.time_entries add column idempotency_key text;

comment on column public.comments.idempotency_key is
  'Client-generated, stable across retries of one submission. Null for anything written without one.';
comment on column public.time_entries.idempotency_key is
  'Client-generated, stable across retries of one submission. Null for anything written without one.';

create unique index comments_idempotency_key
  on public.comments (author_id, idempotency_key)
  where idempotency_key is not null;

create unique index time_entries_idempotency_key
  on public.time_entries (profile_id, idempotency_key)
  where idempotency_key is not null;

-- The key is a retry token and nothing else. Bounding it stops a caller storing
-- a document in it, and 200 is generous for the UUID everything actually sends.
alter table public.comments
  add constraint comments_idempotency_key_length
  check (idempotency_key is null or char_length(idempotency_key) between 8 and 200);

alter table public.time_entries
  add constraint time_entries_idempotency_key_length
  check (idempotency_key is null or char_length(idempotency_key) between 8 and 200);
