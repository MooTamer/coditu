"use client";

import { unstable_rethrow } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { BellRing, BellOff, Check, Share } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import {
  forgetPushSubscription,
  readPushState,
  registerPushSubscription,
  sendTestNotification,
} from "@/lib/actions/push";
import { isIOS, isStandalone } from "@/lib/pwa";
import { control } from "@/lib/interactive";

/**
 * Turning notifications on, and being honest about every reason they might not
 * work.
 *
 * This screen has more states than it has buttons, and every one of them is a
 * real thing that happens to a real person:
 *
 *  - **unsupported** — no `serviceWorker` or no `PushManager` at all.
 *  - **not configured** — the deployment has no VAPID keys. Local checkouts,
 *    most preview deployments.
 *  - **iOS, in a tab** — iOS 16.4+ grants Web Push **only** to a web app
 *    installed to the Home Screen. A Safari tab gets nothing, ever, and
 *    `requestPermission()` there does not throw: it resolves and nothing
 *    happens. So the button is replaced by the instruction that would actually
 *    help.
 *  - **denied** — the browser will not prompt again, from anywhere, for any
 *    reason. A button here would silently no-op, so it says where in the
 *    operating system's settings to reverse it instead.
 *  - **granted but not subscribed** — permission is remembered per origin, so
 *    this is the normal state after clearing site data.
 *  - **subscribed** — with a test send, because waiting to be mentioned is not
 *    a way to find out whether a notification will arrive.
 *
 * `Notification.requestPermission()` is called **from inside the tap handler**
 * and never on load. iOS requires a user gesture for it and silently does
 * nothing otherwise — which would look exactly like a person having refused.
 */

type Support =
  | "checking"
  | "unsupported"
  | "ios-needs-install"
  | "ready";

