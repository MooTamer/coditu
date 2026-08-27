import Link from "next/link";

import { Mono } from "@/components/coditu/mono";
import { RestoreVersion } from "@/components/app/restore-version.client";
import { blockChanges, summariseBlockChanges } from "@/lib/block-diff";
import { collapseUnchanged, diffLines, summariseDiff } from "@/lib/diff";
import { surfaceLabel, type RevisionEntry } from "@/lib/data/revisions";

/**
 * A story's version history — the timeline, a diff per entry, and a restore.
 *
 * ## A Server Component, and `<details>` rather than state
 *
 * The diffs are computed here, on the server, and arrive as markup. Expanding
 * an entry is a `<details>` element, so it works with no JavaScript at all,
 * arrives keyboard-operable and screen-reader-announced without anybody writing
 * `aria-expanded`, and costs nothing in the bundle. The only client code on this
 * panel is the restore button.
 *
 * That split is the lesson of W3d restated: a panel that is read constantly and
 * acted on rarely should not ship the acting half to everyone who reads it.
 * `lib/diff.ts` never reaches the browser.
 *
 * ## Two diffs, because one of them could not see half the changes
 *
 * The text diff (`lib/diff.ts`) walks `plain_text`, the flattened projection
 * stored beside each revision. It answers *"what words moved"* and it is the
 * right answer most of the time.
 *
 * It is blind to everything else. Bolding a word, turning a paragraph into a
 * callout, ticking a checklist item, changing a code block's language, pointing
 * a link somewhere new — every one of those leaves the flattened text identical,
 * and the entry used to say `formatting only` and then *"nothing to compare"*.
 * That is a label, not an answer, and it is the point at which a reader stops
 * trusting a version history.
 *
 * So when the text has not moved, the **block diff** (`lib/block-diff.ts`) runs
 * on the two stored `doc` trees and says which property changed on which block.
 * Both are server-side; neither reaches the browser.
 */
