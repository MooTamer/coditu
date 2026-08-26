import { describe, expect, it } from "vitest";

import { describeActivity, type ActivityLike } from "@/lib/activity";

/**
 * The wording of an activity row, pinned — because it is the only part of one a
 * reader ever sees, and two screens now draw it.
 */

const row = (over: Partial<ActivityLike>): ActivityLike => ({
  verb: "updated",
  field: null,
  fromValue: null,
  toValue: null,
  actor: { initials: "AE" },
  ...over,
});

describe("describeActivity", () => {
  it("names the creation without a field", () => {
    expect(describeActivity(row({ verb: "created" }))).toBe("AE created this item");
  });

  it("says both sides of a status change", () => {
    expect(
      describeActivity(row({ field: "status", fromValue: "ready", toValue: "in_progress" }))
    ).toBe("AE changed status ready → in_progress");
  });

  it("draws an em dash for a side that was empty", () => {
    expect(describeActivity(row({ field: "status", fromValue: null, toValue: "draft" }))).toBe(
      "AE changed status — → draft"
    );
  });

  it("reads any other field as a setting", () => {
    expect(describeActivity(row({ field: "component", toValue: "EVIM Link Buttons" }))).toBe(
      "AE set component → EVIM Link Buttons"
    );
  });

  /**
   * A trigger-written row has no actor, and that is not a gap: the rollup
   * triggers write with no `actor_id`, and `on delete set null` means a deleted
   * profile's history survives and stops naming them.
   */
  it("calls an actorless row system rather than leaving a hole", () => {
    expect(describeActivity(row({ verb: "created", actor: null }))).toBe(
      "system created this item"
    );
    expect(describeActivity(row({ verb: "recalculated", actor: null }))).toBe(
      "system recalculated"
    );
  });
});
