/**
 * The two answers a database gives when it does not have a column yet.
 *
 * These are here because of a real outage: the migration adding
 * `sprints.notes_written_at` was applied to the local stack, the code that
 * reads it shipped, and every sprint page in production threw until the
 * migration caught up. Code reached production ahead of its schema — a
 * deployment-order problem, not a code problem, but the code is where it
 * becomes an error page.
 *
 * So the two places that touch that column ask for it and accept "no such
 * column" as an answer, which is what an expand/contract migration expects. On
 * a migrated database neither fallback runs and both cost nothing.
 *
 * **There are two codes, and they are not interchangeable.** A SELECT of a
 * missing column is refused by Postgres itself and comes back as `42703`. A
 * write is refused earlier, by PostgREST, against its cached schema — that is
 * `PGRST204`, and it never reaches Postgres to earn a SQL state at all. Reads
 * and writes therefore fail differently for the same missing column, which is
 * how the first version of this fix restored the sprint page while leaving the
 * notes editor silently broken.
 *
 * This is deliberately NOT a general "retry any failed query" helper. It is two
 * codes, at two call sites, for one column, with an end date: once every
 * environment has the column, both fallbacks can be deleted, and deleting them
 * is safe precisely because nothing depends on them being there.
 */

/** Postgres `undefined_column`. What a SELECT of a missing column returns. */
export const UNDEFINED_COLUMN = "42703";

/** PostgREST's schema cache refusing to write a column it does not know. */
export const UNKNOWN_COLUMN_IN_CACHE = "PGRST204";

/** Either way of being told the column is not there yet. */
export function isMissingColumn(code: string | undefined): boolean {
  return code === UNDEFINED_COLUMN || code === UNKNOWN_COLUMN_IN_CACHE;
}
