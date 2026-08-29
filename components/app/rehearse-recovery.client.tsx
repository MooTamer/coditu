"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { rehearseRecovery } from "@/lib/actions/recovery";
import { CHECK_DETAIL, CHECK_LABEL, RECOVERY_CHECKS, type RecoveryCheck } from "@/lib/recovery";
import { control } from "@/lib/interactive";

/**
 * Choosing what to rehearse, and pressing the one button on this screen.
 *
 * ## Why this one is allowed to be a client component
 *
 * Almost nothing else in the recovery screen is. This is the only part with a
 * choice in it — which checks to run — and a `<form method="get">` cannot help,
 * because running a rehearsal is a write and a GET that writes is the oldest
 * mistake on the web.
 *
 * ## Nothing is claimed before the server acknowledges it
 *
 * There is no optimistic state here, deliberately, and it is the one screen
 * where that is not a matter of taste: a rehearsal that *looked* like it passed
 * before the server agreed would be the most misleading thing this application
 * could render. The button says it is working, and the result arrives from the
 * read that follows.
 *
 * ## All three are on by default
 *
 * A rehearsal that skips a check reports "passed" about work it never did. The
 * boxes exist so somebody can narrow a re-run after a failure, not so the
 * default can be partial — and the count under the button says how many are
 * actually selected, so a narrowed run is never mistaken for a full one.
 */
export function RehearseRecovery({ canRun }: { canRun: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<RecoveryCheck[]>([...RECOVERY_CHECKS]);

  function toggle(check: RecoveryCheck) {
    setScope((current) =>
      current.includes(check) ? current.filter((c) => c !== check) : [...current, check]
    );
  }

  function run() {
    if (pending || scope.length === 0) return;
    startTransition(async () => {
      const result = await settle(
        () => rehearseRecovery({ scope }),
        "That rehearsal did not finish — check your connection. Nothing was changed."
      );

      if (!result.ok) {
        toast(result.error ?? "That rehearsal did not finish.");
        return;
      }

      // The page re-reads and shows the run. `router.refresh()` and not a
      // `push`, because we are already where the answer appears — and the
      // action has already revalidated, so this only pulls the new render.
      router.refresh();
      toast("Rehearsal finished. The result is at the top of the list.");
    });
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {RECOVERY_CHECKS.map((check) => {
          const on = scope.includes(check);
          return (
            <li key={check}>
              <label
                data-recovery-check={check}
                className="flex cursor-pointer items-start gap-3 rounded-control border border-[var(--hairline)] p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]"
                style={{ background: on ? "var(--raised)" : "transparent" }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(check)}
                  disabled={!canRun || pending}
                  className="mt-[2px] size-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium">{CHECK_LABEL[check]}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-[var(--ink-muted)]">
                    {CHECK_DETAIL[check]}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
        {...control(pending ? "pending" : "idle")}
          type="button"
          onClick={run}
          data-rehearse
          /* Disabled with the reason on it, never hidden — the shape this app
             has used since the shell was built. A non-admin can read this
             whole screen and see exactly what they cannot press. */
          disabled={!canRun || pending || scope.length === 0}
          title={
            !canRun
              ? "Only an admin can rehearse a recovery"
              : scope.length === 0
                ? "Choose at least one thing to check"
                : undefined
          }
          className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin motion-reduce:animate-none" />
          ) : (
            <ShieldCheck size={14} strokeWidth={2} aria-hidden />
          )}
          {pending ? "Rehearsing…" : "Rehearse a recovery"}
        </button>

        <Mono size="meta" aria-live="polite" className="text-[var(--ink-faint)]">
          {pending
            ? "copying into an isolated schema, checking, then dropping it"
            : scope.length === RECOVERY_CHECKS.length
              ? "all three checks · nothing is written back"
              : `${scope.length} of ${RECOVERY_CHECKS.length} checks · a narrowed run proves less`}
        </Mono>
      </div>
    </div>
  );
}
