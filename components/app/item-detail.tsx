import Link from "next/link";

import { PersonAvatar } from "@/components/app/person-avatar";
import { CommentActions } from "@/components/app/comment-actions.client";
import { CommentBody } from "@/components/app/comment-body";
import { CommentThread } from "@/components/app/comment-thread.client";
import { CriteriaList } from "@/components/app/criteria-list.client";
import {
  EditableProse,
  EditableTitle,
  ItemActions,
  type MoveTarget,
} from "@/components/app/item-fields.client";
import { LogTime } from "@/components/app/log-time.client";
import { ComponentTag } from "@/components/coditu/component-icon";
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
  canEditCriteriaBody,
  canManage,
  sprints,
  people,
  me,
  maxImageBatch,
}: {
  item: WorkItemDetail;
  today: string;
  canToggleCriteria: boolean;
  /** Assignee, reviewer, admin or lead — the set that may say what a criterion
   *  says, widened on 2026-08-25 at the team's request. */
  canEditCriteriaBody: boolean;
  /** Admin or lead. The item's own words, its scope, where it lives. */
  canManage: boolean;
  /** Every sprint on THIS project, for the move control. Invariant 1: there is
   *  no cross-project move, so there is no cross-project list. */
  sprints: MoveTarget[];
  /** Active profiles, for the mention list. */
  people: ProfileRef[];
  /**
   * The signed-in reader. Their own optimistic comment and time entry carry
   * their name and initials, so what appears the instant they act is what the
   * server will send back rather than a placeholder that shifts.
   */
  me: {
    id: string;
    fullName: string;
    initials: string;
    avatarUrl: string | null;
    role: "admin" | "lead" | "engineer";
  };
  /** How many images one paste may carry — from `app_settings`. */
  maxImageBatch?: number;
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

      {/* `data-image-scope` is what makes the viewer's arrows traverse THIS
          item and nothing else — criteria screenshots and thread screenshots
          are one gallery, in document order, and a second item open in another
          tab is not part of it. See `comment-image.client.tsx`. */}
      <div data-image-scope className="flex min-w-0 flex-col gap-6 p-6">
        <EditableTitle itemId={item.id} title={item.title} canEdit={canManage} />

        {/* `whitespace-pre-line` on both: a description written as a list of
            requirements is a list of requirements, and collapsing its newlines
            turns fifty-eight of the imported items into one unreadable run-on
            paragraph. Only line breaks are preserved — runs of spaces still
            collapse, so nothing else about the type changes. */}
        <div className="flex flex-col gap-3">
          <EditableProse
            itemId={item.id}
            field="description"
            value={item.description}
            canEdit={canManage}
            label="Description"
            placeholder="Add a description"
          />

          {/* The highlight is a first-class column, and it renders as a rule
              rather than a callout box — "discuss this first", not an alert. */}
          <EditableProse
            itemId={item.id}
            field="highlight"
            value={item.highlight}
            canEdit={canManage}
            label="Highlight"
            placeholder="Add something to discuss before implementing"
            accent="var(--amber)"
          />
        </div>

        {/* The criterion documents are rendered HERE, on the server, and handed
            to the client list as a map — the same arrangement the thread uses.
            `CommentBody` walks stored JSON and pulls in lowlight; rendering a
            checklist client-side would put all of that on a route that has no
            budget for it. */}
        <CriteriaList
          itemId={item.id}
          criteria={item.criteria}
          bodies={Object.fromEntries(
            item.criteria.map((criterion) => [
              criterion.id,
              criterion.bodyJson ? <CommentBody doc={criterion.bodyJson} /> : null,
            ])
          )}
          canToggle={canToggleCriteria}
          canEditBody={canEditCriteriaBody}
          canManage={canManage}
          people={people}
          maxBatch={maxImageBatch}
        />

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
            maxBatch={maxImageBatch}
          >
            {item.comments.map((comment) => (
              // `micro`: 200ms, and NO blur. A per-message blur in a live
              // thread reads as jitter. Existing entries have already finished
              // this animation, so an arriving comment is the only thing that
              // moves when the server tree refreshes.
              <article key={comment.id} data-reveal="micro" className="flex gap-3">
                <PersonAvatar person={comment.author} size={28} fontSize={10} />
                <div className="min-w-0 flex-1">
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
                    {comment.deletedAt ? (
                      <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                        withdrawn
                      </Mono>
                    ) : null}
                  </div>

                  {/* A withdrawn comment is struck through, not removed. The
                      schema comment on `comments.deleted_at` is explicit that
                      this is the rule: an argument that vanishes leaves every
                      reply underneath it making no sense. */}
                  {comment.deletedAt ? (
                    <p className="mt-1 text-[13.5px] italic text-[var(--ink-faint)] line-through">
                      This comment was withdrawn.
                    </p>
                  ) : (
                    <CommentActions
                      commentId={comment.id}
                      authorName={comment.author.fullName}
                      bodyJson={comment.bodyJson}
                      people={people}
                      canEdit={comment.author.id === me.id}
                      canRemove={comment.author.id === me.id || me.role === "admin"}
                    >
                      {/* Rendered by walking the stored JSON server-side. Never
                          injected as HTML — see components/app/comment-body.tsx. */}
                      <div className="mt-1">
                        <CommentBody doc={comment.bodyJson} />
                      </div>
                    </CommentActions>
                  )}
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

        {/* The component, before the flat properties: it is the only one that
            goes somewhere. The link is the way out of "this item" and into
            "everything that has happened to this web part", which is the whole
            reason the registry exists. */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
          <Mono size="meta" className="shrink-0 uppercase tracking-[0.04em] text-[var(--ink-faint)]">
            component
          </Mono>
          {item.component ? (
            <Link
              href={`/app/projects/${item.project.slug}/components/${item.component.slug}`}
              prefetch={false}
              className="min-w-0 text-[13.5px] font-medium hover:text-[var(--accent)]"
            >
              <ComponentTag component={item.component} />
            </Link>
          ) : (
            <span className="text-[13.5px] font-medium text-[var(--ink-faint)]">
              not attributed yet
            </span>
          )}
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
          isAdmin={me.role === "admin"}
        />

        <ItemActions
          itemId={item.id}
          itemKey={item.key}
          minutesLogged={item.minutesLogged}
          sprintId={item.sprint.id}
          sprints={sprints}
          canManage={canManage}
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
