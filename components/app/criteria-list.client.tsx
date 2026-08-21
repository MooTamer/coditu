"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { setCriterionDone } from "@/lib/actions/work-items";
import type { Criterion } from "@/lib/data/work-item";
import { cn } from "@/lib/utils";

/**
 * Acceptance criteria, with the gradient progress ring.
 *
 * The ring is `r=15` on a 36-unit box with `stroke-dasharray="94.2"` — that is
 * 2·pi·15 rounded, straight from the bundle. Rotated -90deg so it starts at
 * twelve o'clock rather than three.
 */
export function CriteriaList({ criteria, canToggle }: { criteria: Criterion[]; canToggle: boolean }) {
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [items, setItems] = useOptimistic(criteria, (state, update: { id: string; isDone: boolean }) =>
    state.map((c) => (c.id === update.id ? { ...c, isDone: update.isDone } : c))
  );

  const done = items.filter((c) => c.isDone).length;
  const total = items.length;
  const ringOffset = total ? (94.2 * (total - done)) / total : 94.2;

  function toggle(criterion: Criterion) {
    if (!canToggle) return;
    startTransition(async () => {
      setItems({ id: criterion.id, isDone: !criterion.isDone });
      const result = await settle(
        () => setCriterionDone({ criterionId: criterion.id, isDone: !criterion.isDone }),
        "That tick did not save — check your connection."
      );
      if (!result.ok) toast(result.error ?? "That tick did not save.");
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--hairline)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="94.2"
            strokeDashoffset={ringOffset}
            transform="rotate(-90 18 18)"
            style={{ transition: "stroke-dashoffset 320ms var(--ease-entrance)" }}
          />
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2B57FF" />
              <stop offset="1" stopColor="#21E2C6" />
            </linearGradient>
          </defs>
        </svg>
        <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          Acceptance criteria
        </Mono>
        <Mono size="key" className="ml-auto">
          {total ? `${done} / ${total}` : "none yet"}
        </Mono>
      </div>

      {total > 0 ? (
        <ul className="mt-[14px] flex flex-col">
          {items.map((criterion) => (
            <li key={criterion.id}>
              <button
                type="button"
                onClick={() => toggle(criterion)}
                disabled={!canToggle}
                aria-pressed={criterion.isDone}
                title={canToggle ? undefined : "Only the assignee, reviewer, an admin or a lead can tick this"}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-[var(--hairline)] py-[11px] text-left",
                  canToggle ? "cursor-pointer" : "cursor-default"
                )}
              >
                <span
                  aria-hidden
                  className="mt-px flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-[background-color,border-color] duration-[var(--dur-micro)] ease-[var(--ease-entrance)]"
                  style={{
                    borderColor: criterion.isDone ? "#21E2C6" : "var(--hairline-strong)",
                    background: criterion.isDone ? "#21E2C6" : "transparent",
                  }}
                >
                  {/* The tick arrives on the `micro` tier — 4px, 200ms, no
                      blur. Keyed on the state so ticking again re-runs it;
                      un-ticking simply removes it, because the tier is for
                      entrances and nothing here should animate on exit. */}
                  {criterion.isDone ? (
                    <Check key="done" data-reveal="micro" size={10} strokeWidth={3.4} color="#07090E" />
                  ) : null}
                </span>
                <span
                  className="text-[14px] leading-[1.5]"
                  style={{
                    color: criterion.isDone ? "var(--ink-muted)" : "var(--ink)",
                    textDecoration: criterion.isDone ? "line-through" : "none",
                  }}
                >
                  {criterion.body}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-[14px] text-[13.5px] text-[var(--ink-faint)]">
          No acceptance criteria yet.
        </p>
      )}
    </div>
  );
}
