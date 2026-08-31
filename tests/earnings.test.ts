import { describe, expect, it } from "vitest";

import { isPlausibleRate, potCents, rateToMicros } from "@/lib/earnings";
import { egpFromPiastres, piastresFromCents, rateFromMicros, usdFromCents } from "@/lib/format";

/**
 * The pot, and the exchange rate that renders it in a second currency.
 *
 * The split moved to `tests/payout.test.ts` on 2026-08-31, along with the
 * identity it exists to hold — `sum(every line) === pot`, exactly. What is left
 * here is the one number the split divides and the rate it is shown at.
 */


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

/**
 * `splitEqually` and `meetsThreshold` were tested here and no longer exist.
 * The split is `lib/payout.ts` and `tests/payout.test.ts`, which asserts the
 * same identity — every payable distribution sums to the pot exactly — plus
 * the hourly leg the old function had no concept of.
 */

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
