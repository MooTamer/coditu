import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CommentBody } from "@/components/app/comment-body";
import { MarkThreadRead } from "@/components/client/mark-thread-read.client";
import { ReplyComposer } from "@/components/client/reply-composer.client";
import { ThreadStateChip } from "@/components/client/thread-state-chip";
import { Reveal } from "@/components/motion/reveal";
import { getClientThread } from "@/lib/data/client-threads";
import { listClientProjects } from "@/lib/data/client";
import { timestamp } from "@/lib/format";
import { getClientContact } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = await params;
  const found = await getClientThread(thread);
  return { title: found?.thread.title ?? "Question" };
}

/**
 * One question, and the conversation on it.
 *
 * ── Who wrote what ─────────────────────────────────────────────────────────
 *
 * Coditu's messages sit left with our name on them; hers sit right. Not a chat
 * bubble in the messaging sense — this is a record of a decision, and it should
 * read as one when it is quoted back in three months. The side is decided from
 * the AUTHOR'S account kind, so a message cannot claim to be from a side it is
 * not.
 *
 * ── The renderer is the internal one ───────────────────────────────────────
 *
 * `CommentBody` walks the stored ProseMirror JSON into React elements — no HTML
 * string, no `dangerouslySetInnerHTML`, failing closed on unknown nodes. It has
 * ten hostile-document specs against it already. Writing a second renderer for
 * this feature would have been writing a second thing to attack.
 */
export default async function ClientThreadPage({
  params,
}: {
  params: Promise<{ thread: string }>;
}) {
  const { thread: threadId } = await params;

  const [contact, found] = await Promise.all([getClientContact(), getClientThread(threadId)]);
  if (!contact) notFound();
  // A thread she may not read returns nothing from RLS, so this is the same
  // 404 an address that does not exist gets. Distinguishing them would confirm
  // the question exists.
  if (!found) notFound();

  const { thread, messages, canReply } = found;

  // `canReply` comes from `client_thread_can_reply`, which is the same
  // predicate the INSERT policy uses. Re-deriving it here from her grant would
  // be a second answer to one question, and the two would eventually disagree
  // — the composer would be drawn for somebody the database then refuses, or
  // hidden from somebody it would have allowed.
  const projects = await listClientProjects();
  const project = projects.find((p) => p.id === thread.projectId);

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      {/* Renders nothing. Marks the thread read once it is genuinely open,
          through an action rather than as a side effect of the GET — a render
          that writes is one a prefetch can fire. */}
      <MarkThreadRead threadId={thread.id} />

      <Reveal tier="section" as="header">
        <Link
          href="/client/questions"
          prefetch={false}
          className="-ml-2 inline-flex h-11 items-center gap-2 rounded-control px-2 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--ui-hover)] hover:text-[var(--ink)]"
        >
          <ArrowLeft size={15} strokeWidth={2} aria-hidden />
          Questions
        </Link>

        <h1 className="mt-2 text-[22px] font-bold leading-[1.3] tracking-[-0.02em] break-words">
          {thread.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ThreadStateChip state={thread.state} />
          {project ? (
            <Link
              href={`/client/projects/${project.slug}/components/${thread.componentSlug}`}
              prefetch={false}
              className="text-[13px] text-[var(--ink-muted)] underline underline-offset-2"
            >
              {thread.componentName}
            </Link>
          ) : (
            <span className="text-[13px] text-[var(--ink-muted)]">{thread.componentName}</span>
          )}
        </div>
      </Reveal>

      <Reveal tier="section" delay={0.06} as="section" aria-label="Conversation">
        <ol className="flex flex-col gap-4">
          {messages.map((message) => (
            <li
              key={message.id}
              className={
                message.fromCoditu
                  ? "max-w-[52ch] rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4"
                  : "ml-auto max-w-[52ch] rounded-card border border-[var(--hairline-strong)] bg-[var(--canvas)] p-4"
              }
            >
              <p className="text-[12.5px] text-[var(--ink-faint)]">
                {message.fromCoditu ? `${message.authorName} · Coditu` : "You"}
                {" · "}
                {timestamp(message.createdAt)}
                {message.editedAt ? " · edited" : ""}
              </p>
              <div className="coditu-prose mt-2 text-[14.5px] leading-[1.65]">
                <CommentBody doc={message.bodyJson} />
              </div>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal tier="section" delay={0.1} as="section" aria-label="Reply">
        {thread.state === "resolved" ? (
          <p className="mb-3 text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
            We have marked this one answered. Replying will reopen it — which is fine if there is
            more to say.
          </p>
        ) : null}

        <ReplyComposer
          threadId={thread.id}
          profileId={contact.id}
          disabled={!canReply}
          disabledReason="You can follow this conversation but not reply to it. Ask us if that should change."
        />
      </Reveal>
    </main>
  );
}
