# Coditu — the story thread, and what a sprint pays

**A brief for Claude Code, working in this repository.**
Written 2026-08-24. Supersedes nothing; extends `docs/coditu-implementation-prompt.md` §13 with six
new workstreams. Read `CLAUDE.md` and `docs/06-PROGRESS.md` before the first line of code, as always.

**Why this is urgent.** The current sprint ends within days, and the team intends to run the *next*
sprint on this app for real — planning it, assigning it, logging it, discussing it, and being paid
from it. Workstream **F** is therefore not the last item on the list; it is the one that decides
whether the others matter. If time runs short, F ships and A–E ship partially. Not the reverse.

---

## 0. How to work on this

Everything in `CLAUDE.md` still holds, and three of its rules are load-bearing here:

- **The five invariants are not guidelines.** Invariant 2 (integer minutes, never floating hours) is
  the one this brief stresses hardest, because §5 introduces *money*, and money is the same class of
  problem: store minor units as integers, divide at the render edge only.
- **Every mutation is a Server Action**: zod-validate → re-check authorization server-side → write →
  revalidate. Every new table gets RLS with a **positive and a negative** pgTAP assertion.
- **Update `docs/06-PROGRESS.md` in the same commit as the work.** Never in a "update docs" commit.

Three additions specific to this brief:

1. **Audit before you build.** Several items below are already implemented, some of them well. Your
   first job on each is to *verify the existing behaviour against the corner-case list*, not to
   rewrite it. Where it already holds, say so in the ledger and move on — "E4 was mostly already
   done, and saying so is more useful than churning files" is the precedent in `06-PROGRESS.md`, and
   it is the right precedent here.
2. **Mobile is not a checkbox at the end.** Every workstream below has a mobile section and it is
   part of the definition of done, not a follow-up. `playwright.config.ts` runs three projects —
   `chromium` (everything), plus `mobile-safari` (iPhone 15) and `mobile-chrome` (Pixel 7), which
   run **only the seven files in `ON_A_PHONE`**: `mobile`, `a11y`, `pwa`, `marketing`, `navigation`,
   `item-detail`, `motion`. `comments.spec.ts`, `composer.spec.ts` and `sprint-table.spec.ts` are
   deliberately **not** on that list, and the reason is recorded: three projects seeding comments on
   one row delete each other's fixture. So a phone assertion for this brief belongs in
   `e2e/mobile.spec.ts` or `e2e/item-detail.spec.ts`, or in a new file you add to `ON_A_PHONE` —
   writing it into `comments.spec.ts` and expecting a phone to run it is a test that silently never
   executes on a phone. Say in the ledger which file each phone assertion landed in.
3. **Stop at the decision gates in §8.** Do not guess your way past them.

4. **Nothing is hardcoded. Everything that is a decision is editable in the interface.** This is a
   standing instruction from the team, and it outranks any convenience below. It has two halves:

   **(a) No magic numbers.** Any value that a human might reasonably want to change — a rate, a
   threshold, a cap, a default, a cut-off — lives in a table an admin edits, not in a `const` and
   not in a migration's `default`. Where this brief names a number (the $12 rate, the 25% share
   threshold, the 8MB image cap, the effective-from sprint, weekly capacity, a criteria cap), read
   it as *the initial value of a setting*, never as a constant. A constant that ships is a change
   request that needs a deploy, and this team deploys their own tool.

   **(b) No unreachable data.** A field that exists in the database and cannot be changed from the
   interface is a hardcode with extra steps. §6 inventories the ones this repo currently has, and
   they are more than you would guess: **a work item's title, description and highlight cannot be
   edited after creation**; **a comment cannot be edited or deleted** even though the actions and
   the RLS for it are written and tested and the "edited" badge already renders; **a time entry
   cannot be corrected or removed**, which after workstream E means a mistyped 8-hour entry silently
   changes what somebody is paid; **a work item cannot be deleted or moved to another sprint**; and
   **a client or a project can only be created in SQL** — there is no `lib/actions/projects.ts` at
   all. Fixing these is workstream F, and it is the workstream that matters most.

   The one thing (b) does **not** mean is "remove the guards". Authorization stays enforced
   server-side and in RLS. "Editable" means *there is a path for the person entitled to change it*,
   not *anyone may change anything*. Where the entitled set is currently drawn too tightly for a
   four-person team of developers, widen it deliberately, in a migration, with a pgTAP assertion
   both ways — never by deleting a policy.

Work the six workstreams **in this order**: **F first** (see the note above), then A → B → C → D → E.
A is a prerequisite for B; B and C share the same image-storage fix; D is independent; E is
independent of all of them and can be branched in parallel if you prefer, but do not interleave its
commits with A–D.

---

## 1. Workstream A — one rich-text editor, used in two places

### What exists

`components/app/comment-editor.client.tsx` is a TipTap editor with a toolbar (bold, italic, inline
code, code block + language select, link, bullet list, image), mention suggestions, paste/drop image
upload, `⌘⏎` to send, and `Esc` to step away. `components/app/comment-composer.client.tsx` wraps it
with draft persistence in `localStorage`, optimistic posting and rollback. `components/app/comment-body.tsx`
renders a stored document server-side by walking `lib/comments/schema.ts`'s allowlist — that file is
the security boundary and **must not** grow a `dangerouslySetInnerHTML`.

### A1 — the two reported bugs are already fixed. Prove it, then protect it.

Both of these appear to be done in the current tree. Verify each with a **red-green check** (break
it deliberately, watch the new spec fail, restore it) and leave a spec behind so it cannot regress.

**"Adding a link gives a weird browser popup."** `window.prompt` is gone; `LinkPopover` in
`comment-editor.client.tsx` replaces it. Confirm and cover:

- The popover is anchored under the toolbar, `left-2 right-2` on a phone and `sm:w-[320px]` above.
  **Test it at 390px inside the item bottom sheet**, not just on a standalone page — the sheet is a
  scroll container (`dialog-shell.client.tsx`, `touch-action: pan-y`) and the file's own comment
  claims "the composer is not inside a scroll container that would clip it". Verify that claim in
  the sheet, with the composer scrolled to the bottom of a long thread. If the popover is clipped or
  lands under the on-screen keyboard, portal it the way `cell-popover.client.tsx` does.
- `Escape` closes the popover and **nothing else** — not the item sheet behind it. Already handled
  with `stopPropagation`; assert it at 390px and at 1440px.
- Applying with an empty selection inserts the URL as its own link text (already implemented).
  Applying over a selection marks the selection. Applying over a selection that *already* has a link
  replaces the href. **Remove** unsets it.
- `normaliseHref` corner cases, each a unit test in `tests/`: `coditu.com` → `https://coditu.com`;
  `hello@coditu.com` → `mailto:…`; `https://x.com` unchanged; `localhost` → null (no dot);
  `localhost:3000` → currently null, decide and document which; a trailing `)` or `.` from a pasted
  sentence; an IDN host; a string with a tab or newline in it (must be refused — `isSafeHref` rejects
  whitespace, and that is the `java\tscript:` defence).
