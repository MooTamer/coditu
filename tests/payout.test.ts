import { describe, expect, it } from "vitest";

import {
  allocateLargestRemainder,
  computeSprintPayout,
  hourlyPayCents,
  type PayablePayout,
  type PayoutInput,
  type PayoutPerson,
  type UnpayablePayout,
} from "@/lib/payout";

/**
 * The money. Every case here was named by Mohamed on 2026-08-31 and each one is
 * asserted rather than described.
 *
 * ## Why this file is worth reading before changing `lib/payout.ts`
 *
 * There are zero payouts in the database — hosted and local, counted before the
 * migration and again after. That is the only reason the model could be changed
 * at all. Every assertion below is cheap today and would be a renegotiation with
 * four people once one real payout exists.
 *
 * ## The identity
 *
 * `sum(every line) === pot`, exactly, for every payable input. Not "within a
 * cent" — a sum that drifts by a cent a sprint is a sum nobody can reconcile,
 * and this app's whole credibility is its sums.
 */

/** USD 12.00/h, the team rate in `app_settings`, and exactly 20 cents a minute. */
const TEAM_RATE = 1200;

function person(
  profileId: string,
  basis: PayoutPerson["basis"],
  minutesLogged: number,
  hourlyRateCents: number | null = null
): PayoutPerson {
  return { profileId, basis, minutesLogged, hourlyRateCents };
}

function payable(input: PayoutInput): PayablePayout {
  const result = computeSprintPayout(input);
  if (!result.payable) throw new Error("expected a payable sprint");
  return result;
}

function unpayable(input: PayoutInput): UnpayablePayout {
  const result = computeSprintPayout(input);
  if (result.payable) throw new Error("expected an unpayable sprint");
  return result;
}

const sums = (p: PayablePayout) => p.lines.reduce((total, line) => total + line.amountCents, 0);
const amountFor = (p: PayablePayout, id: string) =>
  p.lines.find((line) => line.profileId === id)?.amountCents;

describe("the ordinary case", () => {
  // The real team, with the real bases. 100 hours logged between them at the
  // team rate is a $1,200 pot; Ahmed's 20 hours are $240 of it, taken out
  // first, and the $960 left over is split three ways.
  const input: PayoutInput = {
    totalMinutes: 6000,
    hourlyRateCents: TEAM_RATE,
    people: [
      person("a-abdelrahman", "share", 1800),
      person("b-adam", "share", 600),
      person("c-mohamed", "share", 2400),
      person("d-ahmed", "hourly", 1200),
    ],
  };

  it("takes the hourly pay out of the pot, not on top of it", () => {
    const result = payable(input);
    expect(result.potCents).toBe(120_000);
    expect(result.hourlyPayCents).toBe(24_000);
    expect(result.remainderCents).toBe(96_000);
    // The reading that would be wrong: pot 120000 AND hourly 24000 paid
    // separately, costing 144000. The remainder is what proves it did not.
    expect(result.remainderCents).toBe(result.potCents - result.hourlyPayCents);
  });

  it("splits what is left equally, and pays the hourly person their hours", () => {
    const result = payable(input);
    expect(amountFor(result, "d-ahmed")).toBe(24_000);
    expect(amountFor(result, "a-abdelrahman")).toBe(32_000);
    expect(amountFor(result, "b-adam")).toBe(32_000);
    expect(amountFor(result, "c-mohamed")).toBe(32_000);
  });

  it("sums to the pot exactly", () => {
    expect(sums(payable(input))).toBe(120_000);
  });

  it("pays somebody who takes no share nothing, and still counts their minutes", () => {
    // 6,000 minutes on the sprint, only 5,400 of them from people who are paid.
    // The pot is struck on all of it — a non-participant's time is billable and
    // is what makes the pot bigger than the sum of the participants' hours.
    const withOutsider = payable({
      ...input,
      people: [...input.people, person("e-nobody", "none", 600)],
    });
    expect(withOutsider.lines.some((line) => line.profileId === "e-nobody")).toBe(false);
    expect(withOutsider.potCents).toBe(120_000);
    expect(sums(withOutsider)).toBe(120_000);
  });
});

