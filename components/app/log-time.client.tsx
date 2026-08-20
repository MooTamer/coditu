"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
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
}: {
  itemId: string;
  /** Today in Africa/Cairo, computed on the server so it cannot drift. */
  today: string;
  entries: TimeEntryRecord[];
  totalMinutes: number;
}) {
  const [minutes, setMinutes] = useState(90);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const result = await logTime({ itemId, minutes, workedOn: today });
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
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-2">
            <Mono size="meta" className="text-[var(--ink-muted)]">
              {entry.workedOn}
            </Mono>
            <Mono size="meta" className="text-[var(--ink-muted)]">
              {entry.person.initials} · {hoursLabel(entry.minutes)}
            </Mono>
          </div>
        ))}
        {entries.length === 0 ? (
          <Mono size="meta" className="text-[var(--ink-faint)]">
            no entries yet
          </Mono>
        ) : null}

        <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-2">
          <Mono size="key">total</Mono>
          <Mono size="key" className="font-semibold">
            {hoursLabel(totalMinutes)}
          </Mono>
        </div>
      </div>
    </div>
  );
}
