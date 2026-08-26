"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { ComponentMultiPicker } from "@/components/app/component-picker.client";
import { Mono } from "@/components/coditu/mono";
import { COMPONENT_MATCHES, type ComponentMatch } from "@/lib/components";
import type { ComponentRef } from "@/lib/data/components";
import {
  STATUS_DISPLAY_ORDER,
  STATUS_LABEL,
  parseStatusFilter,
  type WorkItemStatus,
} from "@/lib/work-items";
import { cn } from "@/lib/utils";

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
}: {
  availableStatuses: WorkItemStatus[];
  /** Only the components this sprint actually touches. A menu of forty when
   *  twelve are on the board is a menu of twenty-eight dead ends. */
  components: ComponentRef[];
  /** Resolved from the URL against this project's registry, in URL order. */
  activeComponents: ComponentRef[];
  match: ComponentMatch;
  projectSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Through the same parser the server uses, so a link carrying retired values
  // lights up the right chips instead of none. The first toggle rewrites the
  // query string in the current vocabulary.
  const active = parseStatusFilter(params.get("status"));
  const view = params.get("view") === "board" ? "board" : "table";

  const write = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      // `scroll: false` — toggling a filter must not throw the reader back to
      // the top of a table they were part way down.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  function toggleStatus(status: WorkItemStatus) {
    const next = new URLSearchParams(params);
    const on = active.includes(status);
    const updated = on ? active.filter((s) => s !== status) : [...active, status];
    if (updated.length) next.set("status", updated.join(","));
    else next.delete("status");
    write(next);
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
    write(next);
  }

  function setMatch(mode: ComponentMatch) {
    const next = new URLSearchParams(params);
    // `any` is the default, so it does not need saying.
    if (mode === "all") next.set("match", "all");
    else next.delete("match");
    write(next);
  }

  function setView(mode: "table" | "board") {
    const next = new URLSearchParams(params);
    if (mode === "board") next.set("view", "board");
    else next.delete("view");
    write(next);
  }

  const ordered = STATUS_DISPLAY_ORDER.filter((status) => availableStatuses.includes(status));

  return (
    <section className="flex flex-wrap items-center gap-[10px]">
      <div className="flex rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-[3px]">
        {(["table", "board"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            aria-pressed={view === mode}
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
