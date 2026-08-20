import type { ElementType, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type MonoSize = "eyebrow" | "meta" | "key" | "metric";

const SIZES: Record<MonoSize, string> = {
  /** 10.5px uppercase section label — "STATUS DISTRIBUTION", "PROJECTS" */
  eyebrow: "text-[10.5px] uppercase tracking-[0.06em]",
  /** 11px — counts, hints, secondary metadata */
  meta: "text-[11px]",
  /** 12px — item keys, timestamps, dates */
  key: "text-[12px]",
  /** 26px — the sprint metric, `{logged} / {estimated} h` */
  metric: "text-[26px] tracking-[-0.024em]",
};

export interface MonoProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  size?: MonoSize;
}

/**
 * Mono is not decoration. In this design it marks "this is a fact from the
 * database" — every key, timestamp, count, metric, and status label. Prose is
 * Satoshi; facts are JetBrains Mono.
 *
 * `tabular-nums` is on every instance because these numbers sit in columns and
 * update in place; proportional digits make a live sum jitter as it changes.
 */
export function Mono({ as, size = "meta", className, children, ...props }: MonoProps) {
  const Component = (as ?? "span") as ElementType;
  return (
    <Component
      className={cn("font-mono tabular-nums", SIZES[size], className)}
      {...props}
    >
      {children}
    </Component>
  );
}
