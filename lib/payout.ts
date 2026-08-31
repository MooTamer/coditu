import { potCents } from "@/lib/earnings";

/**
 * What a sprint pays each person, as arithmetic.
 *
 * Pure — no database, no `server-only`, no zod. It is imported by a Server
 * Action, by the earnings reads and by two client components, and a `lib/`
 * module that pulls a validator in behind it ships 65 KB to the browser that
 * only `npm run budgets` can see. See `docs/07-FIELD-NOTES.md`.
 *
 * ## The model, from Mohamed, 2026-08-31
 *
 * ```
 * pot        = the sprint's total, struck at the team rate
 * hourly_pay = SUM(rate x minutes_logged) for everybody on the hourly basis
 * remainder  = pot - hourly_pay
 * split      = remainder distributed among the share people
 * ```
 *
 * **Hourly pay comes out of the pot, before the split — it is not a cost on
 * top of it.** That is the sentence the whole file exists to implement, and it
 * is why `hourlyPayCents` is subtracted rather than added anywhere.
 *
 * ## Invariant 2, restated for money
 *
 * Integer minor units everywhere. Every amount here is cents; no value is ever
 * a float; division happens in `lib/format.ts` at the render edge. The identity
 * that matters is
 *
 *     SUM(every line's amountCents) === potCents        exactly
 *
 * for every payable input, and `tests/payout.test.ts` asserts it on thirds of
 * odd amounts, which is where a naïve split loses a cent.
 *
 * ## The three rules that are decisions rather than arithmetic
 *
 * 1. **A share person who logged nothing still receives their share.** It is a
 *    split, not hourly pay. This reverses the `payoutShareThresholdPct` gate
 *    for share people — see the ADR of 2026-08-31.
 * 2. **An hourly person who logged nothing receives nothing, and the pot is
 *    untouched.** Their contribution to `hourly_pay` is zero, so the remainder
 *    is the whole pot.
 * 3. **Hourly pay above the pot is refused, not clamped.** No zero, no negative
 *    share, no rendered number. An unpayable sprint says what it is short by
 *    and names who is owed. The same rule the Recovery Centre follows: a figure
 *    that cannot be computed honestly must not appear on a screen.
 */

export type PayoutBasis = "share" | "hourly" | "none";

export interface PayoutPerson {
  profileId: string;
  basis: PayoutBasis;
  minutesLogged: number;
  /** Their agreed rate when hourly. Null means the team rate. */
  hourlyRateCents: number | null;
}

export interface PayoutInput {
  /** Every minute logged on the sprint, by anybody, on any basis. */
  totalMinutes: number;
  /** `app_settings.hourly_rate_cents` — what the pot is struck at. */
  hourlyRateCents: number;
  people: readonly PayoutPerson[];
}

export interface PayoutLine {
  profileId: string;
  basis: "hourly" | "share";
  minutesLogged: number;
  /** The rate this line was paid at. Null for a share, which is not a rate. */
  rateCents: number | null;
  amountCents: number;
}

export interface PayablePayout {
  payable: true;
  potCents: number;
  hourlyPayCents: number;
  /** What the split divides. `potCents - hourlyPayCents`, never negative. */
  remainderCents: number;
  /** Hourly lines first, then shares. `sum(amountCents) === potCents`. */
  lines: PayoutLine[];
}

export interface UnpayablePayout {
  payable: false;
  reason: "hourly-pay-exceeds-pot";
  potCents: number;
  hourlyPayCents: number;
  /** How much more the hourly people are owed than the sprint took in. */
  shortfallCents: number;
  /** Who is owed it. There is no split, so there are no share lines. */
  hourly: PayoutLine[];
}

export type SprintPayout = PayablePayout | UnpayablePayout;

/**
 * What one person's time is worth at a rate.
 *
 * `minutes x cents-per-hour / 60`, with the division **last** and the result
 * floored — the same shape as `potCents`, for the same reason. `hours x rate`
 * loses a cent at eleven minutes, which is small enough that nobody would ever
 * check it.
 */
export function hourlyPayCents(minutesLogged: number, rateCents: number): number {
  if (minutesLogged <= 0 || rateCents <= 0) return 0;
  return Math.floor((minutesLogged * rateCents) / 60);
}

