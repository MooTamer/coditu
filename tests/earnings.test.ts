import { describe, expect, it } from "vitest";

import {
  isPlausibleRate,
  meetsThreshold,
  potCents,
  rateToMicros,
  splitEqually,
  type Participant,
} from "@/lib/earnings";
import { egpFromPiastres, piastresFromCents, rateFromMicros, usdFromCents } from "@/lib/format";

/**
 * The arithmetic behind what a sprint pays.
 *
 * The identity that matters is `sum(shareCents) === potCents`, exactly, for
 * every input — including the awkward ones the brief names. A split that is
 * one cent short looks right on every screen and is wrong in somebody's bank
 * account, so it is asserted here with numbers chosen to break it.
 */

function ids(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({
    // Zero-padded so string ordering is numeric ordering — the split is
    // deterministic on ascending profileId and the test has to sort the same
    // way the function does.
    profileId: `p${String(i).padStart(3, "0")}`,
    minutesLogged: 0,
  }));
}

describe("potCents", () => {
  it("is minutes × rate ÷ 60, and USD 12/h is exactly 20 cents a minute", () => {
    expect(potCents({ totalMinutes: 60, hourlyRateCents: 1200 })).toBe(1200);
    expect(potCents({ totalMinutes: 1, hourlyRateCents: 1200 })).toBe(20);
    expect(potCents({ totalMinutes: 16_800, hourlyRateCents: 1200 })).toBe(336_000);
  });

  it("never computes hours × rate — 11 minutes at 12/h is 220 cents, and the float route says 219", () => {
    expect(potCents({ totalMinutes: 11, hourlyRateCents: 1200 })).toBe(220);
    // (11 / 60) * 1200 is 219.99999999999997, which floors to 219. A real cent,
    // gone, on a number small enough that nobody would check it. This is
    // invariant 2 in one line, and it is why the division is last.
    expect(Math.floor((11 / 60) * 1200)).toBe(219);
  });

  it("floors a rate that is not a whole number of cents per minute", () => {
    // 1250 c/h ÷ 60 = 20.8333… c/min. One minute is worth 20 cents, not 21.
    expect(potCents({ totalMinutes: 1, hourlyRateCents: 1250 })).toBe(20);
    expect(potCents({ totalMinutes: 60, hourlyRateCents: 1250 })).toBe(1250);
  });

  it("is zero for no minutes, and refuses a nonsense rate rather than going negative", () => {
    expect(potCents({ totalMinutes: 0, hourlyRateCents: 1200 })).toBe(0);
    expect(potCents({ totalMinutes: -5, hourlyRateCents: 1200 })).toBe(0);
    expect(potCents({ totalMinutes: 60, hourlyRateCents: 0 })).toBe(0);
  });
});