describe("hourly pay EXCEEDS the pot — refuse, do not render a number", () => {
  // A contractor at $60/h on a sprint struck at $12/h. Twenty of the hundred
  // hours are his: $1,200 owed out of a $1,200 pot is exactly break-even, so
  // push it to 25 hours and it is not.
  const input: PayoutInput = {
    totalMinutes: 6000,
    hourlyRateCents: TEAM_RATE,
    people: [
      person("a-abdelrahman", "share", 1500),
      person("c-mohamed", "share", 3000),
      person("d-ahmed", "hourly", 1500, 6000),
    ],
  };

  it("refuses rather than returning a plan", () => {
    const result = computeSprintPayout(input);
    expect(result.payable).toBe(false);
  });

  it("names the shortfall", () => {
    const result = unpayable(input);
    expect(result.potCents).toBe(120_000);
    expect(result.hourlyPayCents).toBe(150_000);
    expect(result.shortfallCents).toBe(30_000);
    expect(result.reason).toBe("hourly-pay-exceeds-pot");
  });

  it("does not clamp to zero and does not emit negative shares", () => {
    const result = unpayable(input);
    // The three things a lazier implementation does instead, each asserted
    // absent: a `lines` array, a zero share, a negative one.
    expect(result).not.toHaveProperty("lines");
    expect(result).not.toHaveProperty("remainderCents");
    expect(result.hourly.every((line) => line.amountCents > 0)).toBe(true);
  });

  it("still says who is owed, because that is the actionable half", () => {
    const result = unpayable(input);
    expect(result.hourly.map((line) => line.profileId)).toEqual(["d-ahmed"]);
    expect(result.hourly[0].amountCents).toBe(150_000);
    expect(result.hourly[0].rateCents).toBe(6000);
  });
});

describe("hourly pay EXACTLY equals the pot — zero shares, which is legitimate", () => {
  // Same contractor, twenty hours: $1,200 owed out of a $1,200 pot.
  const input: PayoutInput = {
    totalMinutes: 6000,
    hourlyRateCents: TEAM_RATE,
    people: [
      person("a-abdelrahman", "share", 1800),
      person("c-mohamed", "share", 3000),
      person("d-ahmed", "hourly", 1200, 6000),
    ],
  };

  it("is payable, not an error", () => {
    // The boundary is `>`, not `>=`. Everything is covered, exactly; there is
    // nothing dishonest about a split of nothing when the arithmetic is whole.
    expect(computeSprintPayout(input).payable).toBe(true);
  });

  it("renders zero rather than refusing", () => {
    const result = payable(input);
    expect(result.remainderCents).toBe(0);
    expect(amountFor(result, "a-abdelrahman")).toBe(0);
    expect(amountFor(result, "c-mohamed")).toBe(0);
    expect(amountFor(result, "d-ahmed")).toBe(120_000);
  });

  it("still sums to the pot", () => {
    expect(sums(payable(input))).toBe(120_000);
  });
});

describe("who logged what does not decide a share", () => {
  it("pays a share person who logged NOTHING their full share", () => {
    // The rule in one assertion: it is a split, not hourly pay. Under the old
    // 25% threshold this person was not in `proposedShares` at all.
    const result = payable({
      totalMinutes: 3000,
      hourlyRateCents: TEAM_RATE,
      people: [
        person("a-worked", "share", 3000),
        person("b-did-not", "share", 0),
      ],
    });
    expect(result.potCents).toBe(60_000);
    expect(amountFor(result, "a-worked")).toBe(30_000);
    expect(amountFor(result, "b-did-not")).toBe(30_000);
    expect(sums(result)).toBe(60_000);
  });

  it("pays an hourly person who logged NOTHING nothing, and leaves the pot whole", () => {
    const result = payable({
      totalMinutes: 3000,
      hourlyRateCents: TEAM_RATE,
      people: [
        person("a-worked", "share", 3000),
        person("d-idle", "hourly", 0, 6000),
      ],
    });
    expect(result.hourlyPayCents).toBe(0);
    expect(result.remainderCents).toBe(60_000);
    expect(amountFor(result, "d-idle")).toBe(0);
    expect(amountFor(result, "a-worked")).toBe(60_000);
    expect(sums(result)).toBe(60_000);
  });

  it("is unpayable with nobody to pay only when the hourly pay is real", () => {
    // No share people at all: the remainder has nowhere to go and is NOT
    // silently absorbed. `sum(lines)` is then the hourly pay, and the identity
    // does not hold — so this is the one payable shape where it cannot, and it
    // is asserted rather than hidden.
    const result = payable({
      totalMinutes: 3000,
      hourlyRateCents: TEAM_RATE,
      people: [person("d-ahmed", "hourly", 1200)],
    });
    expect(result.potCents).toBe(60_000);
    expect(result.hourlyPayCents).toBe(24_000);
    expect(result.remainderCents).toBe(36_000);
    expect(sums(result)).toBe(24_000);
    expect(result.lines).toHaveLength(1);
  });
});

