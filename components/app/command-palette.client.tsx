"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { Search } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { signOut } from "@/lib/actions/auth";
import { loadPaletteTargets } from "@/lib/actions/palette";
import { logTime, setWorkItemPerson, setWorkItemStatus } from "@/lib/actions/work-items";
import type { PaletteTargets } from "@/lib/data/palette";
import { todayInCairo } from "@/lib/today";
import { overflowFor } from "@/components/app/nav-items";
import { STATUS_DISPLAY_ORDER, STATUS_LABEL } from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * The command palette. `⌘K` / `Ctrl+K`.
 *
 * Jump to a project, sprint, or item; and when it is opened *on* an item, act
 * on that item — change its status, assign it, log time. Item-scoped commands
 * only appear when there is an item in scope, because a "change status" with
 * nothing to change is a dead row that teaches people the palette is unreliable.
 *
 * Its data is fetched the first time it opens, never on navigation: a query on
 * every page load to populate a dialog most people never open is a cost with no
 * reader. It also keeps the palette out of the app shell's JS budget until it
 * is wanted.
 *
 * Every mutation goes through the same Server Actions the rest of the app uses
 * (invariant 3). The palette is a different way to reach them, not a second
 * implementation of them.
 */

interface Command {
  id: string;
  kind: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [targets, setTargets] = useState<PaletteTargets | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // Which item is in scope, from the URL. `usePathname` rather than a prop
  // because the palette lives in the shell and the shell cannot see a deeper
  // route's params on the server.
  const itemKey = /\/items\/([A-Za-z]+-\d+)/.exec(pathname)?.[1] ?? null;

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setActive(0);
  }, [onOpenChange]);

  /** Runs an action, reports what happened, and refreshes the server tree. */
  const mutate = useCallback(
    (label: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
      close();
      startTransition(async () => {
        const result = await action();
        if (result.ok) {
          toast(label);
          router.refresh();
        } else {
          toast(result.error ?? "That did not work.");
        }
      });
    },
    [close, toast, router]
  );

  // Load once, on first open.
  useEffect(() => {
    if (!open || targets) return;
    let cancelled = false;
    void loadPaletteTargets().then((data) => {
      if (!cancelled) setTargets(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, targets]);

  const commands = useMemo<Command[]>(() => {
    if (!targets) return [];

    const scoped = itemKey ? targets.items.find((item) => item.key === itemKey) ?? null : null;
    const list: Command[] = [];

    if (scoped) {
      for (const status of STATUS_DISPLAY_ORDER) {
        if (status === scoped.status) continue;
        list.push({
          id: `status:${status}`,
          kind: "status",
          label: `Set ${scoped.key} to ${STATUS_LABEL[status]}`,
          hint: scoped.key,
          run: () =>
            mutate(`${scoped.key} → ${STATUS_LABEL[status]}`, () =>
              settle(() => setWorkItemStatus({ itemId: scoped.id, status }), "That status did not save.")
            ),
        });
      }

      for (const minutes of [30, 60, 120]) {
        const hours = (minutes / 60).toFixed(1);
        list.push({
          id: `log:${minutes}`,
          kind: "log time",
          label: `Log ${hours} h on ${scoped.key}`,
          hint: scoped.key,
          run: () =>
            mutate(`Logged ${hours} h on ${scoped.key}`, () =>
              settle(() => logTime({ itemId: scoped.id, minutes, workedOn: todayInCairo() }), "That time was not logged.")
            ),
        });
      }

      if (targets.canAssign) {
        for (const person of targets.people) {
          list.push({
            id: `assign:${person.id}`,
            kind: "assign",
            label: `Assign ${scoped.key} to ${person.fullName}`,
            hint: person.initials,
            run: () =>
              mutate(`${scoped.key} assigned to ${person.fullName}`, () =>
                settle(() => setWorkItemPerson({ itemId: scoped.id, field: "assignee_id", profileId: person.id }), "That did not save.")
              ),
          });
        }
      }
    }

    for (const item of targets.items) {
      list.push({
        id: `item:${item.id}`,
        kind: item.key,
        label: item.title,
        hint: STATUS_LABEL[item.status],
        run: () => {
          close();
          router.push(item.path);
        },
      });
    }

    for (const sprint of targets.sprints) {
      list.push({
        id: `sprint:${sprint.id}`,
        kind: "sprint",
        label: `${sprint.clientName} · ${sprint.name}`,
        hint: sprint.status,
        run: () => {
          close();
          router.push(sprint.path);
        },
      });
    }

    for (const project of targets.projects) {
      list.push({
        id: `project:${project.id}`,
        kind: "project",
        label: `${project.clientName} · ${project.name}`,
        run: () => {
          close();
          router.push(project.path);
        },
      });
    }

    /**
     * The workspace's own destinations.
     *
     * The returned prototype's `paletteRows` ends with a list of exactly these
     * — *"new note, sprint notes, my earnings, team payouts, trash, version
     * history, backup & recovery, workspace settings, profile"* — and Coditu's
     * palette offered items, sprints, projects and two actions. Every route
     * this audit added was reachable only by clicking through the sidebar.
     *
     * `overflowFor(role)` rather than a list written out here, so the palette,
     * the sidebar and the phone's More sheet cannot disagree about what a
     * reader can reach. A command that 404s reads as a broken app rather than
     * as a screen that is not yours.
     */
    for (const destination of overflowFor(targets.role)) {
      list.push({
        id: `go:${destination.id}`,
        kind: "go to",
        label: destination.label,
        run: () => {
          close();
          router.push(destination.href);
        },
      });
    }

    list.push(
      {
        id: "theme",
        kind: "action",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        hint: "T",
        run: () => {
          close();
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
        },
      },
      {
        id: "signout",
        kind: "action",
        label: "Sign out",
        run: () => {
          close();
          void signOut();
        },
      }
    );

    return list;
  }, [targets, itemKey, close, router, resolvedTheme, setTheme, mutate]);

  // Fuzzy over keys and titles: every query character in order, anywhere in the
  // haystack. A subsequence match is what lets "b n m" find "Banner News Mode"
  // — a plain substring search would not.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 12);
    return commands
      .map((command) => ({
        command,
        score: fuzzyScore(`${command.kind} ${command.label}`.toLowerCase(), q),
      }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((row) => row.command);
  }, [commands, query]);

  // Esc closes, the arrows move, Enter runs, Tab stays inside, and the page
  // behind stops scrolling.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousPad = document.body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        results[active]?.run();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    input.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPad;
    };
  }, [open, close, results, active]);

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div
      data-scrim
      onClick={close}
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
    >
      <div
        ref={panel}
        data-reveal="surface"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[620px] overflow-hidden rounded-section border border-[var(--hairline-strong)] bg-[var(--overlay)]"
        style={{ boxShadow: "var(--shadow-overlay)" }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-[18px] py-4">
          <Search size={16} strokeWidth={1.8} className="text-[var(--ink-faint)]" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              // Reset the highlight where the change happens rather than in an
              // effect keyed on `query` — the keystroke is the cause, and an
              // effect would run a render late.
              setQuery(event.target.value);
              setActive(0);
            }}
            // A search box, so the phone's action key should say Go rather
            // than Return — the palette runs the highlighted command on Enter.
            enterKeyHint="go"
            placeholder="Jump to item, change status, log time…"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-label="Search items, sprints, projects and commands"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
            className="min-w-0 flex-1 border-none bg-transparent text-[15.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
          <Mono size="meta" className="rounded-chip border border-[var(--hairline)] px-[6px] py-[2px] text-[var(--ink-faint)]">
            esc
          </Mono>
        </div>

        {targets === null ? (
          <p className="px-[18px] py-[13px]">
            <Mono size="meta" className="text-[var(--ink-faint)]">
              loading…
            </Mono>
          </p>
        ) : results.length === 0 ? (
          <p className="px-[18px] py-[13px] text-[14.5px] text-[var(--ink-muted)]">
            Nothing matches “{query}”.
          </p>
        ) : (
          // The options are NOT buttons. A `role="option"` containing a
          // focusable control is `nested-interactive`: the row announces itself
          // as an option and then the button inside it competes for the same
          // job. In the listbox pattern the input keeps focus and points at the
          // active row with `aria-activedescendant`; the rows themselves only
          // need a click target.
          <ul
            id="palette-results"
            ref={list}
            role="listbox"
            aria-label="Results"
            className="max-h-[420px] overflow-y-auto"
          >
            {results.map((command, index) => (
              <li
                key={command.id}
                id={`palette-${command.id}`}
                role="option"
                aria-selected={index === active}
                onClick={command.run}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-3.5 border-b border-[var(--hairline)] px-[18px] py-[13px]",
                  index === active ? "bg-[var(--canvas)]" : "bg-transparent"
                )}
              >
                <Mono size="meta" className="min-w-[58px] shrink-0 normal-case tracking-normal text-[var(--accent)]">
                  {command.kind}
                </Mono>
                <span className="min-w-0 flex-1 truncate text-[14.5px]">{command.label}</span>
                {command.hint ? (
                  <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                    {command.hint}
                  </Mono>
                ) : null}
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  );
}

/**
 * Subsequence match. Returns the span the match occupies — smaller is tighter,
 * so "COD-140" ranks above an item whose title happens to contain the same
 * letters spread across a sentence. `-1` means no match.
 */
export function fuzzyScore(haystack: string, needle: string): number {
  let first = -1;
  let at = 0;
  for (const character of needle) {
    if (character === " ") continue;
    const found = haystack.indexOf(character, at);
    if (found === -1) return -1;
    if (first === -1) first = found;
    at = found + 1;
  }
  return first === -1 ? 0 : at - first;
}
