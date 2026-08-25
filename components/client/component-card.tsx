import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { ProgressLine } from "@/components/client/progress-line";
import { hoursLabel } from "@/lib/format";
import type { ClientComponentView } from "@/lib/data/client";

/**
 * One piece of the build, as the client thinks of it.
 *
 * The card shows the curated summary rather than anything internal, and its
 * numbers come from the RPC already scoped to published work — there is no
 * filtering to do here and deliberately no arithmetic either. A card that did
 * its own sums would be a second place for the published/unpublished rule to
 * live, and the second place is always the one that gets it wrong.
 *
 * `prefetch={false}`: these are authenticated dynamic routes, and prefetching a
 * grid of them renders every one on the server to save a navigation that may
 * never happen. This repository has already measured that mistake — twenty-eight
 * wasted renders per page view, in `07-FIELD-NOTES.md`.
 */
export function ComponentCard({
  component,
  href,
}: {
  component: ClientComponentView;
  href: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex flex-col gap-4 rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4 transition-[border-color,transform] duration-[var(--dur-micro)] hover:border-[var(--hairline-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] motion-safe:hover:-translate-y-[1px]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15.5px] font-bold tracking-[-0.014em]">{component.name}</h3>
        <ArrowUpRight
          size={16}
          strokeWidth={2}
          aria-hidden
          className="mt-[3px] shrink-0 text-[var(--ink-faint)] transition-colors group-hover:text-[var(--ink)]"
        />
      </div>

      {component.summary ? (
        <p className="text-[14px] leading-[1.6] text-[var(--ink-muted)]">{component.summary}</p>
      ) : null}

      <ProgressLine done={component.doneCount} total={component.itemCount} label="Progress" />

      {/* Only rendered when `view_effort` was granted. The RPC returns null
          otherwise, and null is checked rather than a falsy zero — a component
          with genuinely no hours logged should still show "0.0 h" to somebody
          who is allowed to see hours. */}
      {component.minutesLogged !== null ? (
        <p className="text-[12.5px] tabular-nums text-[var(--ink-faint)]">
          {hoursLabel(component.minutesLogged)} logged
        </p>
      ) : null}
    </Link>
  );
}
