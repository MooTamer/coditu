"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { ClientMark } from "@/components/app/client-mark";
import { Mono } from "@/components/coditu/mono";
import { usePersistentFlag } from "@/lib/hooks/use-client-state";
import {
  projectSlugIn,
  spaceRowsFor,
  spaceStateFor,
  type SpaceProject,
} from "@/lib/project-spaces";
import { cn } from "@/lib/utils";

/**
 * Project spaces — the sidebar's second half, and the thing that lets the
 * topbar stop carrying a project switcher.
 *
 * ## Why this had to exist before breadcrumbs could
 *
 * The trail was written, tested and deliberately not mounted in W6c, because
 * the topbar already held a switcher naming the same project and the same
 * sprint as crumbs two and three. Two controls saying one thing, and at 1400px
 * neither of them fitting — every crumb truncated, "Coditu" down to 22px.
 *
 * The design does not have that problem because project switching lives *here*,
 * in the sidebar, where a tree has room to be a tree. So this is not decoration
 * on the way to breadcrumbs; it is the thing that makes room for them.
 *
 * ## Only where the sidebar has labels
 *
 * Hidden by `globals.css` below `--rail-wide` and whenever the sidebar is
 * collapsed — `display: none`, not `opacity: 0`, and the difference is
 * deliberate. A nav label fades because its icon survives and still needs a
 * name. A tree at 64px has no icon representation at all, so leaving it in the
 * accessibility tree would give a screen reader a dozen rows nobody sighted can
 * see and nobody can reach.
 *
 * ## `aria-current` stays exactly one
 *
 * "Exactly one `aria-current='page'`" is a spec here, asserted by `rail.spec.ts`
 * — it exists because a prefix test once lit two rail items at once. The nav
 * above owns it. A space row that IS the open page gets `aria-current="true"`
 * instead: *the current item in this set*, which is what a tree row means, and
 * which does not make the sidebar claim to be in two places.
 */
export function ProjectSpaces({
  projects,
  componentCounts,
  idPrefix = "rail",
}: {
  projects: SpaceProject[];
  /** Live components per project id. The registry row is a count, not a guess. */
  componentCounts: Record<string, number>;
  /**
   * Namespace for this instance's element ids.
   *
   * The 768–1179 drawer renders this component while the icon rail is still in
   * the document, so every id here — the heading and one per expandable space —
   * appeared twice the moment the drawer opened. `aria-controls` and
   * `aria-labelledby` both resolve to the FIRST match, so the drawer's
   * disclosure buttons pointed at the rail's lists.
   */
  idPrefix?: string;
}) {
  const pathname = usePathname();
  const currentSlug = projectSlugIn(pathname);

  if (projects.length === 0) return null;

  return (
    <div data-rail-spaces className="mt-5">
      <Mono
        size="eyebrow"
        as="h2"
        id={`${idPrefix}-project-spaces`}
        className="px-3 pb-1 text-[9.5px] tracking-[0.07em] text-[var(--ink-faint)]"
      >
        Project spaces
      </Mono>

      <nav aria-labelledby={`${idPrefix}-project-spaces`} className="flex flex-col">
        {projects.map((project) => (
          <Space
            key={project.id}
            project={project}
            componentCount={componentCounts[project.id] ?? 0}
            pathname={pathname}
            inside={project.slug === currentSlug}
            idPrefix={idPrefix}
          />
        ))}
      </nav>
    </div>
  );
}

/**
 * One project, and whatever is open beneath it.
 *
 * The disclosure is a component per project rather than a map over one state
 * object, because each one owns a `usePersistentFlag` and a hook cannot be
 * called in a loop whose length is the project count.
 *
 * Its default is the URL: the project you are looking at is open, the rest are
 * shut. That is context rather than preference, so it needs no storage to be
 * right on the first render — including the server's. Once somebody actually
 * toggles a space, their answer is stored per project and wins from then on.
 */
function Space({
  project,
  componentCount,
  pathname,
  inside,
  idPrefix,
}: {
  project: SpaceProject;
  componentCount: number;
  pathname: string;
  inside: boolean;
  idPrefix: string;
}) {
  const [open, setOpen] = usePersistentFlag(`coditu.space.${project.slug}`, inside);
  const rows = spaceRowsFor(project, componentCount);
  const state = spaceStateFor(project);
  const listId = `${idPrefix}-space-${project.slug}`;
  const href = `/app/projects/${project.slug}`;
  // `inside` is broader than this on purpose: the row is tinted anywhere under
  // the project, because that is "you are in here", but it is only *current*
  // on the one page it actually links to.
  const here = pathname === href;

  return (
    <div>
      <div
        className={cn(
          "flex items-center rounded-control",
          inside ? "bg-[var(--canvas)]" : "hover:bg-[var(--tint)]"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${open ? "Collapse" : "Expand"} ${project.name}`}
          title={`${open ? "Collapse" : "Expand"} ${project.name}`}
          className="flex h-9 w-6 shrink-0 cursor-pointer items-center justify-center rounded-control text-[var(--ink-faint)] hover:text-[var(--ink)]"
        >
          <ChevronRight
            size={12}
            strokeWidth={2.4}
            aria-hidden
            className={cn(
              "motion-safe:transition-transform motion-safe:duration-150",
              open && "rotate-90"
            )}
          />
        </button>

        <Link
          href={href}
          prefetch={false}
          title={project.name}
          aria-current={here ? "true" : undefined}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-[9px] rounded-control pr-2 text-[13px] outline-offset-2",
            inside ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-muted)]"
          )}
        >
          <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-[var(--hairline)]">
            <ClientMark logoPath={project.clientLogoPath ?? null} accentHex={project.accentHex ?? null} size={9} />
          </span>
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          {/* Only while the space is shut. Open, the sprints have their own
              rows directly beneath, and the project's name gets the 48px back
              — at 268px "MEINEvim components" truncates with the chip present
              and fits without it. */}
          {open ? null : (
            <Mono
              size="meta"
              className={cn(
                "shrink-0 text-[9.5px]",
                state.active ? "text-[var(--tone-jade-fg)]" : "text-[var(--ink-faint)]"
              )}
            >
              {state.label}
            </Mono>
          )}
        </Link>
      </div>

      {/* Rendered only when open. A hidden subtree costs a screen reader
          nothing here, but it costs the router a dozen `<Link>`s per project
          that nobody asked for. */}
      {open ? (
        <div id={listId} className="flex flex-col pb-1 pl-[26px]">
          {rows.map((row) => {
            const here = pathname === row.href;
            return (
              <Link
                key={row.key}
                href={row.href}
                prefetch={false}
                aria-current={here ? "true" : undefined}
                className={cn(
                  "flex h-[30px] items-center gap-[9px] rounded-control px-[10px] text-[12.5px] outline-offset-2",
                  here
                    ? "bg-[var(--canvas)] font-medium text-[var(--ink)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--tint)]"
                )}
              >
                <Mono size="meta" className="w-[22px] shrink-0 text-[9.5px] text-[var(--ink-faint)]">
                  {row.glyph}
                </Mono>
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <Mono size="meta" className="shrink-0 text-[9.5px] text-[var(--ink-faint)]">
                  {row.meta}
                </Mono>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