/**
 * Hand out `amount` among `weights` so the parts sum to `amount` exactly.
 *
 * **Largest-remainder allocation.** Each part gets `floor(amount x wᵢ / Σw)`;
 * the cents left over — there are always fewer of them than there are parts —
 * go one each to the parts with the largest fractional remainder, ties broken
 * by `key` ascending so the same input always produces the same output. A
 * re-render that disagreed with a stored row would leave nobody able to say
 * which was right.
 *
 * The comparison is done on `amount x wᵢ mod Σw` as an integer. Comparing
 * fractional parts as floats is the one place a rounding rule could itself
 * round, which would be a joke at this file's expense.
 *
 * `amount` may be zero, and every weight may be equal, which is the only case
 * this repository currently uses: `sprint_payout_shares` carries
 * `minutes_logged` and `share_cents` and **no weight column**, so the split is
 * equal. The general form is here because the refusal case above needs exact
 * arithmetic anyway, and because a weighted split is one column away.
 */
export function allocateLargestRemainder(
  amount: number,
  weights: readonly { key: string; weight: number }[]
): { key: string; amount: number }[] {
  if (weights.length === 0) return [];

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0 || amount <= 0) {
    return weights.map((w) => ({ key: w.key, amount: 0 }));
  }

  const parts = weights.map((w) => {
    const numerator = amount * w.weight;
    return {
      key: w.key,
      amount: Math.floor(numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });

  let left = amount - parts.reduce((sum, p) => sum + p.amount, 0);
  const order = [...parts].sort(
    (a, b) => b.remainder - a.remainder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
  for (const part of order) {
    if (left <= 0) break;
    part.amount += 1;
    left -= 1;
  }

  return parts.map(({ key, amount: part }) => ({ key, amount: part }));
}

/**
 * The whole model, in one function.
 *
 * Returns either a payable plan whose lines sum to the pot exactly, or a
 * refusal that names the shortfall. It never returns a number it cannot stand
 * behind.
 */
export function computeSprintPayout({
  totalMinutes,
  hourlyRateCents: teamRateCents,
  people,
}: PayoutInput): SprintPayout {
  const pot = potCents({ totalMinutes, hourlyRateCents: teamRateCents });

  const hourly: PayoutLine[] = people
    .filter((person) => person.basis === "hourly")
    .map((person) => {
      const rateCents = person.hourlyRateCents ?? teamRateCents;
      return {
        profileId: person.profileId,
        basis: "hourly" as const,
        minutesLogged: person.minutesLogged,
        rateCents,
        amountCents: hourlyPayCents(person.minutesLogged, rateCents),
      };
    })
    .sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));

  const hourlyPaid = hourly.reduce((sum, line) => sum + line.amountCents, 0);

  // Refuse, do not clamp. A pot that cannot cover what it already owes is a
  // fact about the sprint, and rendering `$0.00` for everybody else would be a
  // claim that the split was computed and came to nothing.
  if (hourlyPaid > pot) {
    return {
      payable: false,
      reason: "hourly-pay-exceeds-pot",
      potCents: pot,
      hourlyPayCents: hourlyPaid,
      shortfallCents: hourlyPaid - pot,
      hourly,
    };
  }

  const remainder = pot - hourlyPaid;

  // Every share person, whether or not they logged a minute. Equal weights,
  // because a split is not a measure of who worked hardest — that is what the
  // hourly basis is for.
  const sharePeople = people.filter((person) => person.basis === "share");
  const minutesById = new Map(sharePeople.map((person) => [person.profileId, person.minutesLogged]));
  const allocated = allocateLargestRemainder(
    remainder,
    sharePeople.map((person) => ({ key: person.profileId, weight: 1 }))
  ).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const shares: PayoutLine[] = allocated.map(({ key, amount }) => ({
    profileId: key,
    basis: "share" as const,
    minutesLogged: minutesById.get(key) ?? 0,
    rateCents: null,
    amountCents: amount,
  }));

  return {
    payable: true,
    potCents: pot,
    hourlyPayCents: hourlyPaid,
    remainderCents: remainder,
    // Hourly first: it is paid first, and the screen reads in that order.
    lines: [...hourly, ...shares],
  };
}

/**
 * The one sentence an unpayable sprint is allowed to say, built here so the
 * board, the confirmation screen and somebody's own earnings page cannot
 * disagree about it.
 */
export function unpayableReason(payout: UnpayablePayout, formatMoney: (cents: number) => string) {
  return (
    `Hourly pay on this sprint comes to ${formatMoney(payout.hourlyPayCents)}, ` +
    `which is ${formatMoney(payout.shortfallCents)} more than the ${formatMoney(payout.potCents)} ` +
    "it took in. There is nothing to split, and no figure here would be true."
  );
}
