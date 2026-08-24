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

export interface Participant {
  profileId: string;
  minutesLogged: number;
}

export interface Share extends Participant {
  shareCents: number;
}

/**
 * Split a pot equally, to the cent, with the remainder distributed
 * deterministically.
 *
 * Equally — not proportionally. That is the team's rule (E1.3) and it is the
 * whole reason the confirmation screen exists: an equal split is a decision
 * about fairness, and a decision needs a human on it.
 *
 * The remainder is handed out one cent at a time in ascending `profileId`
 * order. Deterministic on purpose: the same pot and the same participants must
 * produce the same split every time it is computed, or a re-render disagrees
 * with a stored row and nobody can tell which is right.
 *
 * **`sum(shareCents) === potCents` exactly**, for every input, including a pot
 * of 0, a pot of 1 among 7, and 10001 among 3. That identity is asserted in
 * `tests/earnings.test.ts`.
 */
export function splitEqually(potCents: number, participants: readonly Participant[]): Share[] {
  if (participants.length === 0) return [];

  const ordered = [...participants].sort((a, b) => (a.profileId < b.profileId ? -1 : 1));
  const base = Math.floor(potCents / ordered.length);
  let remainder = potCents - base * ordered.length;

  return ordered.map((participant) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { ...participant, shareCents: base + extra };
  });
}

/**
 * Who the app *proposes*, given the threshold.
 *
 * At exactly the threshold they are in — `>=`, and the UI says "logged 25% or
 * more" so the boundary is never a surprise (E7). The comparison is done in
 * integer minutes rather than on a percentage float, because 1 minute in 4 is
 * exactly 25% and `0.25 >= 0.25` is only reliably true when nobody divided.
 */
export function meetsThreshold(
  minutesLogged: number,
  totalMinutes: number,
  thresholdPct: number
): boolean {
  if (totalMinutes <= 0) return false;
  return minutesLogged * 100 >= totalMinutes * thresholdPct;
}

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
