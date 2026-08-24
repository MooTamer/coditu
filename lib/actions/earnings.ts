"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { potCents, splitEqually } from "@/lib/earnings";
import { isStale, refreshStoredRate } from "@/lib/exchange-rate";
import { getAppSettings } from "@/lib/settings";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Confirming what a sprint pays, and keeping the exchange rate fresh.
 *
 * Invariant 3: zod-validate → re-check authorization server-side → write →
 * revalidate. Invariant 2, for money: integer minor units, and the arithmetic
 * lives in `lib/earnings.ts` where it is unit-tested against awkward numbers
 * rather than being inlined here where it is not.
 *
 * **Nothing is paid without an explicit confirmation by an admin.** This file
 * is the only thing that writes a payout, and it re-derives every number from
 * the database at the moment of writing — the confirmation screen's figures are
 * a proposal, not an input. A caller sends *who* is included and nothing else.
 */

export interface EarningsResult {
  ok: boolean;
  error?: string;
}

const uuid = z.string().uuid();

const confirmInput = z.object({
  sprintId: uuid,
  /** Exactly who takes a share. The amounts are computed here, never sent. */
  participantIds: z.array(uuid).max(50),
});

/** The partial unique index refusing a second live payout for one sprint. */
const UNIQUE_VIOLATION = "23505";

