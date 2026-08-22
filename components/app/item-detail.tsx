import { PersonAvatar } from "@/components/app/person-avatar";
import { CommentBody } from "@/components/app/comment-body";
import { CommentThread } from "@/components/app/comment-thread.client";
import { CriteriaList } from "@/components/app/criteria-list.client";
import { LogTime } from "@/components/app/log-time.client";
import { StatusChipDot } from "@/components/coditu/status-chip";
import { Mono } from "@/components/coditu/mono";
import { ThreadRealtime } from "@/components/app/realtime.client";
import { calendarDate, hours, timestamp } from "@/lib/format";
import type { ProfileRef } from "@/lib/data/profiles";
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
  people,
  me,
}: {
  item: WorkItemDetail;
  today: string;
  canToggleCriteria: boolean;
  /** Active profiles, for the mention list. */
  people: ProfileRef[];
  /**
   * The signed-in reader. Their own optimistic comment and time entry carry
   * their name and initials, so what appears the instant they act is what the
   * server will send back rather than a placeholder that shifts.
   */
  me: { id: string; fullName: string; initials: string; avatarUrl: string | null };
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
      {/* Comments arriving on this item, coalesced through a 120ms buffer.
          Renders nothing — it only subscribes. */}
      <ThreadRealtime workItemId={item.id} />
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

          {/* The list is rendered HERE, on the server, and handed to the client
              wrapper as children. `CommentBody` walks stored JSON and pulls in
              lowlight; rendering the thread client-side to make one pending
              comment appear would ship all of that to a route already at
              100.5KB of its 110KB budget. */}
          <CommentThread
            itemId={item.id}
            itemKey={item.key}
            people={people}
            me={me}
            isEmpty={item.comments.length === 0}
          >
            {item.comments.map((comment) => (
              // `micro`: 200ms, and NO blur. A per-message blur in a live
              // thread reads as jitter. Existing entries have already finished
              // this animation, so an arriving comment is the only thing that
              // moves when the server tree refreshes.
              <article key={comment.id} data-reveal="micro" className="flex gap-3">
                <PersonAvatar person={comment.author} size={28} fontSize={10} />
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
                  {/* Rendered by walking the stored JSON server-side. Never
                      injected as HTML — see components/app/comment-body.tsx. */}
                  <div className="mt-1">
                    <CommentBody doc={comment.bodyJson} />
                  </div>
                </div>
              </article>
            ))}
          </CommentThread>
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
          me={me}
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
