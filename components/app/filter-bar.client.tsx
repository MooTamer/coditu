"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Mono } from "@/components/coditu/mono";
import { STATUS_DISPLAY_ORDER, STATUS_LABEL, type WorkItemStatus } from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * View mode and status filters, held in the URL.
 *
 * `?status=dev_started,todo&view=board` — so a view is shareable, survives a
 * reload, and the back button does what it looks like it does. Local state
 * here would mean "send me the board filtered to review" is a sentence
 * somebody has to type instead of a link they can paste.
 */
const DOT: Partial<Record<WorkItemStatus, string>> = {
  dev_started: "#2B57FF",
  ready_for_peer_review: "#FFB020",
  in_review: "#21E2C6",
  changes_requested: "#FF5F6D",
  todo: "#6B7A90",
  draft: "rgba(107,122,144,0.45)",
  blocked: "#FF5F6D",
  done: "#23C97F",
};

export function FilterBar({ availableStatuses }: { availableStatuses: WorkItemStatus[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = (params.get("status") ?? "").split(",").filter(Boolean) as WorkItemStatus[];
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
              view === mode ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)]"
            )}
          >
            {mode}
          </button>
        ))}
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
        {active.length ? `?status=${active.join(",")}` : "?sort=order_index"}
      </Mono>
    </section>
  );
}
