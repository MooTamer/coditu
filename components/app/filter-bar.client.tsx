"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal } from "lucide-react";

import { ComponentMultiPicker } from "@/components/app/component-picker.client";
import { ViewMenu } from "@/components/app/view-menu.client";
import { Mono } from "@/components/coditu/mono";
import { COMPONENT_MATCHES, type ComponentMatch } from "@/lib/components";
import type { ComponentRef } from "@/lib/data/components";
import type { SavedView } from "@/lib/data/saved-views";
import { useUrlWrite } from "@/lib/hooks/use-url-write";
import { control } from "@/lib/interactive";
import { activeFilterCount, type FilterSpec } from "@/lib/sprint-filters";
import { SORT_COLUMN_META, parseSort, type SortColumn } from "@/lib/sprint-sort";
import {
  STATUS_DISPLAY_ORDER,
  STATUS_LABEL,
  parseStatusFilter,
  type WorkItemStatus,
} from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * The panel's first line is `if (!open) return null`, so it has always drawn
 * nothing until the Filter button is pressed — and it has always been in this
 * page's entry bundle anyway. Deferred, and gated at the call site below so the
 * import is not even requested until it is wanted. Behaviour is unchanged in
 * both directions: closing unmounts it exactly as the internal early return did.
 *
 * `ssr: false` for the same reason as the export dialog: there is nothing to
 * server-render for a surface that does not exist until a click.
 */
const FilterPanel = dynamic(
  () => import("@/components/app/filter-panel.client").then((m) => m.FilterPanel),
  { ssr: false }
);

/**
 * PF-8's panel, deferred for the same reason and on the same terms as the
 * filter one: it does not exist until somebody presses Sort, and the app shell
 * had 3.6 KB of headroom when it was written. It carries `@dnd-kit`, which the
 * sprint table already pays for, so the lazy chunk is the panel itself.
 */
const SortPanel = dynamic(
  () => import("@/components/app/sort-panel.client").then((m) => m.SortPanel),
  { ssr: false }
);

/**
 * View mode and status filters, held in the URL.
 *
 * `?status=in_progress,ready&view=board` — so a view is shareable, survives a
 * reload, and the back button does what it looks like it does. Local state
 * here would mean "send me the board filtered to review" is a sentence
 * somebody has to type instead of a link they can paste.
 */
const DOT: Partial<Record<WorkItemStatus, string>> = {
  in_progress: "#2B57FF",
  in_peer_review: "#FFB020",
  in_qa: "#21E2C6",
  changes_requested: "#FF5F6D",
  ready: "#6B7A90",
  draft: "rgba(107,122,144,0.45)",
  blocked: "#FF5F6D",
  done: "#23C97F",
};

