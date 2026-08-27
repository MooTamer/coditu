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

/* -------------------------------------------------------------------------- */

/**
 * The same asymmetry, one level up: the answers a database gives when it does
 * not have a **table** yet.
 *
 * The block above records that a missing *column* fails two different ways —
 * `42703` from Postgres on a read, `PGRST204` from PostgREST's cache on a
 * write. A missing *table* does exactly the same thing and it took an outage of
 * its own to notice.
 *
 * Nine call sites guarded on `42P01` alone, which is Postgres's
 * `undefined_table`. **PostgREST never lets that request reach Postgres.** It
 * resolves the table against its own cached schema first, and when the table is
 * not in that cache it answers `PGRST205` — so a guard written for `42P01` is a
 * guard that does not fire, and the read that was supposed to degrade to `[]`
 * throws a 500 instead.
 *
 * This is not hypothetical and it is not only about a fresh checkout.
 * `07-FIELD-NOTES.md` records that **PostgREST caches the schema and does not
 * notice a migration on its own**, and this project's migrations reach
 * production by hand. So the window between `supabase db push` and PostgREST
 * reloading is a window in which every new table answers `PGRST205` — which is
 * precisely the "code reached production ahead of its schema" case these guards
 * exist for, arriving through the one code they did not name.
 *
 * Found by reading the dev server's own log after a suite run: 44 ×
 * `Could not find the table 'public.recent_views' in the schema cache`,
 * 21 × the same for `public.pages`, and 8 × `PGRST200` for a relationship
 * between two of them.
 */

/** Postgres `undefined_table`. What a query against a missing table returns. */
export const UNDEFINED_TABLE = "42P01";

/** Postgres `undefined_function`. A missing RPC — same deployment-order case. */
export const UNDEFINED_FUNCTION = "42883";

/** PostgREST's schema cache refusing a table it does not know. */
export const UNKNOWN_TABLE_IN_CACHE = "PGRST205";

/**
 * PostgREST's schema cache refusing an EMBED whose foreign key it does not
 * know. A select like `page:pages ( title )` fails this way when `pages` is
 * new — the table may even be in the cache while the relationship is not.
 */
export const UNKNOWN_RELATIONSHIP_IN_CACHE = "PGRST200";

/**
 * PostgREST could not build its schema cache at all and is retrying.
 *
 * Transient, and it means the same thing to a reader: the API cannot answer
 * about this table yet. Degrading is the right response — an empty history
 * panel for a second beats a 500.
 */
export const SCHEMA_CACHE_UNAVAILABLE = "PGRST002";

/**
 * Any way of being told the table, function or relationship is not there yet.
 *
 * Deliberately broader than `isMissingColumn`: that one is two codes for one
 * column with an end date, this one is the general "the schema has not caught
 * up with the code" answer, and every reader that degrades to an empty list
 * wants all of it.
 */
export function isMissingRelation(code: string | undefined): boolean {
  return (
    code === UNDEFINED_TABLE ||
    code === UNDEFINED_FUNCTION ||
    code === UNKNOWN_TABLE_IN_CACHE ||
    code === UNKNOWN_RELATIONSHIP_IN_CACHE ||
    code === SCHEMA_CACHE_UNAVAILABLE
  );
}

/* -------------------------------------------------------------------------- */

/** Postgres `unique_violation`. */
export const UNIQUE_VIOLATION = "23505";

/**
 * Was this write refused because the row is already there under the same
 * retry token?
 *
 * A bare `code === "23505"` is not good enough. Every table here has other
 * unique constraints — a work item key, a project slug, a sprint number — and
 * treating any of them as "you already did this, carry on" would report success
 * for a write that genuinely failed. So the index name has to match too.
 *
 * PostgREST puts the constraint name in `details` (`Key (author_id,
 * idempotency_key)=(…) already exists.`) and in `message`; both are checked
 * because which one carries it has moved between versions, and being wrong here
 * fails in the silent direction.
 */
export function isDuplicateRetry(
  error: { code?: string; message?: string; details?: string } | null,
  indexName: string
): boolean {
  if (!error || error.code !== UNIQUE_VIOLATION) return false;
  return (error.message ?? "").includes(indexName) || (error.details ?? "").includes(indexName);
}
