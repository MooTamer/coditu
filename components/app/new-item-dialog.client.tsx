"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { createWorkItem } from "@/lib/actions/work-items";
import type { ProfileRef } from "@/lib/data/profiles";
import type { ProjectSummary } from "@/lib/data/projects";
import {
  STATUS_DISPLAY_ORDER,
  STATUS_LABEL,
  TYPE_LABEL,
  WORK_ITEM_TYPES,
  type WorkItemStatus,
  type WorkItemType,
} from "@/lib/work-items";

const FIELD =
  "h-[38px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";
const AREA =
  "w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-[9px] text-[14px] leading-[1.5] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Mono size="eyebrow" className="text-[var(--ink-faint)]">
      {children}
    </Mono>
  );
}

/**
 * New item.
 *
 * The one thing this dialog is careful about is *where* the item lands. It asks
 * for a sprint explicitly rather than inferring one from the URL, because the
 * button lives in the topbar and the topbar is on every screen — including
 * People and Import, where "the current sprint" is a guess. Closed sprints are
 * not offered: the server refuses them, and a menu that lets you pick something
 * the server will reject is a menu that lies.
 *
 * Hours are typed as hours and converted to minutes here, at the boundary.
 * Invariant 2: nothing downstream ever sees the float.
 */
export function NewItemDialog({
  projects,
  people,
  defaultSprintId,
  onClose,
}: {
  projects: ProjectSummary[];
  people: ProfileRef[];
  /** The sprint the reader is looking at, if they are looking at one. */
  defaultSprintId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Every sprint an item may actually be created in, with the client's name
  // attached — "Week 17" alone is ambiguous the moment there are two clients.
  const targets = useMemo(
    () =>
      projects.flatMap((project) =>
        project.sprints
          .filter((sprint) => sprint.status !== "closed")
          .map((sprint) => ({
            id: sprint.id,
            label: `${project.clientName} · ${sprint.name}`,
            status: sprint.status,
            projectName: project.name,
          }))
      ),
    [projects]
  );

  const [sprintId, setSprintId] = useState(
    () =>
      (defaultSprintId && targets.some((t) => t.id === defaultSprintId) ? defaultSprintId : null) ??
      targets.find((t) => t.status === "active")?.id ??
      targets[0]?.id ??
      ""
  );

  const [title, setTitle] = useState("");
  const [type, setType] = useState<WorkItemType>("story");
  const [status, setStatus] = useState<WorkItemStatus>("ready");
  const [assigneeId, setAssigneeId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimate, setEstimate] = useState("");
  const [grouping, setGrouping] = useState("");
  const [description, setDescription] = useState("");
  const [highlight, setHighlight] = useState("");
  const [criteria, setCriteria] = useState("");

  const target = targets.find((t) => t.id === sprintId) ?? null;
  const canSubmit = Boolean(title.trim()) && Boolean(sprintId) && !pending;

  function submit() {
    setError(null);
    const estimateHours = estimate.trim() === "" ? null : Number(estimate);
    if (estimateHours !== null && (!Number.isFinite(estimateHours) || estimateHours < 0)) {
      setError("The estimate has to be a number of hours.");
      return;
    }

    startTransition(async () => {
      const result = await createWorkItem({
        sprintId,
        title: title.trim(),
        type,
        status,
        description: description.trim() || undefined,
        highlight: highlight.trim() || undefined,
        assigneeId: assigneeId || null,
        reviewerId: reviewerId || null,
        deadline: deadline || null,
        // Invariant 2: hours exist in this input and nowhere past it.
        estimateMinutes: estimateHours === null ? null : Math.round(estimateHours * 60),
        grouping: grouping.trim() === "" ? null : Number(grouping),
        criteria: criteria
          .split("\n")
          .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
          .filter(Boolean),
      });

      if (result.ok && result.path) {
        toast(`${result.key} created.`);
        // Straight into the item, so the next thing you do is with the thing
        // you just made rather than hunting for it in the table.
        //
        // No `router.refresh()` here, and that is not an oversight: refresh
        // re-fetches the CURRENT route, and issued in the same tick it cancels
        // the push that has not committed yet. The item was created, the toast
        // fired, and the reader was left on the table wondering where it went.
        // The action already `revalidatePath`s the sprint, so there is nothing
        // for a refresh to do anyway.
        router.push(result.path);
        onClose();
        return;
      }

      setError(result.error ?? "That item did not save.");
      toast(result.error ?? "That item did not save.");
    });
  }

  return (
    <DialogShell
      label="New work item"
      onClose={onClose}
      zIndex={65}
      maxWidth={900}
      header={
        <span className="min-w-0">
          <span className="block text-[15.5px] font-bold tracking-[-0.018em]">New item</span>
          <Mono size="eyebrow" className="block truncate normal-case tracking-normal text-[var(--ink-faint)]">
            {target ? `into ${target.label}` : "no open sprint to create into"}
          </Mono>
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {error ? (
            <p role="alert" className="min-w-0 flex-1 text-[13px] text-[var(--rose)]">
              {error}
            </p>
          ) : (
            <Mono size="eyebrow" className="min-w-0 flex-1 normal-case tracking-normal text-[var(--ink-faint)]">
              the key is assigned by the database
            </Mono>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-item"
            disabled={!canSubmit}
            aria-busy={pending}
            className="signal-gradient h-[38px] rounded-control px-5 text-[13.5px] font-semibold text-[#07090E] disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create item"}
          </button>
        </div>
      }
    >
      <form
        id="new-item"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) submit();
        }}
        className="grid gap-6 p-5 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]"
      >
        {/* ---- what it is ---- */}
        <div className="flex min-w-0 flex-col gap-4">
          <label className="flex flex-col gap-[6px]">
            <Label>Title</Label>
            <input
              className={FIELD}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={200}
              autoFocus
              placeholder="Add optional titles to all webparts"
            />
          </label>

          <label className="flex flex-col gap-[6px]">
            <Label>Description</Label>
            <textarea
              className={AREA}
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What the item is, in a sentence or two."
            />
          </label>

          <label className="flex flex-col gap-[6px]">
            <Label>Discuss before implementing</Label>
            <textarea
              className={AREA}
              rows={2}
              maxLength={2000}
              value={highlight}
              onChange={(event) => setHighlight(event.target.value)}
              placeholder="Anything that needs a decision first. Renders as the amber rule."
            />
          </label>

          <label className="flex flex-col gap-[6px]">
            <Label>Acceptance criteria — one per line</Label>
            <textarea
              className={AREA}
              rows={4}
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              placeholder={"The toggle is on by default\nThe title renders directly above the webpart"}
            />
          </label>
        </div>

        {/* ---- where it goes ---- */}
        <div className="flex min-w-0 flex-col gap-4">
          <label className="flex flex-col gap-[6px]">
            <Label>Sprint</Label>
            <select
              className={FIELD}
              value={sprintId}
              onChange={(event) => setSprintId(event.target.value)}
            >
              {targets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {option.status === "planned" ? " (planned)" : ""}
                </option>
              ))}
              {targets.length === 0 ? <option value="">No open sprint</option> : null}
            </select>
          </label>

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr))]">
            <label className="flex flex-col gap-[6px]">
              <Label>Type</Label>
              <select
                className={FIELD}
                value={type}
                onChange={(event) => setType(event.target.value as WorkItemType)}
              >
                {WORK_ITEM_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {TYPE_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-[6px]">
              <Label>Status</Label>
              <select
                className={FIELD}
                value={status}
                onChange={(event) => setStatus(event.target.value as WorkItemStatus)}
              >
                {STATUS_DISPLAY_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-[6px]">
            <Label>Assignee</Label>
            <select
              className={FIELD}
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value="">unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-[6px]">
            <Label>Reviewer</Label>
            <select
              className={FIELD}
              value={reviewerId}
              onChange={(event) => setReviewerId(event.target.value)}
            >
              <option value="">nobody yet</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr))]">
            <label className="flex flex-col gap-[6px]">
              <Label>Deadline</Label>
              <input
                className={FIELD}
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-[6px]">
              <Label>Estimate (hours)</Label>
              <input
                className={FIELD}
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="8"
              />
            </label>

            <label className="flex flex-col gap-[6px]">
              <Label>Grouping</Label>
              <input
                className={FIELD}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={grouping}
                onChange={(event) => setGrouping(event.target.value)}
                placeholder="—"
              />
            </label>
          </div>

          <p className="text-[12.5px] leading-[1.5] text-[var(--ink-muted)]">
            Items sharing a grouping overlap in logic or UI and are meant to be taken by one
            developer. Leave it empty unless that is true.
          </p>
        </div>
      </form>
    </DialogShell>
  );
}
