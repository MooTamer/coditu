import { CriteriaList } from "@/components/app/criteria-list.client";
import { LogTime } from "@/components/app/log-time.client";
import { StatusChipDot } from "@/components/app/status-popover.client";
import { Mono } from "@/components/coditu/mono";
import { calendarDate, hours, timestamp } from "@/lib/format";
import type { WorkItemDetail } from "@/lib/data/work-item";
import { groupingHue, TYPE_LABEL } from "@/lib/work-items";

/**
 * The item detail body. Shared verbatim between the intercepted modal and the
 * full page, so a hard navigation and a soft one show the same thing — which is
 * the whole point of the intercepting route. Two implementations would drift.
 *
 * Two columns at `minmax(300px, 1fr)`, wrapped in `min()` for the same reason
 * the sprint header is.
 */
export function ItemDetailBody({
  item,
  today,
  canToggleCriteria,
}: {
  item: WorkItemDetail;
  today: string;
  canToggleCriteria: boolean;
}) {
  const properties: Array<{ label: string; value: string; color?: string }> = [
    { label: "type", value: TYPE_LABEL[item.type] },
    {
      label: "assignee",
      value: item.assignee?.fullName ?? "unassigned",
      color: item.assignee ? undefined : "var(--ink-faint)",
    },
    {
      label: "reviewer",
      value: item.reviewer?.fullName ?? "—",
      color: item.reviewer ? undefined : "var(--ink-faint)",
    },
    { label: "deadline", value: calendarDate(item.deadline) },
    { label: "estimate", value: `${hours(item.estimateMinutes)} h` },
    {
      label: "grouping",
      value: item.grouping ? String(item.grouping) : "—",
      color: item.grouping ? (groupingHue(item.grouping) ?? undefined) : "var(--ink-faint)",
    },
  ];

  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
      <div className="flex min-w-0 flex-col gap-6 p-6">
        <h1 className="text-[22px] font-bold leading-[1.25] tracking-[-0.02em]">{item.title}</h1>

        <div className="flex flex-col gap-3">
          {item.description ? (
            <p className="text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">{item.description}</p>
          ) : null}

          {/* The highlight is a first-class column, and it renders as a rule
              rather than a callout box — "discuss this first", not an alert. */}
          {item.highlight ? (
            <p
              className="border-l-2 pl-[14px] text-[14.5px] leading-[1.6] text-[var(--ink)]"
              style={{ borderColor: "var(--amber)" }}
            >
              <span className="sr-only">Discuss before implementing: </span>
              {item.highlight}
            </p>
          ) : null}
        </div>

        <CriteriaList criteria={item.criteria} canToggle={canToggleCriteria} />

        <section aria-labelledby={`comments-${item.id}`}>
          <Mono
            as="h2"
            id={`comments-${item.id}`}
            size="meta"
            className="uppercase tracking-[0.06em] text-[var(--ink-faint)]"
          >
            Comments
          </Mono>

          <div className="mt-[14px] flex flex-col gap-[14px]">
            {item.comments.map((comment) => (
              <article key={comment.id} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-pill border border-[var(--hairline-strong)]">
                  <Mono size="eyebrow" className="text-[10px] normal-case tracking-normal">
                    {comment.author.initials}
                  </Mono>
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold">{comment.author.fullName}</span>
                    <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                      {timestamp(comment.createdAt)}
                    </Mono>
                    {comment.editedAt ? (
                      <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                        edited
                      </Mono>
                    ) : null}
                  </div>
                  {/* Step 9 replaces this with the server-side JSON walker.
                      Until then the flattened projection renders as plain text,
                      which is inert by construction. */}
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-[1.55] text-[var(--ink-muted)]">
                    {comment.bodyText}
                  </p>
                </div>
              </article>
            ))}

            {item.comments.length === 0 ? (
              <p className="text-[13.5px] text-[var(--ink-faint)]">No discussion yet.</p>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-[10px] rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-[14px] py-[10px]">
            <span className="flex-1 text-[13.5px] text-[var(--ink-faint)]">
              Write a comment — @ to mention
            </span>
            <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
              step 9
            </Mono>
          </div>
        </section>

        <section aria-labelledby={`activity-${item.id}`}>
          <Mono
            as="h2"
            id={`activity-${item.id}`}
            size="meta"
            className="uppercase tracking-[0.06em] text-[var(--ink-faint)]"
          >
            Activity
          </Mono>
          <ul className="mt-3 flex flex-col gap-2">
            {item.activity.map((entry) => (
              <li key={entry.id}>
                <Mono size="meta" className="text-[11.5px] text-[var(--ink-faint)]">
                  {describeActivity(entry)} · {timestamp(entry.createdAt)}
                </Mono>
              </li>
            ))}
            {item.activity.length === 0 ? (
              <li>
                <Mono size="meta" className="text-[var(--ink-faint)]">
                  no activity yet
                </Mono>
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-5 border-l border-[var(--hairline)] bg-[var(--raised)] p-6">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
          <Mono size="meta" className="uppercase tracking-[0.04em] text-[var(--ink-faint)]">
            status
          </Mono>
          <StatusChipDot status={item.status} />
        </div>

        {properties.map((property) => (
          <div
            key={property.label}
            className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3"
          >
            <Mono size="meta" className="uppercase tracking-[0.04em] text-[var(--ink-faint)]">
              {property.label}
            </Mono>
            <span className="text-[13.5px] font-medium" style={{ color: property.color ?? "var(--ink)" }}>
              {property.value}
            </span>
          </div>
        ))}

        <LogTime
          itemId={item.id}
          today={today}
          entries={item.entries}
          totalMinutes={item.minutesLogged}
        />
      </div>
    </div>
  );
}

/**
 * Activity rows are stored as verb/field/from/to rather than a sentence, so the
 * feed can be re-worded or translated without rewriting history.
 */
function describeActivity(entry: WorkItemDetail["activity"][number]): string {
  const who = entry.actor?.initials ?? "system";
  if (entry.verb === "created") return `${who} created this item`;
  if (entry.field === "status") return `${who} changed status ${entry.fromValue ?? "—"} → ${entry.toValue ?? "—"}`;
  if (entry.field) return `${who} set ${entry.field} → ${entry.toValue ?? "—"}`;
  return `${who} ${entry.verb}`;
}
