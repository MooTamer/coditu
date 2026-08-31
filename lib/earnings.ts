/**
 * What a sprint pays, as arithmetic.
 *
 * Pure functions, no database, no `server-only` — because the identity that
 * matters here (`sum(shares) === pot`) is provable in a unit test with awkward
 * numbers, and it is the only thing standing between this app and paying
 * somebody a cent less than the sum says.
 *
 * **Invariant 2, restated for money.** Integer minor units everywhere. The pot
 * is `minutes × cents-per-minute`, never `hours × rate` — `hours` is a float
 * the moment you compute it, and a float that gets summed drifts. Division
 * happens in `lib/format.ts` at the render edge and nowhere else.
 */

/** The threshold and the rate both live in `app_settings`; see `lib/settings.ts`. */
export interface PotInput {
  totalMinutes: number;
  hourlyRateCents: number;
}

/**
 * A sprint's pot, in cents.
 *
 * `minutes × rate / 60` with the division LAST and the whole thing floored, so
 * a rate that is not a whole number of cents per minute still yields an exact
 * integer that never exceeds what the hours are worth. USD 12.00/h — the
 * initial value — is exactly 20 cents a minute, so at the default there is no
 * remainder at all.
 */
export function potCents({ totalMinutes, hourlyRateCents }: PotInput): number {
  if (totalMinutes <= 0 || hourlyRateCents <= 0) return 0;
  return Math.floor((totalMinutes * hourlyRateCents) / 60);
}

/**
 * `splitEqually` and `meetsThreshold` lived here until 2026-08-31 and are gone.
 *
 * The split moved to `lib/payout.ts`, because a sprint's pot is no longer
 * divided in one step: hourly pay comes out of it first, and what is left is
 * what gets split. Keeping a second function that divided the whole pot would
 * have been a second calculation to keep agreeing with the first, and the
 * failure mode of two money functions disagreeing is that nobody can say which
 * one is right.
 *
 * `meetsThreshold` went with it because the rule it enforced was reversed:
 * a share is a split and not a wage, so somebody on the share basis takes their
 * part whether or not they logged a minute. `app_settings.payout_share_threshold_pct`
 * is still a column and is no longer read by anything.
 */

/**
 * A live exchange rate, or nothing.
 *
 * A provider returning `0`, `null`, a string, or 1e9 EGP to the dollar must
 * never overwrite a rate somebody is being paid against. The band is
 * deliberately wide — it is a sanity check, not a forecast — and anything
 * outside it is logged and dropped, keeping the stored value.
 */
export const RATE_BAND = { min: 1, max: 1000 } as const;

export function isPlausibleRate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= RATE_BAND.min &&
    value <= RATE_BAND.max
  );
}

/** A plausible rate as an integer micro-unit, or null. */
export function rateToMicros(value: unknown): number | null {
  if (!isPlausibleRate(value)) return null;
  return Math.round(value * 1_000_000);
}
