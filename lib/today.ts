/**
 * Today, as a calendar date in Africa/Cairo.
 *
 * Its own module, and deliberately NOT in `lib/data/sprint.ts`: that file is
 * `server-only`, and the command palette needs this to log time from the
 * browser. Importing it from there poisons the client bundle with the whole
 * server data layer — which fails the build with an error about the import
 * chain rather than about the one function anybody wanted.
 *
 * Invariant 5: a `date` column is a calendar date with no timezone, so this
 * returns `YYYY-MM-DD` and never a `Date`. `en-CA` is the shortest way to get
 * ISO order out of `Intl`.
 */
export function todayInCairo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