export function FilterBar({
  availableStatuses,
  components,
  activeComponents,
  match,
  projectSlug,
  filters,
  people,
  groupings,
  views,
  sprintId,
  starredViews,
}: {
  availableStatuses: WorkItemStatus[];
  /** Only the components this sprint actually touches. A menu of forty when
   *  twelve are on the board is a menu of twenty-eight dead ends. */
  components: ComponentRef[];
  /** Resolved from the URL against this project's registry, in URL order. */
  activeComponents: ComponentRef[];
  match: ComponentMatch;
  projectSlug: string;
  /** Type, assignee, reviewer, grouping and free text, from the URL. */
  filters: FilterSpec;
  /** Everybody this sprint could be filtered by, from its own rows. */
  people: { initials: string; fullName: string }[];
  /** The groupings this sprint actually uses. */
  groupings: number[];
  /** This project's saved views — the reader's own, plus everybody's shared. */
  views: SavedView[];
  /** Which saved views the reader has starred, as ids. */
  starredViews: Set<string>;
  /** The sprint on screen, for a view somebody pins to this week. */
  sprintId: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  /** Which rule a toolbar chip asked to open on. Null when Sort itself was pressed. */
  const [sortFocus, setSortFocus] = useState<SortColumn | null>(null);
  // PF-4. Every write below used to be a bare `router.replace`, which on a
  // dynamic route is a server round trip with no sign it is happening — the
  // reported "sorting does nothing for ~2s then sorts". `useUrlWrite` puts the
  // navigation in a transition and hands back which control is waiting on it.
  const { params, write, state } = useUrlWrite();

  // Read with the same parser the server sorts by, so the chips and the table
  // cannot disagree — an unrecognised column is dropped in both places rather
  // than guessed at in one.
  const sortStack = parseSort(params.get("sort"));

  // Through the same parser the server uses, so a link carrying retired values
  // lights up the right chips instead of none. The first toggle rewrites the
  // query string in the current vocabulary.
  const active = parseStatusFilter(params.get("status"));
  const view = params.get("view") === "board" ? "board" : "table";

  function toggleStatus(status: WorkItemStatus) {
    const next = new URLSearchParams(params);
    const on = active.includes(status);
    const updated = on ? active.filter((s) => s !== status) : [...active, status];
    if (updated.length) next.set("status", updated.join(","));
    else next.delete("status");
    write(next, `status:${status}`);
  }

  function setComponents(chosen: ComponentRef[]) {
    const next = new URLSearchParams(params);
    // SLUGS, not ids: a filtered view is a link somebody pastes into a comment,
    // and `?component=link-kachel,newspart&match=all` says what it is looking at.
    if (chosen.length) next.set("component", chosen.map((component) => component.slug).join(","));
    else {
      next.delete("component");
      // `match` on its own is noise in a URL nobody can act on.
      next.delete("match");
    }
    write(next, "component");
  }

  function setMatch(mode: ComponentMatch) {
    const next = new URLSearchParams(params);
    // `any` is the default, so it does not need saying.
    if (mode === "all") next.set("match", "all");
    else next.delete("match");
    write(next, `match:${mode}`);
  }

  function setView(mode: "table" | "board") {
    const next = new URLSearchParams(params);
    if (mode === "board") next.set("view", "board");
    else next.delete("view");
    write(next, `view:${mode}`);
  }

  const ordered = STATUS_DISPLAY_ORDER.filter((status) => availableStatuses.includes(status));
  const count = activeFilterCount(filters);

  return (
    <section className="flex flex-wrap items-center gap-[10px]">
      <div className="flex rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-[3px]">
        {(["table", "board"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            aria-pressed={view === mode}
            {...control(state(`view:${mode}`))}
            className={cn(
              "h-[30px] rounded-[7px] px-[14px] text-[13px] font-semibold capitalize",
              // Filter pills are the `micro` tier: 200ms, no blur. A pill does
              // not arrive, it changes — so this is a transition, not an entrance.
              "transition-[background-color,border-color,color] duration-[var(--dur-micro)] ease-[var(--ease-entrance)]",
              view === mode ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)]"
            )}
          >
            {mode}
          </button>
        ))}
      </div>

      <span aria-hidden className="h-6 w-px bg-[var(--hairline)]" />

      {/* Reading the sprint one component at a time. The same picker the table
          cells and the New item dialog use, minus the ability to add one —
          filtering by something that does not exist yet is not a thing. */}
      <div className="w-[220px] shrink-0">
        <ComponentMultiPicker
          variant="field"
          components={components}
          selected={activeComponents}
          projectSlug={projectSlug}
          canEdit
          allowCreate={false}
          onChange={setComponents}
          emptyLabel="all components"
          className="h-[32px]"
        />
      </div>

      {/* Only once there is something to combine. A pair of toggles offering to
          intersect one component with nothing is a control that cannot do
          anything, which is worse than no control. */}
      {activeComponents.length > 1 ? (
        <div className="flex rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-[3px]">
          {COMPONENT_MATCHES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMatch(mode)}
              aria-pressed={match === mode}
              {...control(state(`match:${mode}`))}
              title={
                mode === "any"
                  ? "Stories naming at least one of these components"
                  : "Stories naming every one of these components"
              }
              className={cn(
                "h-[26px] rounded-[6px] px-[10px] text-[12.5px] font-semibold",
                "transition-[background-color,color] duration-[var(--dur-micro)] ease-[var(--ease-entrance)]",
                match === mode ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)]"
              )}
            >
              match {mode}
            </button>
          ))}
        </div>
      ) : null}

      <span aria-hidden className="h-6 w-px bg-[var(--hairline)]" />

      {ordered.map((status) => {
        const on = active.includes(status);
        return (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatus(status)}
            aria-pressed={on}
            {...control(state(`status:${status}`))}
            className={cn(
              "flex h-8 items-center gap-2 rounded-pill border px-3 text-[13px]",
              "transition-[background-color,border-color,color] duration-[var(--dur-micro)] ease-[var(--ease-entrance)]",
              on
                ? "border-[var(--hairline-strong)] bg-[var(--canvas)] text-[var(--ink)]"
                : "border-[var(--hairline)] text-[var(--ink-muted)]"
            )}
          >
            <span aria-hidden className="size-[7px] rounded-[2px]" style={{ background: DOT[status] }} />
            {STATUS_LABEL[status]}
          </button>
        );
      })}

      {/* A view is a link, so this is the only control here that navigates
          rather than rewriting one parameter. */}
      <ViewMenu
        views={views}
        projectSlug={projectSlug}
        sprintId={sprintId}
        starredViews={starredViews}
      />

      {/* Type, assignee, reviewer, grouping and free text. Behind a button with
          a count, because four more dimensions inline wrap this bar to three
          rows at 1180px and push the table below the fold. */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        data-filter-button
        className={cn(
          "inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-control border px-3 text-[12.5px]",
          "transition-[border-color,color] duration-[var(--dur-micro)]",
          count > 0
            ? "border-[var(--hairline-strong)] font-medium text-[var(--ink)]"
            : "border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)]"
        )}
      >
        <SlidersHorizontal size={13} strokeWidth={1.8} aria-hidden />
        Filter
        {/* The count is dimensions, not values — one button, one number. The
            `sr-only` half is what makes it mean something out loud. */}
        {count > 0 ? (
          <>
            <Mono size="meta" aria-hidden className="text-[10px] text-[var(--accent)]">
              {count}
            </Mono>
            <span className="sr-only">{` — ${count} active`}</span>
          </>
        ) : null}
      </button>

      {/* ---- PF-8: the sort, read from the same `?sort=` the table sorts by ---- */}
      <button
        type="button"
        onClick={() => {
          setSortFocus(null);
          setSortOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={sortOpen}
        data-sort-button
        // Highlighted while ANY sort is active — the one thing the toolbar has
        // to say without being opened, because a table in an order nobody can
        // see an explanation for is the whole complaint PF-8 opens with.
        data-sort-active={sortStack.length > 0 ? "" : undefined}
        className={cn(
          "inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-control border px-3 text-[12.5px]",
          "transition-[border-color,color] duration-[var(--dur-micro)]",
          sortStack.length > 0
            ? "border-[var(--hairline-strong)] font-medium text-[var(--ink)]"
            : "border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)]"
        )}
      >
        <ArrowUpDown
          size={13}
          strokeWidth={1.8}
          aria-hidden
          className={sortStack.length > 0 ? "text-[var(--accent)]" : undefined}
        />
        Sort
        {sortStack.length > 0 ? (
          <span className="sr-only">{` — ${sortStack.length} active`}</span>
        ) : null}
      </button>

      {/* One chip per rule, in priority order, each reopening the panel on
          itself. The arrow is the direction; the word is the column. Together
          they are the whole rule, which is what makes the chip worth the room
          it takes rather than a second copy of the count. */}
      {sortStack.map((rule, index) => {
        const Arrow = rule.direction === "asc" ? ArrowUp : ArrowDown;
        const meta = SORT_COLUMN_META[rule.column];
        return (
          <button
            key={rule.column}
            type="button"
            data-sort-chip={rule.column}
            onClick={() => {
              setSortFocus(rule.column);
              setSortOpen(true);
            }}
            aria-haspopup="dialog"
            title={`${meta.label} — ${index + 1} of ${sortStack.length}`}
            className="inline-flex h-[34px] cursor-pointer items-center gap-[5px] rounded-chip border border-[var(--hairline)] bg-[var(--tint)] px-[9px] text-[12.5px] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)]"
          >
            <Arrow size={12} strokeWidth={2} aria-hidden className="text-[var(--accent)]" />
            {meta.label}
          </button>
        );
      })}

      {sortOpen ? (
        <SortPanel
          stack={sortStack}
          focusColumn={sortFocus}
          onClose={() => setSortOpen(false)}
        />
      ) : null}

      {panelOpen ? (
        <FilterPanel
          open
          onClose={() => setPanelOpen(false)}
          spec={filters}
          people={people}
          groupings={groupings}
        />
      ) : null}

      {/* The link this view IS, read from the URL rather than rebuilt from the
          controls above it.

          It used to reconstruct the query from `status`, `component` and
          `match` — which was correct until W7 made `sort` a real parameter, and
          then it went on printing `?sort=order_index` while the address bar
          said `?sort=deadline:asc,status:asc`. A hint that reconstructs is a
          second implementation of the URL, and it drifts the moment anything
          else learns to write one.

          `params.entries()` yields DECODED values, so this reads `deadline:asc`
          where `toString()` would show `deadline%3Aasc`. */}
      <Mono size="meta" className="ml-auto text-[var(--ink-faint)]">
        {(() => {
          const pairs = [...params.entries()].map(([key, value]) => `${key}=${value}`);
          // No parameters at all is the sprint's own order, which is what the
          // table is actually doing and what the drag handles write.
          return pairs.length ? `?${pairs.join("&")}` : "?sort=order_index";
        })()}
      </Mono>
    </section>
  );
}