export function PushSettings() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  /**
   * Which control was pressed, so that one reports and the others do not.
   *
   * `pending` is shared by every action in this component, and binding it
   * straight to each button lights all of them on any click — the exact bug
   * PF-4's first draft shipped and `e2e/interactive-states.spec.ts` caught.
   * `onClickCapture` records the presser before the handler runs and works for
   * a keyboard activation too; nothing has to clear it, because the conjunction
   * with `pending` goes false on its own when the work finishes.
   */
  const [acting, setActing] = useState<string | null>(null);

  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [deviceCount, setDeviceCount] = useState(0);

  /**
   * Registers the service worker and reads where this device actually stands.
   *
   * Registration happens HERE rather than in the app shell on purpose. The
   * worker exists to receive pushes and to handle a click on one, and both of
   * those need a subscription, which is created on this screen — so registering
   * it on every page view would put a worker on every device that will never
   * receive anything, and put its bytes in a shell that is 0.2KB from its
   * budget.
   */
  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupport("unsupported");
      return;
    }

    if (isIOS() && !isStandalone()) {
      setSupport("ios-needs-install");
      return;
    }

    setPermission(Notification.permission);

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      setEndpoint(existing?.endpoint ?? null);

      const state = await readPushState({ endpoint: existing?.endpoint ?? null });
      setConfigured(state.configured);
      setDeviceCount(state.deviceCount);

      // A subscription the browser holds but the database does not know about
      // is the state left behind by a database reset or a lost row. Say
      // "off" — the person can turn it on and the upsert will reconcile.
      if (existing && !state.subscribed) setEndpoint(null);

      setSupport("ready");
    } catch (error) {
      // `unstable_rethrow` first, and it is not a formality. Next implements
      // `redirect()` and `notFound()` by THROWING, so a bare catch around a
      // Server Action swallows a working navigation and leaves a control that
      // appears to do nothing. This block guards more than the action call —
      // which is why it stays a block rather than becoming `settle()` — so the
      // rethrow has to be written here.
      unstable_rethrow(error);
      setSupport("unsupported");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function enable() {
    startTransition(async () => {
      try {
        // Inside the tap. iOS will not prompt otherwise, and gives no error.
        const granted = await Notification.requestPermission();
        setPermission(granted);
        if (granted !== "granted") {
          toast("Notifications were not allowed. Nothing has changed.");
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!key) {
          toast("Push is not configured on this deployment.");
          setConfigured(false);
          return;
        }

        const subscription = await registration.pushManager.subscribe({
          // Required, and not optional in any browser that matters: a push
          // this application cannot see the contents of is not what anybody
          // means by a notification.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });

        const json = subscription.toJSON() as {
          endpoint?: string;
          keys?: { p256dh?: string; auth?: string };
        };

        const result = await registerPushSubscription({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent.slice(0, 400),
        });

        if (!result.ok) {
          // Roll back the browser's half too, or the device holds a
          // subscription the server will never send to — which reads as
          // "notifications are on" and is not.
          await subscription.unsubscribe().catch(() => undefined);
          toast(result.error ?? "That did not save.");
          return;
        }

        setEndpoint(subscription.endpoint);
        await refresh();
      } catch (error) {
        // `unstable_rethrow` first, and it is not a formality. Next implements
        // `redirect()` and `notFound()` by THROWING, so a bare catch around a
        // Server Action swallows a working navigation and leaves a control that
        // appears to do nothing. This block guards more than the action call —
        // which is why it stays a block rather than becoming `settle()` — so the
        // rethrow has to be written here.
        unstable_rethrow(error);
        // A Server Action that THROWS never returns a result, and a rejected
        // `subscribe()` looks the same from here.
        toast("Notifications could not be turned on. Nothing has changed.");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        const gone = subscription?.endpoint ?? endpoint;

        // The browser's half first: a row deleted while the browser still holds
        // a subscription means the push service keeps a live channel nothing
        // reads.
        await subscription?.unsubscribe().catch(() => undefined);
        if (gone) await forgetPushSubscription({ endpoint: gone });

        setEndpoint(null);
        await refresh();
      } catch (error) {
        // `unstable_rethrow` first, and it is not a formality. Next implements
        // `redirect()` and `notFound()` by THROWING, so a bare catch around a
        // Server Action swallows a working navigation and leaves a control that
        // appears to do nothing. This block guards more than the action call —
        // which is why it stays a block rather than becoming `settle()` — so the
        // rethrow has to be written here.
        unstable_rethrow(error);
        toast("That did not save. Try again.");
      }
    });
  }

  function test() {
    startTransition(async () => {
      try {
        const result = await sendTestNotification();
        toast(
          result.ok
            ? `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. It should appear now.`
            : result.error ?? "That did not send."
        );
      } catch (error) {
        // `unstable_rethrow` first, and it is not a formality. Next implements
        // `redirect()` and `notFound()` by THROWING, so a bare catch around a
        // Server Action swallows a working navigation and leaves a control that
        // appears to do nothing. This block guards more than the action call —
        // which is why it stays a block rather than becoming `settle()` — so the
        // rethrow has to be written here.
        unstable_rethrow(error);
        toast("That did not send.");
      }
    });
  }

  const subscribed = endpoint !== null;

  return (
    <div className="mt-5 flex flex-col gap-4" data-push-settings data-state={stateName()}>
      {body()}
    </div>
  );

  function stateName(): string {
    if (support === "checking") return "checking";
    if (support === "unsupported") return "unsupported";
    if (support === "ios-needs-install") return "ios-needs-install";
    if (!configured) return "not-configured";
    if (permission === "denied") return "denied";
    return subscribed ? "subscribed" : "off";
  }

  function body() {
    if (support === "checking") {
      return (
        <Mono size="meta" className="text-[var(--ink-faint)]">
          checking this device…
        </Mono>
      );
    }

    if (support === "unsupported") {
      return (
        <Note>
          This browser cannot receive push notifications. Everything still reaches you inside
          Coditu — My work lists every mention, and the rail carries a dot while any are unread.
        </Note>
      );
    }

    if (support === "ios-needs-install") {
      return (
        <>
          <Note>
            On iPhone and iPad, notifications only work once Coditu is <strong>added to the Home
            Screen</strong>. Safari tabs cannot receive them at all — this is Apple&rsquo;s rule, not
            a setting we can change.
          </Note>
          <ol className="flex list-inside list-decimal flex-col gap-1 text-[13.5px] text-[var(--ink-muted)]">
            <li className="flex items-center gap-2">
              <Share size={14} strokeWidth={1.9} aria-hidden />
              Tap the Share button in Safari
            </li>
            <li>Choose &ldquo;Add to Home Screen&rdquo;</li>
            <li>Open Coditu from the Home Screen and come back here</li>
          </ol>
        </>
      );
    }

    if (!configured) {
      return (
        <Note>
          Push is not configured on this deployment — it has no VAPID keys, so there is nothing to
          turn on. `.env.example` names the three variables.
        </Note>
      );
    }

    if (permission === "denied") {
      return (
        <Note>
          Notifications are blocked for this site, and the browser will not ask again — so there is
          no button here that could do anything. To reverse it: on iOS, Settings → Notifications →
          Coditu; on Android, long-press the icon → App info → Notifications; on a desktop browser,
          the padlock in the address bar → Notifications.
        </Note>
      );
    }

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <button
          onClickCapture={() => setActing("c1")}
          {...control(pending && acting === "c1" ? "pending" : "idle")}
            type="button"
            disabled={pending}
            onClick={subscribed ? disable : enable}
            className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)] disabled:opacity-60"
          >
            {subscribed ? (
              <BellOff size={15} strokeWidth={1.9} aria-hidden />
            ) : (
              <BellRing size={15} strokeWidth={1.9} aria-hidden />
            )}
            {subscribed ? "Turn off on this device" : "Turn on notifications"}
          </button>

          {subscribed ? (
            <button
          onClickCapture={() => setActing("c2")}
          {...control(pending && acting === "c2" ? "pending" : "idle")}
              type="button"
              disabled={pending}
              onClick={test}
              className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline)] px-4 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas)] disabled:opacity-60"
            >
              Send a test notification
            </button>
          ) : null}
        </div>

        <Mono size="meta" aria-live="polite" className="text-[var(--ink-faint)]">
          {pending ? (
            "working…"
          ) : subscribed ? (
            <span className="inline-flex items-center gap-[6px] text-[var(--tone-jade-fg)]">
              <Check size={12} strokeWidth={2.4} aria-hidden />
              on for this device · {deviceCount} registered in total
            </span>
          ) : permission === "granted" ? (
            "allowed, but this device is not registered yet"
          ) : (
            "your browser will ask for permission"
          )}
        </Mono>
      </>
    );
  }
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">{children}</p>
  );
}

/**
 * The VAPID public key is base64url; `applicationServerKey` wants raw bytes.
 *
 * Every Web Push tutorial carries a copy of this and it is not decoration:
 * passing the string straight through fails with `InvalidCharacterError` on
 * Chrome and, on some versions, subscribes successfully and then never
 * delivers.
 */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  // Returned as the underlying `ArrayBuffer` rather than the view: TypeScript
  // 5.7 made `Uint8Array` generic over its buffer, so a plain `Uint8Array` no
  // longer satisfies `BufferSource` — which wants an `ArrayBuffer`-backed view
  // specifically, and a `SharedArrayBuffer`-backed one would not do.
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return buffer;
}
