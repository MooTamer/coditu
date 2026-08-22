"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { PersonAvatar } from "@/components/app/person-avatar";
import { CellPopover, optionListKeyDown } from "@/components/app/cell-popover.client";
import { Mono } from "@/components/coditu/mono";
import { StatusChipDot } from "@/components/coditu/status-chip";
import { settle } from "@/lib/action-result";
import {
  logTime,
  setWorkItemFields,
  setWorkItemPerson,
  setWorkItemStatus,
} from "@/lib/actions/work-items";
import type { PersonRef } from "@/lib/data/sprint";
import { calendarDate, hours } from "@/lib/format";
import {
  STATUS_DISPLAY_ORDER,
  STATUS_LABEL,
  TYPE_LABEL,
  WORK_ITEM_TYPES,
  groupingHue,
  type WorkItemStatus,
  type WorkItemType,
} from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * The editable table cells.
 *
 * Every one of them writes optimistically, and every one of them can roll back.
 * `useOptimistic` IS the rollback path: the optimistic value lives only for the
 * duration of the transition, so a rejected write drops it on its own and the
 * cell snaps to whatever the server actually holds. The toast fires at exactly
 * that moment, which is what stops the revert looking like a flicker —
 * invariant 4.
 *
 * The field editors below are typed rather than picked, so they commit on blur
 * or Enter rather than on every keystroke: a write per character would be a
 * write per character.
 */

const OPTION =
  "flex w-full items-center gap-2 rounded-chip px-2 py-[7px] text-left text-[13.5px] hover:bg-[var(--canvas)]";
const FIELD =
  "h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)]";

type Toast = (message: string) => void;

/* -------------------------------------------------------------------------- */

export function StatusCell({
  itemId,
  status,
  editable,
  onToast,
}: {
  itemId: string;
  status: WorkItemStatus;
  editable: boolean;
  onToast: Toast;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(status);

  function choose(next: WorkItemStatus, close: () => void) {
    close();
    if (next === shown) return;
    startTransition(async () => {
      // Must be inside the transition — that is what scopes the optimistic
      // value to this action's lifetime.
      showOptimistic(next);
      const result = await settle(
        () => setWorkItemStatus({ itemId, status: next }),
        "That change did not save — check your connection."
      );
      if (!result.ok) onToast(result.error ?? "That change did not save.");
    });
  }

  return (
    <CellPopover
      label={`Status: ${STATUS_LABEL[shown]}. Change status.`}
      value={<StatusChipDot status={shown} />}
      disabled={!editable}
      disabledReason="Only the assignee or reviewer can move this item"
      busy={pending}
      width={190}
    >
      {(close) => (
        <div role="listbox" aria-label="Status" onKeyDown={optionListKeyDown}>
          {STATUS_DISPLAY_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === shown}
              data-autofocus={option === shown ? "" : undefined}
              onClick={() => choose(option, close)}
              className={cn(OPTION, option === shown && "bg-[var(--canvas)]")}
            >
              <StatusChipDot status={option} />
            </button>
          ))}
        </div>
      )}
    </CellPopover>
  );
}

/* -------------------------------------------------------------------------- */

export function PersonCell({
  itemId,
  field,
  person,
  people,
  editable,
  fallback,
  onToast,
}: {
  itemId: string;
  field: "assignee_id" | "reviewer_id";
  person: PersonRef | null;
  people: PersonRef[];
  editable: boolean;
  /** What "nobody" reads as. "unassigned" for an assignee, "—" for a reviewer. */
  fallback: string;
  onToast: Toast;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(person);

  function choose(next: PersonRef | null, close: () => void) {
    close();
    if ((next?.id ?? null) === (shown?.id ?? null)) return;
    startTransition(async () => {
      showOptimistic(next);
      const result = await settle(
        () => setWorkItemPerson({ itemId, field, profileId: next?.id ?? null }),
        "That change did not save — check your connection."
      );
      // A reassignment moves the row between "assigned to me" and everyone
      // else's list, so the shell's counts are stale until this lands.
      if (result.ok) router.refresh();
      else onToast(result.error ?? "That change did not save.");
    });
  }

  const noun = field === "assignee_id" ? "Assignee" : "Reviewer";

  return (
    <CellPopover
      label={`${noun}: ${shown?.fullName ?? fallback}. Change ${noun.toLowerCase()}.`}
      value={<PersonFace person={shown} fallback={fallback} />}
      disabled={!editable}
      disabledReason="Only an admin or lead can change who owns an item"
      busy={pending}
      width={230}
    >
      {(close) => (
        <div role="listbox" aria-label={noun} onKeyDown={optionListKeyDown}>
          <button
            type="button"
            role="option"
            aria-selected={shown === null}
            data-autofocus={shown === null ? "" : undefined}
            onClick={() => choose(null, close)}
            className={cn(OPTION, shown === null && "bg-[var(--canvas)]")}
          >
            <PersonFace person={null} fallback={fallback} />
          </button>
          {people.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === shown?.id}
              data-autofocus={option.id === shown?.id ? "" : undefined}
              onClick={() => choose(option, close)}
              className={cn(OPTION, option.id === shown?.id && "bg-[var(--canvas)]")}
            >
              <PersonFace person={option} fallback={fallback} full />
            </button>
          ))}
        </div>
      )}
    </CellPopover>
  );
}

