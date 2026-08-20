"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

import { ClientMark } from "@/components/app/client-mark";
import { Mono } from "@/components/coditu/mono";
import type { ProjectSummary } from "@/lib/data/projects";
import { cn } from "@/lib/utils";

/**
 * The topbar project control.
 *
 * The menu lists all projects, then **only the sprints belonging to the
 * selected project** — invariant 1 is a UI rule as much as a data one. Picking
 * a project with no sprint routes to /app/projects rather than to an empty
 * sprint page, because an empty sprint page is a dead end with no way out.
 */
export function ProjectSwitcher({
  projects,
  activeProject,
  activeSprintName,
  sprints,
}: {
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  activeSprintName: string | null;
  sprints: ProjectSummary["sprints"];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickProject(project: ProjectSummary) {
    setOpen(false);
    router.push(
      project.activeSprint
        ? `/app/projects/${project.slug}/sprints/${project.activeSprint.number}`
        : "/app/projects"
    );
  }

  const clientName = activeProject?.clientName ?? "No project";

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-[34px] min-w-0 max-w-full items-center gap-[10px] rounded-control border border-[var(--hairline)] bg-[var(--canvas)] px-3"
      >
        <ClientMark logoPath={activeProject?.clientLogoPath ?? null} accentHex={activeProject?.accentHex ?? null} />
        <Mono size="meta" className="truncate whitespace-nowrap text-[var(--accent)]">
          {clientName}
        </Mono>
        <span aria-hidden className="hidden h-[14px] w-px bg-[var(--hairline-strong)] sm:block" />
        <span
          className={cn(
            "hidden truncate whitespace-nowrap text-[13.5px] font-medium sm:block",
            activeSprintName ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"
          )}
        >
          {activeSprintName ?? "no active sprint"}
        </span>
        <ChevronDown size={13} strokeWidth={2} className="text-[var(--ink-faint)]" aria-hidden />
      </button>

      {open ? (
        <div
          data-reveal="surface"
          role="menu"
          className="absolute left-0 top-[42px] z-50 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-card border border-[var(--hairline-strong)] bg-[var(--overlay)]"
          style={{ boxShadow: "var(--shadow-overlay)" }}
        >
          <Mono size="eyebrow" className="block px-[14px] pb-[6px] pt-[10px] text-[var(--ink-faint)]">
            Projects
          </Mono>

          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              role="menuitem"
              onClick={() => pickProject(project)}
              className={cn(
                "flex w-full items-center gap-[11px] px-[14px] py-[10px] text-left hover:bg-[var(--canvas)]",
                project.id === activeProject?.id && "bg-[var(--canvas)]"
              )}
            >
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-chip border border-[var(--hairline)]">
                <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={11} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{project.name}</span>
                <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
                  {project.clientName}
                </Mono>
              </span>
              <Mono
                size="meta"
                className={cn("shrink-0", project.activeSprint ? "text-[var(--tone-jade-fg)]" : "text-[var(--ink-faint)]")}
              >
                {project.activeSprint ? project.activeSprint.name.replace("Sprint — ", "") : "no sprint"}
              </Mono>
            </button>
          ))}

          <Mono
            size="eyebrow"
            className="block border-t border-[var(--hairline)] px-[14px] pb-[6px] pt-[10px] text-[var(--ink-faint)]"
          >
            Sprints in {clientName}
          </Mono>

          {sprints.length === 0 ? (
            <p className="px-[14px] pb-[14px] pt-1 text-[12.5px] leading-[1.5] text-[var(--ink-muted)]">
              {clientName} is not on a sprint cadence yet — no sprints exist for this project.
            </p>
          ) : (
            sprints.map((sprint) => (
              <Link
                key={sprint.number}
                role="menuitem"
                href={`/app/projects/${activeProject?.slug}/sprints/${sprint.number}`}
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-[11px] px-[14px] py-[10px] text-left hover:bg-[var(--canvas)]"
              >
                <span
                  aria-hidden
                  className="size-[7px] shrink-0 rounded-pill"
                  style={{ background: sprint.status === "active" ? "var(--jade)" : "rgba(107,122,144,0.5)" }}
                />
                <span className="flex-1 text-[13.5px] font-medium">{sprint.name}</span>
                <Mono size="meta" className="text-[var(--ink-faint)]">
                  {sprint.status} · {sprint.itemCount} items
                </Mono>
              </Link>
            ))
          )}

          <Link
            href="/app/projects"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 border-t border-[var(--hairline)] bg-[var(--raised)] px-[14px] py-[11px] text-left hover:bg-[var(--canvas)]"
          >
            <Mono size="meta" className="text-[var(--accent)]">
              Manage projects
            </Mono>
            <ArrowRight size={12} strokeWidth={2.2} className="ml-auto text-[var(--accent)]" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
