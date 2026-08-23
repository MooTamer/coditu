import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSubscriptionGone, readVapidConfig, type PushPayload } from "@/lib/push/payload";

/**
 * Sending a push, which is the only impure part of this.
 *
 * ── Why `web-push` and not Web Crypto ──────────────────────────────────────
 * This repository is deliberately dependency-lean, so a new one needs a reason.
 * Sending a push by hand means signing a VAPID JWT with ES256 over the P-256
 * curve, deriving a shared secret with ECDH against the subscription's `p256dh`
 * key, running HKDF to get a content-encryption key and a nonce, and encrypting
 * the payload with `aes128gcm` in the exact record framing RFC 8188 specifies —
 * and every one of those steps fails silently, as a push that is accepted by
 * the service and never shown. It is roughly 200 lines of cryptography whose
 * failure mode is "no notification arrives" with nothing to debug from.
 * Recorded in `docs/05-DECISIONS.md`.
 *
 * ── The rule that outranks everything else in this file ────────────────────
 * **A failed push must never fail the write.** The comment is the thing that
 * matters; a notification about it is not. Nothing here throws, the caller does
 * not await a result it acts on, and a completely unconfigured deployment sends
 * nothing and reports nothing wrong.
 */

let configured = false;

/** Returns false when this deployment has no VAPID keys — the normal local case. */
function ensureConfigured(): boolean {
  const config = readVapidConfig();
  if (!config) return false;

  // `setVapidDetails` is module-global state in `web-push`, so it is set once.
  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }
  return true;
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends one payload to every device in `subscriptions`, and prunes the ones the
 * push service says are gone.
 *
 * The prune is the half people leave out. A subscription answering 404 or 410
 * is an installation that no longer exists — a browser uninstalled, a profile
 * wiped — and without deleting the row it is retried on every mention forever,
 * one failed HTTP request per notification per dead device, for as long as the
 * table is not cleaned by hand. Anything OTHER than 404/410 is left alone: a
 * 429 is rate limiting and a 500 is their problem, and deleting on either would
 * unsubscribe somebody because a push service had a bad minute.
 */
export async function sendToSubscriptions(
  subscriptions: StoredSubscription[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  if (subscriptions.length === 0 || !ensureConfigured()) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          // 24 hours. A mention that arrives two days late is noise; a push
          // service holding it that long is a push service we would rather
          // gave up.
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (isSubscriptionGone(status)) dead.push(subscription.id);
        // Everything else is swallowed. There is no retry queue and there
        // should not be one for this: the notification is a convenience, and
        // the row in `notifications` — which the app reads — is the record.
      }
    })
  );

  if (dead.length > 0) {
    // Service-role, because the person being notified is not the person
    // writing the comment: this runs in the author's session and the rows
    // belong to the recipients, whose RLS would refuse the delete.
    await createAdminClient().from("push_subscriptions").delete().in("id", dead);
  }

  return { sent, pruned: dead.length };
}
