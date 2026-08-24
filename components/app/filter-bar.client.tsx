"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { ComponentPicker } from "@/components/app/component-picker.client";
import { Mono } from "@/components/coditu/mono";
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
  activeComponent,
  projectSlug,
}: {
  availableStatuses: WorkItemStatus[];
  /** Only the components this sprint actually touches. A menu of forty when
   *  twelve are on the board is a menu of twenty-eight dead ends. */
  components: ComponentRef[];
  activeComponent: ComponentRef | null;
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

  function setComponent(component: ComponentRef | null) {
    const next = new URLSearchParams(params);
    // The SLUG, not the id: a filtered view is a link somebody pastes into a
    // comment, and `?component=evim-themen-kachel` says what it is looking at.
    if (component) next.set("component", component.slug);
    else next.delete("component");
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
      <div className="w-[200px] shrink-0">
        <ComponentPicker
          variant="field"
          label="Component filter"
          components={components}
          value={activeComponent}
          projectSlug={projectSlug}
          canEdit
          allowCreate={false}
          onChange={setComponent}
          emptyLabel="all components"
          className="h-[32px]"
        />
      </div>

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

      <Mono size="meta" className="ml-auto text-[var(--ink-faint)]">
        {(() => {
          const parts = [
            active.length ? `status=${active.join(",")}` : null,
            activeComponent ? `component=${activeComponent.slug}` : null,
          ].filter(Boolean);
          return parts.length ? `?${parts.join("&")}` : "?sort=order_index";
        })()}
      </Mono>
    </section>
  );
}
