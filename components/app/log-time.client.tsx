"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { logTime } from "@/lib/actions/work-items";
import type { TimeEntryRecord } from "@/lib/data/work-item";
import { hours, hoursLabel } from "@/lib/format";

/** Half-hour steps, as minutes. Invariant 2: the UI never holds a float. */
const STEP = 30;
const MIN = 30;
const MAX = 1440;

export function LogTime({
  itemId,
  today,
  entries,
  totalMinutes,
  me,
}: {
  itemId: string;
  /** Today in Africa/Cairo, computed on the server so it cannot drift. */
  today: string;
  entries: TimeEntryRecord[];
  totalMinutes: number;
  /** The caller. The entry is always attributed to them — RLS enforces it. */
  me: { id: string; fullName: string; initials: string };
}) {
  const [minutes, setMinutes] = useState(90);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  /**
   * The entry and the total move the moment the button is pressed.
   *
   * This used to wait for the write and then `router.refresh()`, so the number
   * this whole app's credibility rests on sat unchanged for a round trip while
   * the button said nothing — and the reader's most reasonable conclusion was
   * that the click had missed.
   *
   * `useOptimistic` IS the rollback: the added entry lives only for the
   * duration of the transition. On success `revalidatePath` sends down the real
   * one and the number does not move again; on failure React drops it, the
   * total snaps back, and the toast says why. Invariant 4, and invariant 2 —
   * this adds integer minutes, never a fraction of an hour.
   */
  const [shown, addOptimistic] = useOptimistic(
    { entries, totalMinutes },
    (state, added: number) => ({
      entries: [
        ...state.entries,
        {
          id: `pending-${state.entries.length}`,
          minutes: added,
          workedOn: today,
          note: null,
          person: { id: me.id, fullName: me.fullName, initials: me.initials },
        } as TimeEntryRecord,
      ],
      totalMinutes: state.totalMinutes + added,
    })
  );

  function submit() {
    const logged = minutes;
    startTransition(async () => {
      // Inside the transition — that is what scopes the optimistic entry to
      // this action's lifetime.
      addOptimistic(logged);
      const result = await settle(
        () => logTime({ itemId, minutes: logged, workedOn: today }),
        "That time did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else toast(result.error ?? "That time did not save.");
    });
  }

  return (
    <div className="rounded-card border border-[var(--hairline)] bg-[var(--overlay)] p-4">
      <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
        Log time
      </Mono>

      <div className="mt-[14px] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMinutes((m) => Math.max(MIN, m - STEP))}
          aria-label="Half an hour less"
          className="size-[34px] rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)]"
        >
          −
        </button>
        <Mono
          size="key"
          as="output"
          aria-live="polite"
          className="flex-1 text-center text-[18px]"
        >
          {hours(minutes)}
        </Mono>
        <button
          type="button"
          onClick={() => setMinutes((m) => Math.min(MAX, m + STEP))}
          aria-label="Half an hour more"
          className="size-[34px] rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)]"
        >
          +
        </button>
      </div>

      <div className="mt-[10px] flex items-center justify-between">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          {today}
        </Mono>
        <Mono size="meta" className="text-[var(--ink-faint)]">
          0.5 h steps
        </Mono>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        aria-busy={pending}
        className="signal-gradient mt-[14px] h-[38px] w-full rounded-control text-[13.5px] font-semibold text-[#07090E] disabled:opacity-70"
      >
        Log {hours(minutes)} h
      </button>

      <div className="mt-[14px] flex flex-col gap-2">
        {shown.entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-2">
            <Mono size="meta" className="text-[var(--ink-muted)]">
              {entry.workedOn}
            </Mono>
            <Mono size="meta" className="text-[var(--ink-muted)]">
              {entry.person.initials} · {hoursLabel(entry.minutes)}
            </Mono>
          </div>
        ))}
        {shown.entries.length === 0 ? (
          <Mono size="meta" className="text-[var(--ink-faint)]">
            no entries yet
          </Mono>
        ) : null}

        <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-2">
          <Mono size="key">total</Mono>
          <Mono size="key" className="font-semibold">
            {hoursLabel(shown.totalMinutes)}
          </Mono>
        </div>
      </div>
    </div>
  );
}
