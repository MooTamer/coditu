-- Coditu — profile pictures.
--
-- `profiles.avatar_url` has been in the schema since the first migration and
-- nothing has ever written to it. This is the bucket behind it.
--
-- ## Why this bucket is public when the other two are not
--
-- `work-attachments` and `comment-images` are private, served through signed
-- URLs with a one-hour TTL, and that is right for them: a screenshot dropped
-- into a comment is client work and can carry anything.
--
-- An avatar is not that. It is a small picture of a face that its owner chose
-- to show the team, and it appears in the rail, on every board card, in every
-- table row and beside every comment — dozens of times on a page, on pages that
-- re-render constantly. Signing it would mean either a storage round-trip per
-- person per render, or a URL that expires an hour into an open tab and leaves
-- a broken image with nothing to show for it. That second one is the failure
-- mode this repository keeps writing migrations about: it fails by *appearing
-- to work*, and only for whoever left the tab open.
--
-- Public means one stable URL, cached by the browser, costing nothing to render
-- and unable to expire. The trade is that anyone holding the URL can fetch the
-- image. The path is `<profile id>/<random uuid>.<ext>`, the bucket cannot be
-- listed without a key, and what the URL is worth is a photograph its owner
-- published to their colleagues. Recorded in docs/05-DECISIONS.md.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2 * 1024 * 1024,
  -- No SVG, for the same reason `uploadCommentImage` refuses it: it is a
  -- document format that can carry script, and this one would be rendered by an
  -- <img> on every screen in the app.
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- The column can only ever hold one of OUR objects.
--
-- `avatar_url` is client-writable: the "own profile update" policy lets you
-- write your own row, and `guard_profile_privilege_columns` deliberately says
-- nothing about a picture, because a picture is not a privilege. But the write
-- goes through PostgREST with the anon key, which ships in the browser bundle,
-- so "set your picture" without this constraint means "put any URL you like
-- into an <img> on every teammate's screen" — a way to serve them whatever you
-- want, and to collect their addresses, from a page they trust.
--
-- Same lesson as `handle_new_user` reading `raw_user_meta_data`: the form is
-- not the boundary, the endpoint is. The host is left open because it differs
-- between the local stack and the hosted project; the path is not.
alter table public.profiles
  add constraint profiles_avatar_is_our_own_storage
  check (
    avatar_url is null
    or avatar_url ~ '^https?://[^/]+/storage/v1/object/public/avatars/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(png|jpg|webp|gif|avif)$'
  );

comment on constraint profiles_avatar_is_our_own_storage on public.profiles is
  'A profile picture is an object in our own `avatars` bucket or nothing. The column is client-writable, so without this it is an arbitrary URL rendered in an <img> on every screen in the app.';

comment on column public.profiles.avatar_url is
  'Full public URL of an object in the `avatars` bucket, or null for the initials fallback. Written only by `setMyAvatar`, which uploads to a fresh random path every time — so the URL changes on every replacement and no cache can keep serving the old face.';

-- ---------------------------------------------------------------------------
-- Storage policies.
--
-- The bucket being public means the CDN path (`/object/public/avatars/…`) never
-- consults these at all. They govern the authenticated API path, which is what
-- the upload and the replacement go through.
-- ---------------------------------------------------------------------------

create policy "members read avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_active_member());

-- You write into your own folder and nobody else's.
--
-- `to authenticated` on its own is authentication, not authorization: it would
-- let any member drop a file into any other member's prefix. The first path
-- segment has to be the writer's own id, and `storage.foldername(name)` is how
-- you read it — `(…)[1]` is the first segment, Postgres arrays being 1-based.
create policy "own avatar upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Replacing a picture deletes the one it replaces, so this runs on every change
-- and not only on "Remove". An admin can delete anyone's, which is the same
-- escape hatch the other two buckets have: somebody has to be able to take down
-- a picture that should not be on the screen.
create policy "own avatar remove" on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.auth_role() = 'admin'
    )
  );