export async function confirmSprintPayout(input: unknown): Promise<EarningsResult> {
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That distribution did not make sense." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  // Checked here AND in RLS. The policy is what actually stops the write; this
  // is so the answer is a sentence rather than a row count of zero.
  if (profile.role !== "admin") {
    return { ok: false, error: "Only an admin can confirm a distribution." };
  }

  const supabase = await createClient();
  const settings = await getAppSettings();

  const { data: sprint } = await supabase
    .from("sprints")
    .select("id, name")
    .eq("id", parsed.data.sprintId)
    .maybeSingle();
  if (!sprint) return { ok: false, error: "That sprint no longer exists." };

  // Every number is read back out of the database here. A pot posted from a
  // browser would be a figure this server has to distrust, and the whole point
  // of a confirmation is that the number is trustworthy.
  const { data: minutes } = await supabase
    .from("v_sprint_minutes")
    .select("profile_id, minutes_logged")
    .eq("sprint_id", sprint.id);

  const rows = (minutes ?? []).filter((m) => m.profile_id !== null);
  const totalMinutes = rows.reduce((sum, m) => sum + (m.minutes_logged ?? 0), 0);
  if (totalMinutes === 0) {
    return { ok: false, error: `No time has been logged against ${sprint.name} yet.` };
  }

  // Only a developer may take a share, and it is re-checked against the column
  // rather than trusted from the payload — the screen already filters, and a
  // crafted request must not be able to add somebody the team never made one.
  const wanted = new Set(parsed.data.participantIds);
  const { data: developers } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_developer", true)
    .in("id", [...wanted].length ? [...wanted] : ["00000000-0000-0000-0000-000000000000"]);

  const eligible = new Set((developers ?? []).map((d) => d.id));
  const refused = [...wanted].filter((id) => !eligible.has(id));
  if (refused.length > 0) {
    return {
      ok: false,
      error: "Somebody on that list does not take a share. Mark them a developer in Settings first.",
    };
  }
  if (eligible.size === 0) {
    return { ok: false, error: "Pick at least one person to share this between." };
  }

  const byProfile = new Map(rows.map((m) => [m.profile_id!, m.minutes_logged ?? 0]));
  const pot = potCents({ totalMinutes, hourlyRateCents: settings.hourlyRateCents });
  const shares = splitEqually(
    pot,
    [...eligible].map((id) => ({ profileId: id, minutesLogged: byProfile.get(id) ?? 0 }))
  );

  const { data: existing } = await supabase
    .from("sprint_payouts")
    .select("id, total_minutes, pot_cents")
    .eq("sprint_id", sprint.id)
    .is("superseded_at", null)
    .maybeSingle();

  // Confirming twice with nothing changed in between is a no-op, not a second
  // row — the history is a record of decisions, and "I clicked it again" is not
  // one.
  if (existing && existing.total_minutes === totalMinutes && existing.pot_cents === pot) {
    const { data: sameShares } = await supabase
      .from("sprint_payout_shares")
      .select("profile_id, share_cents")
      .eq("payout_id", existing.id);

    const unchanged =
      (sameShares ?? []).length === shares.length &&
      shares.every((share) =>
        (sameShares ?? []).some(
          (row) => row.profile_id === share.profileId && row.share_cents === share.shareCents
        )
      );
    if (unchanged) return { ok: true };
  }

  const { data: created, error } = await supabase
    .from("sprint_payouts")
    .insert({
      sprint_id: sprint.id,
      confirmed_by: profile.id,
      total_minutes: totalMinutes,
      hourly_rate_cents: settings.hourlyRateCents,
      pot_cents: pot,
      // Snapshotted. A confirmed sprint's EGP figure never moves again — the
      // same principle as `sprints.notes_written_at`: a number a person has
      // agreed to is a record, not a live calculation.
      usd_egp_rate_micros: settings.usdEgpRateMicros,
      usd_egp_source: settings.usdEgpSource,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === UNIQUE_VIOLATION) {
      // Two admins confirming at once. The partial unique index is the only
      // place that cannot be raced, and the loser gets a sentence rather than a
      // Postgres error.
      return {
        ok: false,
        error: "Somebody else confirmed this a moment ago. Reload to see what they agreed.",
      };
    }
    return { ok: false, error: "That confirmation did not save. Nothing was lost — try again." };
  }

  const { error: sharesError } = await supabase.from("sprint_payout_shares").insert(
    shares.map((share) => ({
      payout_id: created.id,
      profile_id: share.profileId,
      minutes_logged: share.minutesLogged,
      share_cents: share.shareCents,
    }))
  );

  if (sharesError) {
    // The payout row exists and its shares do not, which is a distribution that
    // says nothing. Say exactly that rather than leaving a total with no split
    // under it looking finished.
    return {
      ok: false,
      error: "The pot was confirmed but the split did not save. Re-confirm to fix it.",
    };
  }

  // Only now: the previous confirmation is superseded, never updated and never
  // deleted. It stays in the table because somebody was paid against it.
  if (existing) {
    await supabase
      .from("sprint_payouts")
      .update({ superseded_at: new Date().toISOString(), superseded_by: created.id })
      .eq("id", existing.id);
  }

  revalidatePath("/app/earnings");
  revalidatePath("/app/settings");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const settingsInput = z.object({
  hourlyRateCents: z.number().int().positive().max(1_000_000).optional(),
  payoutShareThresholdPct: z.number().int().min(0).max(100).optional(),
  payoutFromSprintId: uuid.nullable().optional(),
  maxImageBytes: z.number().int().positive().max(64 * 1024 * 1024).optional(),
  maxImageBatch: z.number().int().min(1).max(50).optional(),
  defaultWeeklyCapacityMinutes: z.number().int().positive().max(10_080).optional(),
  /** Setting a rate by hand switches the source and stops the live refresh. */
  usdEgpRateMicros: z.number().int().positive().max(1_000_000_000).nullable().optional(),
  usdEgpSource: z.enum(["live", "manual"]).optional(),
});

export async function updateAppSettings(input: unknown): Promise<EarningsResult> {
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a setting we can store." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role !== "admin") {
    return { ok: false, error: "Only an admin can change these." };
  }

  const supabase = await createClient();
  const patch: TablesUpdate<"app_settings"> = { updated_by: profile.id };
  const d = parsed.data;
  if (d.hourlyRateCents !== undefined) patch.hourly_rate_cents = d.hourlyRateCents;
  if (d.payoutShareThresholdPct !== undefined) {
    patch.payout_share_threshold_pct = d.payoutShareThresholdPct;
  }
  if (d.payoutFromSprintId !== undefined) patch.payout_from_sprint_id = d.payoutFromSprintId;
  if (d.maxImageBytes !== undefined) patch.max_image_bytes = d.maxImageBytes;
  if (d.maxImageBatch !== undefined) patch.max_image_batch = d.maxImageBatch;
  if (d.defaultWeeklyCapacityMinutes !== undefined) {
    patch.default_weekly_capacity_minutes = d.defaultWeeklyCapacityMinutes;
  }
  if (d.usdEgpRateMicros !== undefined) {
    patch.usd_egp_rate_micros = d.usdEgpRateMicros;
    // A hand-set rate is `manual` by definition, and `manual` is what stops the
    // background refresh overwriting it. Setting one without the other would be
    // a rate that silently reverts overnight.
    patch.usd_egp_source = "manual";
    patch.usd_egp_fetched_at = new Date().toISOString();
  }
  if (d.usdEgpSource !== undefined) patch.usd_egp_source = d.usdEgpSource;

  const { error } = await supabase.from("app_settings").update(patch).eq("id", 1);
  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  // Every screen that renders a setting. The rate is on earnings, the image cap
  // is in an error message on an item, the capacity default is on People.
  revalidatePath("/app/settings");
  revalidatePath("/app/earnings");
  revalidatePath("/app/people");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const developerInput = z.object({ profileId: uuid, isDeveloper: z.boolean() });

/**
 * Who takes a share.
 *
 * A column an admin sets, and never a name or an email in code. The brief is
 * explicit about that, and the reason is obvious the first time somebody joins
 * or leaves: a list of names in a source file is a deploy, and this team
 * deploys their own tool.
 */
export async function setIsDeveloper(input: unknown): Promise<EarningsResult> {
  const parsed = developerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role !== "admin") {
    return { ok: false, error: "Only an admin can decide who takes a share." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_developer: parsed.data.isDeveloper })
    .eq("id", parsed.data.profileId);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath("/app/settings");
  revalidatePath("/app/earnings");
  revalidatePath("/app/people");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

/**
 * Refresh the exchange rate, at most daily, without blocking anything.
 *
 * Called from the earnings page through `after()`, so it runs once the response
 * is on the wire. **The page has already rendered from the stored value by the
 * time this runs**, which is the whole design: a provider that is slow, dead,
 * or answering nonsense changes nothing visible except the "as of" line.
 *
 * A hand-set rate is left alone until an admin switches back to `live`.
 */
export async function refreshExchangeRate(): Promise<EarningsResult> {
  const settings = await getAppSettings();
  const supabase = await createClient();

  // One implementation, in `lib/exchange-rate.ts`. This wrapper exists for a
  // caller that wants an answer — a Refresh button in Settings — and reads the
  // settings and the client itself, which it may, because it is not running
  // inside `after()`. The earnings page takes the other door and passes both in.
  const moved = await refreshStoredRate(supabase, settings);
  if (!moved && isStale(settings.usdEgpFetchedAt, Date.now()) && settings.usdEgpSource !== "manual") {
    return { ok: false, error: "The rate could not be refreshed." };
  }
  return { ok: true };
}
