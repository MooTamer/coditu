import Link from "next/link";

import { PersonAvatar } from "@/components/app/person-avatar";
import { ComponentTag } from "@/components/coditu/component-icon";
import { Mono } from "@/components/coditu/mono";
import { ProgressRing } from "@/components/coditu/progress-ring";
import type { WorkItemRow } from "@/lib/data/sprint";
import { hours } from "@/lib/format";
import { STATUS_DISPLAY_ORDER, STATUS_LABEL, groupingHue, TYPE_LABEL, type WorkItemStatus } from "@/lib/work-items";

const DOT: Record<WorkItemStatus, string> = {
  in_progress: "#2B57FF",
  in_peer_review: "#FFB020",
  in_qa: "#21E2C6",
  changes_requested: "#FF5F6D",
  ready: "#6B7A90",
  draft: "rgba(107,122,144,0.4)",
  blocked: "#FF5F6D",
  done: "#23C97F",
};

/**
 * The board. Columns follow the fixed display order, so the leftmost column is
 * always the work in flight — the same order the table sorts by and every
 * export uses.
 *
 * Horizontal scroll with snap when narrow, rather than reflowing to one column:
 * a board that stacks vertically is a list, and the whole point of the board is
 * seeing the columns side by side.
 */
export function SprintBoard({ rows, basePath }: { rows: WorkItemRow[]; basePath: string }) {
  const present = STATUS_DISPLAY_ORDER.filter((status) => rows.some((row) => row.status === status));

  return (
    <section className="grid snap-x snap-mandatory auto-cols-[minmax(240px,1fr)] grid-flow-col items-start gap-[14px] overflow-x-auto @min-[900px]:grid-flow-row @min-[900px]:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))]">
      {present.map((status) => {
        const items = rows.filter((row) => row.status === status);
        return (
          <div
            key={status}
            className="snap-start overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-[14px] py-3">
              <span aria-hidden className="size-[7px] rounded-[2px]" style={{ background: DOT[status] }} />
              <Mono size="meta" className="uppercase tracking-[0.05em]">
                {STATUS_LABEL[status]}
              </Mono>
              <Mono size="meta" className="ml-auto text-[var(--ink-faint)]">
                {items.length}
              </Mono>
            </div>

            <div className="flex min-h-[120px] flex-col gap-[10px] p-[10px]">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`${basePath}/items/${item.key}`}
                  // See `rail.client.tsx`.
                  prefetch={false}
                        className="flex flex-col gap-[10px] rounded-inner border border-l-[3px] border-[var(--hairline)] bg-[var(--canvas)] p-3"
                  style={{ borderLeftColor: groupingHue(item.grouping) ?? "transparent" }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                      {item.key}
                    </Mono>
                    <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                      {TYPE_LABEL[item.type]}
                    </Mono>
                  </span>
                  <span className="text-[13.5px] font-medium leading-[1.35]">{item.title}</span>
                  {item.component ? (
                    <ComponentTag
                      component={item.component}
                      size={13}
                      className="text-[12px] text-[var(--ink-muted)]"
                    />
                  ) : null}
                  <span className="flex items-center gap-[10px]">
                    <PersonAvatar
                      person={item.assignee}
                      size={20}
                      fontSize={9}
                      title={item.assignee?.fullName ?? "Unassigned"}
                    />
                    <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-muted)]">
                      {item.minutesLogged > 0 ? `${hours(item.minutesLogged)}h` : "—"}
                    </Mono>
                    {item.criteriaTotal > 0 ? (
                      <span className="ml-auto flex shrink-0 items-center gap-[5px]">
                        <ProgressRing done={item.criteriaDone} total={item.criteriaTotal} size={14} strokeWidth={5} />
                        <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-muted)]">
                          {item.criteriaDone}/{item.criteriaTotal}
                        </Mono>
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
