"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusChip } from "@/components/coditu/status-chip";
import { Mono } from "@/components/coditu/mono";
import type { MyWorkItem } from "@/lib/data/my-work";
import { cn } from "@/lib/utils";

/**
 * My work on Home, as the three tabs the handoff gives it.
 *
 * It was two stacked lists — `Assigned to me` and `Waiting on my review` —
 * both always open, so the card was as tall as the sum of them and the second
 * heading was usually below the fold. `workTabs` in the prototype is
 * `Assigned / Reviewing / Due this sprint` with a count on each.
 *
 * **Due this sprint is derived, not fetched.** It is the assigned rows whose
 * `deadline` falls on or before the sprint's end date — the same rows, filtered
 * — so this adds no query, and a row can honestly appear under two tabs
 * because it honestly is both.
 */
type TabId = "assigned" | "reviewing" | "due";

export function HomeWorkTabs({
  assigned,
  reviewing,
  sprintEndsOn,
}: {
  assigned: MyWorkItem[];
  reviewing: MyWorkItem[];
  /** The active sprint's last day, or null when there is no active sprint —
   *  in which case there is nothing for "due this sprint" to mean and the tab
   *  is not offered. */
  sprintEndsOn: string | null;
}) {
  // Calendar dates, compared as ISO strings. Both are `date` columns rendered
  // in Cairo, so string order is date order and no `Date` is constructed —
  // invariant 5.
  const due = sprintEndsOn
    ? assigned.filter((item) => item.deadline !== null && item.deadline <= sprintEndsOn)
    : [];

  const tabs: Array<{ id: TabId; label: string; rows: MyWorkItem[] }> = [
    { id: "assigned", label: "Assigned", rows: assigned },
    { id: "reviewing", label: "Reviewing", rows: reviewing },
    ...(sprintEndsOn ? [{ id: "due" as const, label: "Due this sprint", rows: due }] : []),
  ];

  const [active, setActive] = useState<TabId>("assigned");
  const shown = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <>
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="My work">
        {tabs.map((tab) => {
          const on = tab.id === shown.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(tab.id)}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center gap-[7px] rounded-control px-[11px] text-[12.5px] md:h-[30px]",
                on
                  ? "bg-[var(--canvas)] font-semibold text-[var(--ink)]"
                  : "font-medium text-[var(--ink-muted)] hover:bg-[var(--tint)]"
              )}
            >
              {tab.label}
              <Mono size="meta" className="tabular-nums text-[var(--ink-faint)]">
                {tab.rows.length}
              </Mono>
            </button>
          );
        })}
      </div>

      {shown.rows.length ? (
        <ul className="mt-2 flex list-none flex-col">
          {shown.rows.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/projects/${item.projectSlug}/sprints/${item.sprintNumber}/items/${item.key}`}
                className="flex min-h-11 items-center gap-3 rounded-control px-2 py-[6px] hover:bg-[var(--tint)]"
              >
                <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                  {item.key}
                </Mono>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink)]">
                  {item.title}
                </span>
                <StatusChip status={item.status} />
                {item.deadline ? (
                  <Mono size="meta" className="w-[62px] shrink-0 text-right text-[var(--ink-faint)]">
                    {item.deadline.slice(5)}
                  </Mono>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13.5px] text-[var(--ink-muted)]">
          {shown.id === "assigned"
            ? "Nothing assigned — the sprint board is the place to pick something up."
            : shown.id === "reviewing"
              ? "Nothing waiting on you."
              : "Nothing of yours is due before this sprint ends."}
        </p>
      )}
    </>
  );
}
