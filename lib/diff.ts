/**
 * A line diff, for showing what one version of a document did to the one before.
 *
 * ## Why this is written here rather than installed
 *
 * The obvious answer is `diff` or `jsdiff`, and the obvious answer is wrong for
 * this repo specifically. The app shell has a 110 KB budget it spent most of W1
 * getting under, and every dependency that renders a diff has to be reachable
 * from wherever the diff appears. This is fifty lines and it does not grow.
 *
 * It also does not need to be good. A history panel is read by somebody asking
 * "what changed on the 19th", and line granularity answers that. Word-level
 * diffing inside a changed line is a real improvement that nobody has asked for,
 * and adding it later changes nothing outside this file.
 *
 * ## Lines, and what a "line" is
 *
 * The input is `plain_text` — the flattened projection the revision stores
 * beside its document, written in the same statement, so it cannot disagree with
 * what the document said. Diffing the flattened text rather than walking two
 * ProseMirror trees is a deliberate simplification: a block tree diff has to
 * decide whether a paragraph that moved and gained a word is a move plus an
 * edit or a delete plus an insert, and every answer is wrong for some document.
 * Text lines have one obvious answer.
 *
 * The consequence, stated so nobody is surprised: **a change that alters only
 * formatting produces no diff lines.** Bolding a word, turning a paragraph into
 * a callout, or ticking a checklist item leaves the flattened text identical.
 * The version is still recorded — the trigger compares the document, not the
 * text — and the panel says "formatting only" rather than showing an empty diff
 * that reads like a bug.
 */

export type DiffMark = "same" | "added" | "removed";

export interface DiffLine {
  mark: DiffMark;
  text: string;
}

/** Splits on newlines and drops a single trailing blank, which every text ends with. */
function toLines(value: string | null | undefined): string[] {
  if (!value) return [];
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * The longest common subsequence table, in the O(n·m) form.
 *
 * Bounded rather than clever: `MAX_LINES` caps the table at 1200×1200, which is
 * 1.4M cells — a few milliseconds and a few megabytes, on documents far larger
 * than anything this app holds. Beyond that the diff degrades to "everything
 * removed, everything added", which is honest and instant. A quadratic
 * algorithm with no bound is how a 5,000-line paste becomes a hung request, and
 * `body_json` is a jsonb column that will store one happily.
 */
const MAX_LINES = 1200;

export function diffLines(before: string | null, after: string | null): DiffLine[] {
  const a = toLines(before);
  const b = toLines(after);

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text): DiffLine => ({ mark: "removed", text })),
      ...b.map((text): DiffLine => ({ mark: "added", text })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i…] and b[j…].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ mark: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // Removal before addition when the two are equally good, so a replaced
      // line reads "was this, is now that" rather than the other way round.
      out.push({ mark: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ mark: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ mark: "removed", text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ mark: "added", text: b[j] });
    j += 1;
  }

  return out;
}

/**
 * Drops long stretches of unchanged lines, keeping `context` either side.
 *
 * A story description is mostly unchanged between versions, and a panel that
 * shows forty identical lines to reach the two that moved has buried the answer
 * it exists to give. Returns the lines to render plus how many were elided, so
 * the panel can say so rather than silently hiding them — an elision nobody is
 * told about is indistinguishable from a diff that missed something.
 */
export function collapseUnchanged(
  lines: DiffLine[],
  context = 2
): { lines: DiffLine[]; elided: number } {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.mark === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k += 1) {
      keep[k] = true;
    }
  });

  // No changes at all: a formatting-only revision. Show the opening lines so the
  // panel has something to render, and let the caller say what happened.
  if (!keep.some(Boolean)) {
    return { lines: lines.slice(0, context * 2), elided: Math.max(0, lines.length - context * 2) };
  }

  return {
    lines: lines.filter((_, index) => keep[index]),
    elided: keep.filter((k) => !k).length,
  };
}

/** `+2 added, 1 removed`, or `formatting only` when the text is untouched. */
export function summariseDiff(lines: DiffLine[]): string {
  const added = lines.filter((l) => l.mark === "added").length;
  const removed = lines.filter((l) => l.mark === "removed").length;
  if (added === 0 && removed === 0) return "formatting only";
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} line${added === 1 ? "" : "s"} added`);
  if (removed > 0) parts.push(`${removed} line${removed === 1 ? "" : "s"} removed`);
  return parts.join(", ");
}
