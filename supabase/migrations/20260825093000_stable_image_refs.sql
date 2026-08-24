-- Coditu — every picture already posted, made to work again.
--
-- ## The bug
--
-- `uploadCommentImage` returned a **signed URL with a one-hour expiry** and the
-- editor stored that string verbatim inside `comments.body_json`. An hour later
-- the picture was dead — permanently, because the document held the expired
-- URL, and nothing anywhere said so: the `<img>` simply failed. Every image
-- posted to this app before 2026-08-25 is already broken or on its way there.
--
-- The code fix is `/api/attachments/<key>`: a stable same-origin path that
-- never expires, served by a route that re-checks the reader and signs a fresh
-- URL per request. This is the other half — the documents that already exist.
--
-- ## What this does
--
-- Walks every `body_json` in `comments` and `acceptance_criteria`, finds image
-- nodes whose `src` points into the `comment-images` bucket, and rewrites that
-- `src` to `/api/attachments/<key>`. The token and the expiry go with the old
-- string; the object it named is untouched.
--
-- **Idempotent and re-runnable.** A src that is already `/api/attachments/…`
-- is left exactly as it is, so running this twice changes nothing the second
-- time. **A document it does not recognise is left completely alone** — no
-- reshaping, no key reordering, no whitespace: `jsonb_set` on the one path that
-- matched, and nothing else touched.
--
-- The row counts are reported by the `notice` at the end and recorded in
-- `docs/06-PROGRESS.md`.

-- ---------------------------------------------------------------------------
-- One more tunable, while we are here: how many images one paste may carry.
--
-- §0.4(a) again — this is a number a human might reasonably want to change, so
-- it is a column rather than a `const` in the editor.
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column max_image_batch int not null default 6 check (max_image_batch between 1 and 50);

comment on column public.app_settings.max_image_batch is
  'How many images one paste or drop may upload at once. Beyond it the editor says so rather than silently dropping the rest, which is what it used to do.';

-- ---------------------------------------------------------------------------
-- The rewrite.
-- ---------------------------------------------------------------------------

/**
 * Rewrite one document's image sources, in place.
 *
 * Recursive over `content`, because that is the only place a ProseMirror node
 * puts its children. Every other key on every node is copied through
 * untouched — the function rebuilds `content` and `attrs.src` and nothing else,
 * so a document with attributes this app has never heard of survives with them
 * intact.
 */
create or replace function public.rewrite_attachment_srcs(doc jsonb, depth int default 0)
returns jsonb
language plpgsql
immutable
as $$
declare
  child   jsonb;
  rebuilt jsonb := '[]'::jsonb;
  src     text;
  key     text;
begin
  -- The same ceiling `lib/comments/schema.ts` uses. A document deeper than this
  -- is not a comment somebody wrote.
  if depth > 24 or doc is null or jsonb_typeof(doc) <> 'object' then
    return doc;
  end if;

  if doc ->> 'type' = 'image' then
    src := doc #>> '{attrs,src}';
    if src is not null then
      -- Already stable: leave it exactly as it is. This is what makes the
      -- migration re-runnable.
      if src like '/api/attachments/%' then
        return doc;
      end if;
      -- `…/comment-images/<profile>/<uuid>.<ext>` with or without a token.
      key := substring(split_part(src, '?', 1) from '/comment-images/(.+)$');
      if key ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(png|jpg|webp|gif|avif)$' then
        return jsonb_set(doc, '{attrs,src}', to_jsonb('/api/attachments/' || lower(key)));
      end if;
    end if;
    -- Somebody else's image, or a shape we do not recognise. Untouched.
    return doc;
  end if;

  if jsonb_typeof(doc -> 'content') = 'array' then
    for child in select * from jsonb_array_elements(doc -> 'content') loop
      rebuilt := rebuilt || jsonb_build_array(public.rewrite_attachment_srcs(child, depth + 1));
    end loop;
    return jsonb_set(doc, '{content}', rebuilt);
  end if;

  return doc;
end;
$$;

comment on function public.rewrite_attachment_srcs is
  'Turns an expiring signed storage URL inside a stored document into a stable /api/attachments path. Idempotent; leaves anything it does not recognise byte-for-byte alone.';

do $$
declare
  n_comments int;
  n_criteria int;
begin
  with rewritten as (
    update public.comments c
       set body_json = public.rewrite_attachment_srcs(c.body_json)
     where c.body_json::text like '%/comment-images/%'
       and public.rewrite_attachment_srcs(c.body_json) is distinct from c.body_json
    returning 1
  )
  select count(*) into n_comments from rewritten;

  with rewritten as (
    update public.acceptance_criteria a
       set body_json = public.rewrite_attachment_srcs(a.body_json)
     where a.body_json is not null
       and a.body_json::text like '%/comment-images/%'
       and public.rewrite_attachment_srcs(a.body_json) is distinct from a.body_json
    returning 1
  )
  select count(*) into n_criteria from rewritten;

  raise notice 'stable image refs: % comments, % criteria rewritten', n_comments, n_criteria;
end$$;
