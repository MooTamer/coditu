-- Realtime for the sprint board and the comment thread.
--
-- Supabase's `supabase_realtime` publication is empty by default: a client can
-- subscribe to a channel and receive nothing at all, with no error on either
-- side. The two tables below are the only ones anyone subscribes to — the
-- sprint's items, and a thread's comments.
--
-- This adds no column and changes no shape; it only tells Postgres to emit
-- change events for these tables. RLS still applies to what a subscriber
-- receives, so a person only ever sees changes to rows they could already read.
alter publication supabase_realtime add table public.work_items;
alter publication supabase_realtime add table public.comments;

-- `replica identity full` so an UPDATE payload carries the OLD row too. Without
-- it Postgres sends only the primary key for the previous state, and a client
-- cannot tell which sprint a row moved OUT of — which is exactly the case a
-- board has to handle when an item is reassigned to another sprint.
alter table public.work_items replica identity full;
