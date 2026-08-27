import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The migration that declares a thing, found by looking rather than by name.
 *
 * Several tests here are drift guards: they read the SQL text and assert that a
 * TypeScript list still matches an enum, or that a function still carries an
 * explicit `order by`. Reading the TEXT rather than querying a database is
 * deliberate — it makes them fail on a machine with no Postgres, which is where
 * `npm run test` runs.
 *
 * They used to name the file. That is a hidden coupling between a unit test and
 * a filename, and it broke the moment the twenty-four unapplied migrations were
 * consolidated into one before deployment: `20260825110200_client_access.sql`
 * stopped existing and a test about a TypeScript enum failed with `ENOENT`,
 * which says nothing about what is actually wrong.
 *
 * So the question is asked the way it was always meant: *which migration
 * declares this?* The LAST one that does, because a later `create or replace`
 * is the definition in force, and the drift guard is about what the database
 * ends up with.
 */
const DIR = join(process.cwd(), "supabase", "migrations");

export function migrationContaining(needle: string): string {
  const files = readdirSync(DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of [...files].reverse()) {
    const sql = readFileSync(join(DIR, name), "utf8");
    if (sql.includes(needle)) return sql;
  }

  throw new Error(
    `No migration in supabase/migrations contains ${JSON.stringify(needle)}. ` +
      "Either the declaration was renamed, or the test is looking for text that no longer exists."
  );
}
