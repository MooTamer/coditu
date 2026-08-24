import "server-only";

import { createBreaker } from "@/lib/circuit-breaker";
import { rateToMicros } from "@/lib/earnings";

/**
 * What a dollar is worth in Egyptian pounds.
 *
 * ## The rule that shapes this whole file
 *
 * **The stored value is the source of truth for rendering. The fetch only ever
 * updates it, in the background, on a schedule.** A page always renders from
 * `app_settings.usd_egp_rate_micros`; a refresh that fails changes nothing
 * visible except the "as of" line. That is what makes it impossible for a slow
 * provider to slow down the earnings screen, and it is why there is no cache
 * primitive anywhere near this.
 *
 * A `revalidate`d fetch would not do: a cold instance would render with no rate
 * at all while it waited for one, which is precisely the failure being
 * designed out. Nothing in this repo uses `unstable_cache` or `'use cache'`,
 * and Next 16 has moved that ground more than once — the stored row is a cache
 * that survives a deploy, a cold start and a provider outage, and it needs no
 * framework support.
 *
 * ## Two sources
 *
 * Both free, neither needs a key, and both were verified returning EGP on
 * 2026-08-24. The fallback is a different provider on a different host rather
 * than a retry of the first, because a retry of a dead endpoint is a slower way
 * to fail.
 *
 * ## The sanity band
 *
 * A provider returning `0`, `null`, a string or 1e9 must never overwrite a rate
 * somebody is being paid against. `isPlausibleRate` is the guard, the band is
 * deliberately wide (1–1000 EGP/USD), and anything outside it is logged and
 * dropped — the old value stays.
 */

const PRIMARY = "https://open.er-api.com/v6/latest/USD";
const FALLBACK =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";

/**
 * The breaker exists for the same reason the Supabase one does, and the doc
 * comment on `lib/circuit-breaker.ts` says it better than this could: a slow
 * dependency is worse than a dead one. This one is refused fast and often —
 * a rate we could not fetch costs nothing, because there is already one stored.
 */
const rates = createBreaker({
  name: "exchange-rate",
  failureThreshold: 3,
  resetAfterMs: 10 * 60_000,
  timeoutMs: 4_000,
  maxConcurrent: 1,
});

export interface FetchedRate {
  /** rate x 1e6, as an integer. Never a float. */
  micros: number;
  source: "live";
}

async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/**
 * Fetch a rate, or return null.
 *
 * Never throws. Every failure — a dead provider, a slow one, an open breaker, a
 * body in a shape we do not recognise, a number outside the band — is the same
 * answer to the caller: nothing to store, keep what you have.
 */
export async function fetchUsdEgpRate(): Promise<FetchedRate | null> {
  try {
    const micros = await rates.run(async (signal) => {
      try {
        const primary = (await readJson(PRIMARY, signal)) as {
          result?: string;
          rates?: { EGP?: unknown };
        };
        const fromPrimary = rateToMicros(primary?.rates?.EGP);
        if (fromPrimary) return fromPrimary;
      } catch {
        // Fall through. A second provider on a different host is a better
        // answer than a retry of the same dead endpoint.
      }

      const fallback = (await readJson(FALLBACK, signal)) as { usd?: { egp?: unknown } };
      return rateToMicros(fallback?.usd?.egp);
    });

    return micros ? { micros, source: "live" } : null;
  } catch {
    return null;
  }
}

/**
 * Is the stored rate old enough to be worth replacing?
 *
 * Daily at most. The rate moves by fractions of a percent a day and the figure
 * it feeds is confirmed by a human, so fetching it more often would buy nothing
 * and cost a dependency on every render.
 */
export function isStale(fetchedAt: string | null, nowMs: number): boolean {
  if (!fetchedAt) return true;
  const at = Date.parse(fetchedAt);
  if (Number.isNaN(at)) return true;
  return nowMs - at > 24 * 60 * 60_000;
}