- A `javascript:` or `data:` href typed into the box never becomes a clickable anchor, at write time
  *and* at render time. `comment-body.tsx` already refuses it; keep the belt and the braces.
- `⌘K` / `Ctrl+K` opens the popover with the current href pre-filled. It does not today. **It also
  collides:** `components/app/topbar.client.tsx:56` registers a document listener on
  `⌘K`/`Ctrl+K` for the command palette, and it fires while the palette is closed — which is the
  point of it. Either give the editor precedence while it holds focus (`stopPropagation` in the
  capture phase, the pattern `comment-image.client.tsx` uses for `Escape`) or choose a different
  key. Whichever you pick, both shortcuts must still work in their own context, and the choice goes
  in the ledger.
- Paste a bare URL over a selected word and it becomes a link on that word (TipTap `linkOnPaste`).
  Paste a bare URL with nothing selected and `autolink` handles it.

**"Bold / italic / code should be pressable with no words yet."** `ToolbarButton` already calls
`event.preventDefault()` on `onMouseDown` so ProseMirror keeps its stored marks. Verify and extend:

- On a **touch device** the synthetic mouse event is not guaranteed. Assert on `mobile-safari` and
  `mobile-chrome`: focus an empty composer, tap **Bold**, type `x`, and the stored document contains
  a `bold` mark on `x`. If it fails, add the equivalent guard on `pointerdown` — do not "fix" it by
  calling `editor.commands.focus()` afterwards, which is the thing that loses the stored mark.
- Every toolbar button is pressable on an empty document: bold, italic, inline code, **code block**,
  **bullet list**, **link**, **image**. Code block on an empty paragraph must produce an empty code
  block with the language select visible; bullet list must produce an empty first bullet.
- `aria-pressed` reflects the *stored mark*, not just the selection mark, so the button lights up
  before there are any characters.
- Pressing Bold twice with no typing in between turns the stored mark off again.
- The toolbar row is horizontally scrollable rather than wrapping to two rows at 320px, and the
  active-language `<select>` does not push the image button off the end.

### A2 — extract the editor, do not copy it

§2 needs the same editor for acceptance criteria. **Do not duplicate the file.** Extract:

- `components/app/rich-text-editor.client.tsx` — the TipTap instance and the toolbar, taking a
  props object that declares which features are on: `{ mentions?: ProfileRef[]; images?: boolean;
  placeholder: string; ariaLabel: string; minHeight?: number; density?: "comfortable" | "compact";
  onSubmit?; onEscape?; }`. Criteria use `density: "compact"` (a shorter min-height and a tighter
  toolbar); comments keep today's.
- `comment-editor.client.tsx` becomes a thin configuration of it, and its behaviour must not change
  by one pixel. `e2e/comments.spec.ts`, `e2e/composer.spec.ts` and `tests/comment-rendering.test.ts`
  are the proof — they must pass **untouched**.
- The upload callback is injected, not imported, so the criteria editor can post to its own action
  without the comment editor learning about criteria.

Both editors stay **dynamically imported** (`next/dynamic`, `ssr: false`). TipTap and ProseMirror are
most of a route's budget; `npm run budgets` currently reports the app shell at ~109.9KB of 110KB, so
nothing here may enter the shell. Re-run `npm run budgets` before you commit and record the number.

### A3 — mobile contract for the editor

- No field under 16px (the coarse-pointer rule in the global stylesheet already does this — confirm
  the new editor inherits it and does not re-declare 13.5px).
- The toolbar stays visible while the on-screen keyboard is up. `viewportFit: "cover"` and
  `interactiveWidget: "resizes-content"` are already set in the exported viewport; verify the toolbar
  is not under the keyboard at 390×664 with the keyboard open. If `resizes-content` is not enough,
  pin the toolbar to the top of the editor rather than the bottom of the screen — a bottom-pinned
  toolbar and an iOS accessory bar fight each other.
