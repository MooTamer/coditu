import Link from "next/link";

import { ThreadStateChip } from "@/components/client/thread-state-chip";
import { Reveal } from "@/components/motion/reveal";
import { listClientThreads } from "@/lib/data/client-threads";
import { timestamp } from "@/lib/format";

export const metadata = { title: "Questions" };

/**
 * Everything we have asked, and where each one stands.
 *
 * Ordered by what needs her first — the ones waiting on a reply, then ours,
 * then the ones that are finished. Not by date: a question from three weeks ago
 * that is still waiting on her is more urgent than one from this morning that
 * is already with us, and a date sort buries exactly the row that matters.
 */
const ORDER = { waiting_client: 0, waiting_coditu: 1, resolved: 2 } as const;

export default async function ClientQuestionsPage() {
  const threads = await listClientThreads();
  const sorted = [...threads].sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] ||
      (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt)
  );
  const needsHer = sorted.filter((thread) => thread.state === "waiting_client").length;

  return (
    <main className="flex flex-1 flex-col gap-6 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[26px] font-bold tracking-[-0.024em]">Questions</h1>
        <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">
          {threads.length === 0
            ? "Nothing to answer right now. When we need a decision from you, it will appear here."
            : needsHer > 0
              ? `${needsHer === 1 ? "One question is" : `${needsHer} questions are`} waiting for you.`
              : "Nothing is waiting on you — we have everything we need."}
        </p>
      </Reveal>

      {sorted.length > 0 ? (
        <Reveal tier="section" delay={0.06} as="section" aria-label="Questions">
          <ul className="flex flex-col gap-3">
            {sorted.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/client/questions/${thread.id}`}
                  prefetch={false}
                  className="flex flex-col gap-2 rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4 hover:border-[var(--hairline-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  <div className="flex items-start gap-3">
                    {/* The unread dot is decorative — the word "unread" is in
                        the accessible name below, so a screen reader is told
                        once rather than twice. */}
                    <span
                      aria-hidden
                      className={
                        thread.unread
                          ? "mt-[7px] size-[7px] shrink-0 rounded-full bg-[var(--signal-from)]"
                          : "mt-[7px] size-[7px] shrink-0"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[14.5px] leading-[1.45] break-words ${thread.unread ? "font-bold" : "font-medium"}`}
                      >
                        {thread.title}
                        {thread.unread ? <span className="sr-only"> — unread</span> : null}
                      </span>
                      <span className="mt-1 block text-[12.5px] text-[var(--ink-faint)]">
                        {thread.componentName}
                        {thread.lastMessageAt ? ` · ${timestamp(thread.lastMessageAt)}` : ""}
                      </span>
                    </span>
                  </div>

                  <span className="pl-[19px]">
                    <ThreadStateChip state={thread.state} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      ) : null}
    </main>
  );
}