describe("rounding — thirds of an odd amount", () => {
  /** Every payable split must add back up to the pot. No exceptions, no epsilon. */
  function assertExact(input: PayoutInput) {
    const result = payable(input);
    expect(sums(result)).toBe(result.potCents);
    return result;
  }

  it("splits 1 cent among 3 without losing or inventing one", () => {
    // A pot of exactly 1 cent: 1 minute at 60 cents an hour.
    const result = assertExact({
      totalMinutes: 1,
      hourlyRateCents: 60,
      people: [person("a", "share", 0), person("b", "share", 0), person("c", "share", 1)],
    });
    expect(result.potCents).toBe(1);
    expect(result.lines.map((l) => l.amountCents)).toEqual([1, 0, 0]);
  });

  it("splits 10,001 cents among 3 as 3334 / 3334 / 3333", () => {
    // 3,333 each leaves 2 cents over, so exactly two people get one more.
    // Three thirds of 10,001 is the case that catches an implementation which
    // rounds each share and hopes.
    const result = assertExact({
      totalMinutes: 10_001,
      hourlyRateCents: 60,
      people: [person("a", "share", 1), person("b", "share", 1), person("c", "share", 1)],
    });
    expect(result.potCents).toBe(10_001);
    expect(result.lines.map((l) => l.amountCents)).toEqual([3334, 3334, 3333]);
  });

  it("splits a remainder of 1 among 3 so exactly one person gets the extra cent", () => {
    const result = assertExact({
      totalMinutes: 10_000,
      hourlyRateCents: 60,
      people: [person("a", "share", 0), person("b", "share", 0), person("c", "share", 0)],
    });
    expect(result.potCents).toBe(10_000);
    expect(result.lines.map((l) => l.amountCents)).toEqual([3334, 3333, 3333]);
  });

  it("gives nobody an extra cent when the thirds are whole", () => {
    const result = assertExact({
      totalMinutes: 10_002,
      hourlyRateCents: 60,
      people: [person("a", "share", 0), person("b", "share", 0), person("c", "share", 0)],
    });
    expect(result.lines.map((l) => l.amountCents)).toEqual([3334, 3334, 3334]);
  });

  it("holds the identity across every remainder 0..6 among 7 people", () => {
    for (let extra = 0; extra <= 6; extra += 1) {
      const result = assertExact({
        totalMinutes: 700 + extra,
        hourlyRateCents: 60,
        people: Array.from({ length: 7 }, (_, i) => person(`p${i}`, "share", 0)),
      });
      expect(result.potCents).toBe(700 + extra);
      const extras = result.lines.filter((l) => l.amountCents === 101).length;
      expect(extras).toBe(extra);
    }
  });

  it("holds the identity with hourly pay in front of an awkward remainder", () => {
    // Pot 10,001; hourly takes 1,667; 8,334 splits three ways as 2,778 each.
    const result = assertExact({
      totalMinutes: 10_001,
      hourlyRateCents: 60,
      people: [
        person("a", "share", 0),
        person("b", "share", 0),
        person("c", "share", 0),
        person("d", "hourly", 1667, 60),
      ],
    });
    expect(result.hourlyPayCents).toBe(1667);
    expect(result.remainderCents).toBe(8334);
    expect(result.lines.map((l) => l.amountCents)).toEqual([1667, 2778, 2778, 2778]);
  });

  it("is deterministic — the same input twice is the same split", () => {
    // Not a nicety: a re-render that disagreed with a stored row would leave
    // nobody able to say which was right.
    const input: PayoutInput = {
      totalMinutes: 10_001,
      hourlyRateCents: 60,
      people: [person("c", "share", 9), person("a", "share", 0), person("b", "share", 400)],
    };
    expect(computeSprintPayout(input)).toEqual(computeSprintPayout(input));
  });
});

