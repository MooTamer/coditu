"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Trash2, UserPlus } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { addAllowedEmail, removeAllowedEmail } from "@/lib/actions/allowlist";
import type { AllowedEmail } from "@/lib/data/allowlist";
import { calendarDate } from "@/lib/format";

const FIELD =
  "h-[38px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";

/**
 * The invite list.
 *
 * Invariant 4: every optimistic change has a rollback path and a visible error.
 * `useOptimistic` state is discarded when the transition ends, so a rejected
 * write restores the real list on its own — and the toast is what stops that
 * looking like the row simply flickered.
 */
export function AllowlistPanel({ rows }: { rows: AllowedEmail[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const [optimistic, applyOptimistic] = useOptimistic(
    rows,
    (current: AllowedEmail[], change: { type: "add"; row: AllowedEmail } | { type: "remove"; email: string }) =>
      change.type === "add"
        ? [change.row, ...current]
        : current.filter((row) => row.email !== change.email)
  );

  function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const note = String(formData.get("note") ?? "").trim();
    setError(null);

    startTransition(async () => {
      applyOptimistic({
        type: "add",
        row: { email, note: note || null, invitedBy: null, createdAt: new Date().toISOString(), claimed: false },
      });

      const result = await addAllowedEmail({ email, note: note || undefined });
      if (result.ok) {
        form.current?.reset();
        toast(`${email} can now sign up.`);
      } else {
        setError(result.error ?? "That did not save.");
        toast(result.error ?? "That did not save.");
      }
    });
  }

  function remove(email: string) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "remove", email });
      const result = await removeAllowedEmail({ email });
      if (result.ok) {
        toast(`${email} can no longer sign up.`);
      } else {
        setError(result.error ?? "That did not save.");
        toast(result.error ?? "That did not save.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form ref={form} action={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Email
          </Mono>
          <input
            className={FIELD}
            type="email"
            name="email"
            enterKeyHint="next"
            required
            placeholder="person@example.com"
          />
        </label>

        <label className="flex min-w-[180px] flex-1 flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Note (optional)
          </Mono>
          <input
            className={FIELD}
            type="text"
            name="note"
            enterKeyHint="done"
            maxLength={120}
            placeholder="Designer, joining in March"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="signal-gradient flex h-[38px] shrink-0 items-center gap-2 rounded-control px-4 text-[13.5px] font-semibold text-[#07090E] disabled:opacity-70"
        >
          <UserPlus size={15} strokeWidth={2} aria-hidden />
          Invite
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--rose)]">
          {error}
        </p>
      ) : null}

      {optimistic.length === 0 ? (
        <p className="text-[13.5px] text-[var(--ink-muted)]">
          Nobody is invited yet. An address has to be on this list before anyone can create an
          account with it.
        </p>
      ) : (
        // `data-allowlist` so a spec can ask for THIS list. `/app/people` also
        // renders the access history, whose entries quote the same address
        // ("… invited allowlist-probe@example.com"), so a page-level `li`
        // filtered by an email matches three things once the history has
        // anything in it — and passes only against a database nobody has used.
        <ul
          data-allowlist
          className="flex flex-col rounded-list border border-[var(--hairline)]"
        >
          {optimistic.map((row) => (
            <li
              key={row.email}
              data-reveal="micro"
              className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[var(--ink)]">{row.email}</span>
                {row.note ? (
                  <span className="block truncate text-[12.5px] text-[var(--ink-muted)]">{row.note}</span>
                ) : null}
              </span>

              <Mono
                size="eyebrow"
                className="shrink-0 rounded-chip px-2 py-[3px]"
                style={
                  row.claimed
                    ? { color: "var(--tone-jade-fg)", background: "var(--tone-jade-bg)" }
                    : { color: "var(--tone-slate-fg)", background: "var(--tone-slate-bg)" }
                }
              >
                {row.claimed ? "signed up" : "invited"}
              </Mono>

              <Mono size="meta" className="hidden shrink-0 text-[var(--ink-faint)] sm:block">
                {calendarDate(row.createdAt.slice(0, 10))}
                {row.invitedBy ? ` · by ${row.invitedBy}` : ""}
              </Mono>

              <button
                type="button"
                onClick={() => remove(row.email)}
                disabled={pending}
                aria-label={`Withdraw the invite for ${row.email}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--rose)] hover:text-[var(--rose)] disabled:opacity-50"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
