"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

import { useMounted } from "@/lib/hooks/use-client-state";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { postComment } from "@/lib/actions/comments";
import type { ProfileRef } from "@/lib/data/profiles";
import { isEmptyDocument } from "@/lib/comments/schema";

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
    return isEmptyDocument(parsed) ? null : parsed;
  } catch {
    // A corrupt draft is not worth an error message; start clean.
    return null;
  }
}

export function CommentComposer({
  itemId,
  itemKey,
  people,
}: {
  itemId: string;
  itemKey: string;
  people: ProfileRef[];
}) {
  const [opened, setOpened] = useState(false);
  // null until the editor reports; a restored draft is not empty by definition.
  const [reportedEmpty, setReportedEmpty] = useState<boolean | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [pending, startTransition] = useTransition();
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
      } catch {
        // Storage full or blocked. The comment itself still posts.
      }
    },
    [itemKey]
  );

  const submit = useCallback(() => {
    // The ref holds whatever the editor last reported. Before it reports
    // anything — a restored draft the person has not touched yet — fall back to
    // the draft itself. Read here rather than during render: a ref is not
    // render state, and React will not re-render when it changes.
    const current = docRef.current !== EMPTY_DOC ? docRef.current : (restored ?? EMPTY_DOC);
    if (isEmptyDocument(current)) return;

    startTransition(async () => {
      const result = await postComment({ itemId, doc: current });
      if (result.ok) {
        try {
          window.localStorage.removeItem(draftKey(itemKey));
        } catch {
          /* see above */
        }
        docRef.current = EMPTY_DOC;
        setReportedEmpty(true);
        setOpened(false);
        // Re-read the (now removed) draft, so `restored` stops holding the
        // document that was just posted.
        setDraftVersion((version) => version + 1);
        router.refresh();
      } else {
        // The draft is untouched, so nothing the person wrote is lost.
        toast(result.error ?? "That comment did not save.");
      }
    });
  }, [itemId, itemKey, restored, router, toast]);

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
          <Mono size="meta" className="ml-auto text-[var(--ink-faint)]">
            draft saved
          </Mono>
        ) : null}
      </div>
    </div>
  );
}
