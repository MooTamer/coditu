"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, MessageCircleQuestion } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { openClientThread, resolveClientThread } from "@/lib/actions/client-threads";
import {
  setComponentPublication,
  setWorkItemPublication,
} from "@/lib/actions/client-publication";
import { THREAD_STATE_LABEL_INTERNAL, type ClientThreadView } from "@/lib/client-threads";
import { timestamp } from "@/lib/format";

const FIELD =
  "w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-2 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";

export interface PublishableItem {
  id: string;
  key: string;
  title: string;
  clientTitle: string | null;
  published: boolean;
}

/**
 * What this client can see of this component, and what we have asked them.
 *
 * ── Why it is one panel and not two screens ────────────────────────────────
 *
 * Publishing and asking are the same act of attention: somebody is looking at a
 * component and deciding what the client should know about it. Splitting them
 * across two places means the person who publishes never sees the question that
 * is waiting, which is how a client ends up staring at work nobody has
 * explained.
 *
 * ── No optimistic updates, again ───────────────────────────────────────────
 *
 * Same reasoning as `/app/clients`: everywhere else the cost of being briefly
 * wrong is a row that flickers, and here it is somebody believing a component
 * is private when it is not. Every control waits for the server and says so.
 */
export function ClientVisibilityPanel({
  componentId,
  componentName,
  projectSlug,
  componentSlug,
  published,
  summary,
  items,
  threads,
  canManage,
}: {
  componentId: string;
  componentName: string;
  projectSlug: string;
  componentSlug: string;
  published: boolean;
  summary: string;
  items: PublishableItem[];
  threads: ClientThreadView[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [draftSummary, setDraftSummary] = useState(summary);
  const [asking, setAsking] = useState(false);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await work().catch(() => ({
        ok: false,
        error: "That did not reach the server. Check your connection and try again.",
      }));
      toast(result.ok ? success : (result.error ?? "That did not save."));
    });
  }

  const publishedCount = items.filter((item) => item.published).length;

  return (
    <div className="flex flex-col gap-5 rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[16px] font-bold tracking-[-0.015em]">
            {published ? (
              <Eye size={16} strokeWidth={2} aria-hidden className="text-[var(--jade)]" />
            ) : (
              <EyeOff size={16} strokeWidth={2} aria-hidden className="text-[var(--ink-faint)]" />
            )}
            The client&rsquo;s view
          </h2>
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
            {published
              ? `Published. ${publishedCount} of ${items.length} ${items.length === 1 ? "item is" : "items are"} included.`
              : "Not published. Nobody outside Coditu can see this component or any of its work."}
          </p>
        </div>
      </div>

      {canManage ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              What this is, in the client&rsquo;s words
            </Mono>
            <textarea
              className={FIELD}
              rows={2}
              value={draftSummary}
              maxLength={400}
              onChange={(event) => setDraftSummary(event.target.value)}
              placeholder="The news area of the intranet — the list, the detail page, and the editor's controls."
            />
          </label>

          <p className="text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
            This replaces the internal name for them. The internal description and any
            discuss-before-implementing note are never shown, whatever is written here.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    settle(() => setComponentPublication({
                      componentId,
                      projectSlug,
                      componentSlug,
                      summary: draftSummary,
                      published: true,
                    }), "That did not save. The client sees what they saw before."),
                  published ? "Summary saved." : `${componentName} is now visible to the client.`
                )
              }
              className="inline-flex h-11 items-center rounded-control bg-[var(--ink)] px-4 text-[13.5px] font-medium text-[var(--canvas)] disabled:opacity-60"
            >
              {published ? "Save summary" : "Publish to the client"}
            </button>

            {published ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Take ${componentName} back? The client stops seeing it and its work immediately.`)) return;
                  run(
                    () =>
                      settle(() => setComponentPublication({
                        componentId,
                        projectSlug,
                        componentSlug,
                        // The summary stays. Somebody taking a component back
                        // to fix a sentence should find their words when they
                        // return, and an unpublished summary is inert.
                        summary: draftSummary,
                        published: false,
                      }), "That did not save. The client sees what they saw before."),
                    `${componentName} is hidden from the client again.`
                  );
                }}
                className="inline-flex h-11 items-center rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium disabled:opacity-60"
              >
                Unpublish
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {published && items.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-4">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Which work they see
          </Mono>
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id} className="flex min-h-11 items-center gap-3 py-1">
                <input
                  id={`pub-${item.id}`}
                  type="checkbox"
                  className="size-[18px] shrink-0"
                  checked={item.published}
                  disabled={pending || !canManage}
                  onChange={(event) =>
                    run(
                      () =>
                        settle(() => setWorkItemPublication({
                          workItemId: item.id,
                          projectSlug,
                          componentSlug,
                          published: event.target.checked,
                        }), "That did not save. The client sees what they saw before."),
                      event.target.checked ? "Shown to the client." : "Hidden from the client."
                    )
                  }
                />
                <label htmlFor={`pub-${item.id}`} className="min-w-0 flex-1 text-[13.5px]">
                  <span className="break-words">{item.clientTitle ?? item.title}</span>
                  {item.clientTitle ? (
                    <span className="ml-2 text-[12px] text-[var(--ink-faint)]">
                      (internally: {item.title})
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Questions
          </Mono>
          {canManage && published ? (
            <button
              type="button"
              onClick={() => setAsking((open) => !open)}
              aria-expanded={asking}
              className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-3 text-[13.5px] font-medium"
            >
              <MessageCircleQuestion size={15} strokeWidth={2} aria-hidden />
              Ask the client
            </button>
          ) : null}
        </div>

        {!published ? (
          <p className="text-[13px] text-[var(--ink-muted)]">
            Publish this component before asking — a question about something they cannot see is a
            question they cannot answer.
          </p>
        ) : null}

        {asking ? (
          <form
            className="flex flex-col gap-2 rounded-card border border-[var(--hairline-strong)] p-3"
            action={(formData) => {
              const title = String(formData.get("title") ?? "").trim();
              const body = String(formData.get("body") ?? "").trim();
              if (!title || !body) return;

              run(
                () =>
                  settle(() => openClientThread({
                    componentId,
                    title,
                    doc: {
                      type: "doc",
                      content: body
                        .split(/\n{2,}/)
                        .map((block) => block.trim())
                        .filter(Boolean)
                        .map((block) => ({
                          type: "paragraph",
                          content: [{ type: "text", text: block }],
                        })),
                    },
                  }), "That thread was not opened.").then((result) => {
                    if (result.ok) setAsking(false);
                    return result;
                  }),
                "Asked. It is waiting for them now."
              );
            }}
          >
            <input className={FIELD} name="title" required maxLength={200} placeholder="What do you need to know?" />
            <textarea className={FIELD} name="body" required rows={3} placeholder="Give them enough to decide without opening anything else." />
            <p className="text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
              This goes to everybody at this client with access to the project. It is not an internal
              comment — write it as though they will read it, because they will.
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-11 items-center rounded-control bg-[var(--ink)] px-4 text-[13.5px] font-medium text-[var(--canvas)] disabled:opacity-60"
              >
                Send the question
              </button>
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="inline-flex h-11 items-center rounded-control px-4 text-[13.5px] font-medium text-[var(--ink-muted)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {threads.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-faint)]">Nothing asked yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {threads.map((thread) => (
              <li
                key={thread.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-card border border-[var(--hairline)] p-3"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium break-words">{thread.title}</p>
                  <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
                    {THREAD_STATE_LABEL_INTERNAL[thread.state]}
                    {thread.lastMessageAt ? ` · ${timestamp(thread.lastMessageAt)}` : ""}
                    {` · ${thread.messageCount} ${thread.messageCount === 1 ? "message" : "messages"}`}
                  </p>
                </div>

                {canManage ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          settle(() => resolveClientThread({
                            threadId: thread.id,
                            resolved: thread.state !== "resolved",
                          }), "That thread was not resolved."),
                        thread.state === "resolved" ? "Reopened." : "Marked answered."
                      )
                    }
                    className="inline-flex h-11 items-center rounded-control border border-[var(--hairline-strong)] px-3 text-[13px] font-medium disabled:opacity-60"
                  >
                    {thread.state === "resolved" ? "Reopen" : "Mark answered"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
