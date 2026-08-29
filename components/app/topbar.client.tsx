"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

import { AccountMenu, type AccountIdentity } from "@/components/app/account-menu.client";
import { Breadcrumbs } from "@/components/app/breadcrumbs.client";
import { NavDrawer } from "@/components/app/nav-drawer.client";
import { CommandPalette } from "@/components/app/command-palette.client";
import { SaveChip } from "@/components/app/save-state.client";
import { TopbarPresence } from "@/components/app/topbar-presence.client";
import { ThemeToggle } from "@/components/app/theme-toggle.client";
import { Mono } from "@/components/coditu/mono";
import type { ComponentRef } from "@/lib/data/components";
import type { ProfileRef } from "@/lib/data/profiles";
import type { ProjectSummary } from "@/lib/data/projects";
import type { FavouriteLink } from "@/lib/favourites";
import { cn } from "@/lib/utils";

/**
 * Two dialogs that only exist after a click, and are only fetched then.
 *
 * Both were static imports, which put them in the app shell's bundle on every
 * page — 22.2 KB for the export dialog alone, measured as its own chunk. They
 * are rendered `{open ? … : null}`, so nothing about them is on screen until
 * somebody asks, and `next/dynamic` makes the *code* follow the same rule.
 *
 * The command palette below is deliberately NOT one of these: it is the ⌘K
 * surface, so the first press must open it rather than start a download.
 */
const NewItemDialog = dynamic(() =>
  import("@/components/app/new-item-dialog.client").then((m) => m.NewItemDialog)
);

/**
 * 60px topbar: where you are, search, and the two things you do from anywhere.
 *
 * A client component only because the shell layout cannot see the URL of a
 * deeper route on the server, and the topbar has to know which project and
 * sprint are open. It reads `usePathname()` and picks from a list the server
 * already fetched — no second query, no waterfall, and the alternative
 * (repeating the topbar in every page) is worse.
 *
 * ── The project switcher used to be here, and it is gone ───────────────────
 * It named the project and the sprint, which is what breadcrumbs two and three
 * say — two controls saying one thing, and with both present neither fitting.
 * Project switching lives in the sidebar's spaces tree now, which is where the
 * design has it and where a tree has room to be one. What is left of it here is
 * `activeProject` / `activeSprint` below: Export and New item still need to
 * know what is open, and they derive it from the URL exactly as the switcher
 * did.
 */
