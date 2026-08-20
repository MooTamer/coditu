"use client";

import { usePathname } from "next/navigation";
import { Download, Plus, Search } from "lucide-react";

import { ProjectSwitcher } from "@/components/app/project-switcher.client";
import { ThemeToggle } from "@/components/app/theme-toggle.client";
import { Mono } from "@/components/coditu/mono";
import type { ProjectSummary } from "@/lib/data/projects";
import { cn } from "@/lib/utils";

/**
 * 60px topbar.
 *
 * A client component only because the shell layout cannot see the URL of a
 * deeper route on the server, and the topbar has to know which project and
 * sprint are open. It reads `usePathname()` and picks from a list the server
 * already fetched — no second query, no waterfall, and the alternative
 * (repeating the topbar in every page) is worse.
 */
export function Topbar({ projects }: { projects: ProjectSummary[] }) {
  const pathname = usePathname();

  const match = /^\/app\/projects\/([^/]+)(?:\/sprints\/(\d+))?/.exec(pathname);
  const slug = match?.[1];
  const sprintNumber = match?.[2] ? Number(match[2]) : null;

  const activeProject =
    projects.find((project) => project.slug === slug) ??
    projects.find((project) => project.activeSprint !== null) ??
    projects[0] ??
    null;

  const activeSprint =
    activeProject?.sprints.find((sprint) =>
      sprintNumber !== null ? sprint.number === sprintNumber : sprint.status === "active"
    ) ?? null;

  const canExport = Boolean(activeSprint);
  const clientName = activeProject?.clientName ?? "no project";

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-4 border-b border-[var(--hairline)] bg-[var(--raised)] px-[var(--app-gutter)]"
      style={{ height: "var(--topbar-h)" }}
    >
      <ProjectSwitcher
        projects={projects}
        activeProject={activeProject}
        activeSprintName={activeSprint?.name ?? null}
        sprints={activeProject?.sprints ?? []}
      />

      <button
        type="button"
        className="hidden h-[34px] max-w-[420px] flex-1 items-center gap-[10px] rounded-control border border-[var(--hairline)] bg-[var(--canvas)] px-3 text-left text-[var(--ink-faint)] sm:flex"
      >
        <Search size={14} strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13.5px]">Search items, sprints, people</span>
        <Mono size="meta" className="rounded-chip border border-[var(--hairline)] px-[6px] py-[2px]">
          ⌘K
        </Mono>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

        {/* Disabled with a tooltip, never hidden. A control that disappears
            reads as a bug; one that is present and explains itself reads as an
            answer. */}
        <button
          type="button"
          disabled={!canExport}
          title={
            canExport
              ? `Export ${clientName} · ${activeSprint!.name}`
              : `No sprint to export for ${clientName}`
          }
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-control border border-[var(--hairline-strong)] px-[14px] text-[13.5px] font-medium",
            canExport
              ? "cursor-pointer text-[var(--ink)] hover:bg-[var(--canvas)]"
              : "cursor-not-allowed text-[var(--ink-faint)]"
          )}
        >
          <Download size={14} strokeWidth={1.9} aria-hidden />
          <span className="hidden sm:inline">Export</span>
        </button>

        <button
          type="button"
          className="signal-gradient inline-flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-control px-[14px] text-[13.5px] font-semibold text-[#07090E]"
        >
          <Plus size={14} strokeWidth={2.4} aria-hidden />
          <span className="hidden sm:inline">New item</span>
        </button>
      </div>
    </header>
  );
}
