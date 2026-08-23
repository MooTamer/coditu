"use server";

import { z } from "zod";

import { sendToSubscriptions } from "@/lib/push/send";
import { readVapidConfig } from "@/lib/push/payload";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Registering and forgetting a device.
 *
 * Invariant 3: zod-validate → re-check authorization server-side → write →
 * revalidate. There is nothing to revalidate here — a subscription is not on
 * any screen except the one that just changed it, and that screen holds the
 * answer in its own state.
 *
 * RLS is what actually enforces ownership: every policy on
 * `push_subscriptions` is `profile_id = auth.uid()`, and this deliberately
 * writes through the CALLER's client rather than the service-role one, so a
 * mistake here is refused by the database rather than trusted.
 */

export interface PushResult {
  ok: boolean;
  error?: string;
}

/**
 * What `PushSubscription.toJSON()` produces, and nothing else.
 *
 * The endpoint is checked to be a URL because it is what the server will later
 * make an HTTP request to — an unvalidated string here is a request this
 * application makes to wherever a browser said. The keys are only ever handed
 * back to `web-push`, which will reject them if they are not what it expects.
 */
const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  userAgent: z.string().max(400).optional(),
});

export async function registerPushSubscription(input: unknown): Promise<PushResult> {
  const parsed = subscription.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That subscription could not be read." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profile.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: parsed.data.userAgent ?? null,
    },
    // Keyed on the endpoint, which is the push service's identity for this
    // installation. A browser that re-subscribes — after a permission reset, a
    // key rotation, or simply on a later visit — must replace its row rather
    // than add one, or every notification arrives twice.
    { onConflict: "endpoint" }
  );

  if (error) {
    return { ok: false, error: "That device could not be registered. Try again." };
  }

  return { ok: true };
}

export async function forgetPushSubscription(input: unknown): Promise<PushResult> {
  const parsed = z.object({ endpoint: z.string().url().max(2000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  // No `.eq("profile_id", …)` is needed for correctness — the delete policy is
  // `profile_id = auth.uid()` — but it is here anyway, because a policy is a
  // fence and a query should not be leaning on it.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("profile_id", profile.id);

  if (error) return { ok: false, error: "That did not save. Try again." };
  return { ok: true };
}

/**
 * Is this device registered, and is push configured at all?
 *
 * Both, in one call, because the control has to tell the truth about four
 * different states and half of them are server facts.
 */
export async function readPushState(input: unknown): Promise<{
  configured: boolean;
  subscribed: boolean;
  deviceCount: number;
}> {
  const parsed = z.object({ endpoint: z.string().url().max(2000).nullable() }).safeParse(input);
  const endpoint = parsed.success ? parsed.data.endpoint : null;

  const configured = readVapidConfig() !== null;
  const profile = await getCurrentProfile();
  if (!profile) return { configured, subscribed: false, deviceCount: 0 };

  const supabase = await createClient();
  const { data } = await supabase.from("push_subscriptions").select("endpoint");
  const rows = data ?? [];

  return {
    configured,
    subscribed: endpoint !== null && rows.some((row) => row.endpoint === endpoint),
    deviceCount: rows.length,
  };
}

/**
 * "Send a test notification", which exists so nobody has to wait to be
 * mentioned to find out whether any of this works.
 *
 * It sends to the caller's own devices and nobody else's — the query is the
 * caller's, so RLS makes that structural rather than a filter somebody could
 * forget. The failure modes are reported honestly: a push that is accepted by
 * the service and never displayed is the normal way this breaks, so the count
 * of devices it reached is returned rather than a bare "sent".
 */
export async function sendTestNotification(): Promise<PushResult & { sent?: number }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  if (!readVapidConfig()) {
    return { ok: false, error: "Push is not configured on this deployment — no VAPID keys." };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (!data || data.length === 0) {
    return { ok: false, error: "No device is registered yet. Turn notifications on first." };
  }

  const { sent, pruned } = await sendToSubscriptions(data, {
    title: "Coditu",
    body: "Notifications are working on this device.",
    url: "/app/my-work",
  });

  if (sent === 0) {
    return {
      ok: false,
      error:
        pruned > 0
          ? "That device is no longer registered with its push service. Turn notifications off and on again."
          : "The push service accepted nothing. Try again in a moment.",
    };
  }

  return { ok: true, sent };
}
