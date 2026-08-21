import { describe, expect, it } from "vitest";

import {
  UNDEFINED_COLUMN,
  UNKNOWN_COLUMN_IN_CACHE,
  isMissingColumn,
} from "@/lib/supabase/schema";

/**
 * Two codes mean "that column is not there yet", and they are not the same one.
 *
 * This exists because the difference caused a second bug while fixing the
 * first. `sprints.notes_written_at` shipped ahead of its migration and took
 * every production sprint page down with `42703`. The fix tolerated `42703` —
 * which restored the page, because a SELECT of a missing column is refused by
 * Postgres and carries a SQL state.
 *
 * A WRITE never gets that far. PostgREST refuses it against its own cached
 * schema and answers `PGRST204`, with no SQL state at all. So the sprint page
 * came back while the notes editor stayed broken, and it stayed broken
 * silently: the action returned its ordinary "those notes did not save"
 * sentence, which is indistinguishable from a network failure.
 *
 * Both codes are verified against a real local PostgREST, not from memory:
 *   SELECT of a missing column  -> {"code":"42703",   "message":"column sprints.notes_written_at does not exist"}
 *   PATCH  of a missing column  -> {"code":"PGRST204","message":"Could not find the 'notes_written_at' column ..."}
 */
describe("missing-column detection", () => {
  it("recognises the code Postgres returns for a refused read", () => {
    expect(UNDEFINED_COLUMN).toBe("42703");
    expect(isMissingColumn("42703")).toBe(true);
  });

  it("recognises the code PostgREST returns for a refused write", () => {
    // The one that was missed. A fallback checking only 42703 silently never
    // fires on a write, which is the worst kind of fallback: present, tested by
    // eye, and doing nothing.
    expect(UNKNOWN_COLUMN_IN_CACHE).toBe("PGRST204");
    expect(isMissingColumn("PGRST204")).toBe(true);
  });

  it("does not swallow anything else", () => {
    // The tolerance is for one temporary condition. A permission error, a
    // constraint violation or a dead connection must still surface — a helper
    // that treats every failure as "not migrated yet" hides real bugs behind a
    // fallback path.
    for (const code of ["42501", "23505", "23503", "PGRST116", "PGRST301", "", undefined]) {
      expect(isMissingColumn(code), `${code} must not be treated as a missing column`).toBe(false);
    }
  });
});
