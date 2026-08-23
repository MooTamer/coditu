-- Coditu — where a device's push subscription lives.
--
-- ## What was there before
--
-- Nothing. "Notifications" were rows in `public.notifications`, surfaced as a
-- dot on My work and a list on `/app/my-work`. There was no service worker, no
-- `Notification.requestPermission` anywhere, no VAPID key and no push
-- dependency in the repository — **nothing had ever reached an operating
-- system**. A person had to open the app to find out they had been mentioned,
-- which is the opposite of what a notification is for.
--
-- ## What a row here is
--
-- One BROWSER on one DEVICE, not one person. The same human signing in on a
-- laptop and a phone produces two rows, and both should be sent to; a person
-- who clears their browser data produces a third and orphans the first.
-- `endpoint` is the push service's URL for that installation and is what
-- identifies it — hence the unique constraint, so re-subscribing the same
-- device upserts rather than piling up duplicates that would each deliver the
-- same notification again.
--
-- `p256dh` and `auth` are the subscription's public key and authentication
-- secret. They are what the payload is encrypted TO: without them a push can
-- only be a bare wake-up with no content. They are not credentials for this
-- application and they are useless without the VAPID private key, which lives
-- in the environment and never in the database.

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- The push service's URL for this installation. Unique, so a device that
  -- re-subscribes replaces its row instead of doubling its notifications.
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  -- Only so a person can tell their own devices apart in Settings. Never used
  -- to decide anything.
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'One row per browser per device, keyed by the push service endpoint. Deleted when the push service answers 404 or 410, which is how it says the installation is gone.';

comment on column public.push_subscriptions.endpoint is
  'The push service URL. Unique: re-subscribing the same device must upsert, or every notification arrives twice.';

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- ---------------------------------------------------------------------------
-- RLS: your own devices, and nobody else's.
--
-- Every operation, not just select. A subscription is a live channel into
-- somebody's lock screen: being able to INSERT one against another profile's id
-- would be a way to have this application push whatever it sends them to a
-- device you control, and being able to DELETE theirs would be a way to switch
-- their notifications off silently.
--
-- `with check` on the update as well as `using`, or a person could move their
-- own row onto somebody else's `profile_id` — the trap the Supabase guidance
-- calls out and the reason every update policy in this schema carries both.
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "own push subscriptions read" on public.push_subscriptions
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "own push subscriptions insert" on public.push_subscriptions
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy "own push subscriptions update" on public.push_subscriptions
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "own push subscriptions delete" on public.push_subscriptions
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- The server sends the pushes, so it reads and prunes them.
--
-- `service_role` bypasses RLS policies but not table GRANTs — the third time
-- this schema has needed that line, and it fails the same way every time: a
-- bare 42501 that surfaces as a feature quietly not working.
--
-- SELECT to find the recipients' devices; DELETE because a push service
-- answering 404 or 410 is telling us that installation is gone and the row
-- must not be retried forever. No INSERT and no UPDATE: a subscription is
-- created by the browser that owns it, through its own session, or not at all.
-- ---------------------------------------------------------------------------
grant select, delete on public.push_subscriptions to service_role;
