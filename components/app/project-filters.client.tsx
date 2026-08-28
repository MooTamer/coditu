"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Mono } from "@/components/coditu/mono";
import { useUrlWrite } from "@/lib/hooks/use-url-write";
import { control } from "@/lib/interactive";
import {
  activeProjectFilterCount,
  clearedProjectFilters,
  parseProjectFilters,
} from "@/lib/project-filters";
import { PROJECT_STATES, PROJECT_STATE_LABEL, type ProjectState } from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * The projects list's controls — and only its controls.
 *
 * The filtering itself happens on the server, from the same query string this
 * writes. That split is deliberate and it is the opposite of the sprint table's:
 * a sprint board sorts, re-tints and re-sums a live table without a round trip,
 * so it filters in the browser. A project list is a page you arrive at, read
 * once and click out of — so the rows are server-rendered and the only
 * JavaScript on the screen is this bar.
 *
 * It matters here beyond taste: §5's **total** budget had 0.3 KB of headroom
 * after W7, so a screen that could ship no row-rendering JavaScript should ship
 * none.
 *
 * ## The text box is debounced, the chips are not
 *
 * Typing is a stream of intentions and only the last one is meant; a navigation
 * per keystroke would put eight entries in the back stack for one word.
 * `replace` rather than `push` for the same reason — the back button should
 * leave the projects list, not walk back through a search.
 *
 * A chip is a single decision, so it navigates immediately.
 */
const DOT: Record<ProjectState, string> = {
  active: "#23C97F",
  planned: "#FFB020",
  none: "rgba(107,122,144,0.6)",
};

const TYPING_SETTLES_MS = 250;

export function ProjectFilters({ total, shown }: { total: number; shown: number }) {
  // PF-4. `controlState` rather than `state`, because `state` is already a
  // ProjectState in three functions below and shadowing it would read as the
  // filter's own value.
  const { params, write: push, state: controlState } = useUrlWrite();
  const spec = parseProjectFilters(new URLSearchParams(params.toString()));

  const [query, setQuery] = useState(params.get("q") ?? "");

  /**
   * The URL is the source of truth, so a change that did not come from this box
   * — Clear, the back button, a pasted link — has to reach it. Without this the
   * box would keep showing a search that is no longer being applied, which is
   * the worst of both: a filter that looks on and is off.
   */
  const fromUrl = params.get("q") ?? "";
  const [lastSeen, setLastSeen] = useState(fromUrl);
  if (lastSeen !== fromUrl) {
    setLastSeen(fromUrl);
    setQuery(fromUrl);
  }

  useEffect(() => {
    if (query === fromUrl) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");
      push(next);
    }, TYPING_SETTLES_MS);
    return () => clearTimeout(timer);
  }, [query, fromUrl, params, push]);

  function toggleState(state: ProjectState) {
    const next = new URLSearchParams(params.toString());
    const on = spec.states.includes(state);
    const states = on ? spec.states.filter((s) => s !== state) : [...spec.states, state];
    if (states.length) next.set("state", states.join(","));
    else next.delete("state");
    push(next, `state:${state}`);
  }

  function toggleArchived() {
    const next = new URLSearchParams(params.toString());
    if (spec.archived) next.delete("archived");
    else next.set("archived", "1");
    push(next, "archived");
  }

  const count = activeProjectFilterCount(spec);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative flex h-[34px] min-w-[180px] flex-1 items-center sm:max-w-[320px]">
        <Search
          size={14}
          strokeWidth={1.8}
          aria-hidden
          className="pointer-events-none absolute left-3 text-[var(--ink-faint)]"
        />
        <span className="sr-only">Search projects by name or client</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          className="h-full w-full rounded-control border border-[var(--hairline)] bg-[var(--canvas)] pl-9 pr-3 text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus-visible:border-[var(--hairline-strong)]"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by state">
        {PROJECT_STATES.map((state) => {
          const on = spec.states.includes(state);
          return (
            <button
              key={state}
              type="button"
              onClick={() => toggleState(state)}
              aria-pressed={on}
              {...control(controlState(`state:${state}`))}
              className={cn(
                "inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-pill border px-3 text-[12.5px]",
                on
                  ? "border-transparent bg-[var(--canvas)] font-medium text-[var(--ink)]"
                  : "border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)]"
              )}
            >
              <span
                aria-hidden
                className="size-[7px] shrink-0 rounded-pill"
                style={{ background: DOT[state] }}
              />
              {PROJECT_STATE_LABEL[state]}
            </button>
          );
        })}

        {/* Archived is not one of the state chips, and that is the point:
            `is_archived` is the only status column `projects` actually has,
            and it answers a different question — not "what is happening here"
            but "is this still ours to look at". */}
        <button
          type="button"
          onClick={toggleArchived}
          aria-pressed={spec.archived}
          {...control(controlState("archived"))}
          className={cn(
            "inline-flex h-[30px] items-center whitespace-nowrap rounded-pill border px-3 text-[12.5px]",
            spec.archived
              ? "border-transparent bg-[var(--canvas)] font-medium text-[var(--ink)]"
              : "border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)]"
          )}
        >
          {spec.archived ? "Hiding nothing" : "Show archived"}
        </button>
      </div>

      {count > 0 ? (
        <button
          type="button"
          onClick={() => push(clearedProjectFilters(new URLSearchParams(params.toString())), "clear")}
          {...control(controlState("clear"))}
          className="inline-flex h-[30px] items-center gap-[6px] rounded-control px-2 text-[12.5px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          <X size={13} strokeWidth={2} aria-hidden />
          Clear
        </button>
      ) : null}

      {/* A count, always — a filtered list that looks like the whole list is
          how somebody concludes a project has disappeared. `aria-live` because
          the number changes without the page navigating anywhere a screen
          reader would announce. */}
      <Mono
        size="meta"
        data-project-count
        aria-live="polite"
        className="ml-auto text-[var(--ink-faint)]"
      >
        {shown === total ? `${total} projects` : `${shown} of ${total}`}
      </Mono>
    </div>
  );
}
