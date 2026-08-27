import Link from "next/link";

import { PersonAvatar } from "@/components/app/person-avatar";
import { ComponentTags } from "@/components/coditu/component-icon";
import { StatusChipDot } from "@/components/coditu/status-chip";
import { Mono } from "@/components/coditu/mono";
import { ProgressRing } from "@/components/coditu/progress-ring";
import type { WorkItemRow } from "@/lib/data/sprint";
import { calendarDate, hours } from "@/lib/format";
import { groupingHue, groupingTint } from "@/lib/work-items";

/**
 * The stacked card layout, shown below 768px.
 *
 * ── Why nothing in here is `--ink-faint` ──────────────────────────────────
 * A grouped card carries a 5% hue tint, and `--ink-faint` measures **4.46:1**
 * against it — under AA by four hundredths. It is 4.67:1 on the plain canvas,
 * which is how it survived: axe had only ever run at 1440px, where this layout
 * does not exist. `--ink-muted` is 5.25:1 on the same tint. Exactly the shape of
 * the bug `cell-popover.client.tsx` already documents for the sticky column.
 *
 * Driven by the VIEWPORT at `md`, which is 768px, because that is where
 * `Coditu Workspace.dc.html` switches: its 768-1023 row is *"Full table, sticky
 * Task column"* and only below 768 does it say *"Story cards"*.
 *
 * This was a 900px container query, on the reasoning that the table's own width
 * is what decides whether it fits and that width changes when the rail pins
 * open. Reasonable, and wrong in practice: with the rail expanded the container
 * at an 834px viewport measures ~727px, so the whole 768-1023 band showed cards
 * — and the sticky Task column, which is implemented correctly, was never once
 * on screen. The table scrolls inside its own card, so a squeezed table is not
 * the failure the container query was protecting against.
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
    <section className="hidden flex-col gap-[10px] max-md:flex">
      {/* The same answer the table gives, because a phone can reach the same
          empty state and a screen with nothing on it explains nothing. No
          "clear the filters" here: the control that set them is a sheet the
          reader just closed, and it is one tap away. */}
      {rows.length === 0 ? (
        <p className="rounded-card border border-[var(--hairline)] bg-[var(--raised)] px-4 py-8 text-center text-[13.5px] text-[var(--ink-muted)]">
          {allRows.length === 0
            ? "No stories in this sprint yet."
            : `No story here matches these filters — ${allRows.length} in the sprint.`}
        </p>
      ) : null}

      {rows.map((row) => {
        const hue = groupingHue(row.grouping);
        return (
          <Link
            key={row.id}
            data-sprint-card
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
              <Mono size="meta" className="text-[var(--ink-muted)]">
                {row.key}
              </Mono>
              <StatusChipDot status={row.status} />
            </span>

            <span className="text-[15px] font-medium leading-[1.35]">{row.title}</span>

            {/* The component reads as a caption under the title rather than
                joining the metadata row: on a 320px card that row is already
                four things wide, and this is the one that names what the item
                is about. `--ink-muted`, never `--ink-faint` — see the note at
                the top of this file. */}
            {row.components.length > 0 ? (
              <ComponentTags
                components={row.components}
                size={13}
                itemClassName="text-[12.5px] text-[var(--ink-muted)]"
              />
            ) : null}

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
                <Mono size="meta" className="text-[var(--ink-muted)]">
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
              {/* Here too, or the information disappears entirely below 900px
                  where the table becomes this card stack. */}
              {row.criteriaTotal > 0 ? (
                <span className="ml-auto flex shrink-0 items-center gap-[5px]">
                  <ProgressRing done={row.criteriaDone} total={row.criteriaTotal} size={16} strokeWidth={5} />
                  <Mono size="meta" className="text-[var(--ink-muted)]">
                    {row.criteriaDone}/{row.criteriaTotal}
                  </Mono>
                </span>
              ) : null}
              <Mono size="meta" className="shrink-0 text-[var(--ink-muted)]">
                {row.grouping ?? "—"}
              </Mono>
            </span>
          </Link>
        );
      })}

      <div className="flex items-center justify-between rounded-card border border-[var(--hairline)] bg-[var(--canvas)] px-4 py-[14px]">
        <Mono size="key" className="uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          Sum{filtered ? " (filtered)" : ""}
        </Mono>
        <Mono size="key" className="text-[15px] font-semibold">
          {hours(logged)} / {hours(estimate)}
        </Mono>
      </div>
    </section>
  );
}
