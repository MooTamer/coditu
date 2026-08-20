import type { HTMLAttributes } from "react";

import { STATUS_LABEL, type WorkItemStatus } from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * Chip text is a themed pair, not one hue.
 *
 * A foreground tuned for paper drops to roughly 2.4:1 on the dark canvas, so
 * every status carries a light and a dark ink AND a light and dark ground. Both
 * pairs live in `app/globals.css` and flip with the `.dark` class, which is why
 * this component can stay a Server Component and ship no JavaScript: it never
 * needs to know which theme is active.
 */
const CHIP_VARS: Record<WorkItemStatus, { fg: string; bg: string }> = {
  draft: { fg: "var(--chip-draft-fg)", bg: "var(--chip-draft-bg)" },
  todo: { fg: "var(--chip-todo-fg)", bg: "var(--chip-todo-bg)" },
  dev_started: { fg: "var(--chip-dev-started-fg)", bg: "var(--chip-dev-started-bg)" },
  ready_for_peer_review: {
    fg: "var(--chip-ready-for-peer-review-fg)",
    bg: "var(--chip-ready-for-peer-review-bg)",
  },
  in_review: { fg: "var(--chip-in-review-fg)", bg: "var(--chip-in-review-bg)" },
  changes_requested: {
    fg: "var(--chip-changes-requested-fg)",
    bg: "var(--chip-changes-requested-bg)",
  },
  done: { fg: "var(--chip-done-fg)", bg: "var(--chip-done-bg)" },
  blocked: { fg: "var(--chip-blocked-fg)", bg: "var(--chip-blocked-bg)" },
};

export type ChipTone = "amber" | "jade" | "slate";

const TONE_VARS: Record<ChipTone, { fg: string; bg: string }> = {
  amber: { fg: "var(--tone-amber-fg)", bg: "var(--tone-amber-bg)" },
  jade: { fg: "var(--tone-jade-fg)", bg: "var(--tone-jade-bg)" },
  slate: { fg: "var(--tone-slate-fg)", bg: "var(--tone-slate-bg)" },
};

const CHIP_BASE =
  "inline-flex items-center rounded-chip px-2 py-[3px] font-mono text-[11px] leading-none tabular-nums whitespace-nowrap";

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  status: WorkItemStatus;
  /** Override the label. The PDF uses `STATUS_LABEL_CLIENT` instead. */
  label?: string;
}

export function StatusChip({ status, label, className, style, children, ...props }: StatusChipProps) {
  const vars = CHIP_VARS[status];
  return (
    <span
      className={cn(CHIP_BASE, className)}
      style={{ color: vars.fg, backgroundColor: vars.bg, ...style }}
      {...props}
    >
      {children ?? label ?? STATUS_LABEL[status]}
    </span>
  );
}

export interface ToneChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone: ChipTone;
}

/** The same treatment for anything that is not a status — days left, load, import state. */
export function ToneChip({ tone, className, style, children, ...props }: ToneChipProps) {
  const vars = TONE_VARS[tone];
  return (
    <span
      className={cn(CHIP_BASE, className)}
      style={{ color: vars.fg, backgroundColor: vars.bg, ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
