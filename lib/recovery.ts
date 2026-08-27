/**
 * What a recovery rehearsal can check, and what each check is called.
 *
 * ## Why this is not in `lib/data/recovery.ts`
 *
 * Because that module is `server-only`, and the control that chooses which
 * checks to run is a client component. Importing this vocabulary from there
 * compiled, type-checked and linted clean — and then took `lib/supabase/server`
 * and `next/headers` into the browser bundle with it, which fails at build with
 * *"'server-only' cannot be imported from a Client Component module"* and shows
 * up as a blank page.
 *
 * `07-FIELD-NOTES.md` has this: **`server-only` is a bundler rule, so
 * `typecheck` and `lint` both pass.** It is the same split `lib/work-items.ts`
 * makes for the status vocabulary and `lib/history-filters.ts` for the revision
 * surfaces — the words live in a plain module, the reads live behind
 * `server-only`.
 */

export const RECOVERY_CHECKS = ["documents", "pages", "trash", "attachments"] as const;
export type RecoveryCheck = (typeof RECOVERY_CHECKS)[number];

export interface RecoveryFinding {
  check: RecoveryCheck;
  subject: string;
  detail: string;
}

/** What each check is called on screen. */
export const CHECK_LABEL: Record<RecoveryCheck, string> = {
  documents: "Documents replay",
  pages: "Pages replay",
  trash: "The bin is restorable",
  attachments: "Attachments resolve",
};

/** What each one actually asks, in the words the screen uses. */
export const CHECK_DETAIL: Record<RecoveryCheck, string> = {
  documents:
    "Rebuilds every story description from its newest version and compares it to the live row. Not “are there versions” — would replaying them give back what we have.",
  pages:
    "The same question for project and workspace pages, which are a separate check so an admin can ask about them without waiting on a workspace of attachments.",
  trash:
    "Every deleted story still has the sprint and project it would be restored into. One whose sprint went away is recoverable in principle and orphaned in practice.",
  attachments:
    "Every attachment row resolves to a file in the bucket. Managed database backups do not cover storage, so this is the one place where a healthy database says nothing.",
};
