"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { PersonAvatar } from "@/components/app/person-avatar";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { setMyName } from "@/lib/actions/profiles";
import { initialsFor } from "@/lib/profile-initials";

/**
 * Correcting your own name.
 *
 * There was no way to do this at all. A name arrives from the sign-up form —
 * or, for the four seeded accounts, from the import — and if it arrived wrong
 * it stayed wrong on every screen in the app, because the only other place a
 * name can be changed is `/app/people`, which is admin-only and is about role
 * and access rather than about spelling.
 *
 * The circle beside the field updates as you type, and that is the point of it
 * rather than decoration: `initials` is derived from the name by a rule nobody
 * has memorised, so the honest thing is to show the answer before the write.
 * `initialsFor` is the same rule `handle_new_user` applies at sign-up — see the
 * comment on it — and the server derives its own copy regardless of what this
 * sends, because a derived column that a form can set is not derived.
 */
export function NameSettings({
  fullName,
  avatarUrl,
}: {
  fullName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  /** What is in the box. The stored name is `saved`. */
  const [draft, setDraft] = useState(fullName);
  const [saved, setSaved] = useState(fullName);
  const [justSaved, setJustSaved] = useState(false);

  const trimmed = draft.trim();
  const changed = trimmed !== saved;
  const tooShort = trimmed.length < 2;

  function save() {
    if (!changed || tooShort || pending) return;

    // Optimistic, with the previous value kept for the rollback invariant 4
    // requires. The circle and the field are already showing the new name; if
    // the action fails, both go back and the toast says so.
    const previous = saved;
    setSaved(trimmed);
    setJustSaved(false);

    startTransition(async () => {
      try {
        const result = await setMyName({ fullName: trimmed });
        if (!result.ok) {
          setSaved(previous);
          setDraft(previous);
          toast(result.error ?? "That did not save.");
          return;
        }
        // The server's copy wins — it trims and derives its own initials, and
        // agreeing with it here is what stops the next render flickering.
        setSaved(result.fullName ?? trimmed);
        setDraft(result.fullName ?? trimmed);
        setJustSaved(true);
        // Refresh, so the face and name in the rail, the topbar and every board
        // card change without anybody reloading the page.
        router.refresh();
      } catch {
        // A Server Action that THROWS never returns a result, so the branch
        // above never runs and the field would sit there looking saved.
        setSaved(previous);
        setDraft(previous);
        toast("That did not save. Your name is unchanged — try again.");
      }
    });
  }

  return (
    <form
      className="mt-5 flex flex-wrap items-end gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <PersonAvatar
        person={{ fullName: trimmed || saved, initials: initialsFor(trimmed || saved), avatarUrl }}
        size={44}
        fontSize={16}
      />

      <label className="flex min-w-[min(320px,100%)] flex-1 flex-col gap-[6px]">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          Display name
        </Mono>
        <input
          name="fullName"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          value={draft}
          disabled={pending}
          onChange={(event) => {
            setDraft(event.target.value);
            setJustSaved(false);
          }}
          // 16px, not 14: iOS Safari zooms the whole page in when a focused
          // input's text is smaller than that, and it does not zoom back out.
          className="h-11 w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-[16px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] disabled:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={!changed || tooShort || pending}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save name"}
      </button>

      <Mono
        size="meta"
        // Polite, not assertive: this confirms something the reader just did.
        aria-live="polite"
        className="w-full text-[var(--ink-faint)]"
      >
        {tooShort ? (
          "A name needs at least two characters."
        ) : justSaved ? (
          <span className="inline-flex items-center gap-[6px] text-[var(--tone-jade-fg)]">
            <Check size={12} strokeWidth={2.4} aria-hidden />
            saved · your initials are {initialsFor(saved)}
          </span>
        ) : (
          `shown wherever you appear · initials ${initialsFor(trimmed || saved)}`
        )}
      </Mono>
    </form>
  );
}
