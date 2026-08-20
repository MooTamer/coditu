import Link from "next/link";

import { ClientMark } from "@/components/app/client-mark";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import type { ProjectSummary } from "@/lib/data/projects";

/**
 * The no-sprint state.
 *
 * A real screen, not a spinner. It names the client, says plainly why the page
 * is empty — items, hours and reviews all hang off a sprint — and offers two
 * ways out. A blank panel would leave the reader wondering whether it is
 * loading, broken, or genuinely empty.
 */
export function NoSprint({ project }: { project: ProjectSummary }) {
  return (
    <main className="flex flex-1 items-start p-[var(--app-gutter)]">
      <Reveal
        tier="section"
        as="section"
        className="w-full max-w-[560px] rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-8"
      >
        <div className="flex items-center gap-[10px]">
          <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={14} />
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {project.clientName}
          </Mono>
        </div>

        <h1 className="mt-4 text-[22px] font-bold tracking-[-0.022em]">
          {project.clientName} has no open sprint
        </h1>

        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--ink-muted)]">
          {project.name} is not on a sprint cadence yet. Pick a project with an active sprint, or
          create the first sprint for this one — items, hours, and reviews all hang off it.
        </p>

        <div className="mt-[22px] flex flex-wrap gap-[10px]">
          <Link
            href="/app/projects"
            className="flex h-[38px] items-center rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
          >
            See all projects
          </Link>
          <Link
            href="/app/projects"
            className="signal-gradient flex h-[38px] items-center rounded-control px-4 text-[13.5px] font-semibold text-[#07090E]"
          >
            Switch project
          </Link>
        </div>
      </Reveal>
    </main>
  );
}
