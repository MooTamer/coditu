import Link from "next/link";

import { PersonAvatar } from "@/components/app/person-avatar";
import { StatusChipDot } from "@/components/coditu/status-chip";
import { Mono } from "@/components/coditu/mono";
import type { WorkItemRow } from "@/lib/data/sprint";
import { calendarDate, hours } from "@/lib/format";
import { groupingHue, groupingTint } from "@/lib/work-items";

/**
 * The stacked card layout, shown below 900px.
 *
 * Driven by a CONTAINER query, not a viewport breakpoint. The table's own
 * width is what decides whether it fits, and that width changes when the rail
 * pins open — a viewport breakpoint would keep showing a squeezed table on a
 * wide screen with an expanded rail, and switch to cards on a narrow screen
 * where the table would actually have fitted.
 */
export function SprintCards({
  rows,
  allRows,
  basePath,
}: {
  rows: WorkItemRow[];
  allRows: WorkItemRow[];
  basePath: string;
}) {
  const filtered = rows.length !== allRows.length;
  const summed = filtered ? rows : allRows;
  const logged = summed.reduce((total, row) => total + row.minutesLogged, 0);
  const estimate = summed.reduce((total, row) => total + row.estimateMinutes, 0);

  return (
    <section className="hidden flex-col gap-[10px] @max-[900px]:flex">
      {rows.map((row) => {
        const hue = groupingHue(row.grouping);
        return (
          <Link
            key={row.id}
            href={`${basePath}/items/${row.key}`}
            // See `rail.client.tsx` — a prefetch that is discarded before it
            // can be used is a server render nobody asked for.
            prefetch={false}
            className="flex flex-col gap-3 rounded-card border border-l-[3px] border-[var(--hairline)] p-4"
            style={{
              borderLeftColor: hue ?? "var(--hairline)",
              background: row.grouping ? groupingTint(row.grouping) : "var(--raised)",
            }}
          >
            <span className="flex items-center justify-between gap-[10px]">
              <Mono size="meta" className="text-[var(--ink-faint)]">
                {row.key}
              </Mono>
              <StatusChipDot status={row.status} />
            </span>

            <span className="text-[15px] font-medium leading-[1.35]">{row.title}</span>

            <span className="flex flex-wrap items-center gap-3">
              {/* Assignee → reviewer. The arrow stays: two faces side by side
                  do not say which of them is holding the item. */}
              <span className="flex items-center gap-[6px]">
                <PersonAvatar
                  person={row.assignee}
                  size={22}
                  fontSize={9.5}
                  title={row.assignee ? `Assigned to ${row.assignee.fullName}` : "Unassigned"}
                />
                <Mono size="meta" className="text-[var(--ink-faint)]">
                  →
                </Mono>
                <PersonAvatar
                  person={row.reviewer}
                  size={22}
                  fontSize={9.5}
                  title={row.reviewer ? `Reviewed by ${row.reviewer.fullName}` : "No reviewer"}
                />
              </span>
              <Mono size="meta" className="text-[var(--ink-muted)]">
                {hours(row.minutesLogged)} / {hours(row.estimateMinutes)}h
              </Mono>
              <Mono size="meta" className="text-[var(--ink-muted)]">
                {calendarDate(row.deadline)}
              </Mono>
              <Mono size="meta" className="ml-auto text-[var(--ink-muted)]">
                {row.grouping ?? "—"}
              </Mono>
            </span>
          </Link>
        );
      })}

      <div className="flex items-center justify-between rounded-card border border-[var(--hairline)] bg-[var(--canvas)] px-4 py-[14px]">
        <Mono size="key" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          Sum{filtered ? " (filtered)" : ""}
        </Mono>
        <Mono size="key" className="text-[15px] font-semibold">
          {hours(logged)} / {hours(estimate)}
        </Mono>
      </div>
    </section>
  );
}
