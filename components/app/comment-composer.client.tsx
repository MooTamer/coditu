"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

import { useMounted } from "@/lib/hooks/use-client-state";

import { useToast } from "@/components/app/toast.client";
// From `lib/blocks/uploading.ts`, NOT from `uploading-image.client.tsx`:
// that module defines a TipTap node view, and importing a helper out of it
// puts 329 KB of ProseMirror on this page. See that file.
import { hasPendingUpload } from "@/lib/blocks/uploading";
import { Mono } from "@/components/coditu/mono";
import { useSaveReporter, useTrackedSave } from "@/components/app/save-state.client";
import { useAnnounceSurface } from "@/components/app/presence-surface.client";
import { postComment } from "@/lib/actions/comments";
import type { ProfileRef } from "@/lib/data/profiles";
import { isEmptyDocument } from "@/lib/blocks/schema";

/**
 * TipTap and ProseMirror are a large dependency, so they are loaded only when
 * somebody actually intends to write — on focus, or when a saved draft means
 * they were already writing. Reading a thread costs nothing.
 */
const CommentEditor = dynamic(
  () => import("./comment-editor.client").then((module) => module.CommentEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[112px] rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-3">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    ),
  }
);

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function draftKey(itemKey: string) {
  return `coditu.draft.${itemKey}`;
}

/**
 * Reads the saved draft for an item.
 *
 * `hydrated` gates the `localStorage` access — it is not readable on the
 * server. `version` is an invalidation token: it is unused in the body, but
 * taking it as a parameter makes it a genuine input, so bumping it re-reads
 * rather than returning a memoised value for a draft that has been deleted.
 */
function readDraft(itemKey: string, hydrated: boolean, version: number): unknown {
  void version;
  if (!hydrated) return null;
  try {
    const stored = window.localStorage.getItem(draftKey(itemKey));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    // A draft written while an upload was in flight holds a `blob:` URL that
    // died with the tab it was made in. Restoring one would put a permanently
    // broken picture in front of somebody with no way to tell what it was, so
    // the placeholder is dropped and the words it sat between are kept.
    if (hasPendingUpload(parsed)) return stripPendingUploads(parsed);
    return isEmptyDocument(parsed) ? null : parsed;
  } catch {
    // A corrupt draft is not worth an error message; start clean.
    return null;
  }
}

/** The same document with every unfinished upload taken out of it. */
function stripPendingUploads(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const current = node as { type?: string; content?: unknown[] };
  if (!current.content) return node;
  const content = current.content
    .filter((child) => !hasPendingUpload(child))
    .map(stripPendingUploads);
  return { ...current, content };
}

