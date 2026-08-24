"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, Check, Pencil, Play, RotateCcw, Square, Trash2, X } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import {
  createSprint,
  deleteSprint,
  setSprintStatus,
  updateSprint,
} from "@/lib/actions/sprints";
import type { SprintSummary } from "@/lib/data/projects";
import { dateRange, hours } from "@/lib/format";
import type { SprintStatus } from "@/lib/work-items";
import { cn } from "@/lib/utils";

const FIELD =
  "h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)]";
const ACTION =
  "inline-flex h-8 shrink-0 items-center gap-[6px] whitespace-nowrap rounded-control border border-[var(--hairline)] px-[10px] text-[12.5px] text-[var(--ink-muted)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45";

const TONE: Record<SprintStatus, "jade" | "amber" | "slate"> = {
  active: "jade",
  planned: "amber",
  closed: "slate",
};

/**
 * Sprint management, on the project it belongs to.
 *
 * The one rule the schema enforces and this screen has to make legible: a
 * project has at most one active sprint, held by a partial unique index. So
 * "Start" on a planned sprint is disabled while another is running, and the
 * tooltip names the one in the way — rather than starting it and quietly
 * closing the other, which is two decisions taken from one click.
 */
export function SprintManager({
  projectId,
  slug,
  sprints,
  canManage,
}: {
  projectId: string;
  slug: string;
  sprints: SprintSummary[];
  /** Admin or lead. RLS refuses everyone else's write. */
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const running = sprints.find((sprint) => sprint.status === "active") ?? null;
  const nextNumber = sprints.reduce((highest, sprint) => Math.max(highest, sprint.number), 0) + 1;

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setCreating((was) => !was)}
            aria-expanded={creating}
            className="inline-flex h-[34px] items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-[14px] text-[13.5px] font-medium hover:bg-[var(--canvas)]"
          >
            <CalendarPlus size={14} strokeWidth={1.9} aria-hidden />
            {creating ? "Cancel" : "New sprint"}
          </button>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {running ? `${running.name} is running` : "no sprint is running"}
          </Mono>
        </div>
      ) : null}

      {creating ? (
        <NewSprintForm
          projectId={projectId}
          nextNumber={nextNumber}
          onDone={() => setCreating(false)}
        />
      ) : null}

      <div className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
        {sprints.map((sprint) => (
          <SprintRow
            key={sprint.id}
            sprint={sprint}
            slug={slug}
            canManage={canManage}
            blockedBy={sprint.status === "planned" || sprint.status === "closed" ? running : null}
          />
        ))}
        {sprints.length === 0 ? (
          <p className="px-5 py-4 text-[13.5px] text-[var(--ink-faint)]">
            No sprints yet.{canManage ? " Open the first one above." : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NewSprintForm({
  projectId,
  nextNumber,
  onDone,
}: {
  projectId: string;
  nextNumber: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState(String(nextNumber));
  const [name, setName] = useState(`Sprint — Week ${nextNumber}`);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [goal, setGoal] = useState("");

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createSprint({
        projectId,
        number: Number(number),
        name: name.trim(),
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        goal: goal.trim() || null,
      });
      if (result.ok) {
        toast(`${name.trim()} is open. It is planned until you start it.`);
        onDone();
        router.refresh();
        return;
      }
      setError(result.error ?? "That sprint did not save.");
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-5"
    >
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))]">
        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Number
          </Mono>
          <input
            className={FIELD}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            required
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-[6px] sm:col-span-2">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Name
          </Mono>
          <input
            className={FIELD}
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Starts
          </Mono>
          <input
            className={FIELD}
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Ends
          </Mono>
          <input
            className={FIELD}
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
          />
        </label>

        {/* The goal. `sprints.goal` has been in the schema since the first
            migration and nothing could write or read it — a whole column no
            code path could reach. It is the first thing anybody types on
            planning day, so it goes on the form that opens the sprint. */}
        <label className="flex flex-col gap-[6px] sm:col-span-3">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Goal
          </Mono>
          <input
            className={FIELD}
            maxLength={500}
            enterKeyHint="done"
            placeholder="What this week is for, in one sentence"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="signal-gradient h-[34px] rounded-control px-4 text-[13px] font-semibold text-[#07090E] disabled:opacity-60"
        >
          {pending ? "Opening…" : "Open sprint"}
        </button>
        <Mono size="meta" className="text-[var(--ink-faint)]">
          it opens planned · starting it is a separate step
        </Mono>
        {error ? (
          <p role="alert" className="basis-full text-[13px] text-[var(--rose)]">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SprintRow({
  sprint,
  slug,
  canManage,
  blockedBy,
}: {
  sprint: SprintSummary;
  slug: string;
  canManage: boolean;
  /** The sprint already running, when that is what stops this one starting. */
  blockedBy: SprintSummary | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sprint.name);
  const [startsOn, setStartsOn] = useState(sprint.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(sprint.endsOn ?? "");
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  function move(status: SprintStatus, said: string) {
    startTransition(async () => {
      const result = await setSprintStatus({ sprintId: sprint.id, status });
      if (result.ok) {
        toast(said);
        router.refresh();
      } else {
        toast(result.error ?? "That change did not save.");
      }
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateSprint({
        sprintId: sprint.id,
        name: name.trim(),
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        goal: goal.trim() || null,
      });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        toast(result.error ?? "That change did not save.");
      }
    });
  }

  function remove() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    startTransition(async () => {
      const result = await deleteSprint({ sprintId: sprint.id });
      if (result.ok) {
        toast(`${sprint.name} is gone.`);
        router.refresh();
      } else {
        toast(result.error ?? "That sprint could not be deleted.");
      }
    });
  }

  const empty = sprint.itemCount === 0;

  return (
    <div
      data-sprint-row
      className="flex flex-wrap items-center gap-4 border-b border-[var(--hairline)] px-5 py-4 last:border-b-0"
    >
      {editing ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <label className="flex min-w-[180px] flex-1 flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              {`Name of sprint ${sprint.number}`}
            </Mono>
            <input
              className={FIELD}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              {`Start of sprint ${sprint.number}`}
            </Mono>
            <input
              className={FIELD}
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              {`End of sprint ${sprint.number}`}
            </Mono>
            <input
              className={FIELD}
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              {`Goal of sprint ${sprint.number}`}
            </Mono>
            <input
              className={FIELD}
              maxLength={500}
              placeholder="What this week is for, in one sentence"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            aria-label={`Save sprint ${sprint.number}`}
            className={cn(ACTION, "h-[34px]")}
          >
            <Check size={14} strokeWidth={2} aria-hidden />
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(sprint.name);
              setStartsOn(sprint.startsOn ?? "");
              setEndsOn(sprint.endsOn ?? "");
              setGoal(sprint.goal ?? "");
            }}
            aria-label={`Cancel editing sprint ${sprint.number}`}
            className={cn(ACTION, "h-[34px]")}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : (
        <Link
          href={`/app/projects/${slug}/sprints/${sprint.number}`}
          className="min-w-0 flex-1 rounded-control"
        >
          <span className="block truncate text-[14px] font-medium">{sprint.name}</span>
          <Mono size="meta" className="block text-[var(--ink-faint)]">
            {dateRange(sprint.startsOn, sprint.endsOn)}
          </Mono>
          {sprint.goal ? (
            <span className="mt-[2px] block truncate text-[12.5px] text-[var(--ink-muted)]">
              {sprint.goal}
            </span>
          ) : null}
        </Link>
      )}

      <ToneChip tone={TONE[sprint.status]} className="shrink-0">
        {sprint.status}
      </ToneChip>

      <Mono size="meta" className="w-[68px] shrink-0 text-right text-[var(--ink-muted)]">
        {sprint.itemCount} items
      </Mono>
      <Mono size="meta" className="w-[96px] shrink-0 text-right text-[var(--ink-muted)]">
        {hours(sprint.minutesLogged)} / {hours(sprint.estimateMinutes)} h
      </Mono>

      {canManage && !editing ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {sprint.status !== "active" ? (
            <button
              type="button"
              onClick={() => move("active", `${sprint.name} is running.`)}
              disabled={pending || Boolean(blockedBy)}
              title={
                blockedBy
                  ? `${blockedBy.name} is still running — a project has one active sprint. Close it first.`
                  : `Start ${sprint.name}`
              }
              className={ACTION}
            >
              <Play size={13} strokeWidth={1.9} aria-hidden />
              Start
            </button>
          ) : null}

          {sprint.status === "active" ? (
            <button
              type="button"
              onClick={() => move("closed", `${sprint.name} is closed.`)}
              disabled={pending}
              title={`Close ${sprint.name}`}
              className={ACTION}
            >
              <Square size={12} strokeWidth={2.2} aria-hidden />
              Close
            </button>
          ) : null}

          {sprint.status === "closed" ? (
            <button
              type="button"
              onClick={() => move("planned", `${sprint.name} is planned again.`)}
              disabled={pending}
              title={`Reopen ${sprint.name} as planned`}
              className={ACTION}
            >
              <RotateCcw size={13} strokeWidth={1.9} aria-hidden />
              Reopen
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            aria-label={`Edit sprint ${sprint.number}`}
            className={ACTION}
          >
            <Pencil size={13} strokeWidth={1.8} aria-hidden />
          </button>

          <button
            type="button"
            onClick={remove}
            disabled={pending || !empty}
            aria-label={`Delete sprint ${sprint.number}`}
            title={
              empty
                ? `Delete ${sprint.name}`
                : `${sprint.name} holds ${sprint.itemCount} items — deleting it would delete their hours too`
            }
            className={cn(
              ACTION,
              confirmingDelete && "border-[var(--rose)] font-semibold text-[var(--rose)]"
            )}
          >
            <Trash2 size={13} strokeWidth={1.8} aria-hidden />
            {confirmingDelete ? "Confirm?" : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
