import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Every tunable in Coditu, read once per request.
 *
 * The team's standing instruction is that nothing is hardcoded: a rate, a
 * threshold, a cap or a default is a decision, and a decision belongs in a row
 * an admin edits. `public.app_settings` is that row. This is the only thing
 * that reads it.
 *
 * ## Why `cache()`
 *
 * React's `cache` is per-request memoisation, not a cross-request cache. Six
 * components on one page asking for the rate produce one query, and the next
 * request gets fresh values — which is what a settings row wants, because an
 * admin who changes the rate should see it change. A `revalidate`d fetch cache
 * would be the wrong tool: it would hold a stale rate across requests and it
 * would need invalidating from the write path.
 *
 * ## Why the fallbacks are not belt-and-braces
 *
 * The hosted database is behind local and always has been — see
 * `docs/07-FIELD-NOTES.md`, and the `sprints.notes_written_at` outage that
 * taught this repo the lesson. Code that reads a column ships before the
 * migration that adds it roughly half the time, so this accessor treats a
 * missing table, a missing row and a missing column as the same answer: use the
 * default, render the page. The defaults here are byte-for-byte the ones in
 * `20260825090000_app_settings.sql`, and if you change one, change both.
 */

export interface AppSettings {
  hourlyRateCents: number;
  payoutShareThresholdPct: number;
  payoutFromSprintId: string | null;
  usdEgpRateMicros: number | null;
  usdEgpFetchedAt: string | null;
  usdEgpSource: "live" | "manual" | null;
  maxImageBytes: number;
  defaultWeeklyCapacityMinutes: number;
  /**
   * False when the row could not be read at all — an un-migrated database, or a
   * reader with no session. The values are still safe to render; this is for
   * the settings screen, which should say "not configured yet" rather than
   * present a default as if somebody chose it.
   */
  configured: boolean;
}

/** The same numbers the migration defaults to. Both, or neither. */
export const SETTING_DEFAULTS: Omit<AppSettings, "configured"> = {
  hourlyRateCents: 1200,
  payoutShareThresholdPct: 25,
  payoutFromSprintId: null,
  usdEgpRateMicros: null,
  usdEgpFetchedAt: null,
  usdEgpSource: null,
  maxImageBytes: 8 * 1024 * 1024,
  defaultWeeklyCapacityMinutes: 2400,
};

export const getAppSettings = cache(async (): Promise<AppSettings> => {
  const supabase = await createClient();

  // A missing table, a missing row and a missing column are all the same
  // answer: the defaults, and a page that renders. `error` is deliberately not
  // rethrown even when it is none of those — a sprint page that 500s because
  // the image cap could not be read is the worse failure by a distance.
  const { data } = await supabase
    .from("app_settings")
    .select(
      "hourly_rate_cents, payout_share_threshold_pct, payout_from_sprint_id, usd_egp_rate_micros, usd_egp_fetched_at, usd_egp_source, max_image_bytes, default_weekly_capacity_minutes"
    )
    .eq("id", 1)
    .maybeSingle();

  if (!data) return { ...SETTING_DEFAULTS, configured: false };

  return {
    hourlyRateCents: data.hourly_rate_cents ?? SETTING_DEFAULTS.hourlyRateCents,
    payoutShareThresholdPct:
      data.payout_share_threshold_pct ?? SETTING_DEFAULTS.payoutShareThresholdPct,
    payoutFromSprintId: data.payout_from_sprint_id ?? null,
    usdEgpRateMicros: data.usd_egp_rate_micros ?? null,
    usdEgpFetchedAt: data.usd_egp_fetched_at ?? null,
    usdEgpSource: (data.usd_egp_source as "live" | "manual" | null) ?? null,
    maxImageBytes: data.max_image_bytes ?? SETTING_DEFAULTS.maxImageBytes,
    defaultWeeklyCapacityMinutes:
      data.default_weekly_capacity_minutes ?? SETTING_DEFAULTS.defaultWeeklyCapacityMinutes,
    configured: true,
  };
});
