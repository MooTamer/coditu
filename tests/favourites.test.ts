import { describe, expect, it } from "vitest";

import {
  favouriteLink,
  favouriteLinks,
  type FavouriteProject,
  type FavouriteRow,
} from "@/lib/favourites";

/**
 * Where a starred row points, pinned — including the two cases that only turn
 * up later: a saved view that follows whichever sprint is running, and a
 * favourite whose target is no longer reachable.
 */

const PROJECTS: FavouriteProject[] = [
  { slug: "meinevim", activeSprint: { number: 17 } },
  { slug: "ops-console", activeSprint: null },
];

const row = (over: Partial<FavouriteRow>): FavouriteRow => ({
  id: "f1",
  kind: "saved_view",
  name: "Peer review queue",
  projectSlug: "meinevim",
  sprintNumber: null,
  search: "",
  componentSlug: null,
  ...over,
});

describe("favouriteLink", () => {
  it("sends a story to its own sprint, labelled by the key people say out loud", () => {
    expect(
      favouriteLink(row({ kind: "work_item", name: "COD-241", sprintNumber: 17 }), PROJECTS)
    ).toEqual({
      id: "f1",
      kind: "work_item",
      glyph: "COD",
      label: "COD-241",
      href: "/app/projects/meinevim/sprints/17/items/COD-241",
    });
  });

  it("sends a component to its registry page", () => {
    expect(
      favouriteLink(
        row({ kind: "component", name: "EVIM Link Buttons", componentSlug: "link-kachel" }),
        PROJECTS
      )
    ).toMatchObject({
      glyph: "reg",
      label: "EVIM Link Buttons",
      href: "/app/projects/meinevim/components/link-kachel",
    });
  });

  it("carries a saved view's question in the query string", () => {
    expect(
      favouriteLink(row({ search: "status=in_peer_review&sort=deadline%3Aasc" }), PROJECTS)
    ).toMatchObject({
      glyph: "view",
      href: "/app/projects/meinevim/sprints/17?status=in_peer_review&sort=deadline%3Aasc",
    });
  });

  /**
   * The case worth having a test for: the same starred row resolves somewhere
   * different next week, because that is what "follows whichever sprint is
   * running" means.
   */
  it("follows the running sprint when the view is not pinned to one", () => {
    expect(favouriteLink(row({}), PROJECTS)?.href).toBe("/app/projects/meinevim/sprints/17");
    expect(
      favouriteLink(row({}), [{ slug: "meinevim", activeSprint: { number: 18 } }])?.href
    ).toBe("/app/projects/meinevim/sprints/18");
  });

  it("goes to the sprint a view was pinned to, running or not", () => {
    expect(favouriteLink(row({ sprintNumber: 12 }), PROJECTS)?.href).toBe(
      "/app/projects/meinevim/sprints/12"
    );
  });

  it("returns nothing rather than a link that goes nowhere", () => {
    // A view following the running sprint, on a project with none.
    expect(favouriteLink(row({ projectSlug: "ops-console" }), PROJECTS)).toBeNull();
    // A project this reader can no longer see. RLS returning fewer projects
    // than there are favourites is the system working.
    expect(favouriteLink(row({ projectSlug: "gone" }), PROJECTS)).toBeNull();
    // A story with no sprint, and a component with no slug.
    expect(favouriteLink(row({ kind: "work_item", sprintNumber: null }), PROJECTS)).toBeNull();
    expect(favouriteLink(row({ kind: "component", componentSlug: null }), PROJECTS)).toBeNull();
  });
});

describe("favouriteLinks", () => {
  it("keeps the order it was given and drops only what cannot resolve", () => {
    const links = favouriteLinks(
      [
        row({ id: "a", kind: "work_item", name: "COD-1", sprintNumber: 17 }),
        row({ id: "b", projectSlug: "ops-console" }),
        row({ id: "c", name: "Mine" }),
      ],
      PROJECTS
    );
    expect(links.map((link) => link.id)).toEqual(["a", "c"]);
  });
});
