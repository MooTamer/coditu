import { Mono } from "@/components/coditu/mono";
import { RestoreVersion } from "@/components/app/restore-version.client";
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
 * ## What the diff can and cannot show
 *
 * It diffs `plain_text`, the flattened projection stored beside each revision.
 * So a change that only alters formatting — bolding a word, turning a paragraph
 * into a callout, ticking a checklist item — produces no diff lines, and the
 * entry says "formatting only" rather than rendering an empty box that reads
 * like a bug. The version is real either way; the capture trigger compares the
 * document, not the text.
 */
export function RevisionHistory({
  entries,
  itemId,
  itemKey,
  projectSlug,
  sprintNumber,
  canRestore,
}: {
  entries: RevisionEntry[];
  itemId: string;
  itemKey: string;
  projectSlug: string;
  sprintNumber: number;
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
    <section aria-labelledby={`history-${itemId}`}>
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
              <Entry
                entry={entry}
                itemKey={itemKey}
                projectSlug={projectSlug}
                sprintNumber={sprintNumber}
                canRestore={canRestore}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Entry({
  entry,
  itemKey,
  projectSlug,
  sprintNumber,
  canRestore,
}: {
  entry: RevisionEntry;
  itemKey: string;
  projectSlug: string;
  sprintNumber: number;
  canRestore: boolean;
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

  const summary = entry.previousKnown
    ? entry.revisionNo === 1
      ? "first version"
      : summariseDiff(lines)
    : "earlier versions not loaded";

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
        <Mono size="meta" className="text-[11.5px] text-[var(--ink)]">
          {label} · v{entry.revisionNo}
        </Mono>
        <Mono size="meta" className="text-[11.5px] text-[var(--ink-faint)]">
          {who} · <time dateTime={entry.createdAt}>{stamp(entry.createdAt)}</time> · {summary}
          {entry.restoredFrom !== null ? ` · restored from v${entry.restoredFrom}` : ""}
        </Mono>
      </summary>

      <div className="px-2 pb-3">
        {shown.length === 0 ? (
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {entry.previousKnown ? "nothing to compare" : "the version before this one is not loaded"}
          </Mono>
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