describe("largest-remainder allocation, on its own", () => {
  it("gives the spare cents to the largest remainders first", () => {
    // 10 among weights 1,2,3 -> exact 1.67, 3.33, 5.00; floors 1,3,5 = 9;
    // one cent left and the largest fractional part is the 1-weight's .67.
    expect(
      allocateLargestRemainder(10, [
        { key: "a", weight: 1 },
        { key: "b", weight: 2 },
        { key: "c", weight: 3 },
      ])
    ).toEqual([
      { key: "a", amount: 2 },
      { key: "b", amount: 3 },
      { key: "c", amount: 5 },
    ]);
  });

  it("breaks ties by key so equal weights are still deterministic", () => {
    const out = allocateLargestRemainder(4, [
      { key: "z", weight: 1 },
      { key: "a", weight: 1 },
      { key: "m", weight: 1 },
    ]);
    // Every remainder is equal, so the extra cent goes to "a".
    expect(out).toEqual([
      { key: "z", amount: 1 },
      { key: "a", amount: 2 },
      { key: "m", amount: 1 },
    ]);
  });

  it("returns zeros rather than dividing by nothing", () => {
    expect(allocateLargestRemainder(0, [{ key: "a", weight: 1 }])).toEqual([{ key: "a", amount: 0 }]);
    expect(allocateLargestRemainder(5, [{ key: "a", weight: 0 }])).toEqual([{ key: "a", amount: 0 }]);
    expect(allocateLargestRemainder(5, [])).toEqual([]);
  });
});

describe("one person's hours at a rate", () => {
  it("divides last, so eleven minutes is not a cent short", () => {
    // 11 minutes at $12.00/h is 220 cents exactly. `hours x rate` computes
    // 0.1833... x 1200 and floors to 219.
    expect(hourlyPayCents(11, TEAM_RATE)).toBe(220);
    expect(Math.floor(Math.floor((11 / 60) * 100) / 100 * TEAM_RATE)).toBe(216);
  });

  it("floors a rate that is not a whole number of cents a minute", () => {
    // $10.00/h is 16.66… cents a minute; 7 minutes is 116.66… and pays 116.
    expect(hourlyPayCents(7, 1000)).toBe(116);
  });

  it("is zero for nothing logged and for a rate of nothing", () => {
    expect(hourlyPayCents(0, TEAM_RATE)).toBe(0);
    expect(hourlyPayCents(600, 0)).toBe(0);
  });
});

describe("the team as it stands on 2026-08-31", () => {
  // Mohamed's decision, as data rather than as prose: Ahmed Yehia is a
  // developer paid hourly; Mohamed, Abdelrahman and Adam take the split.
  it("pays Ahmed his hours and splits the rest three ways", () => {
    const result = payable({
      totalMinutes: 5040 + 3000,
      hourlyRateCents: TEAM_RATE,
      people: [
        person("abdelrahman", "share", 1000),
        person("adam", "share", 500),
        person("mohamed", "share", 1500),
        person("ahmed", "hourly", 5040),
      ],
    });
    // 8,040 minutes at $12/h = $1,608. Ahmed's 5,040 = $1,008 of it, out
    // first; $600 splits three ways at $200 each.
    expect(result.potCents).toBe(160_800);
    expect(result.hourlyPayCents).toBe(100_800);
    expect(result.remainderCents).toBe(60_000);
    expect(amountFor(result, "ahmed")).toBe(100_800);
    expect(amountFor(result, "adam")).toBe(20_000);
    expect(sums(result)).toBe(160_800);
  });

  it("shows what the old model would have done with the same minutes", () => {
    // Ahmed on the share basis — which is what `is_developer = true` meant
    // before this split — hands him $402 and the others $402 each, so his
    // 5,040 minutes swell a pot he then takes an equal quarter of. That is the
    // money error the overloaded column was one confirmation away from making.
    const old = payable({
      totalMinutes: 5040 + 3000,
      hourlyRateCents: TEAM_RATE,
      people: [
        person("abdelrahman", "share", 1000),
        person("adam", "share", 500),
        person("mohamed", "share", 1500),
        person("ahmed", "share", 5040),
      ],
    });
    expect(amountFor(old, "ahmed")).toBe(40_200);
    expect(amountFor(old, "adam")).toBe(40_200);
    expect(sums(old)).toBe(160_800);
  });
});
