import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/app/page-shell";
import { MarkNotificationsRead } from "@/components/app/mark-read.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getMyWork } from "@/lib/data/my-work";
import { listNotifications } from "@/lib/data/notifications";
import { hours, hoursLabel, timestamp } from "@/lib/format";
import type { MyWorkItem } from "@/lib/data/my-work";

export const metadata = { title: "My work" };

export default async function MyWorkPage() {
  const [mine, notifications] = await Promise.all([getMyWork(), listNotifications()]);
  if (!mine) notFound();

  const unread = notifications.filter((notification) => notification.readAt === null);

  return (
    <PageShell measure="mywork">
      <Reveal tier="section" as="header">
        <h1 className="text-[26px] font-bold tracking-[-0.024em]">My work</h1>
        <p className="mt-2 text-[14.5px] text-[var(--ink-muted)]">
          {mine.fullName} · {hours(mine.minutesThisWeek)} h logged this week against{" "}
          {hours(mine.weeklyCapacityMinutes)} h capacity
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.06}
        className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]"
      >
        <Column label="Assigned to me" items={mine.assigned} meta={(item) => item.status} />
        <Column
          label="Awaiting my review"
          items={mine.awaitingMyReview}
          meta={(item) => `${hoursLabel(item.minutesLogged)} logged`}
        />

        <section className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
          <div className="flex items-center gap-[10px] border-b border-[var(--hairline)] px-4 py-[14px]">
            <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              Mentions
            </Mono>
            <Mono size="key" className="ml-auto">
              {unread.length > 0 ? `${unread.length} unread` : notifications.length}
            </Mono>
          </div>

          <ul className="flex flex-col">
            {notifications.slice(0, 12).map((notification) => (
              <li key={notification.id}>
                <Link
                  href={`/app/projects/${notification.projectSlug}/sprints/${notification.sprintNumber}/items/${notification.itemKey}`}
                  className="flex flex-col gap-1 border-b border-[var(--hairline)] px-4 py-[14px] last:border-b-0 hover:bg-[var(--canvas)]"
                >
                  <span className="flex items-center gap-2">
                    {notification.readAt === null ? (
                      <span
                        aria-hidden
                        className="size-[6px] shrink-0 rounded-pill"
                        style={{ background: "var(--accent)" }}
                      />
                    ) : null}
                    <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                      {notification.itemKey}
                    </Mono>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {notification.itemTitle}
                    </span>
                    <Mono size="eyebrow" className="shrink-0 normal-case tracking-normal text-[var(--ink-faint)]">
                      {timestamp(notification.createdAt)}
                    </Mono>
                    {notification.readAt === null ? <span className="sr-only">unread</span> : null}
                  </span>
                  {notification.preview ? (
                    <span className="truncate text-[13px] text-[var(--ink-muted)]">
                      {notification.preview}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}

            {notifications.length === 0 ? (
              <li className="px-4 py-[14px] text-[13.5px] text-[var(--ink-faint)]">
                Nobody has mentioned you yet.
              </li>
            ) : null}
          </ul>

          {unread.length > 0 ? <MarkNotificationsRead count={unread.length} /> : null}
        </section>
      </Reveal>
    </PageShell>
  );
}

function Column({
  label,
  items,
  meta,
}: {
  label: string;
  items: MyWorkItem[];
  meta: (item: MyWorkItem) => string;
}) {
  return (
    <section className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
      <div className="flex items-center gap-[10px] border-b border-[var(--hairline)] px-4 py-[14px]">
        <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          {label}
        </Mono>
        <Mono size="key" className="ml-auto">
          {items.length}
        </Mono>
      </div>

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/projects/${item.projectSlug}/sprints/${item.sprintNumber}/items/${item.key}`}
              className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-[14px] last:border-b-0 hover:bg-[var(--canvas)]"
            >
              <Mono size="eyebrow" className="shrink-0 normal-case tracking-normal text-[var(--ink-faint)]">
                {item.key}
              </Mono>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{item.title}</span>
              <Mono size="meta" className="shrink-0 text-[var(--ink-muted)]">
                {meta(item)}
              </Mono>
            </Link>
          </li>
        ))}

        {items.length === 0 ? (
          <li className="px-4 py-[14px] text-[13.5px] text-[var(--ink-faint)]">
            {/* Not a blank box: say which of the two empty states this is. */}
            {label === "Assigned to me" ? "Nothing assigned to you right now." : "Nothing waiting on your review."}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
