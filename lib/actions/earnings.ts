"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { computeSprintPayout } from "@/lib/payout";
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

  // Only somebody the pot pays may be on the list, and the basis is re-read
  // from the column rather than trusted from the payload — the screen already
  // filters, and a crafted request must not be able to add somebody the team
  // never put on a basis. `is_developer` is deliberately NOT consulted: since
  // 2026-08-31 it says whether somebody is an engineer and nothing about money.
  const wanted = new Set(parsed.data.participantIds);
  const { data: paid } = await supabase
    .from("profiles")
    .select("id, payout_basis, hourly_rate_cents")
    .neq("payout_basis", "none")
    .in("id", [...wanted].length ? [...wanted] : ["00000000-0000-0000-0000-000000000000"]);

  const eligible = new Map((paid ?? []).map((p) => [p.id, p]));
  const refused = [...wanted].filter((id) => !eligible.has(id));
  if (refused.length > 0) {
    return {
      ok: false,
      error:
        "Somebody on that list takes nothing from the pot. Give them a payout basis in Settings first.",
    };
  }
  if (eligible.size === 0) {
    return { ok: false, error: "Pick at least one person this pot pays." };
  }

  const byProfile = new Map(rows.map((m) => [m.profile_id!, m.minutes_logged ?? 0]));
  const payout = computeSprintPayout({
    totalMinutes,
    hourlyRateCents: settings.hourlyRateCents,
    people: [...eligible.values()].map((p) => ({
      profileId: p.id,
      basis: p.payout_basis,
      minutesLogged: byProfile.get(p.id) ?? 0,
      hourlyRateCents: p.hourly_rate_cents,
    })),
  });

  // Refuse rather than write. An unpayable sprint has no honest distribution,
  // and a confirmation is a record of an agreement — there is nothing here to
  // agree to. The same rule the screen follows, enforced where it counts.
  if (!payout.payable) {
    return {
      ok: false,
      error:
        `Hourly pay on ${sprint.name} comes to more than it took in, by ` +
        `${(payout.shortfallCents / 100).toFixed(2)} USD. Nothing can be confirmed until the ` +
        "hours, the rates or the pot change.",
    };
  }

  const pot = payout.potCents;
  const shares = payout.lines;

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
          (row) => row.profile_id === share.profileId && row.share_cents === share.amountCents
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
      share_cents: share.amountCents,
      // WHY somebody was paid, not only how much. A confirmed payout is a
      // record of an agreement and "hourly, at their rate" is part of it.
      basis: share.basis,
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

const payoutInput = z.object({
  profileId: uuid,
  basis: z.enum(["share", "hourly", "none"]),
  /**
   * Their agreed rate, in cents. Null means the team rate.
   *
   * Capped at USD 10,000/h — not because anybody would set it, but because an
   * unbounded rate is the one input that can make a sprint unpayable by
   * accident, and a fat finger on a money field should be refused rather than
   * rendered.
   */
  hourlyRateCents: z.number().int().positive().max(1_000_000).nullable().optional(),
});

/**
 * How somebody is paid out of a sprint's pot.
 *
 * A column an admin sets, and never a name or an email in code. The brief is
 * explicit about that, and the reason is obvious the first time somebody joins
 * or leaves: a list of names in a source file is a deploy, and this team
 * deploys their own tool.
 *
 * **Replaces `setIsDeveloper`.** Until 2026-08-31 one boolean answered both
 * "is this person an engineer" and "does this person share the pot", and Ahmed
 * Yehia — a developer who is paid hourly — is the person for whom those answers
 * differ. `is_developer` still exists and still means the first thing; this
 * writes the second.
 */
export async function setPayoutBasis(input: unknown): Promise<EarningsResult> {
  const parsed = payoutInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role !== "admin") {
    return { ok: false, error: "Only an admin can decide how somebody is paid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      payout_basis: parsed.data.basis,
      // Cleared when they come off the hourly basis, so a rate can never sit
      // dormant on a profile and surprise somebody the next time it is set.
      hourly_rate_cents:
        parsed.data.basis === "hourly" ? (parsed.data.hourlyRateCents ?? null) : null,
    })
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
