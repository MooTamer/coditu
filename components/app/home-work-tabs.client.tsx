"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

import { StatusChip } from "@/components/coditu/status-chip";
import { Mono } from "@/components/coditu/mono";
import { dueThisSprint, type SprintScope } from "@/lib/home";
import type { MyWorkItem } from "@/lib/data/my-work";
import { cn } from "@/lib/utils";

/**
 * My work on Home, as the three tabs the handoff gives it.
 *
 * ## Two corrections
 *
 * **The scope.** "Due this sprint" filtered `deadline <= endsOn` over
 * `getMyWork().assigned`, which is **workspace-wide** — so another client's
 * story with a near deadline appeared under a tab that claims to be this
 * sprint's. Invariant 1 says nothing is global; a date is not a scope. The
 * predicate now compares the project and the sprint first and lives in
 * `lib/home.ts`, where `tests/home.test.ts` holds it to fixtures that include
 * exactly that row.
 *
 * **The semantics.** `role="tab"` and `aria-selected` were there; nothing else
 * was. There was no `tabpanel`, so the tabs controlled nothing an assistive
 * technology could find; no `aria-controls` to say what; and all three tabs
 * were in the tab sequence, so reaching the rows meant three stops rather than
 * one. Arrow keys, the whole point of a tablist, did nothing.
 *
 * A tablist is a **single** stop with roving focus: `tabIndex` is 0 on the
 * selected tab and −1 on the rest, arrows move between them, Home and End jump
 * to the ends. Selection follows focus, which is the correct pattern when
 * switching is free — no fetch happens here, the rows are already in memory.
 */
type TabId = "assigned" | "reviewing" | "due";

export function HomeWorkTabs({
  assigned,
  reviewing,
  scope,
}: {
  assigned: MyWorkItem[];
  reviewing: MyWorkItem[];
  /**
   * The active sprint's project, number and last day — or null when no project
   * has an active sprint, in which case there is nothing for "due this sprint"
   * to mean and the tab is not offered.
   */
  scope: SprintScope | null;
}) {
  const due = dueThisSprint(assigned, scope);

  /**
   * "Assigned to me", not "Assigned".
   *
   * The design bundle's strip reads `Assigned / Reviewing / Due this sprint`,
   * and `/app/my-work` — the screen this tab links out to, showing the same
   * list — has always called the same column "Assigned to me". Two screens
   * naming one list two ways is the kind of small inconsistency that makes
   * somebody check whether they are the same list. The longer label is also
   * the one that stands on its own out of context, which a tab has to: a
   * screen reader announces it without the "my work" heading above it.
   *
   * Recorded as a deliberate divergence from the bundle in `05-DECISIONS.md`.
   */
  const tabs: Array<{ id: TabId; label: string; rows: MyWorkItem[] }> = [
    { id: "assigned", label: "Assigned to me", rows: assigned },
    { id: "reviewing", label: "Reviewing", rows: reviewing },
    ...(scope ? [{ id: "due" as const, label: "Due this sprint", rows: due }] : []),
  ];

  const [active, setActive] = useState<TabId>("assigned");
  const shown = tabs.find((tab) => tab.id === active) ?? tabs[0];

  // `useId` rather than a constant: this component is rendered once today, and
  // a duplicated id is exactly the bug the navigation drawer shipped.
  const base = useId();
  const tabId = (id: TabId) => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;

  const strip = useRef<HTMLDivElement>(null);

  /**
   * Roving focus. The index moves, selection follows it, and focus is moved
   * onto the newly selected tab so the reader's caret is where the highlight
   * is.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const order = tabs.map((tab) => tab.id);
    const at = order.indexOf(shown.id);
    let next = at;

    if (event.key === "ArrowRight") next = (at + 1) % order.length;
    else if (event.key === "ArrowLeft") next = (at - 1 + order.length) % order.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    else return;

    event.preventDefault();
    setActive(order[next]);
    strip.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(order[next]))}`)?.focus();
  }

  return (
    <>
      <div
        ref={strip}
        role="tablist"
        aria-label="My work"
        onKeyDown={onKeyDown}
        className="flex flex-wrap items-center gap-1"
      >
        {tabs.map((tab) => {
          const on = tab.id === shown.id;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              // One stop for the whole strip, not one per tab.
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center gap-[7px] rounded-control px-[11px] text-[12.5px] md:h-[30px]",
                on
                  ? "bg-[var(--canvas)] font-semibold text-[var(--ink)]"
                  : "font-medium text-[var(--ink-muted)] hover:bg-[var(--tint)]"
              )}
            >
              {tab.label}{" "}
              {/* The separator is inside the count, so the control's own text
                  reads "Assigned to me · 3" rather than two numbers meeting.
                  `{" "}` is load-bearing: JSX drops whitespace that spans a
                  newline, and without it the two run together. */}
              <Mono size="meta" className="tabular-nums text-[var(--ink-faint)]">
                · {tab.rows.length}
              </Mono>
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(shown.id)}
        // The panel is reachable, so a reader who has tabbed off the strip can
        // still get into the rows without going back through it.
        tabIndex={0}
        className="outline-offset-2"
      >
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
                    <Mono
                      size="meta"
                      className="w-[62px] shrink-0 text-right text-[var(--ink-faint)]"
                    >
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
      </div>
    </>
  );
}
