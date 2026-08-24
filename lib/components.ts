/**
 * The component vocabulary, defined once in TypeScript.
 *
 * A *component* is a thing a project is made of — one EVIM web part, one
 * extension, one feature of the React app. Work items point at one, so the
 * question "what has happened to the Newspart" is a query rather than a text
 * search over fifteen sprints of hand-typed titles.
 *
 * `component_kind` is the same two values in Postgres
 * (`supabase/migrations/20260824120000_components.sql`), and
 * `tests/component-kinds.test.ts` reads the migration and asserts they agree —
 * so this file and the schema cannot drift without the suite saying so.
 *
 * See docs/02-DATA-MODEL.md and docs/05-DECISIONS.md.
 */

import type { ChipTone } from "@/components/coditu/status-chip";

/** Declaration order of the `component_kind` enum, and the order it is offered in. */
export const COMPONENT_KINDS = ["react", "spfx"] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/**
 * In-app labels.
 *
 * "Microsoft web part" rather than "SPFx": the team says SPFx, everyone else in
 * the room says the Microsoft one, and this label is read in a picker by
 * whoever is filing the ticket.
 */
export const COMPONENT_KIND_LABEL: Record<ComponentKind, string> = {
  react: "React",
  spfx: "Microsoft web part",
};

/** One line of "which of these is mine", for the add-a-component form. */
export const COMPONENT_KIND_HINT: Record<ComponentKind, string> = {
  react: "A page or feature in a React app we host and deploy.",
  spfx: "A SharePoint Framework web part or extension, handed over as a folder.",
};

/**
 * Reuses the existing tone pair rather than introducing a colour. Two kinds do
 * not need a palette, and every hue this app adds is one more thing that has to
 * clear 4.5:1 in both themes.
 */
export const COMPONENT_KIND_TONE: Record<ComponentKind, ChipTone> = {
  react: "jade",
  spfx: "slate",
};

/**
 * The URL identity, derived from the name once and never again.
 *
 * Must satisfy the column's own check constraint — `^[a-z0-9]+(-[a-z0-9]+)*$`
 * — so this is the only place allowed to produce one. Diacritics are folded
 * rather than stripped: half the names in this project are German, and
 * "Überschrift" turning into "berschrift" is worse than a violated constraint,
 * because it looks like it worked.
 *
 * Returns an empty string when nothing survives (a name of only punctuation, or
 * only CJK, which NFKD does not decompose). The caller must treat that as
 * invalid input and say so — never send it to the database and let a check
 * constraint answer in Postgres.
 */
export function componentSlug(name: string): string {
  return name
    .normalize("NFKD")
    // Combining marks left behind by the decomposition above, written as
    // escapes: a literal combining accent in a source file is invisible in
    // every editor and gets eaten by the first tool that normalises the file.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // After the lowercase, so capital ẞ is folded to ß first and both forms
    // survive as "ss" instead of one of them vanishing into a hyphen.
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