export function RevisionHistory({
  entries,
  itemId,
  itemKey,
  projectSlug,
  sprintNumber,
  path,
  canRestore,
}: {
  entries: RevisionEntry[];
  itemId: string;
  itemKey: string;
  /**
   * Where the document lives, for the restore's revalidation.
   *
   * Optional because a **page** has neither: it belongs to a project or to the
   * workspace, and never to a sprint. It passes `path` instead, which is the
   * route to revalidate — see `lib/actions/revisions.ts`.
   */
  projectSlug?: string;
  sprintNumber?: number;
  /** An exact route to revalidate after a restore. Used by pages. */
  path?: string;
  /**
   * Whether to offer the restore control at all.
   *
   * A hint, not a gate — the database decides, and it decides per surface. This
   * only avoids showing a button to somebody who can never use one, which is
   * every engineer on a story-level document.
   */
  canRestore: boolean;
}) {
  return (
    <section aria-labelledby={`history-${itemId}`} data-version-history>
      <Mono
        as="h2"
        id={`history-${itemId}`}
        size="meta"
        className="uppercase tracking-[0.06em] text-[var(--ink-faint)]"
      >
        Version history
      </Mono>

      {entries.length === 0 ? (
        <Mono size="meta" className="mt-3 block text-[var(--ink-faint)]">
          no versions recorded yet
        </Mono>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {entries.map((entry) => (
            <li key={entry.id}>
              <RevisionEntryDetails
                entry={entry}
                itemKey={itemKey}
                projectSlug={projectSlug}
                sprintNumber={sprintNumber}
                path={path}
                canRestore={canRestore}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One version, its diff, and its restore.
 *
 * Exported because `/app/history` renders the same thing across every story
 * rather than within one. The two screens differ in what they already know:
 * a story panel knows which story it is on, so its rows say
 * *"Description · v4"*; the workspace list does not, so it passes `target` and
 * the row says which story as well. Everything else — the diff, the collapse,
 * the `+`/`−` marks, the restore — is one implementation, because a second copy
 * is a second place for a diff to start lying.
 */
export function RevisionEntryDetails({
  entry,
  itemKey,
  projectSlug,
  sprintNumber,
  path,
  canRestore,
  target,
}: {
  entry: RevisionEntry;
  /**
   * Where the document lives, for the restore's revalidation.
   *
   * Optional because `/app/history` reads across a workspace and a revision
   * whose scope columns never resolved has no route to name — the row still
   * renders, it simply says nothing it cannot prove. Same choice
   * `previousKnown` makes about the diff.
   */
  itemKey?: string;
  projectSlug?: string;
  sprintNumber?: number;
  /** An exact route to revalidate after a restore. Used by pages. */
  path?: string;
  canRestore: boolean;
  /** Shown before the surface label when the reader does not already know. */
  target?: { label: string; href: string } | null;
}) {
  const label = surfaceLabel(entry.surface);
  // A null actor is any write that had no signed-in session: the seed, the
  // importer, a migration, a fix applied by hand in the SQL editor. Naming one
  // of them would be a guess, and "the importer" was wrong for three of the four.
  const who = entry.actor?.fullName ?? "written outside the app";

  // Only diff against something we actually have. A version whose predecessor
  // fell outside the fetched window would otherwise render as though the whole
  // document had just been written.
  const lines = entry.previousKnown ? diffLines(entry.previousText, entry.plainText) : [];
  const { lines: shown, elided } = collapseUnchanged(lines);
  const textMoved = lines.some((line) => line.mark !== "same");

  // Only when the words did not move. When they did, `lib/diff.ts` has already
  // answered and a second story about the same edit is noise — the block diff's
  // own header says so, and it returns `[]` for that case anyway.
  const blocks =
    entry.previousKnown && !textMoved && entry.revisionNo > 1
      ? blockChanges(entry.previousDoc, entry.doc)
      : [];

  const summary = !entry.previousKnown
    ? "earlier versions not loaded"
    : entry.revisionNo === 1
      ? "first version"
      : textMoved
        ? summariseDiff(lines)
        : summariseBlockChanges(blocks);

  // A story-level document is admin-and-lead only; a criterion or a comment is
  // not. Showing a restore an engineer cannot use would be a control that
  // exists to be refused.
  const offerRestore =
    canRestore ||
    entry.surface === "acceptance_criterion" ||
    entry.surface === "comment";

  return (
    <details className="group rounded-inner border border-transparent open:border-[var(--hairline)] open:bg-[var(--raised)]">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-1 rounded-inner px-2 py-[6px] marker:content-none">
        {target ? (
          <Mono size="meta" className="text-[11.5px] text-[var(--ink-muted)]">
            {target.label}
          </Mono>
        ) : null}
        <Mono size="meta" className="text-[11.5px] text-[var(--ink)]">
          {label} · v{entry.revisionNo}
        </Mono>
        <Mono size="meta" className="text-[11.5px] text-[var(--ink-faint)]">
          {who} · <time dateTime={entry.createdAt}>{stamp(entry.createdAt)}</time> · {summary}
          {entry.restoredFrom !== null ? ` · restored from v${entry.restoredFrom}` : ""}
        </Mono>
      </summary>

      <div className="px-2 pb-3">
        {blocks.length > 0 ? (
          // The answer the text diff could not give. A list rather than a
          // `<pre>` because these are sentences about the document, not lines
          // of it — and each one names the block position, so "paragraph 3"
          // means something a reader can point at.
          <ul data-block-diff className="flex flex-col gap-1">
            {blocks.map((change, index) => (
              <li
                key={`${entry.id}-block-${index}`}
                className="flex gap-2 text-[12px] leading-[1.5] text-[var(--ink-muted)]"
              >
                <Mono size="meta" className="w-8 shrink-0 text-right text-[var(--ink-faint)]">
                  {change.position === null ? "" : `#${change.position}`}
                </Mono>
                <span>{change.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {shown.length === 0 ? (
          blocks.length > 0 ? null : (
            <Mono size="meta" className="text-[var(--ink-faint)]">
              {entry.previousKnown
                ? "the words and the formatting are both unchanged — this version was written, and it matched"
                : "the version before this one is not loaded"}
            </Mono>
          )
        ) : (
          <>
            {elided > 0 ? (
              <Mono size="meta" className="mb-1 block text-[11px] text-[var(--ink-faint)]">
                {elided} unchanged {elided === 1 ? "line" : "lines"} hidden
              </Mono>
            ) : null}
            <pre className="overflow-x-auto rounded-inner border border-[var(--hairline)] bg-[var(--canvas)] p-2 text-[11.5px] leading-[1.6]">
              {shown.map((line, index) => (
                <div
                  key={`${entry.id}-${index}`}
                  className={
                    line.mark === "added"
                      ? "text-[var(--jade-ink)]"
                      : line.mark === "removed"
                        ? "text-[var(--amber-ink)] line-through decoration-[var(--hairline-strong)]"
                        : "text-[var(--ink-faint)]"
                  }
                >
                  {/* The mark is text, not only a colour — the whole diff is
                      otherwise invisible to anybody who cannot distinguish the
                      two hues, and `01-DESIGN-SYSTEM.md` forbids colour as the
                      sole carrier of meaning. */}
                  <span aria-hidden="true">{line.mark === "added" ? "+ " : line.mark === "removed" ? "- " : "  "}</span>
                  <span className="sr-only">
                    {line.mark === "added" ? "added: " : line.mark === "removed" ? "removed: " : ""}
                  </span>
                  {line.text || " "}
                </div>
              ))}
            </pre>
          </>
        )}

        {target ? (
          // In the body, not in the summary. A link inside a `<summary>` fights
          // the disclosure for the same click — activating it would toggle the
          // details as well — and nesting an interactive element inside another
          // is the kind of thing axe is right to complain about. The label
          // stays up top so a reader can scan for it; getting there is one of
          // the two things this expanded row offers.
          <p className="mt-2">
            <Link
              href={target.href}
              className="text-[12px] font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
            >
              Open {target.label}
            </Link>
          </p>
        ) : null}

        {offerRestore && entry.revisionNo > 0 ? (
          <div className="mt-2">
            <RestoreVersion
              surface={entry.surface}
              entityId={entry.entityId}
              revisionNo={entry.revisionNo}
              label={label}
              itemKey={itemKey}
              projectSlug={projectSlug}
              sprintNumber={sprintNumber}
              path={path}
            />
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** `20 Aug, 10:02` in Africa/Cairo — invariant 5, at the render edge. */
function stamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
