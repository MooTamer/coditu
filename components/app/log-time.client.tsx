"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";

import { PersonAvatar } from "@/components/app/person-avatar";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { useTrackedSave } from "@/components/app/save-state.client";
import { deleteTimeEntry, logTime, updateTimeEntry } from "@/lib/actions/work-items";
import type { TimeEntryRecord } from "@/lib/data/work-item";
import { hours, hoursLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  isAdmin = false,
}: {
  itemId: string;
  /** Today in Africa/Cairo, computed on the server so it cannot drift. */
  today: string;
  entries: TimeEntryRecord[];
  totalMinutes: number;
  /** The caller. The entry is always attributed to them — RLS enforces it. */
  me: { id: string; fullName: string; initials: string; avatarUrl: string | null };
  /** An admin may strike anyone's entry. Nobody rewrites anyone else's. */
  isAdmin?: boolean;
}) {
  const [minutes, setMinutes] = useState(90);
  const trackedSave = useTrackedSave();
  const [pending, startTransition] = useTransition();
  // Null between submissions; a uuid from the first attempt until one succeeds.
  const retryToken = useRef<string | null>(null);
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
          person: { id: me.id, fullName: me.fullName, initials: me.initials, avatarUrl: me.avatarUrl },
        } as TimeEntryRecord,
      ],
      totalMinutes: state.totalMinutes + added,
    })
  );

  function submit() {
    const logged = minutes;
    // One token per submission, held until a send succeeds, so a retry after a
    // failure carries the token of the attempt that failed. If that attempt
    // reached the database and only its answer was lost, the retry collides
    // with itself rather than logging the half hour a second time. See
    // `postComment` for the full argument.
    retryToken.current ??= crypto.randomUUID();
    const token = retryToken.current;

    startTransition(async () => {
      // Inside the transition — that is what scopes the optimistic entry to
      // this action's lifetime.
      addOptimistic(logged);
      const result = await trackedSave(
        () => logTime({ itemId, minutes: logged, workedOn: today, idempotencyKey: token }),
        "That time did not save — check your connection."
      );
      if (result.ok) {
        retryToken.current = null;
        router.refresh();
      } else toast(result.error ?? "That time did not save.");
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
          <TimeEntryRow
            key={entry.id}
            entry={entry}
            canCorrect={entry.person.id === me.id && !entry.id.startsWith("pending-")}
            canRemove={
              (entry.person.id === me.id || isAdmin) && !entry.id.startsWith("pending-")
            }
          />
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

/**
 * One logged entry, and the two things you could not do to it until 2026-08-25.
 *
 * `logTime` was append-only in practice: type 8 hours instead of 0.8 and it was
 * in the sprint total forever. RLS has said `edit own time` and `delete own
 * time` since the first migration; there was simply no control. After
 * workstream E that gap is not a typo in a report, it is what somebody is paid.
 *
 * **Correcting is your own only; removing is yours or an admin's.** That
 * asymmetry is the policy's, not this component's: an admin can strike a wrong
 * entry, but nobody rewrites somebody else's record of what they did.
 */
function TimeEntryRow({
  entry,
  canCorrect,
  canRemove,
}: {
  entry: TimeEntryRecord;
  canCorrect: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const trackedSave = useTrackedSave();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState(entry.minutes);
  const [workedOn, setWorkedOn] = useState(entry.workedOn);

  function save() {
    startTransition(async () => {
      const result = await trackedSave(
        () => updateTimeEntry({ entryId: entry.id, minutes, workedOn }),
        "That correction did not save — check your connection."
      );
      if (result.ok) {
        setEditing(false);
        router.refresh();
        return;
      }
      toast(result.error ?? "That correction did not save.");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await trackedSave(
        () => deleteTimeEntry({ entryId: entry.id }),
        "That entry did not go — check your connection."
      );
      if (result.ok) {
        // An undo toast rather than a confirm dialog: the team's own pattern for
        // a reversible destructive action. Logging it again is one control away
        // and the sentence says what left the total.
        toast(`${hoursLabel(entry.minutes)} removed from ${entry.workedOn}.`);
        router.refresh();
        return;
      }
      toast(result.error ?? "That entry did not go.");
    });
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-control border border-[var(--hairline-strong)] p-2">
        <label className="sr-only" htmlFor={`worked-${entry.id}`}>
          Date worked
        </label>
        <input
          id={`worked-${entry.id}`}
          type="date"
          value={workedOn}
          onChange={(event) => setWorkedOn(event.target.value)}
          className="h-[34px] min-w-0 flex-1 rounded-control border border-[var(--hairline)] bg-[var(--canvas)] px-2 text-[13.5px]"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinutes((m) => Math.max(MIN, m - STEP))}
            aria-label="Half an hour less"
            className="size-[34px] rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)]"
          >
            −
          </button>
          <Mono size="meta" as="output" aria-live="polite" className="w-[38px] text-center">
            {hours(minutes)}
          </Mono>
          <button
            type="button"
            onClick={() => setMinutes((m) => Math.min(MAX, m + STEP))}
            aria-label="Half an hour more"
            className="size-[34px] rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)]"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-[34px] rounded-control border border-[var(--hairline-strong)] px-3 text-[12.5px] font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setMinutes(entry.minutes);
            setWorkedOn(entry.workedOn);
          }}
          aria-label="Cancel this correction"
          className="h-[34px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)]"
        >
          <X size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-2 transition-opacity duration-[var(--dur-micro)]",
        // Dimmed while its own write is in flight. `disabled` alone says "not
        // now" without saying "something is happening", which on a slow
        // connection is indistinguishable from a click that missed.
        pending && "opacity-50"
      )}
    >
      <Mono size="meta" className="text-[var(--ink-muted)]">
        {entry.workedOn}
      </Mono>
      <span className="flex items-center gap-2">
        <PersonAvatar person={entry.person} size={18} fontSize={8} title={entry.person.fullName} />
        <Mono size="meta" className="text-[var(--ink-muted)]">
          {hoursLabel(entry.minutes)}
        </Mono>
        {canCorrect ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            aria-label={`Correct ${hoursLabel(entry.minutes)} on ${entry.workedOn}`}
            className="grid size-[30px] shrink-0 place-items-center rounded-control text-[var(--ink-faint)] hover:text-[var(--ink)]"
          >
            <Pencil size={12} strokeWidth={1.8} aria-hidden />
          </button>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={`Remove ${hoursLabel(entry.minutes)} on ${entry.workedOn}`}
            className="grid size-[30px] shrink-0 place-items-center rounded-control text-[var(--ink-faint)] hover:text-[var(--rose)]"
          >
            <Trash2 size={12} strokeWidth={1.8} aria-hidden />
          </button>
        ) : null}
      </span>
    </div>
  );
}
