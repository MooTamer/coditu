/**
 * Where you are, as a trail.
 *
 * ## A pure function, and no new fetch
 *
 * The topbar already receives every project — it draws the project switcher out
 * of them — and each carries its slug, its name and its sprints' numbers and
 * names. So the trail is a function of `(pathname, projects)` and nothing else:
 * no loader, no context, no round trip, and no per-route plumbing to forget on
 * the seventh screen.
 *
 * That it is pure is the point. Breadcrumbs are the kind of thing that is wrong
 * on one route in five and nobody notices for a month, so every route this app
 * has is asserted in `tests/breadcrumbs.test.ts` rather than checked by eye.
 *
 * ## Names, not slugs
 *
 * `/app/projects/meinevim/sprints/17` reads **Coditu / MEINEvim / Sprint —
 * Week 17**. A trail that showed `meinevim` and `17` would be the URL with
 * slashes drawn differently, which is not worth a row of the screen.
 *
 * When a project or sprint is not in the list — a stale link, a project this
 * reader cannot see — the slug is used as the label rather than dropping the
 * crumb. A trail with a gap is more confusing than one with an ugly word in it.
 *
 * ## The last crumb is not a link
 *
 * It is where you already are. The design disables it; this returns it without
 * an `href`, which is the same thing said in markup a screen reader understands.
 */

export interface Crumb {
  label: string;
  /** Absent on the last crumb — you are already there. */
  href?: string;
  /** The project's key prefix, e.g. `COD`. Drawn as a chip before the label. */
  glyph?: string;
}

export interface CrumbProject {
  slug: string;
  name: string;
  keyPrefix?: string | null;
  sprints: Array<{ number: number; name: string }>;
}

/** Every flat `/app/x` route that is simply itself. */
const FLAT: Record<string, string> = {
  "my-work": "My work",
  projects: "Projects",
  people: "People",
  import: "Import",
  clients: "Clients",
  trash: "Trash",
  settings: "Workspace settings",
  earnings: "Earnings",
};

export function crumbsFor(pathname: string, projects: CrumbProject[]): Crumb[] {
  // `Coditu` is always the root and always a link home, exactly as the design
  // has it. It is the only crumb that is not derived from the URL.
  const root: Crumb = { label: "Coditu", href: "/app" };

  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  // Everything here lives under `/app`; anything else has no trail to draw.
  if (segments[0] !== "app") return [];
  const rest = segments.slice(1);

  if (rest.length === 0) return [root, { label: "Home" }];

  const [first] = rest;

  if (first !== "projects") {
    // `earnings` sits under Account in the design, which is a grouping rather
    // than a route — there is no `/app/account` to link to, so the crumb is
    // present and inert.
    if (first === "earnings") return [root, { label: "Account" }, { label: "Earnings" }];
    const label = FLAT[first];
    return label ? [root, { label }] : [root];
  }

  // /app/projects
  if (rest.length === 1) return [root, { label: "Projects" }];

  const slug = rest[1];
  const project = projects.find((candidate) => candidate.slug === slug);
  const projectCrumb: Crumb = {
    label: project?.name ?? slug,
    glyph: project?.keyPrefix ?? undefined,
  };

  // /app/projects/[slug]
  if (rest.length === 2) {
    return [root, { label: "Projects", href: "/app/projects" }, projectCrumb];
  }

  const section = rest[2];

  // /app/projects/[slug]/components…
  if (section === "components") {
    return [
      root,
      { ...projectCrumb, href: `/app/projects/${slug}` },
      { label: rest.length > 3 ? "Component" : "Components" },
    ];
  }

  if (section !== "sprints") {
    return [root, { ...projectCrumb, href: `/app/projects/${slug}` }, { label: section }];
  }

  const number = Number(rest[3]);
  const sprint = project?.sprints.find((candidate) => candidate.number === number);
  const sprintLabel = sprint?.name ?? `Sprint ${rest[3]}`;
  const sprintHref = `/app/projects/${slug}/sprints/${rest[3]}`;

  // /app/projects/[slug]/sprints/[n]
  if (rest.length === 4) {
    return [root, { ...projectCrumb, href: `/app/projects/${slug}` }, { label: sprintLabel }];
  }

  // /app/projects/[slug]/sprints/[n]/items/[key] — and the key IS the label. It
  // is what anybody calls the story out loud, and the title is on the page
  // directly beneath.
  if (rest[4] === "items" && rest[5]) {
    return [
      root,
      { ...projectCrumb, href: `/app/projects/${slug}` },
      { label: sprintLabel, href: sprintHref },
      { label: rest[5] },
    ];
  }

  return [root, { ...projectCrumb, href: `/app/projects/${slug}` }, { label: sprintLabel }];
}