export function Topbar({
  projects,
  people,
  componentsByProject,
  canCreate,
  me,
  unreadCount,
  componentCounts,
  favourites,
}: {
  projects: ProjectSummary[];
  /** Active profiles, for the New item dialog's owner pickers. */
  people: ProfileRef[];
  /** Every project's component registry, for the New item dialog's picker. */
  componentsByProject: Record<string, ComponentRef[]>;
  /** Admin or lead. RLS refuses an engineer's insert; the button says so
   *  rather than opening a form that cannot be submitted. */
  canCreate: boolean;
  /** The signed-in person. Their face is the account menu's trigger. */
  me: AccountIdentity;
  /** The three below are for `NavDrawer` only — the 768–1179 navigation. The
   *  shell already reads all of them for the sidebar, so nothing new is
   *  fetched; they are handed across rather than queried twice. */
  unreadCount: number;
  componentCounts: Record<string, number>;
  favourites: FavouriteLink[];
}) {
  const pathname = usePathname();
  const [newOpen, setNewOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K, from anywhere in the app. Bound here rather than inside the
  // palette so the shortcut works while the palette is closed — which is the
  // only time it matters.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    // The phone has no ⌘K. Its bottom bar's Search tab dispatches this instead,
    // so both routes into the palette end at the one piece of state that owns
    // it rather than the tab bar growing a second copy of the dialog.
    const onRequest = () => setPaletteOpen(true);
    // Home's `New story n`. Same reasoning: one dialog, one piece of state,
    // and the surface that asks does not grow its own copy of it.
    const onNewItem = () => setNewOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("coditu:open-palette", onRequest);
    window.addEventListener("coditu:new-item", onNewItem);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("coditu:open-palette", onRequest);
      window.removeEventListener("coditu:new-item", onNewItem);
    };
  }, []);

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


  // Somewhere to put it: any sprint that is not closed, anywhere.
  const hasOpenSprint = projects.some((project) =>
    project.sprints.some((sprint) => sprint.status !== "closed")
  );
  const canCreateHere = canCreate && hasOpenSprint;
  const newItemTitle = !canCreate
    ? "Only an admin or lead can create an item"
    : hasOpenSprint
      ? "Create a work item"
      : "No open sprint to create an item in";

  return (
    <header
      data-app-chrome
      // `min-w-0` on the flex parent AND on the trail below: without it a flex
      // child refuses to shrink past its content and the whole right-hand
      // cluster is pushed off a 320px screen — clipped, so the Export button
      // is not just cramped, it is unreachable.
      className="sticky top-0 z-30 flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--hairline)] bg-[var(--raised)] px-[var(--app-gutter)] py-2 sm:gap-4"
      style={{ minHeight: "var(--topbar-h)", paddingRight: "max(var(--app-gutter), env(safe-area-inset-right))" }}
    >
      {/* 768–1179 only: the band where the sidebar is icons and cannot say
          what any of them is. */}
      <NavDrawer
        role={me.role}
        unreadCount={unreadCount}
        projects={projects}
        componentCounts={componentCounts}
        favourites={favourites}
      />

      {/* Where you are — at every width now, collapsing rather than hiding
          below `lg`. The numbers are in `breadcrumbs.client.tsx`. */}
      <Breadcrumbs projects={projects} />

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        // `xl` rather than `sm`, and the number comes from the bar's own
        // arithmetic rather than from the ladder. The deepest route's trail is
        // 415px, the right-hand cluster is 303, padding and gaps are 79, and
        // above 1180 the sidebar takes 268 — so a box with a usable minimum
        // needs 1205px before the trail starts losing letters. It had `sm`,
        // and at 1180 that cost the trail 20px: `Coditu` 34 of the 37 it
        // needs, every crumb clipped, which is the exact bar W6c refused to
        // ship. Below `xl` the icon beside it is search, and ⌘K is unchanged.
        //
        // `min-w-[140px]` rather than the default `min-width: auto` for the
        // same reason: with `auto` this button holds its whole placeholder and
        // the trail gives way instead. A stated minimum reverses that, so a
        // project with a very long name ellipses the placeholder first.
        className="hidden h-[34px] min-w-[140px] max-w-[420px] flex-1 cursor-pointer items-center gap-[10px] rounded-control border border-[var(--hairline)] bg-[var(--canvas)] px-3 text-left text-[var(--ink-faint)] hover:border-[var(--hairline-strong)] xl:flex"
      >
        <Search size={14} strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13.5px]">Search items, sprints, people</span>
        <Mono size="meta" className="rounded-chip border border-[var(--hairline)] px-[6px] py-[2px]">
          ⌘K
        </Mono>
      </button>

      {/* The two the returned handoff names and the build did not have:
          *"56px topbar carries breadcrumbs, surface presence, save chip,
          theme, search, New."*

          Both sit before `ml-auto` so they belong to the LEFT cluster and
          shrink with it. Putting them on the right would have made a 320px
          screen choose between "Failed — draft kept" and the New-item button,
          and it would have chosen wrong. */}
      <div className="ml-auto flex min-w-0 shrink items-center justify-end gap-2 overflow-hidden">
        <TopbarPresence me={me} people={people} />
        <SaveChip />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* The palette's own trigger is `hidden … xl:flex` — a 420px search box
            has no room on a phone, and below 1280 it has no room beside the
            breadcrumb trail either. Search itself is needed at every width, or
            the only way to find an item is to scroll the sprint it happens to
            be in. Same dialog, one icon. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-haspopup="dialog"
          aria-label="Search items, sprints, people"
          title="Search items, sprints, people"
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--tint)] xl:hidden"
        >
          <Search size={16} strokeWidth={1.9} aria-hidden />
        </button>

        <ThemeToggle />

        {/* Disabled with a tooltip, never hidden. A control that disappears
            reads as a bug; one that is present and explains itself reads as an
            answer. */}
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          disabled={!canCreateHere}
          aria-haspopup="dialog"
          title={newItemTitle}
          className={cn(
            "signal-gradient inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-control px-[14px] text-[13.5px] font-semibold text-[#07090E] md:h-[34px]",
            canCreateHere ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          )}
        >
          <Plus size={14} strokeWidth={2.4} aria-hidden />
          <span className="hidden sm:inline">New item</span>
        </button>

        {/* Last in the cluster, which is where a person expects their own face
            to be — and, on a phone, the only route to Settings or Sign out. */}
        <AccountMenu me={me} />
      </div>


      {newOpen ? (
        <NewItemDialog
          projects={projects}
          people={people}
          componentsByProject={componentsByProject}
          defaultSprintId={activeSprint?.id ?? null}
          onClose={() => setNewOpen(false)}
        />
      ) : null}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