- Every toolbar target ≥ 44px on a coarse pointer (the existing 28px buttons pass today only because
  the 34px row has no gaps; re-measure with `e2e/mobile.spec.ts`'s helper after the extraction).
- Typing near the bottom of the sheet scrolls the caret into view rather than leaving it under the
  keyboard.
- Long-press inside the editor opens the platform selection callout, not a Coditu menu that fights it.

**Verification (A):** `npm run lint` · `npm run typecheck` · `npm run test` ·
`npx playwright test e2e/comments.spec.ts e2e/composer.spec.ts` (chromium — these are not on
`ON_A_PHONE`, see §0.2) · `npx playwright test e2e/mobile.spec.ts e2e/item-detail.spec.ts` **on all
three projects**, carrying the empty-composer toolbar assertions and the link-popover-in-a-sheet
assertions · `npm run budgets`, with the number recorded.

---

## 2. Workstream B — acceptance criteria are rich documents

### The requirement

Acceptance criteria must be editable exactly the way a comment is: formatting, code snippets, pasted
and uploaded images, mentions, and full responsiveness. A criterion is still a **to-do item** — one
row, one checkbox, one position — and an image or a snippet belongs *inside* that row, indented
under it, not floating beside the list.

### B1 — the data model

`acceptance_criteria` today is `(id, work_item_id, body text not null, is_done, order_index,
created_at)`. `body` is read by three things that must not break: the CSV export, the Markdown
export and the client PDF (`docs/04-EXPORT-SPEC.md` — a client-facing contract), plus
`createWorkItem`'s `criteria: string[]` input and the Notion importer.

**Mirror the `comments` design exactly.** New migration
`supabase/migrations/2026MMDDHHMMSS_criteria_rich_body.sql`:

```
alter table public.acceptance_criteria
  add column body_json jsonb;
```

- `body` **stays**, `not null`, and becomes the *flattened text projection* of `body_json`, written
  in the **same transaction** by the same server code, via `flattenToText` from
  `lib/comments/schema.ts`. This is the `comments.body_json` / `comments.body_text` pattern and the
  reason for it is identical: search, export and previews must never disagree with the document.
- `body_json` is nullable, and null means "this criterion predates rich bodies". The renderer falls
  back to `body` as a paragraph. Backfill is a data migration you may run, but the code must work
  **without** it. The hosted database is behind — `20260824120000_components.sql` is *local only* as
  of this writing — so code that reads a new column must tolerate the column not being there yet.
  `lib/supabase/schema.ts` is the precedent and it is worth reading in full before you copy it: it
  distinguishes `42703` (a SELECT, refused by Postgres) from `PGRST204` (a write, refused by
  PostgREST's schema cache), because getting that wrong once restored the sprint page while leaving
  the notes editor silently broken. It also says, explicitly, that it is *not* a general
  retry-any-failed-query helper. Extend it deliberately for these call sites; do not generalise it.
- Extend `guard_criteria_columns` to name `body_json`. **This is not optional.** That function is an
  allowlist written as a denylist — a new column is silently writable by an engineer until it is
  named there. Same trap `20260824120000_components.sql` documents for `guard_work_item_columns`.
- Add the same `MAX_DEPTH` and length ceilings the comment path has. A criterion body over ~8,000
  flattened characters is not an acceptance criterion.

### B2 — the surface

`components/app/criteria-list.client.tsx` becomes an editable list:

- **Read mode** renders each criterion with the *same renderer as a comment* — reuse
  `comment-body.tsx` (rename it `rich-body.tsx` if you like, but do not fork it; there must remain
  exactly one place that walks stored ProseMirror JSON, because it is the security boundary).
- **Edit mode** is per-criterion and inline: tap/click the body → the `RichTextEditor` from A2 opens
  in place, pre-filled, with the checkbox and the drag handle still visible. `⌘⏎` or the Save button
  commits; `Esc` reverts and closes; clicking away commits (never silently discards).
- **Add** — a persistent "Add a criterion" affordance at the bottom of the undone group. Enter on an
  empty new criterion closes the composer instead of creating a blank row.
- **Delete** — an explicit control per row, with an undo toast rather than a confirm dialog (the
  team's own pattern for reversible destructive actions; a two-step confirm is used for
  deactivating a person because that one is not reversible in the same breath).
- **Reorder** — drag handle, with the *exact* sensor configuration
  `components/app/sprint-table.client.tsx` uses: `MouseSensor` at `distance: 6`, `TouchSensor` at
  `delay: 220, tolerance: 8`, `KeyboardSensor` with `sortableKeyboardCoordinates`, and full
  `Announcements`. A reorder you can only do with a mouse is a reorder half the team cannot do.
  Persist through a single-statement RPC, the way `reorder_work_items` does — not N updates over the
  wire, and not a partial write that RLS silently truncates.
- Images inside a criterion render as the **same thumbnail** as a comment image
  (`comment-image.client.tsx`) and are visually **indented under the criterion's text**, aligned to
  the text column, not to the checkbox — so a criterion with three screenshots still reads as one
  to-do item.
- Everything is optimistic with a rollback path and a visible error (invariant 4).

### B3 — authorization

The existing rule in `20260820120600_rls.sql` is: **admin or lead** may insert, delete or rewrite a
criterion; **assignee or reviewer** may only toggle `is_done`. That is too tight — see the resolved
gate at the top of §8: **the assignee and the reviewer may now edit a criterion's body too**, while
*insert* and *delete* stay with admin/lead. Extend `guard_criteria_columns` to name `body_json`,
widen its `body` rule to match, and assert both directions in pgTAP: an assignee may rewrite a body,
an unrelated engineer may not, and neither may touch `work_item_id` or `order_index`.

### B4 — corner cases, all of which must have a test or a written answer

- A criterion whose body is only an image, only a code block, or empty after an edit → an empty body
  is refused with a sentence, the same way `postComment` refuses an empty comment.
- The flattened `body` for an image-only criterion is `[image: alt]` (already what `flattenToText`
  produces) — check what that does to the CSV and the PDF and record the answer.
- `createWorkItem`'s `criteria: string[]` still works and now writes both columns.
- The Notion importer (`lib/import/notion.ts`) still writes criteria and does not regress.
- Two people editing the same criterion: last write wins, but the loser sees the new value after
  `router.refresh()` rather than their stale draft. Realtime (`components/app/realtime.client.tsx`)
  covers comments today — decide whether criteria join the subscription and say why either way.
- Ticking a criterion while its body is open in the editor does not discard the edit.
- A criterion added while the item sheet is open appears without a reload.
- Copy-paste of a whole criterion body between two criteria preserves marks and images.
- Pasting a Word/Notion/Google-Docs fragment does not smuggle in node types outside the allowlist —
  the renderer fails closed already, but the *stored* document should be clean; strip on paste.
- A very long single word (a URL, a base64 blob) does not blow the layout — `break-words` is set on
  paragraphs in `comment-body.tsx`; confirm it applies inside a list item too.
- 50 criteria on one item: the list virtualises or, better, is simply capped and says so. Decide.

### B5 — mobile

- Tapping a criterion's text opens the editor without also toggling the checkbox. The checkbox and
  the body are **separate targets**, both ≥44px on a coarse pointer. This is a behaviour change: the
  whole row is one button today.
- Drag-to-reorder does not hijack a scroll (that is what the 220ms `TouchSensor` delay is for).
- The editor opening does not scroll the sheet to the top.
- At 320px the toolbar, the checkbox and the drag handle coexist without horizontal overflow.
- Long-press on a criterion image opens the platform's image menu (save/share), and the *tap* opens
  the Coditu viewer.

**Verification (B):** `npm run db:test` with new positive **and negative** assertions for
`body_json` on insert, update, delete and the engineer guard · `npm run test` for the flattening and
the schema agreement · `npx playwright test e2e/item-detail.spec.ts e2e/mobile.spec.ts` **on all
three projects** (both are on `ON_A_PHONE`), axe clean on the open editor · `npm run e2e` green
overall · `npm run budgets`.

---

## 3. Workstream C — images in the thread

### C1 — the bug that matters most: the src expires

`uploadCommentImage` in `lib/actions/comments.ts` uploads to the private `comment-images` bucket and
returns **a signed URL with a one-hour expiry**, which is then stored verbatim inside `body_json`.
An hour later that URL is dead, and it is dead permanently, because the document holds the expired
string. Every image posted before today is already broken or will be.

**Confirm this first** (post a comment with an image, wait out the expiry or sign a URL with a 5s
TTL, reload) — do not take this brief's word for it. Then fix it properly:

- Store a **stable reference** in the document, not a signed URL. Either the bucket object path
  (`comment-images/<profile>/<uuid>.png`) behind a Coditu-owned route, or an `attachments` row id.
  `lib/comments/schema.ts`'s `isSafeImageSrc` already accepts same-origin `/…` paths, so a route
  handler at `app/api/attachments/[…]/route.ts` fits the existing allowlist with no change to the
  security boundary.
- That route **re-checks authorization on every request** (`is_active_member`), then streams or
  redirects to a freshly signed URL. It must not become an open proxy: validate that the path
  resolves inside `comment-images`, refuse `..`, refuse absolute URLs, and refuse anything outside
  the bucket. `tests/avatar-url.test.ts` already tests exactly this class of traversal for avatars —
  extend that test file's approach.
- Cache correctly: `Cache-Control: private, max-age=…` and never `public`. A client work screenshot
  must not land in a shared CDN cache.
- **Migrate the documents that already exist.** A data migration that walks `comments.body_json`
  (and, after B, `acceptance_criteria.body_json`), extracts the object path out of each stored signed
  URL, and rewrites `src` to the stable form. Idempotent, re-runnable, and it must leave a document
  it does not recognise completely untouched. Report how many rows changed.
- Register every upload in `public.attachments` (the table exists and is unused by this path) so an
  orphan sweep is possible later, and so RLS applies to the record as well as the object.

### C2 — presentation

`comment-image.client.tsx` already does the right thing — a `clamp(88px, 22vw, 132px)` thumbnail and
a `DialogShell` viewer at `zIndex: 90` with Escape captured so it does not close the item behind it.
Keep the design; make sure it also holds for criteria images (B2) and cover:

- **Thumbnail:** `max-w-full` so a 2400px panorama does not overflow a 320px column; `w-auto` so a
  tall screenshot is not squashed; `object-cover` keeps a row of them a row. Confirm both a very
  wide and a very tall image at 320px, 390px and 1440px.
- **Multiple images in one paragraph** wrap into a neat row and do not each take a line.
- **Loading:** `loading="lazy"`, `decoding="async"` (present). Add explicit `width`/`height` or an
  aspect-ratio box so the thread does not reflow as images arrive — a thread that jumps while you
  are reading it is the worst version of this feature. Store intrinsic dimensions on the image node's
  attrs at upload time; the renderer must tolerate their absence.
- **Failure:** a src that 404s renders a small, quiet "image unavailable" placeholder with the alt
  text — not a broken-image glyph, and not nothing.
- **Viewer:** pinch-to-zoom works on a phone (do not trap the gesture), the image is capped at
  `max-h-[76dvh]`, swipe-down or tap-outside closes, and focus returns to the thumbnail. If there is
  more than one image in the thread, left/right arrows and swipe move between them — decide whether
  that is in scope and say so either way.
- **Alt text:** today it is the filename. That is honest but poor. Let the author edit it from the
  editor (select the image → a small "Describe" affordance) and keep the filename as the default.
  Screen-reader users are why, and `axe` will not catch this one.

### C3 — upload, on both platforms

- Paste (`handlePaste`) and drop (`handleDrop`) already work on desktop. Verify **paste on iOS**
  (long-press → Paste with a screenshot on the clipboard) and **Android Gboard's** image insertion,
  which arrives as an `insertFromPaste` input event rather than a clipboard file on some keyboards.
  If Gboard does not work, the visible Image button is the documented fallback — say so in the ledger
  rather than leaving it silently broken.
- Multiple files pasted or dropped at once: today `files.find(...)` takes the first and drops the
  rest silently. Upload all of them, in order, with one progress indicator. Cap the batch and say so.
- **HEIC/HEIF from an iPhone.** `ALLOWED_IMAGE_TYPES` does not include it, so the current message is
  "Images only — PNG, JPEG, WebP, GIF or AVIF", which is useless to somebody holding an iPhone.
  Either accept and transcode server-side, or refuse with a specific sentence naming HEIC and telling
  them where the "Most Compatible" camera setting lives. Recommendation: refuse with the better
  sentence — transcoding pulls in a native dependency for a case iOS usually converts away on upload.
- The 8MB cap and the magic-number check in `lib/images.ts` stay. A file that lies about its type is
  refused by content, not by extension — that is already right.
- **Upload progress** on a slow connection: the current `uploading…` label is fine for a fast one; on
  3G an 8MB image is 30 seconds of no feedback. Show a determinate progress or at least a per-image
  placeholder in the document that resolves or disappears.
- A failed upload leaves **no** broken placeholder in the document (current behaviour — preserve it)
  and says why.
- The editor's draft in `localStorage` must not carry a half-uploaded image reference into the next
  session.
- Offline: an upload attempted with no connection fails with "check your connection", the draft
  survives, and nothing is lost.

**Verification (C):** a unit test for the path-traversal guard on the new route, extending
`tests/avatar-url.test.ts`'s approach · a spec that posts an image, forces the stored reference's
underlying signed URL to expire, reloads, and **the image still renders** — this is the regression
that matters and it is the one thing in workstream C that must not be skipped · the data-migration
row count recorded in the ledger · `npx playwright test e2e/comments.spec.ts` (chromium) and
`npx playwright test e2e/mobile.spec.ts e2e/item-detail.spec.ts` on all three projects · axe clean
on the open viewer.

---

## 4. Workstream D — finished criteria sink, and the table shows a ring

### D1 — auto-sort, without destroying manual order

Done criteria go to the bottom. The list's sort key is `(is_done ASC, order_index ASC)` — **derived
at the render edge, never written to `order_index`**. Ticking a box must not rewrite anybody's
manual ordering; un-ticking must return the criterion to exactly the position it held before.

- Drag-to-reorder rearranges **within** the group you are dragging in. Dragging an undone criterion
  cannot place it below a done one, and the drop targets reflect that.
- The optimistic state in `useOptimistic` must sort by the same key as the server does, or the row
  jumps once on tick and again on refresh.
- The move is **animated** — a `micro`-tier transition (200ms, no blur) or a view transition, and it
  respects `prefers-reduced-motion` by not animating at all.
- Focus stays on the checkbox that was just ticked, even though its DOM position changed. Keyed by
  criterion id, not by index.
- The count and the ring update optimistically with the tick.
- An `aria-live="polite"` region announces `"3 of 5 done"`. Do **not** announce the reorder itself;
  it is noise.
- **The export order is `order_index`, always.** CSV, Markdown and the client PDF must be
  byte-for-byte what `docs/04-EXPORT-SPEC.md` says. "Done last" is a reading affordance for the team,
  not a change to a client-facing contract. Add a test that asserts the export order is unaffected.

### D2 — a progress ring in the table, in place of `3/5`

`components/app/sprint-table.client.tsx` renders `{row.criteriaDone}/{row.criteriaTotal}` as text at
the end of the sticky Task cell. Replace it with a compact ring — the same gradient ring
`criteria-list.client.tsx` draws, at roughly 16–18px, so the sticky column does not grow.

Corner cases, and the first one is a real bug waiting to happen:

- **The gradient id.** `criteria-list.client.tsx` hard-codes `<linearGradient id="ringGrad">`.
  Render one ring per row and you have twelve elements sharing an id — invalid HTML, and `url(#ringGrad)`
  resolves to whichever the browser saw first. Use `useId()` per instance, or define the gradient
  **once** in a hidden SVG sprite and reference it. Assert there is exactly one `#ringGrad` in the
  DOM, or none.
- Zero criteria → render nothing at all (today's behaviour; keep it).
- All done → a full ring; consider a check glyph inside it, but not at the cost of legibility at 16px.
- The ring is **not** the only carrier of the information: `role="img"` with
  `aria-label="3 of 5 acceptance criteria done"`, so a screen reader and a `title`-less touch device
  both get the number. Do not put the number in a `title` tooltip only — that exact mistake is
  already recorded in `06-PROGRESS.md` for per-person sprint load, and a finger cannot open a tooltip.
- **Contrast on a grouping-tinted row.** The track colour must clear AA against `groupingTint`, not
  just against `--canvas`. `--ink-faint` measures 4.46:1 on a tinted mobile card — under AA — which
  is exactly how the last one of these got through. Recompute, do not assume.
- The ring appears on the **mobile cards** (`components/app/sprint-cards.tsx`) and the **board cards**
  (`components/app/sprint-board.tsx`) too, or the information disappears below 900px.
- It does not shift the row height, and it does not make the sticky Task column wider — measure.
- Reduced motion: the `stroke-dashoffset` transition is dropped, the ring still renders at the right
  value.

**Verification (D):** `npx playwright test e2e/sprint-table.spec.ts` (chromium) ·
`npx playwright test e2e/item-detail.spec.ts e2e/mobile.spec.ts` on all three projects, carrying the
ring's presence on the mobile cards and the separate checkbox/body targets · an export test proving
`order_index` order is unchanged · axe clean · a DOM assertion that the gradient id is unique across
a full table of rows.

---

## 5. Workstream E — what a sprint pays

This is the only workstream that adds a concept the app does not have. It changes the data model, so
it gets an ADR in `docs/05-DECISIONS.md`, a section in `docs/02-DATA-MODEL.md`, and a section in
`docs/03-APP-SPEC.md`. It does **not** change `docs/04-EXPORT-SPEC.md` — see E7.

### E1 — the rules, stated exactly

Every number in this section is an **initial value of an editable setting**, not a constant — see
§0.4(a) and the table in §F3. If you find yourself typing `12` or `0.25` into a `const`, stop.

1. The rate is **USD 12.00 per hour**, for the team as a whole — `app_settings.hourly_rate_cents`,
   admin-editable.
2. A sprint's **pot** is *every minute logged against every item in that sprint* × the rate.
   `pot_cents = total_minutes × 20`. Twelve dollars an hour is exactly twenty cents a minute, so the
   pot is an exact integer with no rounding anywhere. Do not compute it as `hours × 1200`.
3. The pot is split **equally** among that sprint's **confirmed participants**. Not proportionally.
4. **Only a developer can be a participant.** Adam Nafie is not a developer and takes no hours and no
   money. Mohamed Tamer, Abdelrahman Elkhateeb and Ahmed Yehia are. Encode this as a
   `profiles.is_developer boolean not null default false` column set by an admin — **never as a name
   or an email in code**. Add `is_developer` to `guard_profile_privilege_columns` (§B1's trap, again:
   a new profile column is writable by its owner until the guard names it).
5. **Nothing is paid without an explicit confirmation by an admin.** The app *proposes* a
   distribution; a human confirms it. The proposal defaults to every developer who logged at least
   `app_settings.payout_share_threshold_pct` — initially **25%** — of the sprint's total minutes, and
   the confirmation screen lists **every** developer who logged anything, with their share, so the
   admin can add or remove anyone before confirming. The threshold is a suggestion engine; the
   confirmed set is the truth.
6. Sprints before the **effective-from sprint** show *"not tracked"* — not zero. Zero is a claim;
   "not tracked" is the truth.

### E2 — schema

New migration, and every table gets RLS with positive **and** negative pgTAP assertions:

- `profiles.is_developer boolean not null default false` — admin-writable only, named in
  `guard_profile_privilege_columns`. Seed the three developers; leave everyone else false.
- `public.app_settings` — a single-row settings table (`id` with a `check (id = 1)` so a second row
  is impossible) holding:
  - `hourly_rate_cents int not null default 1200 check (hourly_rate_cents > 0)`
  - `payout_from_sprint_id uuid references public.sprints(id)` — the effective-from sprint
  - `usd_egp_rate_micros bigint` — the last known rate, stored as an **integer** (rate × 1,000,000),
    never a float
  - `usd_egp_fetched_at timestamptz`
  - `usd_egp_source text check (usd_egp_source in ('live','manual'))`
  - Admin-writable, readable by any active member.
- `public.sprint_payouts` — one row per confirmed distribution, **append-only**:
  - `sprint_id`, `confirmed_by`, `confirmed_at`
  - `total_minutes int` — the snapshot at confirmation
  - `hourly_rate_cents int`, `pot_cents int`
  - `usd_egp_rate_micros bigint`, `usd_egp_source text`
  - `superseded_at timestamptz` — a later confirmation supersedes an earlier one; the earlier one is
    never updated and never deleted.
  - A partial unique index so at most one **live** (non-superseded) payout exists per sprint.
- `public.sprint_payout_shares` — one row per participant per payout: `payout_id`, `profile_id`,
  `minutes_logged int`, `share_cents int`.
  - **`sum(share_cents) = pot_cents` exactly.** Split the remainder deterministically (ascending
    `profile_id`, one cent each, until it is gone) and assert the identity in a unit test with
    awkward numbers: 3 participants and a pot of 100 cents, 7 participants and 1 cent, a pot of 0.

**Invariant 2 restated for money:** integer minor units everywhere. Cents for USD, piastres for EGP,
`rate × 1e6` for the FX rate. A float never touches a stored value and never touches a sum. Division
happens at the render edge only, in `lib/format.ts`, beside `hours()`.

### E3 — the exchange rate

Fetch it live, with a manual fallback. Both of these are free, need no key, and were verified
returning EGP on 2026-08-24:

| Source | Endpoint | Shape |
|---|---|---|
| Primary | `https://open.er-api.com/v6/latest/USD` | `{ result, time_last_update_unix, rates: { EGP } }` |
| Fallback | `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json` | `{ date, usd: { egp } }` |

Rules:

- The fetch goes through `lib/circuit-breaker.ts` — deadline, bulkhead, breaker. That module exists
  for exactly this and its doc comment explains why a *slow* dependency is worse than a dead one.
- It is **cached and refreshed at most daily**, and it **never blocks a page render**. A page always
  renders from `app_settings.usd_egp_rate_micros` — the stored value is the source of truth for
  rendering; the fetch only ever *updates* it, in the background, on a schedule. A refresh that
  fails changes nothing visible except the "as of" line. Nothing in this repo currently uses
  `unstable_cache` or `'use cache'`, and Next 16 has moved this ground more than once — check what
  this version blesses before reaching for a cache primitive, and note that a `revalidate`d fetch is
  not a substitute for the stored value, because a cold instance would then render with no rate at
  all.
- Sanity-check the response before storing: a positive finite number within a plausible band (say
  1–1000 EGP/USD). A provider returning `0`, `null` or a string must not overwrite a good rate.
  Log and keep the old one.
- If both sources fail and there has never been a rate, show USD only and a one-line explanation
  with a link to set it manually. Never invent a rate; never show a stale one without its date.
- An admin can set the rate by hand in settings, which sets `usd_egp_source = 'manual'` and stops the
  live refresh from overwriting it until they switch back.
- **At confirmation, the rate is snapshotted onto `sprint_payouts`.** A confirmed sprint's EGP figure
  never moves again. This is the same principle as `sprints.notes_written_at` and as invariant 2:
  a number a person has agreed to is a record, not a live calculation.
- The UI always says which it is: `"EGP 50.86 / USD · live, 24 Aug 2026"` or `"… · set by hand"`.

### E4 — the confirmation flow

- Any active member can open the earnings screen and see the **provisional** figures for the current
  sprint, marked provisional, recomputed on every render from live time entries.
- An admin sees a **Confirm distribution** panel listing every developer who logged time, each with
  minutes, share of total, and a checkbox — pre-ticked for anyone at ≥25%. The pot, the per-person
  amount in USD and EGP, and the rate being used are shown **before** the button, not after.
- Confirming writes `sprint_payouts` + `sprint_payout_shares` and an `activity`-style record of who
  confirmed what and when. It is immutable.
- **If the underlying minutes change after a confirmation, the confirmation goes stale, loudly.**
  A banner on the earnings screen: *"Time logged on Sprint 12 has changed since this was confirmed —
  4.5 h added. The figures below are the confirmed ones."* The confirmed figures keep being shown;
  they do not silently drift. An admin re-confirms, which supersedes the previous row and leaves it
  in the table.
- Only an admin may confirm, checked in the Server Action **and** in RLS. Identify them by `role`,
  never by name.
- A sprint with zero logged minutes offers nothing to confirm and says so.
- A sprint before `payout_from_sprint_id` shows "not tracked" and has no confirm control at all.
- Confirming twice with no change in between is a no-op, not a second row.

### E5 — where it lives, and where it must never appear

You told me: everyone sees everyone's, **but not on any screen that gets shared with a client.**
That is a hard boundary, and it is the most important requirement in this workstream.

**Money appears only on:**

- `/app/earnings` — a new route: per sprint, the pot, the participants, each share in USD and EGP,
  and the confirmation state. Everyone active can read it; only an admin can confirm.
- `/app/settings` — a compact "Your earnings" card: this sprint's provisional figure, last confirmed
  sprint, and a link to `/app/earnings`.

**Money must never appear on, and there must be a test that asserts it:**

- `/app/projects/**` — the sprint board, the sprint table, the sprint header, the item detail, the
  report route and the PDF route. These are the screens that get shared.
- The CSV, Markdown and PDF exports. `docs/04-EXPORT-SPEC.md` is unchanged, byte for byte. The
  precedent is already set: components were deliberately kept out of the export because "the export
  is a client-facing contract".
- The command palette, push notification payloads, and `/app/my-work`.

Assert it **two ways**, because this is the one that costs a client relationship if it leaks:

1. A rendered-output assertion — load the sprint table, the board, an item, the report route and the
   PDF route on a sprint that *has* a confirmed payout, and assert none of the money strings, the
   currency symbols, or the words "earn"/"payout"/"rate" appear anywhere in the response.
2. A **source-level grep test**, the pattern `e2e/password.spec.ts` already uses to prove nothing in
   `app`, `components`, `lib` or `scripts` calls a Supabase API that sends mail: assert that nothing
   under `app/app/projects/` or the export modules imports the earnings data module or the payout
   tables. A rendered assertion proves today's markup; the grep proves the next person cannot add it
   by accident.

Do **not** put an Earnings link in the top bar or the desktop rail beside Sprint. Put it in the
account menu and in the mobile "More" sheet, where a shared screen does not advertise it.

### E6 — invariant 1, and how earnings do not break it

Invariant 1 says nothing is global and no query may return an item outside the active project's
scope. Earnings aggregate **across** projects — a person's money is the sum of their shares in every
sprint they worked. Resolve it this way and record it as an ADR:

> The earnings model aggregates **sprint-level totals**, never work items. `/app/earnings` lists
> sprints and money; it does not list, link to, or leak a single item title, key, client name or
> component. Each sprint row is still scoped to its own project by construction. Invariant 1 is about
> items; this view never touches one.

If a design draft starts wanting to show "which items made this money", stop — that is the invariant
talking, and the answer is no.

### E7 — corner cases

- A developer who logged time and is then **deactivated**: their confirmed shares stay, exactly as
  their time entries stay. `listTeam` includes deactivated people; the earnings screen must too, for
  historical rows.
- A time entry deleted by an admin after confirmation → the stale banner, not a silent recompute.
- A sprint reopened after being closed and confirmed → same.
- Two admins confirming concurrently → the partial unique index makes one of them lose; the loser
  gets a sentence, not a Postgres error.
- Rounding: 3 participants, pot 10001 cents → 3334 / 3334 / 3333, and the sum is 10001. Test it.
- The 25% threshold at exactly 25.0% → included (`>=`). State it in the UI: *"logged 25% or more"*.
- A non-developer who logged time: their minutes **count toward the pot** (per the rule you chose)
  but they take no share. Show this explicitly on the confirmation screen so it is never a surprise:
  *"Includes 2.0 h logged by Adam Nafie, who takes no share."*
- Everyone at 0% (nobody logged) → no proposal, no confirm button.
- Only one developer logged → they take 100%; still requires confirmation.
- The effective-from sprint being changed later → past confirmations are untouched; sprints newly
  brought into range become provisional and unconfirmed.
- Money is formatted with `Intl.NumberFormat`, `USD` and `EGP`, in `lib/format.ts` beside `hours()`,
  and it is the only place cents are divided by 100.

### E8 — mobile

`/app/earnings` is a phone screen first: a per-sprint card stack, no horizontal scroll at 320px, the
confirmation panel usable with a thumb, every target ≥44px, and the numbers legible without zooming.
The confirm action is a real form submission that works before hydration where it can be.

**Verification (E):** `npm run db:test` with new RLS assertions — a member reads, a member cannot
write `sprint_payouts`, an engineer cannot set `is_developer` on their own row, an engineer cannot
confirm, an admin can, and a second live payout per sprint is refused · `npm run test` for the
split-remainder identity, the cents arithmetic, the rate sanity band and the format helpers ·
`npx playwright test` for the flow, the stale banner, and the **leak assertions** in E5 ·
`npm run e2e` green on all three projects · `npm run budgets`.

---

## 6. Workstream F — the next sprint runs on this, for real

**Do this one first.** The team starts running a live sprint here within days. Everything in A–E is
an improvement to a tool; F is whether the tool can be used at all on day one. A gap found on the
morning of sprint planning is a gap that sends everyone back to Notion, and they will not come back.

### F1 — the rehearsal, run end to end, on a database that has never seen this data

Before writing a line of new code, **run the whole flow** and write down every place it stops. Do it
on a freshly reset local stack (`npm run db:reset`), signed in as each of the three roles in turn,
and do the whole thing a second time **on a phone at 390px**. This is a scripted walkthrough, not a
code review — you are the person who has to plan a sprint on Monday.

1. Sign in. Land somewhere useful.
2. **Create a client and a project.** (Spoiler: you cannot. There is no `lib/actions/projects.ts`
   and no UI. This is F2.1.)
3. **Create the next sprint** — number, name, start and end dates, and a goal. `createSprint` and
   `updateSprint` exist and `SprintManager` has edit and delete controls, so most of this works.
   `sprints.goal` does not: neither action writes it, and `grep -rn goal components/app app/app`
   returns nothing, so it is never rendered either. A whole column that no code path can write or
   read. (F2.6.)
4. **Start it.** One active sprint per project is enforced by a partial unique index; confirm the UI
   says something human when you try to start a second, not a Postgres error.
5. **Add ten work items** — the New item dialog, with title, type, status, description, highlight,
   assignee, reviewer, deadline, estimate, grouping, component, and a few acceptance criteria.
6. **Now change your mind about one**, the way anybody does the day after planning: rename it, fix a
   typo in the description, rewrite the highlight, move it to a different sprint, and delete one
   outright. (Spoiler: three of those five are impossible. F2.2, F2.4.)
7. **Attribute components** — including creating a new component in place from the row picker,
   renaming one, and archiving one.
8. **Assign and reassign** — from the table, from the board, from the item, on desktop and on a
   phone. Reassign to somebody who is then deactivated.
9. **Log time** — as three different people, on several days, including a same-day correction.
   Then correct a wrong one. (Spoiler: you cannot. F2.3.)
10. **Comment** — with a mention, a code block, a link, an image, and a reply chain. Then edit a
    comment and delete one. (Spoiler: no UI for either. F2.2.)
11. **Tick criteria**, watch the ring, watch them sink (workstream D).
12. **Filter, search, use the command palette, export** — CSV, Markdown, PDF.
13. **Close the sprint**, confirm the payout (workstream E), and open the next one.

Write the result up in `docs/06-PROGRESS.md` as a table: step, worked / did not, what was missing.
That table is the acceptance record for this workstream, and it is more valuable than any code you
write today.

### F2 — the gaps that are already known, and must be closed

These were found by reading the tree on 2026-08-24. Verify each still holds before fixing it — and
if the rehearsal finds more, they join this list.

**F2.1 — clients and projects can only be created in SQL.** `lib/actions/` has no `projects.ts`.
Add one: create and rename a client (name, website, logo, accent), create and rename a project (name,
slug, scope, accent, client), and archive a project. Admin-only, zod-validated, RLS-backed with
positive and negative pgTAP. Surfaced on `/app/projects`. Two details that will bite:

- The slug is in every URL. Renaming a project must either keep the slug or handle the redirect;
  decide and say which. Changing a slug silently 404s every bookmark the team has.
- `work_item_key_seq` is a **single global sequence** defaulting to `'COD-' || nextval(...)`. Every
  project's items are `COD-nnn` regardless of client. For a team about to take a second client
  that is a hardcode in a `default`, exactly the kind §0.4(a) is about. Either give `projects` a
  `key_prefix text` with its own sequence, or record explicitly why one shared prefix is right.
  Whatever you choose, existing `COD-` keys are immutable — they are in comments, exports and
  people's memories.

**F2.2 — a work item's own words cannot be edited, and neither can a comment.**

- `setWorkItemFields` accepts `deadline`, `estimateMinutes`, `grouping` and `type` — and nothing
  else. **Title, description and highlight have no path at all** after creation. `guard_work_item_columns`
  already treats them as admin/lead columns, so the database is ready; the action and the UI are not.
  Add them, with inline editing on the item detail (title as an editable heading, description and
  highlight as rich or plain multi-line fields — match `03-APP-SPEC.md`), optimistic with rollback.
- `editComment` and `deleteComment` are written, authorized, RLS-tested — **and called by nothing.**
  `grep -rn "editComment\|deleteComment" components app` returns nothing. The "edited" badge in
  `components/app/item-detail.tsx` renders a state no user can currently reach. Add the controls:
  author edits their own, author or admin soft-deletes, a deleted comment shows as withdrawn rather
  than vanishing (the schema comment on `comments.deleted_at` is explicit that this is the rule).
  The editor is the one from A2; the draft, the mention re-sync and the `edited_at` stamp all come
  along for free.

**F2.3 — a time entry cannot be corrected, and after workstream E that is a money bug.**
RLS already says `edit own time`, `delete own time`, and admins may delete any. There is no action
and no UI, so `logTime` is append-only in practice: type 8 hours instead of 0.8 and it is in the
sprint total forever. Add `updateTimeEntry` and `deleteTimeEntry` — own entries always, admin may
delete any — surfaced in `components/app/log-time.client.tsx` beside each entry. This interacts with
E4: a change to a confirmed sprint's minutes must trigger the **stale banner**, not a silent
recompute. Wire that up in the same commit, or the two features are individually correct and jointly
wrong.

**F2.4 — a work item cannot be deleted or moved.** No `deleteWorkItem` anywhere, and no way to move
an item to another sprint — which is what "this slipped, carry it over" means, and it will be the
single most common request in week one. Add both. Moving re-derives the project from the *target*
sprint and refuses a target in another project (invariant 1, the same guard
`guard_work_item_component_project` already applies to components — an item carrying a component
into a different project's sprint must be refused or have its component cleared, and you must decide
which and say so). Deleting cascades to criteria, comments and **time entries**, which is destroying
hours somebody logged — so it is admin-only, it warns with the hour count, and consider a soft
delete instead. Raise it at gate §8.6 if you think soft is right.

**F2.5 — weekly capacity is displayed everywhere and editable nowhere.** `profiles.weekly_capacity_minutes`
drives the load bars on People and `v_person_load`; `lib/actions/profiles.ts` has role, active,
password, name and avatar — no capacity. The docs say plainly that "role, capacity and access are
decisions *about* a person and are an admin's". Add the control on People, admin-only, in minutes
under the hood and hours at the render edge (invariant 2), and make sure it is named in
`guard_profile_privilege_columns`.

**F2.6 — the sprint goal is a dead column.** `sprints.goal` is in the schema and in
`SprintDetail`; nothing writes it and nothing renders it — `grep -rn "goal" components/app app/app`
returns nothing at all. A sprint goal is the first thing anybody types on planning day, so wire it
into `createSprint`, `updateSprint` and the sprint header. If the team would rather not have one,
drop the column instead — but do not leave a field in the schema that can only ever be null.

### F3 — settings, not constants

Create the `/app/settings` (or `/app/admin`) surface that `app_settings` from E2 needs, and put
**every** tunable in it, each with its current value, what it affects, and who may change it:

| Setting | Initial | Affects |
|---|---|---|
| `hourly_rate_cents` | 1200 | The pot (E1) |
| `payout_share_threshold_pct` | 25 | Who is *proposed* as a participant (E1.5) |
| `payout_from_sprint_id` | the current sprint | Which sprints are tracked (E1.6) |
| `usd_egp_rate_micros` + source | live | The EGP figure (E3) |
| `max_image_bytes` | 8 MB | Uploads (C3) |
| `default_weekly_capacity_minutes` | 2400 | New profiles (F2.5) |

Anything else this brief states as a number and you find yourself typing into a `const` belongs in
that table too. Read them server-side through one cached accessor, not by re-querying per component.
Every one of them needs a sane fallback if the row is missing, so a database that has not been
seeded still renders.

### F4 — first-run and cold-start

The next sprint starts on a database that is **not** the seeded local one. Assume nothing.

- A project with no sprints, a sprint with no items, an item with no criteria, no comments, no time,
  no component, no assignee — every one of these renders a real empty state with the action that
  fills it, never a blank panel or a crash. `components/app/no-sprint.tsx` exists; check its
  siblings do too.
- A person with no avatar, a profile with no picture, a team of one.
- The **hosted database is behind local** — `20260824120000_components.sql` and its two seeds are
  local-only. Before the team's first real sprint, every migration in this brief plus that one must
  be applied to production **in order, before the code that reads them**, and `06-PROGRESS.md` must
  say so explicitly with the order. This repo has already had one outage from exactly this.
- Ten new work items created in one sitting must not collide on `order_index` or the key sequence.
- Realtime: two people planning the same sprint in two browsers see each other's items appear.
- Every destructive action is either reversible or asks twice. Nothing in a first week should be
  unrecoverable by a person still learning where the buttons are.

### F5 — mobile

The whole rehearsal, at 390px, with a thumb. Specifically: creating a sprint, creating an item with
all its fields, assigning from the table (which is a card stack below 900px — check the card can do
everything the table row can, or that the item sheet can), logging time, and commenting with an
image. Anything that can only be done on a laptop must be listed in the ledger as such, deliberately,
not discovered on a Monday.

**Verification (F):** the rehearsal table in `docs/06-PROGRESS.md` · `npm run db:test` with positive
and negative assertions for every new policy (project create/rename/archive, comment edit/delete,
time-entry update/delete, item delete/move, capacity, settings) · `npm run test` for the settings
accessor and its fallbacks · new e2e specs for the create-project, edit-item, edit-comment,
correct-time and move-item flows, with the phone-facing half in `e2e/mobile.spec.ts` or
`e2e/item-detail.spec.ts` per §0.2 · `npm run e2e` green on all three projects · `npm run budgets`.

---

## 7. Cross-cutting definition of done

Nothing in this brief is done until all of the following are green **on the same tree**:

```bash
npm run lint
npm run typecheck
npm run test          # vitest
npm run db:test       # pgTAP, positive AND negative per policy
npm run e2e           # chromium + mobile-safari + mobile-chrome
npm run budgets       # app shell must stay under 110KB
```

Plus, per `CLAUDE.md`:

- `docs/06-PROGRESS.md` updated **in the same commit** as the work, with the commit hash and the
  command that proved it.
- An ADR in `docs/05-DECISIONS.md` for each of: the stable image reference (C1), criteria bodies as
  `body_json` + derived `body` (B1), done-last as a render-edge sort (D1), the earnings model and its
  relationship to invariant 1 (E6), the FX rate snapshot at confirmation (E3), **`app_settings` as
  the home of every tunable and why no rate or threshold is a constant (§0.4a, F3)**, **widening
  criterion-body edits to the assignee and reviewer, citing who asked (§8)**, **whatever is decided
  about the key prefix, the slug rename and item deletion (§8.4–6)**, and any place where
  correctness won over the brief.
- `docs/02-DATA-MODEL.md` updated for every new column, table, trigger, index and policy — including
  `app_settings`, the payout tables, `profiles.is_developer`, and every widened policy from F.
- `docs/03-APP-SPEC.md` updated for the criteria editor, the ring, `/app/earnings`, the settings
  surface, and every newly-editable field from F2 — a field that is editable in the app and absent
  from the spec is how the next person removes it by accident.
- **The F1 rehearsal table** in `docs/06-PROGRESS.md`: every step of the walkthrough, whether it
  worked, and what was missing. It is the acceptance record for the whole brief.
- `docs/04-EXPORT-SPEC.md` **unchanged**. If you believe it must change, that is decision gate §8.2.
- Commit small, in the repo's plain human-voice style, no conventional-commit prefixes.

**On the hosted database:** the ledger records that `20260824120000_components.sql` and its two seeds
are *local only*. Do not assume the hosted schema matches your local one. Every new migration in this
brief must be listed in `06-PROGRESS.md` under an explicit "not yet applied to the hosted database"
note with the exact order to run it, and every new column must be read through the
`isMissingColumn` tolerance pattern until it is confirmed applied. A page that throws `42703` on
every render because the code shipped before the column is the outage this repo has already had once.

---

## 8. Decision gates — stop and ask

Do not resolve these on your own judgement. Ask, wait, then record the answer in
`docs/05-DECISIONS.md`.

**Already resolved — do not re-ask:**

- **Who may edit a criterion's body.** Answered by the team on 2026-08-24: *"everything important
  should be editable, we are developers, don't lock anything as hardcoded."* So: **extend edit of
  the body to the assignee and the reviewer** — the same set that may already tick — and keep
  *insert* and *delete* at admin/lead so the shape of the scope stays a lead's call. Migrate
  `guard_criteria_columns` accordingly, with pgTAP both ways. Record it as an ADR citing this
  instruction, because it *is* an auth-model change and the next reader will want to know who asked.

**Still open:**

1. **Image lightbox navigation** — arrows/swipe between all images in a thread: in scope or not?
2. **Any change to `docs/04-EXPORT-SPEC.md`.** The export is a client-facing contract. If a criterion
   body containing an image or a code block makes the CSV or the PDF wrong, describe the problem and
   the options; do not pick one.
3. **A cap on criteria per item, or images per criterion** — and if there is one, it is a row in
   `app_settings` (§0.4a), not a constant. Only ask if you find a case where the absence of a cap is
   a real problem.
4. **The work-item key prefix** (F2.1): one shared `COD-` sequence for every client, or a per-project
   prefix. Existing keys are immutable either way.
5. **Renaming a project's slug** (F2.1): keep the old slug as a redirect, or refuse the rename.
6. **Deleting a work item** (F2.4): hard delete with a warning naming the hours it destroys, or a
   soft delete like `comments.deleted_at`. Recommendation: soft, for the same reason comments are —
   but it is the team's call, and it is their data.
7. Anything else that would touch the auth model, the data model or the export contract in a way
   this brief does not describe.

---

## 9. What must not change

- The five invariants. Any change that breaks one is a bug regardless of what it enables.
- `lib/comments/schema.ts` as an allowlist, and `comment-body.tsx` as the single place that walks
  stored JSON. No `dangerouslySetInnerHTML`, ever, on any path.
- The export contract in `docs/04-EXPORT-SPEC.md`.
- The app-shell budget: 110KB.
- The name "Strukture" stays absent from code, copy, metadata, filenames and assets.
- Restraint — but read it correctly. `CLAUDE.md`'s "do not add features that are not in the brief"
  bans **new concepts**: no epics, no story points, no workflow engine, no custom fields, no
  roadmap, no invoicing module. E is a read-out of hours the team already logs with one confirmation
  step, and nothing more. It does **not** ban making an existing field editable — a title you cannot
  correct and a comment you cannot fix are not restraint, they are an unfinished CRUD. Workstream F
  adds no concept at all; it finishes the ones already in the schema.