describe("splitEqually", () => {
  const identity = (pot: number, n: number) => {
    const shares = splitEqually(pot, ids(n));
    expect(shares.reduce((sum, s) => sum + s.shareCents, 0)).toBe(pot);
    return shares;
  };

  it("3 participants and a pot of 100 cents", () => {
    expect(identity(100, 3).map((s) => s.shareCents)).toEqual([34, 33, 33]);
  });

  it("7 participants and a pot of 1 cent — one takes it, six take nothing", () => {
    expect(identity(1, 7).map((s) => s.shareCents)).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it("a pot of 0", () => {
    expect(identity(0, 4).map((s) => s.shareCents)).toEqual([0, 0, 0, 0]);
  });

  it("3 participants and 10001 cents — 3334 / 3334 / 3333, summing to 10001", () => {
    expect(identity(10001, 3).map((s) => s.shareCents)).toEqual([3334, 3334, 3333]);
  });

  it("one developer takes the whole pot", () => {
    expect(identity(33_607, 1).map((s) => s.shareCents)).toEqual([33_607]);
  });

  it("nobody is a valid answer, not a divide by zero", () => {
    expect(splitEqually(5000, [])).toEqual([]);
  });

  it("holds the identity across a wide sweep of awkward numbers", () => {
    for (let n = 1; n <= 9; n += 1) {
      for (const pot of [0, 1, 2, 7, 99, 100, 101, 10_000, 10_001, 336_007, 999_999]) {
        identity(pot, n);
      }
    }
  });

  it("is deterministic: the remainder goes by ascending profile id, not by arrival", () => {
    const forwards = splitEqually(100, [
      { profileId: "c", minutesLogged: 10 },
      { profileId: "a", minutesLogged: 90 },
      { profileId: "b", minutesLogged: 50 },
    ]);
    const backwards = splitEqually(100, [
      { profileId: "b", minutesLogged: 50 },
      { profileId: "a", minutesLogged: 90 },
      { profileId: "c", minutesLogged: 10 },
    ]);
    expect(forwards).toEqual(backwards);
    expect(forwards.map((s) => s.profileId)).toEqual(["a", "b", "c"]);
    // Equally, not proportionally: the person with 90 minutes and the person
    // with 10 take the same amount.
    expect(forwards.map((s) => s.shareCents)).toEqual([34, 33, 33]);
  });

  it("carries each participant's minutes through untouched", () => {
    const shares = splitEqually(60, [{ profileId: "a", minutesLogged: 275 }]);
    expect(shares[0].minutesLogged).toBe(275);
  });
});

describe("meetsThreshold", () => {
  it("includes somebody at exactly the threshold", () => {
    expect(meetsThreshold(25, 100, 25)).toBe(true);
    // The float route rounds the wrong way often enough to matter: 1 minute in
    // 4 is exactly 25%, and this is why the comparison never divides.
    expect(meetsThreshold(1, 4, 25)).toBe(true);
    expect(meetsThreshold(3, 12, 25)).toBe(true);
  });

  it("excludes somebody just under it", () => {
    expect(meetsThreshold(24, 100, 25)).toBe(false);
    expect(meetsThreshold(299, 1200, 25)).toBe(false);
  });

  it("is false when nobody logged anything, rather than dividing by zero", () => {
    expect(meetsThreshold(0, 0, 25)).toBe(false);
  });

  it("a threshold of 0 includes everyone who logged nothing at all", () => {
    expect(meetsThreshold(0, 100, 0)).toBe(true);
  });
});

describe("the exchange rate never arrives as a float in the database", () => {
  it("accepts a plausible rate and stores it as an integer", () => {
    expect(rateToMicros(50.86)).toBe(50_860_000);
    expect(rateToMicros(48)).toBe(48_000_000);
  });

  it("refuses 0, null, a string, a NaN and an implausible band", () => {
    for (const bad of [0, null, undefined, "50.86", NaN, Infinity, -3, 0.5, 1001, 1e9]) {
      expect(isPlausibleRate(bad)).toBe(false);
      expect(rateToMicros(bad)).toBeNull();
    }
  });

  it("takes the edges of the band", () => {
    expect(isPlausibleRate(1)).toBe(true);
    expect(isPlausibleRate(1000)).toBe(true);
  });
});

describe("money at the render edge", () => {
  it("divides by 100 exactly once, here", () => {
    expect(usdFromCents(336_000)).toBe("$3,360.00");
    expect(usdFromCents(0)).toBe("$0.00");
    expect(usdFromCents(1)).toBe("$0.01");
  });

  it("renders EGP with its own symbol", () => {
    // A NON-BREAKING space, which is what `Intl` puts between a three-letter
    // currency code and its number. Asserted as the codepoint rather than as a
    // space, because the two are indistinguishable in a diff and a plain space
    // here would be a test that fails for a reason nobody can see.
    expect(egpFromPiastres(1_708_896)).toBe("EGP 17,088.96");
  });

  it("converts cents to piastres in integers, rounding once at the end", () => {
    // $3,360.00 at 50.86 EGP/USD is EGP 170,889.60 — 17,088,960 piastres.
    expect(piastresFromCents(336_000, 50_860_000)).toBe(17_088_960);
    expect(piastresFromCents(1, 50_860_000)).toBe(51);
  });

  it("returns null rather than inventing a rate", () => {
    expect(piastresFromCents(336_000, null)).toBeNull();
    expect(piastresFromCents(336_000, 0)).toBeNull();
    expect(piastresFromCents(336_000, -1)).toBeNull();
  });

  it("renders the rate itself from its micro-unit", () => {
    expect(rateFromMicros(50_860_000)).toBe("50.86");
  });
});
