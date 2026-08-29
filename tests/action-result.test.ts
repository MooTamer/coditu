import { describe, expect, it } from "vitest";

import { isUnreachable, settle } from "@/lib/action-result";

/**
 * The discriminator the retry queue rests on.
 *
 * `components/app/save-state.client.tsx` queues a write for replay only when
 * `isUnreachable(result)`. Get that wrong in either direction and the failure is
 * quiet:
 *
 * - too eager, and a write the server *refused on its merits* — not your item,
 *   that criterion is gone — is queued and replayed forever against the same
 *   refusal, with a badge that never clears;
 * - too shy, and a write that never reached anything is dropped, which is the
 *   whole thing the queue exists to prevent.
 *
 * The first version of this used a string comparison — `result.error === fallback`
 * — and it was wrong for every real call site, because several of them wrap
 * `settle` around `settle`. The inner one catches first, so the outer one sees a
 * *resolved* result carrying the INNER fallback string, and the comparison is
 * quietly false. The flag survives that nesting; the string did not. That is
 * what the last test here holds.
 */
describe("settle marks the failures nobody answered", () => {
  it("passes a successful result through untouched", async () => {
    const result = await settle(async () => ({ ok: true, id: "abc" }), "fallback");
    expect(result).toEqual({ ok: true, id: "abc" });
    expect(isUnreachable(result)).toBe(false);
  });

  it("passes a server's refusal through untouched, and does NOT mark it", async () => {
    const refusal = { ok: false, error: "Only the assignee can move this item." };
    const result = await settle(async () => refusal, "fallback");

    expect(result).toEqual(refusal);
    // The server read this write and said no. Replaying it gets the same no.
    expect(isUnreachable(result)).toBe(false);
  });

  it("marks a rejected call, because nothing ever read it", async () => {
    const result = await settle(async () => {
      throw new TypeError("Failed to fetch");
    }, "That change did not save.");

    expect(result).toEqual({
      ok: false,
      error: "That change did not save.",
      unreachable: true,
    });
    expect(isUnreachable(result)).toBe(true);
  });

  it("keeps the mark through a nested settle, which a string comparison did not", async () => {
    // Exactly the shape of `row-editors.client.tsx`: the call site settles with
    // its own sentence, and `useTrackedSave` settles the whole thing again with
    // another.
    const inner = () =>
      settle(async () => {
        throw new TypeError("Failed to fetch");
      }, "That change did not save.");
    const result = await settle(inner, "That change did not save — check your connection.");

    expect(isUnreachable(result)).toBe(true);
    // The surviving sentence is the INNER one. Any code comparing this against
    // the outer fallback would conclude the write reached a server, and would
    // silently decline to queue it.
    expect(result).toMatchObject({ error: "That change did not save." });
  });
});