function PersonFace({
  person,
  fallback,
  full,
}: {
  person: PersonRef | null;
  fallback: string;
  /** Full name in the menu; first name in the 120px-wide cell. */
  full?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap">
      <PersonAvatar person={person} size={24} fontSize={9.5} />
      <span
        className="truncate text-[13.5px]"
        style={{ color: person ? "var(--ink)" : "var(--ink-faint)" }}
      >
        {person ? (full ? person.fullName : person.fullName.split(" ")[0]) : fallback}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/** Half-hour steps, as minutes. Invariant 2: the UI never holds a float. */
const STEP = 30;

export function HoursCell({
  itemId,
  minutesLogged,
  estimateMinutes,
  today,
  canEstimate,
  onToast,
}: {
  itemId: string;
  minutesLogged: number;
  estimateMinutes: number;
  /** Today in Africa/Cairo, computed on the server so it cannot drift. */
  today: string;
  canEstimate: boolean;
  onToast: Toast;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(90);
  const [estimate, setEstimate] = useState(() => (estimateMinutes / 60).toFixed(1));

  const over = minutesLogged > estimateMinutes && estimateMinutes > 0;

  function log(close: () => void) {
    close();
    startTransition(async () => {
      const result = await settle(
        () => logTime({ itemId, minutes: draft, workedOn: today }),
        "That time did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else onToast(result.error ?? "That time did not save.");
    });
  }

  function commitEstimate() {
    const value = Number(estimate);
    if (!Number.isFinite(value) || value < 0) {
      setEstimate((estimateMinutes / 60).toFixed(1));
      onToast("An estimate has to be a number of hours.");
      return;
    }
    const minutes = Math.round(value * 60);
    if (minutes === estimateMinutes) return;
    startTransition(async () => {
      const result = await settle(
        () => setWorkItemFields({ itemId, estimateMinutes: minutes }),
        "That estimate did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else {
        setEstimate((estimateMinutes / 60).toFixed(1));
        onToast(result.error ?? "That estimate did not save.");
      }
    });
  }

  return (
    <CellPopover
      label={`${hours(minutesLogged)} of ${hours(estimateMinutes)} hours. Log time or change the estimate.`}
      align="end"
      width={250}
      busy={pending}
      className="justify-end"
      value={
        <span className="whitespace-nowrap">
          <Mono
            size="key"
            className="text-[13px]"
            style={{ color: over ? "var(--amber-text)" : "var(--ink)" }}
          >
            {minutesLogged > 0 ? hours(minutesLogged) : "—"}
          </Mono>
          <Mono size="key" className="text-[var(--ink-faint)]">
            {` / ${hours(estimateMinutes)}`}
          </Mono>
        </span>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-3 p-2">
          <div>
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              Log time
            </Mono>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                data-autofocus=""
                onClick={() => setDraft((m) => Math.max(STEP, m - STEP))}
                aria-label="Half an hour less"
                className="size-[30px] shrink-0 rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)]"
              >
                −
              </button>
              <Mono size="key" as="output" aria-live="polite" className="flex-1 text-center text-[16px]">
                {hours(draft)}
              </Mono>
              <button
                type="button"
                onClick={() => setDraft((m) => Math.min(1440, m + STEP))}
                aria-label="Half an hour more"
                className="size-[30px] shrink-0 rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)]"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => log(close)}
              className="signal-gradient mt-2 h-[32px] w-full rounded-control text-[13px] font-semibold text-[#07090E]"
            >
              Log {hours(draft)} h on {today}
            </button>
          </div>

          {canEstimate ? (
            <label className="flex flex-col gap-[6px] border-t border-[var(--hairline)] pt-3">
              <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                Estimate (hours)
              </Mono>
              <input
                className={FIELD}
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                onBlur={commitEstimate}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitEstimate();
                    close();
                  }
                }}
              />
            </label>
          ) : (
            <p className="border-t border-[var(--hairline)] pt-3 text-[12px] text-[var(--ink-faint)]">
              Only an admin or lead can change the estimate.
            </p>
          )}
        </div>
      )}
    </CellPopover>
  );
}

/* -------------------------------------------------------------------------- */

