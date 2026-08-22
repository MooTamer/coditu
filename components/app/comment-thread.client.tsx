"use client";

import { useOptimistic, type ReactNode } from "react";

import { PersonAvatar } from "@/components/app/person-avatar";
import { CommentComposer } from "@/components/app/comment-composer.client";
import { Mono } from "@/components/coditu/mono";
import { flattenToText } from "@/lib/comments/schema";
import type { ProfileRef } from "@/lib/data/profiles";

/**
 * The thread, with the comment you just wrote already in it.
 *
 * Posting used to wait for the round trip and then `router.refresh()`, so the
 * thread sat unchanged while the server thought about it — on a hosted database
 * that is most of a second of a page that looks like it ignored you, which is
 * the exact moment people press the button again.
 *
 * ── Why `children` and not a list of comments ──────────────────────────────
 * `components/app/comment-body.tsx` is the security boundary: it walks stored
 * ProseMirror JSON into React elements, server-side, and it highlights code
 * with lowlight. Rendering the thread from a client component would drag all of
 * that into the browser bundle — a route that is already 100.5KB of its 110KB
 * budget — to display comments the server has already rendered perfectly well.
 *
 * So the server renders the real thread and hands it here as `children`. This
 * component only adds the one comment that does not exist yet.
 *
 * ── Why the pending comment is plain text ──────────────────────────────────
 * For the same reason. It is the flattened text of what was typed, marked
 * "sending…", and it lives for exactly as long as the transition: when the
 * refresh lands it is replaced by the real, fully rendered comment, and if the
 * write fails React drops it and the composer hands the draft back. Invariant 4
 * — a rollback, and a visible reason.
 */

interface Pending {
  id: string;
  text: string;
}

/** Stable identity, so the base value is not a new array on every render. */
const NONE: Pending[] = [];

export function CommentThread({
  itemId,
  itemKey,
  people,
  me,
  isEmpty,
  children,
}: {
  itemId: string;
  itemKey: string;
  people: ProfileRef[];
  /** The signed-in reader, so their own comment can carry their name. */
  me: { fullName: string; initials: string; avatarUrl: string | null };
  /** Whether the server-rendered thread is empty — it cannot be read from `children`. */
  isEmpty: boolean;
  /** The real thread, rendered on the server. */
  children: ReactNode;
}) {
  const [pending, addPending] = useOptimistic<Pending[], Pending>(NONE, (state, comment) => [
    ...state,
    comment,
  ]);

  return (
    <>
      {/* `aria-relevant="additions"` so an arriving comment is announced and the
          thread that was already on screen is not. A bare `aria-live="polite"`
          on a list would read the whole discussion out on every refresh. */}
      <div aria-live="polite" aria-relevant="additions" className="mt-[14px] flex flex-col gap-[14px]">
        {children}

        {pending.map((comment) => (
          <article key={comment.id} data-reveal="micro" className="flex gap-3">
            <PersonAvatar person={me} size={28} fontSize={10} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-semibold">{me.fullName}</span>
                <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                  sending…
                </Mono>
              </div>
              {/* Dimmed, because it is not saved yet and should not claim to be. */}
              <div className="mt-1 whitespace-pre-wrap text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
                {comment.text}
              </div>
            </div>
          </article>
        ))}

        {isEmpty && pending.length === 0 ? (
          <p className="text-[13.5px] text-[var(--ink-faint)]">No discussion yet.</p>
        ) : null}
      </div>

      <div className="mt-4">
        <CommentComposer
          itemId={itemId}
          itemKey={itemKey}
          people={people}
          onPending={(doc) => {
            // Called from inside the composer's transition, which is what scopes
            // the optimistic entry to that action's lifetime.
            addPending({ id: `pending-${pending.length}`, text: flattenToText(doc) });
          }}
        />
      </div>
    </>
  );
}
