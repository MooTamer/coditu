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

/* -------------------------------------------------------------------------- */
/**
 * Everything below is here rather than in `lib/data/components.ts` for one
 * reason: that module begins `import "server-only"`, which is a BUNDLER rule,
 * so importing it from a unit test fails at runtime while `typecheck` and
 * `lint` both pass. The ordering rule below is pure arithmetic over three
 * fields and is exactly the kind of thing that must be unit-tested, so it
 * lives in a module with no such import and the loaders re-export it.
 *
 * Types were never the problem — they are erased, so `import type` across
 * that boundary is always fine. It is a runtime value that drags the whole
 * module across.
 */

/**
 * The component read models.
 *
 * Invariant 1 again, and by the same method the sprint read model uses: nothing
 * in here can be asked for "all components" or "all items". Every function
 * takes a project id and filters by it, and the dossier reaches items only
 * through `components.project_id`, which the database itself guarantees agrees
 * with the item's sprint — see `guard_work_item_component_project`.
 */

export interface ComponentRef {
  id: string;
  name: string;
  slug: string;
  kind: ComponentKind;
  isArchived: boolean;
  /**
   * The SPFx manifest's `officeFabricIconFontName`, verbatim, or null. Resolved
   * to a drawable glyph by `components/coditu/component-icon.tsx` — this layer
   * stays a faithful copy of what the delivery repository says.
   */
  icon: string | null;
}
/**
 * One row of `work_item_components`, as it comes back embedded.
 *
 * The component itself is nullable in the type only: the join column is
 * `not null` and the foreign key is enforced, so a null here means the embed
 * returned nothing — which is what happens if the select string is ever changed
 * without changing this mapper.
 */
export interface ComponentTag {
  position: number;
  createdAt: string;
  componentId: string;
  component: ComponentRef | null;
}

/**
 * The total order a work item's components render in.
 *
 * **This is the same order `primary_component_of()` applies in SQL**, and the
 * two are defined separately because neither side can import the other.
 * `tests/components.test.ts` reads the migration and asserts the key list
 * matches, the same way the status vocabulary is kept honest.
 *
 * It has to be total. `position` is deliberately neither unique nor dense — a
 * dense sequence would mean re-packing every sibling on each delete — so
 * `created_at` and then the id break the ties. Without the tiebreakers the same
 * item renders its chips in a different sequence on different reloads, which
 * reads as the data changing when nothing has.
 */
export const COMPONENT_TAG_ORDER = ["position", "created_at", "component_id"] as const;

export function orderComponentTags(tags: ComponentTag[]): ComponentTag[] {
  return [...tags].sort(
    (a, b) =>
      a.position - b.position ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.componentId.localeCompare(b.componentId)
  );
}

/** The components of one item, in order, with the embed's nulls dropped. */
export function componentsFromTags(tags: ComponentTag[] | null | undefined): ComponentRef[] {
  return orderComponentTags(tags ?? [])
    .map((tag) => tag.component)
    .filter((component): component is ComponentRef => component !== null);
}

/** The select fragment every caller embeds, so the shape cannot drift between them. */
export const COMPONENT_TAGS_SELECT =
  "work_item_components ( position, created_at, component_id, components ( id, name, slug, kind, is_archived, icon ) )" as const;

/** Map an embedded `work_item_components` array onto `ComponentRef[]`. */
export function toComponentTags(
  rows:
    | Array<{
        position: number;
        created_at: string;
        component_id: string;
        components: {
          id: string;
          name: string;
          slug: string;
          kind: string;
          is_archived: boolean;
          icon: string | null;
        } | null;
      }>
    | null
    | undefined
): ComponentRef[] {
  return componentsFromTags(
    (rows ?? []).map((row) => ({
      position: row.position,
      createdAt: row.created_at,
      componentId: row.component_id,
      component: row.components ? toComponent(row.components) : null,
    }))
  );
}

export function toComponent(row: {
  id: string;
  name: string;
  slug: string;
  kind: string;
  is_archived: boolean;
  icon: string | null;
}): ComponentRef {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind as ComponentKind,
    isArchived: row.is_archived,
    icon: row.icon,
  };
}

/* -------------------------------------------------------------------------- */

/**
 * How a multi-component filter combines.
 *
 * `any` — the story names at least one of the chosen components.
 * `all` — it names every one of them.
 *
 * The distinction earns its place on the responsiveness work: "Link Kachel OR
 * Tabs with Cards" is forty items across the project's history, "Link Kachel AND
 * Tabs with Cards" is the three that touch both, and those are different
 * questions with different answers.
 */
export const COMPONENT_MATCHES = ["any", "all"] as const;
export type ComponentMatch = (typeof COMPONENT_MATCHES)[number];

/**
 * `?match=` — anything unrecognised is `any`.
 *
 * `any` is the widening default on purpose: a filter that quietly narrows is a
 * filter that hides work, and a link written before this parameter existed has
 * no `match` at all.
 */
export function parseComponentMatch(value: string | null | undefined): ComponentMatch {
  return value === "all" ? "all" : "any";
}

/** The column's own constraint, restated — the only legal producer is `componentSlug`. */
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * `?component=a,b,c` — deduplicated, order preserved, garbage dropped.
 *
 * Shape-checked here and checked AGAIN against the project's own registry by the
 * caller, which is the guard that matters: a hand-edited query string naming
 * another client's component must resolve to nothing rather than to something.
 * This step only keeps the obvious rubbish out of the URL.
 */
export function parseComponentFilter(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of (value ?? "").split(",")) {
    const slug = raw.trim();
    if (slug && SLUG_SHAPE.test(slug)) seen.add(slug);
  }
  return [...seen];
}

/**
 * Does this item pass the filter?
 *
 * An empty filter passes everything — that is what "no filter" means, and it is
 * the case a `.every()` on an empty array gets right by accident and a hand
 * written loop usually gets wrong.
 */
export function matchesComponentFilter(
  itemSlugs: readonly string[],
  filterSlugs: readonly string[],
  match: ComponentMatch
): boolean {
  if (filterSlugs.length === 0) return true;
  const held = new Set(itemSlugs);
  return match === "all"
    ? filterSlugs.every((slug) => held.has(slug))
    : filterSlugs.some((slug) => held.has(slug));
}
