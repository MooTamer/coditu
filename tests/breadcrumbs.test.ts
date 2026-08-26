import { describe, expect, it } from "vitest";

import { crumbsFor, type CrumbProject } from "@/lib/breadcrumbs";

/**
 * Every route this application has, asserted.
 *
 * Breadcrumbs are the kind of thing that is wrong on one route in five and
 * nobody notices for a month — the trail is glanced at, not read. So the whole
 * map is pinned here rather than checked by eye on the two screens somebody
 * happened to open.
 */

const PROJECTS: CrumbProject[] = [
  {
    slug: "meinevim",
    name: "MEINEvim",
    keyPrefix: "COD",
    sprints: [
      { number: 17, name: "Sprint — Week 17" },
      { number: 10, name: "Sprint — Week 10" },
    ],
  },
  { slug: "nile", name: "Nile Atelier", keyPrefix: "NIL", sprints: [] },
];

const labels = (path: string) => crumbsFor(path, PROJECTS).map((c) => c.label);
const hrefs = (path: string) => crumbsFor(path, PROJECTS).map((c) => c.href ?? null);

describe("crumbsFor", () => {
  it("roots every trail at Coditu, linking home", () => {
    expect(crumbsFor("/app/my-work", PROJECTS)[0]).toEqual({ label: "Coditu", href: "/app" });
  });

  it("never gives the last crumb a link — you are already there", () => {
    for (const path of [
      "/app",
      "/app/my-work",
      "/app/projects",
      "/app/projects/meinevim",
      "/app/projects/meinevim/sprints/17",
      "/app/projects/meinevim/sprints/17/items/COD-241",
      "/app/trash",
      "/app/earnings",
      "/app/profile",
      "/app/settings/payouts",
    ]) {
      const trail = crumbsFor(path, PROJECTS);
      expect(trail.at(-1)?.href, path).toBeUndefined();
      // And every crumb before it links somewhere, or the trail is decoration.
      // `Account` is the one exception and it is deliberate: it groups Earnings
      // in the design and there is no route behind it, so it is inert rather
      // than invented. Asserted on its own below.
      const shouldLink = trail.slice(0, -1).filter((c) => c.label !== "Account");
      expect(shouldLink.every((c) => c.href), path).toBe(true);
    }
  });

  it("names the flat routes", () => {
    expect(labels("/app")).toEqual(["Coditu", "Home"]);
    expect(labels("/app/my-work")).toEqual(["Coditu", "My work"]);
    expect(labels("/app/projects")).toEqual(["Coditu", "Projects"]);
    expect(labels("/app/people")).toEqual(["Coditu", "People"]);
    expect(labels("/app/import")).toEqual(["Coditu", "Import"]);
    expect(labels("/app/clients")).toEqual(["Coditu", "Clients"]);
    expect(labels("/app/trash")).toEqual(["Coditu", "Trash"]);
    expect(labels("/app/settings")).toEqual(["Coditu", "Workspace settings"]);
  });

  it("groups the two personal screens under an inert Account crumb", () => {
    // The design puts both under Account. There is no `/app/account` route, so
    // the crumb is present and carries no link rather than inventing one.
    expect(labels("/app/earnings")).toEqual(["Coditu", "Account", "My earnings"]);
    expect(hrefs("/app/earnings")).toEqual(["/app", null, null]);
    expect(labels("/app/profile")).toEqual(["Coditu", "Account", "Profile"]);
    expect(hrefs("/app/profile")).toEqual(["/app", null, null]);
  });

  it("puts Team payouts under a Workspace settings crumb that links", () => {
    // The one flat route with a child. Unlike `Account`, this parent is a real
    // screen, so its crumb carries an href — for the admin who can open it. A
    // lead or an engineer following it is redirected to their profile, which is
    // the same answer typing the URL gives them.
    expect(labels("/app/settings/payouts")).toEqual([
      "Coditu",
      "Workspace settings",
      "Team payouts",
    ]);
    expect(hrefs("/app/settings/payouts")).toEqual(["/app", "/app/settings", null]);
  });

  it("uses names, not slugs and numbers", () => {
    expect(labels("/app/projects/meinevim")).toEqual(["Coditu", "Projects", "MEINEvim"]);
    expect(labels("/app/projects/meinevim/sprints/17")).toEqual([
      "Coditu",
      "MEINEvim",
      "Sprint — Week 17",
    ]);
  });

  it("carries the project's key prefix as a glyph", () => {
    const trail = crumbsFor("/app/projects/meinevim/sprints/17", PROJECTS);
    expect(trail[1].glyph).toBe("COD");
  });

  it("puts the story's key last, and links the sprint above it", () => {
    expect(labels("/app/projects/meinevim/sprints/17/items/COD-241")).toEqual([
      "Coditu",
      "MEINEvim",
      "Sprint — Week 17",
      "COD-241",
    ]);
    expect(hrefs("/app/projects/meinevim/sprints/17/items/COD-241")).toEqual([
      "/app",
      "/app/projects/meinevim",
      "/app/projects/meinevim/sprints/17",
      null,
    ]);
  });

  it("handles the component registry under a project", () => {
    expect(labels("/app/projects/meinevim/components")).toEqual([
      "Coditu",
      "MEINEvim",
      "Components",
    ]);
    expect(labels("/app/projects/meinevim/components/link-buttons")).toEqual([
      "Coditu",
      "MEINEvim",
      "Component",
    ]);
  });

  it("falls back to the slug rather than dropping a crumb", () => {
    // A stale link, or a project this reader cannot see. A trail with a gap in
    // it is more confusing than one with an ugly word in it.
    expect(labels("/app/projects/gone/sprints/3")).toEqual(["Coditu", "gone", "Sprint 3"]);
  });

  it("ignores a trailing slash", () => {
    expect(labels("/app/projects/")).toEqual(["Coditu", "Projects"]);
    expect(labels("/app/")).toEqual(["Coditu", "Home"]);
  });

  it("draws nothing outside /app", () => {
    // The marketing site has its own chrome and no trail.
    expect(crumbsFor("/", PROJECTS)).toEqual([]);
    expect(crumbsFor("/client", PROJECTS)).toEqual([]);
    expect(crumbsFor("/login", PROJECTS)).toEqual([]);
  });
});
