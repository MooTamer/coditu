"use client";

import { RichTextEditor } from "@/components/app/rich-text-editor.client";
import type { ProfileRef } from "@/lib/data/profiles";

/**
 * The comment composer's editor: `RichTextEditor`, configured for a comment.
 *
 * This file used to BE the editor. §2 of the thread brief needed the same one
 * for acceptance criteria, and the instruction was explicit — extract it, do
 * not duplicate it. So the TipTap instance, the toolbar, the link popover, the
 * paste filter and the upload flow moved to
 * `components/app/rich-text-editor.client.tsx`, and what is left here is the
 * configuration that makes it a comment: mentions on, images on, a paragraph's
 * worth of height, and the placeholder that says what this box is for.
 *
 * **Its behaviour must not change by one pixel.** `e2e/comments.spec.ts`,
 * `e2e/composer.spec.ts` and `tests/comment-rendering.test.ts` are the proof
 * and they pass untouched.
 *
 * Kept as its own module rather than inlined at the call site because
 * `comment-composer.client.tsx` imports it through `next/dynamic`, and the
 * dynamic boundary is what keeps TipTap and ProseMirror out of the app shell.
 */
export function CommentEditor({
  initialDoc,
  people,
  onChange,
  onSubmit,
  onEscape,
  onToast,
  autoFocus,
  workItemId,
  maxBatch,
  placeholder = "Write a comment — @ to mention",
  ariaLabel = "Comment",
  minHeight = 72,
}: {
  initialDoc: unknown;
  people: ProfileRef[];
  onChange: (doc: unknown, isEmpty: boolean) => void;
  onSubmit: () => void;
  onEscape: () => void;
  onToast: (message: string) => void;
  autoFocus: boolean;
  /** The item this comment belongs to, so an upload can be recorded against it. */
  workItemId?: string;
  /** How many images one paste may carry — from `app_settings`. */
  maxBatch?: number;
  /** An acceptance criterion is not a comment, and should not say it is. */
  placeholder?: string;
  ariaLabel?: string;
  /** A criterion is usually one line; a comment expects a paragraph. */
  minHeight?: number;
}) {
  return (
    <RichTextEditor
      initialDoc={initialDoc}
      people={people}
      images
      workItemId={workItemId}
      maxBatch={maxBatch}
      onChange={onChange}
      onSubmit={onSubmit}
      onEscape={onEscape}
      onToast={onToast}
      autoFocus={autoFocus}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      minHeight={minHeight}
      density="comfortable"
    />
  );
}
