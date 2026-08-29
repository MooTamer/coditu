"use client";

import { useRef, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";

import { settle } from "@/lib/action-result";
import { replyToClientThread } from "@/lib/actions/client-threads";
import { control } from "@/lib/interactive";

/**
 * Answering, on a phone, with a thumb.
 *
 * ── A textarea, not the rich editor ────────────────────────────────────────
 *
 * The internal composer is TipTap: mentions, code blocks, pasted screenshots,
 * a toolbar. None of that belongs here. A client answering "the second one,
 * please" does not want a formatting toolbar, and shipping ProseMirror to the
 * portal would take it from **0 KB of its own JavaScript** to something well
 * over a hundred. The message is still stored as a ProseMirror document, built
 * here from plain paragraphs — same schema, same renderer, same allowlist, so
 * `comment-body.tsx` renders it and a future upgrade to the full editor is a
 * component swap rather than a migration.
 *
 * ── The draft survives ─────────────────────────────────────────────────────
 *
 * Keyed by thread AND by person. A shared laptop is a real thing at a client
 * company, and a draft key that is only the thread id would show one person's
 * half-written sentence to the next.
 *
 * ── Duplicate submits ──────────────────────────────────────────────────────
 *
 * The button is disabled while the transition runs and the text is cleared only
 * after the server says yes. A double-tap on a slow connection is the common
 * way a message gets sent twice, and it is the case a `disabled` attribute
 * actually handles.
 */
export function ReplyComposer({
  threadId,
  profileId,
  disabled,
  disabledReason,
}: {
  threadId: string;
  profileId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const key = `coditu:client-draft:${profileId}:${threadId}`;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);

  /**
   * The draft is restored DURING RENDER, not in an effect.
   *
   * `useEffect` + `setValue` is the obvious shape and React's own lint rule
   * (`react-hooks/set-state-in-effect`) refuses it. Adjusting state during
   * render is the documented answer, and `tab-bar.client.tsx` already uses it
   * for the same reason — React discards the in-progress render and re-runs
   * before committing, so nothing is painted twice and there is no hydration
   * mismatch to warn about.
   *
   * `typeof window` guards the server, where `sessionStorage` does not exist.
   * Keyed on `key`, so switching threads restores the right draft rather than
   * carrying one thread's half-sentence into another.
   */
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (restoredFor !== key && typeof window !== "undefined") {
    setRestoredFor(key);
    const saved = sessionStorage.getItem(key);
    setValue(saved ?? "");
  }

  if (disabled) {
    return (
      <p className="rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4 text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
        {disabledReason ?? "This question is read-only for you."}
      </p>
    );
  }

  function send() {
    const text = value.trim();
    if (!text) return;
    setError(null);

    startTransition(async () => {
      const result = await settle(() => replyToClientThread({
        threadId,
        // The same document shape `comments.body_json` uses. One paragraph per
        // line, blank lines dropped — which is what somebody typing into a
        // textarea means by pressing Enter twice.
        doc: {
          type: "doc",
          content: text
            .split(/\n{2,}/)
            .map((block) => block.trim())
            .filter(Boolean)
            .map((block) => ({
              type: "paragraph",
              content: [{ type: "text", text: block }],
            })),
        },
      }), "That did not send.").catch(() => ({
        ok: false as const,
        // A thrown Server Action never reaches the `ok: false` branch, so
        // without this the composer would simply stop with the text still in
        // it and no explanation. `07-FIELD-NOTES.md` has the entry.
        error: "That did not reach us. Check your connection and try again.",
      }));

      if (result.ok) {
        setValue("");
        sessionStorage.removeItem(key);
      } else {
        setError(result.error ?? "That did not send.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`reply-${threadId}`}>
        Your reply
      </label>
      <textarea
        id={`reply-${threadId}`}
        ref={field}
        value={value}
        rows={3}
        onChange={(event) => {
          setValue(event.target.value);
          sessionStorage.setItem(key, event.target.value);
        }}
        placeholder="Write your reply…"
        // 16px exactly. iOS Safari auto-zooms any focusable editable element
        // under 16px and does not zoom back out — the trap recorded in
        // `07-FIELD-NOTES.md`, which cost this repo an hour through the one
        // element the global rule did not match.
        className="w-full resize-y rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] p-3 text-[16px] leading-[1.55] text-[var(--ink)] placeholder:text-[var(--ink-faint)]"
      />

      {error ? (
        <p role="alert" className="text-[13px] leading-[1.5] text-[var(--tone-amber-fg)]">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
        {...control(pending ? "pending" : "idle")}
          type="button"
          onClick={send}
          disabled={pending || value.trim().length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-control bg-[var(--ink)] px-4 text-[14px] font-medium text-[var(--canvas)] disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send reply"}
          {pending ? null : <SendHorizontal size={15} strokeWidth={2} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
