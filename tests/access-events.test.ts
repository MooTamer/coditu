import { describe, expect, it } from "vitest";

import { describeAccessEvent, type AccessEventLike } from "@/lib/access-events";

/**
 * The wording of an access change, pinned.
 *
 * Every sentence here is the only thing an admin will read six months from now
 * when they ask who gave somebody access, so the case that matters most is the
 * one with no actor: it has to say `system` rather than invent an author.
 */

const event = (over: Partial<AccessEventLike>): AccessEventLike => ({
  kind: "role",
  subjectLabel: "Ahmed Yehia",
  fromValue: null,
  toValue: null,
  actor: { fullName: "Mohamed" },
  ...over,
});

describe("describeAccessEvent", () => {
  it("says who made whom what, with the right article", () => {
    expect(describeAccessEvent(event({ fromValue: "engineer", toValue: "lead" }))).toBe(
      "Mohamed made Ahmed Yehia a lead"
    );
    expect(describeAccessEvent(event({ fromValue: "lead", toValue: "admin" }))).toBe(
      "Mohamed made Ahmed Yehia an admin"
    );
  });

  it("names deactivation and reactivation as the different things they are", () => {
    expect(
      describeAccessEvent(event({ kind: "activation", fromValue: "active", toValue: "deactivated" }))
    ).toBe("Mohamed deactivated Ahmed Yehia");
    expect(
      describeAccessEvent(event({ kind: "activation", fromValue: "deactivated", toValue: "active" }))
    ).toBe("Mohamed reactivated Ahmed Yehia");
  });

  it("uses the allowlist panel's own words, not a second glossary", () => {
    expect(
      describeAccessEvent(event({ kind: "allowlist", subjectLabel: "new@coditu.com", toValue: "invited" }))
    ).toBe("Mohamed invited new@coditu.com to sign up");
    expect(
      describeAccessEvent(
        event({ kind: "allowlist", subjectLabel: "old@coditu.com", fromValue: "invited", toValue: "withdrawn" })
      )
    ).toBe("Mohamed withdrew the invitation for old@coditu.com");
  });

  it("calls a temporary password what it is — somebody else can sign in as you", () => {
    expect(describeAccessEvent(event({ kind: "temporary_password", toValue: "issued" }))).toBe(
      "Mohamed issued a temporary password for Ahmed Yehia"
    );
  });

  it("names the project on a grant, and the four things a grant can do", () => {
    const grant = (over: Partial<AccessEventLike>) =>
      describeAccessEvent(
        event({ kind: "client_grant", subjectLabel: "Eva", projectName: "MEINEvim components", ...over })
      );

    expect(grant({ toValue: "view_project, view_components" })).toBe(
      "Mohamed gave Eva access on MEINEvim components — view_project, view_components"
    );
    expect(grant({ fromValue: "granted", toValue: "revoked" })).toBe(
      "Mohamed revoked Eva's access on MEINEvim components"
    );
    expect(grant({ fromValue: "revoked", toValue: "granted" })).toBe(
      "Mohamed restored Eva's access on MEINEvim components"
    );
    expect(grant({ fromValue: "view_project", toValue: "view_project, view_work" })).toBe(
      "Mohamed changed what Eva can see on MEINEvim components — view_project, view_work"
    );
  });

  it("says nothing about a project when the event has none", () => {
    expect(
      describeAccessEvent(
        event({ kind: "client_grant", subjectLabel: "Eva", fromValue: "granted", toValue: "revoked" })
      )
    ).toBe("Mohamed revoked Eva's access");
  });

  /**
   * The one that matters. A null actor means no session was behind the write —
   * a migration, the service-role client, or the SQL console — and those are
   * precisely the writes somebody comes to this table asking about.
   */
  it("says system rather than inventing an author", () => {
    expect(
      describeAccessEvent(event({ actor: null, fromValue: "engineer", toValue: "lead" }))
    ).toBe("system made Ahmed Yehia a lead");
  });
});
