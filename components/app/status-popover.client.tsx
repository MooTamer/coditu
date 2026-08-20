"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { StatusChip } from "@/components/coditu/status-chip";
import { setWorkItemStatus } from "@/lib/actions/work-items";
import { STATUS_DISPLAY_ORDER, STATUS_LABEL, type WorkItemStatus } from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * The status control: a keyboard-navigable popover with an optimistic write.
 *
 * Invariant 4: the optimistic value has a rollback path and a visible error.
 * The chip snaps back to the server's value and a toast explains why — a
 * failed write that silently reverts is worse than no optimism, because the
 * reader believes the change stuck.
 */
export function StatusPopover({
  itemId,
  status,
  editable,
  onToast,
}: {
  itemId: string;
  status: WorkItemStatus;
  editable: boolean;
  onToast: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // `useOptimistic` IS the rollback path. The optimistic value lives only for
  // the duration of the transition: if the action succeeds, `revalidatePath`
  // sends down a new `status` prop and the chip stays put; if it fails, React
  // drops the optimistic value on its own and the chip snaps back — which is
  // exactly when the toast fires, so the revert is never silent.
  const [shown, showOptimistic] = useOptimistic(status);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>("[data-active='true']")?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function choose(next: WorkItemStatus) {
    setOpen(false);
    if (next === shown) return;

    startTransition(async () => {
      // Must be inside the transition — that is what scopes the optimistic
      // value to this action's lifetime.
      showOptimistic(next);
      const result = await setWorkItemStatus({ itemId, status: next });
      if (!result.ok) onToast(result.error ?? "That change did not save.");
    });
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }

  if (!editable) {
    return (
      <span title="Only the assignee or reviewer can move this item">
        <StatusChipDot status={shown} />
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((was) => !was);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={pending}
        aria-label={`Status: ${STATUS_LABEL[shown]}. Change status.`}
        className="rounded-chip"
      >
        <StatusChipDot status={shown} />
      </button>

      {open ? (
        <div
          ref={listRef}
          role="listbox"
          onKeyDown={onListKeyDown}
          data-reveal="surface"
          className="absolute left-0 top-[30px] z-50 w-[190px] overflow-hidden rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] p-1"
          style={{ boxShadow: "var(--shadow-overlay)" }}
        >
          {STATUS_DISPLAY_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === shown}
              data-active={option === shown}
              onClick={(event) => {
                event.stopPropagation();
                choose(option);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-chip px-2 py-[6px] text-left hover:bg-[var(--canvas)]",
                option === shown && "bg-[var(--canvas)]"
              )}
            >
              <StatusChipDot status={option} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The chip with its 6px leading dot, exactly as the table renders it. */
export function StatusChipDot({ status }: { status: WorkItemStatus }) {
  return (
    <StatusChip status={status} className="gap-[7px] px-[10px] py-[5px]">
      <span aria-hidden className="size-[6px] rounded-pill bg-current" />
      {STATUS_LABEL[status]}
    </StatusChip>
  );
}