export function CommentComposer({
  itemId,
  itemKey,
  people,
  maxBatch,
  onPending,
}: {
  itemId: string;
  itemKey: string;
  people: ProfileRef[];
  /** How many images one paste may carry — from `app_settings`. */
  maxBatch?: number;
  /**
   * Called with the document at the moment of sending, from INSIDE this
   * component's transition — which is what scopes the thread's optimistic entry
   * to this action's lifetime. See `comment-thread.client.tsx`.
   */
  onPending?: (doc: unknown) => void;
}) {
  const [opened, setOpened] = useState(false);
  const trackedSave = useTrackedSave();
  const report = useSaveReporter();
  // Somebody is writing a comment. The stack says so; it never says what.
  useAnnounceSurface(opened ? "comment" : null);
  // null until the editor reports; a restored draft is not empty by definition.
  const [reportedEmpty, setReportedEmpty] = useState<boolean | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [pending, startTransition] = useTransition();
  // Null between submissions; a uuid from the first attempt until one succeeds.
  const retryToken = useRef<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const docRef = useRef<unknown>(EMPTY_DOC);
  const shellRef = useRef<HTMLDivElement>(null);
  const hydrated = useMounted();

  /**
   * A draft means the person was mid-sentence when something interrupted them,
   * so restoring one opens the editor straight away rather than making them
   * click back into it.
   *
   * Derived during render rather than set from an effect. `localStorage` is not
   * readable on the server, so this waits for `useMounted`, but waiting is not
   * the same as needing a state update — computing it here means one render
   * pass instead of two, and no `setState` inside an effect.
   */
  const restored = useMemo(
    () => readDraft(itemKey, hydrated, draftVersion),
    [itemKey, hydrated, draftVersion]
  );

  const active = opened || restored !== null;
  const doc = restored ?? EMPTY_DOC;
  // Without the fallback, a restored draft leaves Comment disabled until the
  // person types one more character — which is the opposite of restoring it.
  const empty = reportedEmpty ?? restored === null;

  useLayoutEffect(() => {
    // The editor is a dynamic import, so there is a beat between opening and
    // its autofocus landing. Park focus on the shell for that beat — otherwise
    // it sits on <body>, and Tab walks straight out of the surrounding dialog.
    if (active && shellRef.current && !shellRef.current.contains(document.activeElement)) {
      shellRef.current.focus({ preventScroll: true });
    }
  }, [active]);

  const onChange = useCallback(
    (next: unknown, isEmpty: boolean) => {
      docRef.current = next;
      setReportedEmpty(isEmpty);
      try {
        if (isEmpty) window.localStorage.removeItem(draftKey(itemKey));
        else window.localStorage.setItem(draftKey(itemKey), JSON.stringify(next));
        // The shared vocabulary, from the surface that already had half of it.
        // `draft saved` has been in this composer's footer since it was
        // written; saying it in the topbar as well is what makes it the same
        // word everywhere rather than this one composer's private caption.
        report(isEmpty ? "idle" : "draft");
      } catch {
        // Storage full or blocked. The comment itself still posts — but the
        // chip must not claim a draft was saved when it was not.
        report("idle");
      }
    },
    [itemKey, report]
  );

  const submit = useCallback(() => {
    // The ref holds whatever the editor last reported. Before it reports
    // anything — a restored draft the person has not touched yet — fall back to
    // the draft itself. Read here rather than during render: a ref is not
    // render state, and React will not re-render when it changes.
    const current = docRef.current !== EMPTY_DOC ? docRef.current : (restored ?? EMPTY_DOC);
    if (isEmptyDocument(current)) return;

    // An image that has not landed yet is a `blob:` URL that exists in this tab
    // and nowhere else. Posting now would store a picture nobody — including
    // its author, on their next reload — could ever see. Waiting two seconds is
    // better than that, and better than silently dropping the screenshot
    // somebody went to the trouble of pasting.
    if (hasPendingUpload(current)) {
      toast("An image is still uploading. It will be a moment.");
      return;
    }

    /** Empties the box, as if it had already sent. */
    const clear = () => {
      try {
        window.localStorage.removeItem(draftKey(itemKey));
      } catch {
        /* see above */
      }
      docRef.current = EMPTY_DOC;
      setReportedEmpty(true);
      setOpened(false);
      // Re-read the (now removed) draft, so `restored` stops holding the
      // document that was just posted. The editor remounts on this key, which
      // is what actually empties it.
      setDraftVersion((version) => version + 1);
    };

    // Emptied here, OUTSIDE the transition, and this is not a style choice:
    // state set inside a transition is deferred until the transition settles,
    // so clearing in there leaves the words sitting in the box until the write
    // returns — underneath a copy of themselves in the thread. The test caught
    // exactly that.
    clear();

    /**
     * One retry token per submission, not per attempt.
     *
     * It is minted when a send starts and kept until one succeeds, so the
     * retry a reader makes after a failure carries the SAME token as the
     * attempt that failed. That is the whole mechanism: if the first attempt
     * actually reached the database and only its response was lost, the retry
     * collides with itself and the server reports success instead of writing
     * the comment twice.
     *
     * Cleared on success, so the next comment is a new submission. Kept on
     * failure, which is the case that matters.
     */
    retryToken.current ??= crypto.randomUUID();
    const token = retryToken.current;

    startTransition(async () => {
      // The comment appears in the thread before the write is awaited. On a
      // hosted database that round trip is most of a second of a thread that
      // looks like it ignored you — which is the moment people press the button
      // a second time.
      onPending?.(current);

      const result = await trackedSave(
        () =>
          postComment({ itemId, doc: current, idempotencyKey: token }),
        "That comment did not save — check your connection."
      );
      if (result.ok) {
        retryToken.current = null;
        router.refresh();
      } else {
        // Invariant 4: a rollback with a visible reason. React drops the
        // optimistic comment when this transition ends; the draft goes back
        // into storage and the editor reopens holding it, so nothing anyone
        // wrote is lost — it is exactly where they left it.
        try {
          window.localStorage.setItem(draftKey(itemKey), JSON.stringify(current));
        } catch {
          /* see above */
        }
        docRef.current = current;
        setReportedEmpty(false);
        setOpened(true);
        setDraftVersion((version) => version + 1);
        // `trackedSave` already said `failed`; this says the second half of the
        // handoff's sentence — *"Failed — draft kept"* — is true, because the
        // draft has just been put back above.
        report("failed");
        toast(result.error ?? "That comment did not save.");
      }
    });
  }, [itemId, itemKey, onPending, report, restored, router, toast, trackedSave]);

  if (!active) {
    return (
      <button
        type="button"
        // Opens on activation, NOT on focus. Opening on focus swaps this button
        // out from under the focus that just arrived, and the browser drops
        // focus to <body> — so tabbing through the thread fell out of the
        // dialog entirely.
        onClick={() => setOpened(true)}
        className="flex w-full items-center gap-[10px] rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-[14px] py-[10px] text-left"
      >
        <span className="flex-1 text-[13.5px] text-[var(--ink-faint)]">
          Write a comment — @ to mention
        </span>
        <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
          {hydrated ? "⌘⏎ to send" : ""}
        </Mono>
      </button>
    );
  }

  return (
    <div ref={shellRef} tabIndex={-1} className="flex flex-col gap-2 outline-none">
      <CommentEditor
        // Remounts when the draft version changes, which is what clears the
        // editor's own content after a successful post.
        key={draftVersion}
        initialDoc={doc}
        people={people}
        onChange={onChange}
        onSubmit={submit}
        onEscape={() => undefined}
        onToast={toast}
        autoFocus
        workItemId={itemId}
        maxBatch={maxBatch}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={empty || pending}
          aria-busy={pending}
          className="signal-gradient h-[34px] rounded-control px-4 text-[13.5px] font-semibold text-[#07090E] disabled:opacity-50"
        >
          Comment
        </button>
        <Mono size="meta" className="text-[var(--ink-faint)]">
          ⌘⏎ to send · Esc to step away
        </Mono>
        {!empty ? (
          <Mono size="meta" data-composer-draft className="ml-auto text-[var(--ink-faint)]">
            draft saved
          </Mono>
        ) : null}
      </div>
    </div>
  );
}
