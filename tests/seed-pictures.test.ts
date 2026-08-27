import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COMMENT_IMAGE_BUCKET, objectKeyFromSrc } from "@/lib/attachments";
import { flattenToText, isSafeImageSrc, type ProseMirrorNode } from "@/lib/blocks/schema";

/**
 * The imported pictures, checked against the two things that decide whether
 * anybody ever sees them.
 *
 * `scripts/import-notion-export.mjs` writes one comment per work item that has
 * pictures on its Notion page, because the thread is the only surface in this
 * app that draws one. That comment is only useful if two separate files agree:
 * the document's `src` has to be a key `/api/attachments` will serve, and an
 * object has to exist at that key in the bucket that route reads. `seed.sql`
 * holds the first and `notion-attachments.json` holds the second, they are
 * written by the same script in the same run, and nothing until now noticed
 * when they disagreed — a mismatch renders as an image that silently fails,
 * which is the exact bug `lib/attachments.ts` exists to have fixed once.
 *
 * This runs without a database on purpose. The seeded state it describes is
 * asserted end to end by `db:test` and the e2e suite; those need a local
 * Supabase, and every worktree shares one, so they are not always available.
 * These four properties are checkable from the committed artefacts alone.
 */

const root = join(import.meta.dirname, "..");
const seed = readFileSync(join(root, "supabase", "seed.sql"), "utf8");
const manifest: { files: Array<{ bucket?: string; path: string }> } = JSON.parse(
  readFileSync(join(root, "supabase", "notion-attachments.json"), "utf8")
);

/**
 * The comments the seed inserts, as documents.
 *
 * Read out of the SQL rather than out of a database. The generator writes one
 * row per line in a known shape and doubles its quotes, which is enough to take
 * apart without a parser — and a parser here would be a second implementation
 * of the thing under test.
 */
function seededComments(): Array<{ doc: ProseMirrorNode; bodyText: string }> {
  const start = seed.indexOf("insert into public.comments");
  expect(start, "the seed has no comments section").toBeGreaterThan(-1);
  const section = seed.slice(start);

  const row = /'(?:[0-9a-f-]+)', '(?:[0-9a-f-]+)', '(?:[0-9a-f-]+)',\n {3}'((?:[^']|'')*)'::jsonb,\n {3}'((?:[^']|'')*)',/g;
  const out: Array<{ doc: ProseMirrorNode; bodyText: string }> = [];
  for (const match of section.matchAll(row)) {
    out.push({
      doc: JSON.parse(match[1].replace(/''/g, "'")) as ProseMirrorNode,
      bodyText: match[2].replace(/''/g, "'"),
    });
  }
  return out;
}

function imagesIn(node: ProseMirrorNode): ProseMirrorNode[] {
  const found: ProseMirrorNode[] = [];
  const walk = (n: ProseMirrorNode) => {
    if (n.type === "image") found.push(n);
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return found;
}

const comments = seededComments();
const images = comments.flatMap((c) => imagesIn(c.doc));
const servable = new Set(
  manifest.files.filter((f) => f.bucket === COMMENT_IMAGE_BUCKET).map((f) => f.path)
);

describe("the seed's imported pictures", () => {
  it("seeds comments at all", () => {
    // A guard on the reader above, not on the data: if the row shape ever
    // changes, every other test here would pass vacuously on an empty list.
    expect(comments.length).toBeGreaterThan(0);
    expect(images.length).toBeGreaterThan(0);
  });

  it("addresses every picture with a src the renderer will draw", () => {
    // `comment-body.tsx` returns null for anything `isSafeImageSrc` refuses,
    // which is a picture that is simply absent with nothing on screen to say so.
    const refused = images.filter((image) => !isSafeImageSrc(image.attrs?.src));
    expect(refused.map((i) => i.attrs?.src)).toEqual([]);
  });

  it("addresses every picture with a key /api/attachments will serve", () => {
    // The route matches the key against a shape rather than sanitising it, so a
    // key that is one character off is a 400, not a near miss.
    const unresolvable = images.filter((image) => objectKeyFromSrc(image.attrs?.src) === null);
    expect(unresolvable.map((i) => i.attrs?.src)).toEqual([]);
  });

  it("points every picture at an object the uploader actually pushes", () => {
    const missing = images
      .map((image) => objectKeyFromSrc(image.attrs?.src))
      .filter((key): key is string => key !== null && !servable.has(key));
    expect(missing).toEqual([]);
  });

  it("pushes no picture that no comment refers to", () => {
    // The other direction. An orphan in `comment-images` is bytes in a private
    // bucket that nothing can reach and nothing will ever clean up.
    const referenced = new Set(
      images.map((image) => objectKeyFromSrc(image.attrs?.src)).filter(Boolean)
    );
    expect([...servable].filter((path) => !referenced.has(path))).toEqual([]);
  });

  it("derives body_text the way the app derives it", () => {
    // `body_text` is what search, both exports and the notification preview
    // read — never the document. A seed that writes it with its own rule is a
    // seed whose rows read differently from every row a person writes.
    const wrong = comments
      .map((c) => ({ stored: c.bodyText, derived: flattenToText(c.doc).trim() }))
      .filter((c) => c.stored !== c.derived);
    expect(wrong).toEqual([]);
  });
});
