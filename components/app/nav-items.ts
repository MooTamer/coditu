import { Building2, CheckCheck, FolderOpen, Import, Rows3, Settings, Users, Wallet } from "lucide-react";

/**
 * The application's destinations, and the rule for when each one is current.
 *
 * ── Why `isActive` is a function per item ──────────────────────────────────
 * `startsWith(href)` cannot express this list. `/app/projects/evim/sprints/17`
 * starts with `/app/projects`, so Projects and Sprint both lit up on every
 * sprint page and the rail claimed the reader was in two places at once. A
 * sprint URL is nested under its project for scoping reasons — invariant 1 —
 * not because it is a sub-page of the project list, so the prefix is the wrong
 * question to ask. Each item answers it for itself instead.
 *
 * ── Why it lives here rather than in the rail ──────────────────────────────
 * Because the bottom tab bar has to agree with the rail about which item is
 * current, and "exactly one `aria-current='page'`" is a spec. Two copies of
 * these predicates is two chances to reintroduce the bug they were written for.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  Icon: typeof Rows3;
  isActive: (path: string) => boolean;
  /**
   * Who this destination is for. Absent means everybody.
   *
   * A nav item that 404s for the person looking at it is worse than no nav
   * item: it reads as a broken link rather than as a screen that is not
   * theirs. `Clients` is the first item in this list that is not for the whole
   * team, so this is where that gets expressed — once, in the place both the
   * rail and the phone's overflow sheet already read from, because two copies
   * of the rule is two chances for them to disagree about what is on screen.
   */
  visibleTo?: (role: string) => boolean;
}

export const NAV: readonly NavItem[] = [
  {
    id: "sprint",
    label: "Sprint",
    href: "/app",
    Icon: Rows3,
    isActive: (path) => path === "/app" || /^\/app\/projects\/[^/]+\/sprints(\/|$)/.test(path),
  },
  {
    id: "projects",
    label: "Projects",
    href: "/app/projects",
    Icon: FolderOpen,
    // The list, a project's own overview, and its component registry — but not
    // the sprints beneath it. The registry is part of "what this project is",
    // which is the question this destination answers.
    isActive: (path) =>
      /^\/app\/projects(\/[^/]+)?$/.test(path) ||
      /^\/app\/projects\/[^/]+\/components(\/|$)/.test(path),
  },
  {
    id: "my-work",
    label: "My work",
    href: "/app/my-work",
    Icon: CheckCheck,
    isActive: (path) => path.startsWith("/app/my-work"),
  },
  {
    id: "people",
    label: "People",
    href: "/app/people",
    Icon: Users,
    isActive: (path) => path.startsWith("/app/people"),
  },
  {
    id: "import",
    label: "Import",
    href: "/app/import",
    Icon: Import,
    isActive: (path) => path.startsWith("/app/import"),
  },
  {
    id: "clients",
    label: "Clients",
    href: "/app/clients",
    Icon: Building2,
    isActive: (path) => path.startsWith("/app/clients"),
    // A lead reads it, an admin changes it, an engineer has no business there
    // and the page itself answers `notFound()` for one. Same split as the email
    // allowlist and role changes: deciding what leaves the company is not a
    // delivery decision.
    visibleTo: (role) => role !== "engineer",
  },
];

/** `NAV`, minus the destinations this role has no route to. */
export function navFor(role: string): readonly NavItem[] {
  return NAV.filter((item) => item.visibleTo?.(role) ?? true);
}

/**
 * Settings is not in `NAV` and that is deliberate: it is not a place the team
 * works, it is a place you go once. It appears in the account menu and in the
 * phone's overflow sheet, and nowhere in the rail.
 */
export const SETTINGS_ITEM: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/app/settings",
  Icon: Settings,
  isActive: (path) => path.startsWith("/app/settings"),
};

/**
 * Earnings is not in `NAV` either, and for a sharper reason than Settings.
 *
 * It is the one screen in this app with money on it, and the rail and the top
 * bar are visible on every screen that gets shared — a projector in a client
 * meeting, a screenshot in a chat, somebody looking over a shoulder. A link
 * labelled "Earnings" beside "Sprint" advertises it on all of them. It lives in
 * the account menu and the phone's overflow sheet, which are behind a
 * deliberate tap.
 */
export const EARNINGS_ITEM: NavItem = {
  id: "earnings",
  label: "Earnings",
  href: "/app/earnings",
  Icon: Wallet,
  isActive: (path) => path.startsWith("/app/earnings"),
};

/**
 * What a phone puts in the bar, and what goes behind "More".
 *
 * Four across at 390px is 97px each, which is comfortable; five is 78px and
 * the labels start truncating. The split is by how often a person on a phone
 * actually needs each one: the sprint they are working, the work assigned to
 * them, and then everything that is administration.
 */
export const TAB_IDS = ["sprint", "my-work", "projects"] as const;

export const TABS: readonly NavItem[] = TAB_IDS.map(
  (id) => NAV.find((item) => item.id === id)!
);

/** People, Import, Clients, Earnings and Settings — behind the overflow sheet. */
export const OVERFLOW: readonly NavItem[] = [
  ...NAV.filter((item) => !TAB_IDS.includes(item.id as (typeof TAB_IDS)[number])),
  EARNINGS_ITEM,
  SETTINGS_ITEM,
];

/** The same sheet, minus what this role cannot reach. */
export function overflowFor(role: string): readonly NavItem[] {
  return OVERFLOW.filter((item) => item.visibleTo?.(role) ?? true);
}
