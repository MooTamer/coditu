/**
 * Turning an activity row into a sentence.
 *
 * Rows are stored as `verb` / `field` / `from_value` / `to_value` rather than as
 * prose, so the feed can be re-worded — or translated — without rewriting
 * history. This is the one place that does the wording.
 *
 * ## Why it is not still inside `item-detail.tsx`
 *
 * The projects list says the same thing about the same rows, in a narrower
 * column. Two copies would be two chances for `/app/projects` to describe an
 * event differently from the item it happened on — and the wording is the only
 * part of an activity row a reader ever sees, so a disagreement there is a
 * disagreement about what happened.
 */

export interface ActivityLike {
  verb: string;
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  actor: { initials: string } | null;
}

/**
 * `AE changed status ready → in_progress`.
 *
 * A row with no actor reads as `system`, which is true: the triggers that
 * maintain rollups write with no `actor_id`, and `on delete set null` on the
 * foreign key means a deleted profile's history stays and stops naming them.
 */
export function describeActivity(entry: ActivityLike): string {
  const who = entry.actor?.initials ?? "system";
  if (entry.verb === "created") return `${who} created this item`;
  if (entry.field === "status") {
    return `${who} changed status ${entry.fromValue ?? "—"} → ${entry.toValue ?? "—"}`;
  }
  if (entry.field) return `${who} set ${entry.field} → ${entry.toValue ?? "—"}`;
  return `${who} ${entry.verb}`;
}