export function DeadlineCell({
  itemId,
  deadline,
  dueSoon,
  editable,
  onToast,
}: {
  itemId: string;
  deadline: string | null;
  dueSoon: boolean;
  editable: boolean;
  onToast: Toast;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(deadline);

  function commit(next: string | null, close: () => void) {
    close();
    if (next === shown) return;
    startTransition(async () => {
      showOptimistic(next);
      const result = await settle(
        () => setWorkItemFields({ itemId, deadline: next }),
        "That deadline did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else onToast(result.error ?? "That deadline did not save.");
    });
  }

  return (
    <CellPopover
      label={`Deadline: ${shown ?? "none"}. Change deadline.`}
      width={220}
      busy={pending}
      disabled={!editable}
      disabledReason="Only an admin or lead can change a deadline"
      value={
        <Mono
          size="key"
          className="whitespace-nowrap text-[12.5px]"
          style={{ color: dueSoon ? "var(--amber-text)" : "var(--ink-muted)" }}
        >
          {calendarDate(shown)}
        </Mono>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2 p-2">
          <label className="flex flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              Deadline
            </Mono>
            <input
              data-autofocus=""
              className={FIELD}
              type="date"
              defaultValue={shown ?? ""}
              onChange={(event) => {
                // A date input fires change on a complete date, not per
                // keystroke, so committing here is one write per choice.
                if (event.target.value) commit(event.target.value, close);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => commit(null, close)}
            className="h-[30px] rounded-control border border-[var(--hairline)] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            Clear the deadline
          </button>
        </div>
      )}
    </CellPopover>
  );
}

/* -------------------------------------------------------------------------- */

export function TypeCell({
  itemId,
  type,
  editable,
  onToast,
}: {
  itemId: string;
  type: WorkItemType;
  editable: boolean;
  onToast: Toast;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(type);

  function choose(next: WorkItemType, close: () => void) {
    close();
    if (next === shown) return;
    startTransition(async () => {
      showOptimistic(next);
      const result = await settle(
        () => setWorkItemFields({ itemId, type: next }),
        "That change did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else onToast(result.error ?? "That change did not save.");
    });
  }

  return (
    <CellPopover
      label={`Type: ${TYPE_LABEL[shown]}. Change type.`}
      width={190}
      busy={pending}
      disabled={!editable}
      disabledReason="Only an admin or lead can change the type"
      value={
        <Mono size="meta" className="whitespace-nowrap text-[var(--ink-muted)]">
          {TYPE_LABEL[shown]}
        </Mono>
      }
    >
      {(close) => (
        <div role="listbox" aria-label="Type" onKeyDown={optionListKeyDown}>
          {WORK_ITEM_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === shown}
              data-autofocus={option === shown ? "" : undefined}
              onClick={() => choose(option, close)}
              className={cn(OPTION, option === shown && "bg-[var(--canvas)]")}
            >
              <Mono size="meta" className="text-[var(--ink)]">
                {TYPE_LABEL[option]}
              </Mono>
            </button>
          ))}
        </div>
      )}
    </CellPopover>
  );
}

/* -------------------------------------------------------------------------- */

export function GroupingCell({
  itemId,
  grouping,
  editable,
  onToast,
}: {
  itemId: string;
  grouping: number | null;
  editable: boolean;
  onToast: Toast;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(grouping);
  const [draft, setDraft] = useState(grouping === null ? "" : String(grouping));

  function commit(raw: string, close: () => void) {
    const next = raw.trim() === "" ? null : Number(raw);
    if (next !== null && (!Number.isInteger(next) || next < 1)) {
      setDraft(shown === null ? "" : String(shown));
      onToast("A grouping is a whole number above zero, or nothing at all.");
      return;
    }
    close();
    if (next === shown) return;
    startTransition(async () => {
      showOptimistic(next);
      const result = await settle(
        () => setWorkItemFields({ itemId, grouping: next }),
        "That grouping did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else onToast(result.error ?? "That grouping did not save.");
    });
  }

  const hue = groupingHue(shown);

  return (
    <CellPopover
      label={`Grouping: ${shown ?? "none"}. Change grouping.`}
      align="end"
      width={230}
      busy={pending}
      disabled={!editable}
      disabledReason="Only an admin or lead can change the grouping"
      className="justify-end"
      value={
        <span
          className="inline-flex min-w-6 items-center justify-center rounded-chip border px-[7px] py-[3px]"
          style={{
            borderColor: hue ?? "var(--hairline)",
            background: shown ? "var(--group-chip-bg)" : "transparent",
          }}
        >
          {/* The number is ink, never the hue: an 11px label in the grouping
              colour never clears 4.5:1. */}
          <Mono size="meta" className={shown ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}>
            {shown ?? "—"}
          </Mono>
        </span>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2 p-2">
          <label className="flex flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              Grouping
            </Mono>
            <input
              data-autofocus=""
              className={FIELD}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit(draft, close);
                }
              }}
              onBlur={() => commit(draft, () => {})}
            />
          </label>
          <p className="text-[12px] leading-[1.45] text-[var(--ink-faint)]">
            Items sharing a number overlap in logic or UI and are meant to be taken by one developer.
          </p>
          <button
            type="button"
            onClick={() => {
              setDraft("");
              commit("", close);
            }}
            className="h-[30px] rounded-control border border-[var(--hairline)] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            Clear the grouping
          </button>
        </div>
      )}
    </CellPopover>
  );
}
