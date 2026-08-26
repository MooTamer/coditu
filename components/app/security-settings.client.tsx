"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { KeyRound, MonitorSmartphone } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { signOutOtherDevices } from "@/lib/actions/auth";

/**
 * The two things you can do about how you get in.
 *
 * ## What is not here, and why
 *
 * The prototype's third security action is *"Push notifications on this
 * device · enabled"*. That is the Notifications section three headings up —
 * the same subscription, described twice. One control, one place.
 *
 * There is also no session list. GoTrue does not expose one to the session it
 * belongs to: a client can revoke other sessions but cannot enumerate or
 * describe them, so the prototype's `2 sessions` is a number this app has no
 * way to know. Printing one would be inventing it, which is the same refusal
 * `docs/06-PROGRESS.md` records for the backup schedule and the snapshot id.
 * The control says what it does instead of claiming what it will affect.
 *
 * ## Why signing out others has no confirmation
 *
 * There is nothing to undo and nothing to lose. The cost of pressing it by
 * mistake is signing in again on a device you are not holding — which is
 * exactly what somebody presses it *for*. A confirmation step here would be
 * ceremony around a reversible act, and this app keeps its confirmations for
 * the ones that are not: emptying the bin, and confirming a payout.
 */
export function SecuritySettings() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function signOutOthers() {
    if (pending) return;
    startTransition(async () => {
      const result = await signOutOtherDevices();
      if (result.error) {
        toast(result.error);
        return;
      }
      setDone(true);
      toast(result.notice ?? "Every other device has been signed out.");
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <Link
        href="/auth/update-password"
        data-change-password
        className="flex min-h-11 items-center justify-between gap-4 rounded-control border border-[var(--hairline)] px-4 py-2.5 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
      >
        <span className="inline-flex items-center gap-2.5">
          <KeyRound size={14} strokeWidth={2} aria-hidden />
          Change your password
        </span>
        <Mono size="meta" className="shrink-0 text-right text-[var(--ink-faint)]">
          this app sends no email
        </Mono>
      </Link>

      <button
        type="button"
        onClick={signOutOthers}
        disabled={pending}
        data-sign-out-others
        className="flex min-h-11 items-center justify-between gap-4 rounded-control border border-[var(--hairline)] px-4 py-2.5 text-left text-[13.5px] font-medium hover:bg-[var(--canvas)] disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-2.5">
          <MonitorSmartphone size={14} strokeWidth={2} aria-hidden />
          Sign out everywhere else
        </span>
        <Mono size="meta" aria-live="polite" className="shrink-0 text-right text-[var(--ink-faint)]">
          {pending ? "working…" : done ? "done · this device is still signed in" : "keeps this device"}
        </Mono>
      </button>
    </div>
  );
}
