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
  ready: { fg: "var(--chip-ready-fg)", bg: "var(--chip-ready-bg)" },
  in_progress: { fg: "var(--chip-in-progress-fg)", bg: "var(--chip-in-progress-bg)" },
  in_peer_review: {
    fg: "var(--chip-in-peer-review-fg)",
    bg: "var(--chip-in-peer-review-bg)",
  },
  in_qa: { fg: "var(--chip-in-qa-fg)", bg: "var(--chip-in-qa-bg)" },
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
    // `key` on the status is what makes a CHANGE visible: React remounts the
    // span, which restarts the `micro` animation. Without it the chip's new
    // colour appears with no acknowledgement that anything happened — and an
    // optimistic status write is exactly the moment a reader needs one.
    //
    // `micro` is 4px and 200ms with NO blur. A chip is small, there are a dozen
    // on screen, and blurring them on every write is how a table starts to
    // hitch.
    <span
      key={status}
      data-reveal="micro"
      className={cn(CHIP_BASE, className)}
      style={{ color: vars.fg, backgroundColor: vars.bg, ...style }}
      {...props}
    >
      {children ?? label ?? STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The chip with its 6px leading dot, exactly as the table and the item detail
 * render it.
 *
 * It lives here rather than beside the table's editor because three Server
 * Components display one — the item page, the item detail body, and the mobile
 * cards — and none of them should have to import a client module to do it.
 */
export function StatusChipDot({ status }: { status: WorkItemStatus }) {
  return (
    <StatusChip status={status} className="gap-[7px] px-[10px] py-[5px]">
      <span aria-hidden className="size-[6px] rounded-pill bg-current" />
      {STATUS_LABEL[status]}
    </StatusChip>
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
