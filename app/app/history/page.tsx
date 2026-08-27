import Link from "next/link";
import { notFound } from "next/navigation";

import { RevisionEntryDetails } from "@/components/app/revision-history";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { listRevisions, surfaceLabel } from "@/lib/data/revisions";
import { listProjects } from "@/lib/data/projects";
import { listTeam } from "@/lib/data/profiles";
import {
  ACTIONS,
  ACTION_LABEL,
  MAX_QUERY,
  OUTSIDE,
  SURFACES,
  activeHistoryFilterCount,
  parseHistoryFilters,
  toggleHref,
  type HistoryFilterSpec,
} from "@/lib/history-filters";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Version history" };

const WINDOW = 80;

/**
 * Every version of every document, across the whole workspace.
 *
 * ## Why this exists when the story panel already does
 *
 * The panel answers *"what happened to this story"*, and you have to already be
 * on the story to ask. This answers *"what happened on the 19th"*, and
 * *"what has Adam been rewriting"*, and *"who touched the sprint notes"* —
 * none of which start from a story, which is why `document_revisions` has
 * carried `work_item_id` and `sprint_id` since it was created and the migration
 * names this route as their reader.
 *
 * ## Six filters, and the state is the URL
 *
 * `PLAN.md` §11 asks for *"Search and filtering by person, content type,
 * project, date, and action"*. Every one of them is a query parameter, every
 * chip is a `<Link>`, and the date range is a real `<form method="get">` — so
 * the whole screen works before hydration, ships no JavaScript, and every
 * combination is somewhere a person can paste into a message. Same rule the
 * sprint table's filters follow, and the same one that makes a saved view
 * possible.
 *
 * The form re-emits the chip state as hidden inputs. Without that, submitting a
 * date would drop every chip on the screen — a GET form sends its own fields
 * and nothing else, which is the classic way a filter bar half-forgets itself.
 *
 * ## The prototype's side panel is not built, and the diff is not lost
 *
 * The design puts a `Diff preview` pane in a second column at ≥1180px, driven
 * by a selected row. Every entry carries its own diff here instead, inside the
 * `<details>` W4c built — which means the diff is computed on the server, ships
 * no JavaScript, is keyboard-operable and announced without anybody writing
 * `aria-expanded`, and reads the same on a phone as on a desktop. That decision
 * was made and recorded in W4c; repeating it here would have meant a selected-row
 * state, a round trip per selection, and a second diff renderer to keep honest.
 *
 * ## Restoring stays per surface
 *
 * Exactly as on the story panel, and for the reason `lib/data/revisions.ts`
 * states at length: a merged timeline is the right way to read history and the
 * wrong way to write it back.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const filters = parseHistoryFilters(await searchParams);
  const projects = await listProjects();

  // Slugs in the URL, ids in the query. A slug this workspace does not have
  // resolves to no id, and `projectIds: []` on a non-empty `filters.projects`
  // would silently mean "no project filter" — so the empty result is made
  // explicit rather than left to the absence of a clause.
  const projectIds = projects
    .filter((project) => filters.projects.includes(project.slug))
    .map((project) => project.id);
  const namesNothing = filters.projects.length > 0 && projectIds.length === 0;

  const [entries, team] = await Promise.all([
    namesNothing
      ? Promise.resolve([])
      : listRevisions(
          {
            surfaces: filters.surfaces,
            actors: filters.actors,
            q: filters.q || undefined,
            projectIds: projectIds.length ? projectIds : undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            actions: filters.actions,
          },
          WINDOW
        ),
    listTeam(),
  ]);

  // A story-level document is admin-and-lead only; the entry decides per
  // surface from there.
  const canRestore = profile.role === "admin" || profile.role === "lead";
  const active = activeHistoryFilterCount(filters);

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          every story, note, page, criterion and comment
        </Mono>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.022em]">Version history</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          What each document said before somebody changed it. Nothing here can be edited or removed —
          a restore writes a new version and leaves the ones in between readable, and records itself.
        </p>
      </Reveal>

      <Reveal tier="section" delay={0.06} as="section" aria-labelledby="filters">
        <h2 id="filters" className="sr-only">
          Search and filters
        </h2>

        {/* A real GET form, so search and the date range work before hydration
            and every result is a URL. The chips re-enter as hidden fields
            because a GET form submits its own inputs and nothing else. */}
        <form method="get" role="search" className="flex flex-wrap items-end gap-2">
          <Hidden spec={filters} />

          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <Mono size="meta" className="text-[var(--ink-faint)]">
              search the words
            </Mono>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              maxLength={MAX_QUERY}
              placeholder="A phrase somebody wrote"
              data-history-search
              className="min-h-11 w-full rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-3 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <Mono size="meta" className="text-[var(--ink-faint)]">
              from
            </Mono>
            <input
              type="date"
              name="from"
              defaultValue={filters.from}
              data-history-from
              className="min-h-11 rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-3 text-[13px] text-[var(--ink)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <Mono size="meta" className="text-[var(--ink-faint)]">
              to
            </Mono>
            <input
              type="date"
              name="to"
              defaultValue={filters.to}
              data-history-to
              className="min-h-11 rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-3 text-[13px] text-[var(--ink)]"
            />
          </label>

          <button
            type="submit"
            className="min-h-11 rounded-control border border-[var(--hairline-strong)] bg-[var(--raised)] px-4 text-[13px] font-medium text-[var(--ink)]"
          >
            Search
          </button>
        </form>

        <FilterRow label="Content type">
          {SURFACES.map((surface) => (
            <Chip
              key={surface}
              href={toggleHref(filters, "surface", surface)}
              on={filters.surfaces.includes(surface)}
            >
              {surfaceLabel(surface)}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Person">
          {team.map((person) => (
            <Chip
              key={person.id}
              href={toggleHref(filters, "actor", person.initials)}
              on={filters.actors.includes(person.initials)}
            >
              {person.fullName.split(" ")[0]}
            </Chip>
          ))}
          <Chip href={toggleHref(filters, "actor", OUTSIDE)} on={filters.actors.includes(OUTSIDE)}>
            Outside the app
          </Chip>
        </FilterRow>

        <FilterRow label="Project">
          {projects.map((project) => (
            <Chip
              key={project.id}
              href={toggleHref(filters, "project", project.slug)}
              on={filters.projects.includes(project.slug)}
            >
              {project.name}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Action">
          {ACTIONS.map((action) => (
            <Chip
              key={action}
              href={toggleHref(filters, "action", action)}
              on={filters.actions.includes(action)}
            >
              {ACTION_LABEL[action]}
            </Chip>
          ))}
          {active > 0 ? (
            <Link
              href="/app/history"
              data-clear-filters
              className="ml-1 inline-flex min-h-11 items-center rounded-control px-3 text-[12.5px] font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
            >
              Clear {active === 1 ? "the filter" : `all ${active}`}
            </Link>
          ) : null}
        </FilterRow>

        <Mono size="meta" className="mt-3 block text-[var(--ink-faint)]">
          {/* The count says what it is: a window, not a total. Claiming
              "N entries" for a `limit`ed read is the same class of lie as
              "$0.00" for a share nobody computed. */}
          {entries.length === 0
            ? "nothing matches"
            : entries.length < WINDOW
              ? `${entries.length} ${entries.length === 1 ? "version" : "versions"}`
              : `the ${WINDOW} most recent versions`}
          {" · every restore is itself recorded"}
        </Mono>
      </Reveal>

      <Reveal tier="section" delay={0.12}>
        {entries.length === 0 ? (
          <p className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
            {namesNothing
              ? "No project here has that name."
              : active > 0
                ? "Nothing matches these filters. Clear one to see more."
                : "No versions have been recorded yet. They appear here as soon as somebody edits a document."}
          </p>
        ) : (
          <ul
            data-history-list
            className="flex flex-col gap-1 rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-2"
          >
            {entries.map((entry) => (
              <li key={entry.id} data-history-entry>
                {/* `undefined` rather than `""` and `0` when a revision has no
                    resolvable target. All three are used to revalidate the page
                    the document lives on, and an empty slug would ask Next to
                    revalidate a route that does not exist. */}
                <RevisionEntryDetails
                  entry={entry}
                  itemKey={entry.target?.itemKey ?? undefined}
                  projectSlug={entry.target?.projectSlug || undefined}
                  sprintNumber={entry.target?.sprintNumber || undefined}
                  canRestore={canRestore}
                  target={
                    entry.target ? { label: entry.target.label, href: entry.target.href } : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </main>
  );
}

/**
 * The chip filters, as hidden fields on the search form.
 *
 * Without these, typing a date and pressing Search would drop every chip: a GET
 * form navigates to its own fields and nothing else, so the query string it
 * builds is the whole new URL. This is the same spec the chips' `href`s carry,
 * expressed the way a form can carry it.
 */
function Hidden({ spec }: { spec: HistoryFilterSpec }) {
  return (
    <>
      {spec.surfaces.length ? <input type="hidden" name="surface" value={spec.surfaces.join(",")} /> : null}
      {spec.actors.length ? <input type="hidden" name="actor" value={spec.actors.join(",")} /> : null}
      {spec.projects.length ? <input type="hidden" name="project" value={spec.projects.join(",")} /> : null}
      {spec.actions.length ? <input type="hidden" name="action" value={spec.actions.join(",")} /> : null}
    </>
  );
}

/** One labelled row of chips. The label is a real heading for a screen reader. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="mt-3 flex flex-wrap items-center gap-1.5">
      <Mono size="meta" className="w-[86px] shrink-0 text-[var(--ink-faint)]">
        {label.toLowerCase()}
      </Mono>
      {children}
    </section>
  );
}

/**
 * A filter chip that is a link.
 *
 * ## The state is in the accessible name, not in `aria-pressed`
 *
 * `aria-pressed` belongs to a button — a link with one is an axe violation, and
 * the gate here is axe. But a chip whose only difference between on and off is
 * a background colour says nothing to a screen reader, and
 * `01-DESIGN-SYSTEM.md` forbids colour as the sole carrier of meaning. So the
 * name carries it: *"Filter by Comment"* becomes *"Remove the Comment filter"*,
 * which is both the state and what activating it will do.
 *
 * `min-h-11` because §5's touch-target floor is 44px and this row is the first
 * thing a thumb meets on a phone.
 */
function Chip({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      data-filter-chip
      data-on={on ? "true" : undefined}
      aria-label={on ? `Remove the ${children} filter` : `Filter by ${children}`}
      className="inline-flex min-h-11 items-center rounded-control border px-3 text-[12.5px] font-medium"
      style={{
        background: on ? "var(--raised)" : "transparent",
        borderColor: on ? "var(--hairline-strong)" : "var(--hairline)",
        color: on ? "var(--ink)" : "var(--ink-muted)",
      }}
    >
      {children}
    </Link>
  );
}
