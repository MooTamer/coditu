import {
  Atom,
  BriefcaseBusiness,
  Calendar,
  ChartArea,
  Code,
  Contact,
  FileText,
  FolderSearch,
  Grid2x2,
  Languages,
  LayoutGrid,
  List,
  MessageSquare,
  Network,
  Newspaper,
  Puzzle,
  Search,
  Table,
  Type,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { COMPONENT_KIND_LABEL, type ComponentKind } from "@/lib/components";
import { cn } from "@/lib/utils";

/**
 * The glyph SharePoint shows beside a web part in its toolbox, drawn with the
 * icon set this application already ships.
 *
 * `components.icon` stores the SPFx manifest's `officeFabricIconFontName`
 * verbatim — 'Page', 'News', 'OrganizationChart' — because that is a fact about
 * the web part, stated by the delivery repository, and re-syncing it should be
 * a string comparison rather than a fresh judgement every time. The judgement
 * happens here instead, once, in a table anyone can read.
 *
 * ── Why not the real Fluent icons ──────────────────────────────────────────
 * `@fluentui/font-icons-mdl2` is a webfont plus a registration call, and these
 * glyphs appear on the sprint table, which has 110KB of route budget and no
 * headroom. Lucide is already in the bundle and tree-shakes per icon, so the
 * twenty below cost about a kilobyte between them. The shapes are not
 * identical; the reading is — a calendar looks like a calendar in both.
 *
 * An unmapped name falls back to the kind's own glyph rather than nothing: a
 * new web part with an icon nobody has mapped yet still gets a mark, and the
 * row does not jump when somebody adds the mapping later.
 */
const FLUENT_TO_LUCIDE: Record<string, LucideIcon> = {
  // The generic document — what SharePoint itself draws for a web part that
  // declares no icon of its own. Twelve of EVIM's use it, and the toolbox in
  // the client's own screenshot is mostly this shape.
  Page: FileText,
  News: Newspaper,
  Calendar: Calendar,
  Embed: Code,
  Table: Table,
  LocaleLanguage: Languages,
  SearchAndApps: FolderSearch,
  TextBox: Type,
  // Fluent draws a person with a briefcase; both feed web parts use it.
  RecruitmentManagement: BriefcaseBusiness,
  AreaChart: ChartArea,
  Tiles: LayoutGrid,
  GridViewMedium: Grid2x2,
  OrganizationChart: Network,
  People: Users,
  TimelineProgress: Waypoints,
  ContactCard: Contact,
  Search: Search,
  BulletedList2: List,
  Feedback: MessageSquare,
};

/**
 * No manifest entry, no icon. An ApplicationCustomizer never appears in the
 * toolbox at all, and a React feature has no toolbox to appear in.
 */
const KIND_FALLBACK: Record<ComponentKind, LucideIcon> = {
  react: Atom,
  spfx: Puzzle,
};

export function ComponentIcon({
  icon,
  kind,
  size = 14,
  className,
}: {
  /** `components.icon` — the Fluent name, or null. */
  icon: string | null;
  kind: ComponentKind;
  size?: number;
  className?: string;
}) {
  const Glyph = (icon ? FLUENT_TO_LUCIDE[icon] : undefined) ?? KIND_FALLBACK[kind];
  return (
    <Glyph
      size={size}
      strokeWidth={1.8}
      // Decorative in every place it is used: the component's NAME is always
      // beside it, so announcing the glyph as well would read the same thing
      // twice.
      aria-hidden
      className={cn("shrink-0 text-[var(--ink-muted)]", className)}
    />
  );
}

/**
 * Icon plus name, as one unit — the way a component appears everywhere it is
 * mentioned: table cell, board card, item detail, picker, registry.
 *
 * `min-w-0` and `truncate` on the label, never on the wrapper: the glyph is
 * 14px and must not be the thing that gets clipped when a card narrows to
 * 240px. A name without its mark is still readable; a mark without its name is
 * a rebus.
 */
export function ComponentTag({
  component,
  size = 14,
  className,
  iconClassName,
}: {
  component: { name: string; kind: ComponentKind; icon: string | null; isArchived?: boolean } | null;
  size?: number;
  className?: string;
  iconClassName?: string;
}) {
  if (!component) {
    return <span className={cn("truncate text-[var(--ink-faint)]", className)}>—</span>;
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-[6px]", className)}>
      <ComponentIcon
        icon={component.icon}
        kind={component.kind}
        size={size}
        className={iconClassName}
      />
      <span className="truncate">{component.name}</span>
      {component.isArchived ? (
        <span className="shrink-0 text-[var(--ink-faint)]" title="Archived">
          ·&nbsp;archived
        </span>
      ) : null}
    </span>
  );
}

/** Announced form, for a picker trigger's `aria-label`. */
export function componentAriaLabel(
  component: { name: string; kind: ComponentKind } | null
): string {
  return component ? `${component.name}, ${COMPONENT_KIND_LABEL[component.kind]}` : "no component";
}
