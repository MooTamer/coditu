"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { deleteComment, editComment } from "@/lib/actions/comments";
import type { ProfileRef } from "@/lib/data/profiles";
import { cn } from "@/lib/utils";

/**
 * Editing and withdrawing a comment.
 *
 * `editComment` and `deleteComment` have existed since the thread was built.
 * They are zod-validated, authorized twice, covered by RLS and asserted in
 * pgTAP — and `grep -rn "editComment\|deleteComment" components app` returned
 * **nothing**. The "edited" badge in the item detail rendered a state no user
 * could reach. This is the missing half.
 *
 * **Withdrawn, not vanished.** `comments.deleted_at` is a soft delete and the
 * schema comment is explicit about why: an argument that disappears is worse
 * than one that is visibly struck out, because the replies underneath it stop
 * making sense. A removed comment keeps its author and its timestamp and says
 * it was withdrawn.
 *
 * The editor is the same one the composer uses, dynamically imported for the
 * same reason: TipTap and ProseMirror are most of a route's budget and a thread
 * you are only reading must never pay for them.
 */
const RichTextEditor = dynamic(
  () => import("@/components/app/rich-text-editor.client").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[96px] rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-3">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    ),
  }
);

const GHOST =
  "grid size-[30px] shrink-0 place-items-center rounded-control text-[var(--ink-faint)] transition-colors duration-[var(--dur-micro)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45";

export function CommentActions({
  commentId,
  authorName,
  bodyJson,
  people,
  canEdit,
  canRemove,
  children,
}: {
  commentId: string;
  authorName: string;
  /** The stored document, so the editor opens on what is actually there. */
  bodyJson: unknown;
  people: ProfileRef[];
  /** The author. Nobody rewrites somebody else's words. */
  canEdit: boolean;
  /** The author, or an admin. */
  canRemove: boolean;
  /** The comment as the server rendered it — the security boundary stays there. */
  children: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(bodyJson);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (empty) {
      setError("A comment cannot be empty. Remove it instead.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await settle(
        () => editComment({ commentId, doc: draft }),
        "That edit did not save — check your connection."
      );
      if (result.ok) {
        setEditing(false);
        router.refresh();
        return;
      }
      setError(result.error ?? "That edit did not save.");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await settle(
        () => deleteComment({ commentId }),
        "That did not save — check your connection."
      );
      if (result.ok) {
        toast(`${authorName}'s comment is withdrawn. It stays in the thread, struck through.`);
        router.refresh();
        return;
      }
      toast(result.error ?? "That did not save.");
    });
  }

  if (editing) {
    return (
      <div className="mt-1 flex flex-col gap-2">
        <RichTextEditor
          initialDoc={bodyJson}
          people={people}
          images
          autoFocus
          placeholder="Say it again, better"
          ariaLabel="Edit this comment"
          onChange={(doc, isEmpty) => {
            setDraft(doc);
            setEmpty(isEmpty);
          }}
          onSubmit={save}
          onEscape={() => setEditing(false)}
          onToast={(message) => toast(message)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || empty}
            aria-busy={pending}
            className="signal-gradient h-[32px] rounded-control px-4 text-[12.5px] font-semibold text-[#07090E] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(bodyJson);
              setError(null);
            }}
            className="h-[32px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)]"
          >
            Cancel
          </button>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            ⌘⏎ to save · Esc to abandon
          </Mono>
          {error ? (
            <p role="alert" className="basis-full text-[12.5px] text-[var(--rose)]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group/comment relative", pending && "opacity-60")}>
      {children}
      {canEdit || canRemove ? (
        <div className="mt-1 flex items-center gap-1">
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              aria-label="Edit this comment"
              className={GHOST}
            >
              <Pencil size={12} strokeWidth={1.8} aria-hidden />
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Withdraw this comment"
              title="Withdraw — it stays in the thread, struck through"
              className={cn(GHOST, "hover:text-[var(--rose)]")}
            >
              {pending ? (
                <Loader2
                  size={12}
                  strokeWidth={2}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <Trash2 size={12} strokeWidth={1.8} aria-hidden />
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
