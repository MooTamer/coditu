"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Join a presence channel, keep your own entry current, and get the roster back.
 *
 * Extracted from `presence.client.tsx` when the story's viewer stack needed the
 * same subscription with a different presentation. The two differ in ways that
 * matter — the sprint stack leaves you out, the story stack includes you and
 * marks you `(you)` — and none of those differences are about *joining a
 * channel*, so the join lives here once.
 *
 * ## The `surface` argument is reactive
 *
 * Passing a new `surface` re-announces this member on the same channel rather
 * than rejoining it, so "AE is editing the acceptance criteria" costs one
 * `track` and no reconnection. It is what makes the editing indicator a
 * property of presence rather than a second channel — see `05-DECISIONS.md`.
 *
 * ## Idle
 *
 * 60 seconds without a key, a pointer move or a scroll. Hiding the tab is
 * immediate, because switching away is unambiguous and there is nothing to wait
 * for. A tab left open on a second monitor is not somebody working, and an
 * indicator that says otherwise about the person across the desk is untrusted
 * about everyone.
 *
 * ## The module is imported inside the effect
 *
 * `@supabase/realtime-js` is ~65KB and a static import would put it on the
 * critical path of every page that shows presence — the mistake W1 spent itself
 * undoing.
 */

const IDLE_AFTER_MS = 60_000;

export interface PresenceRosterEntry {
  profileId: string;
  surface: string;
  state: "online" | "idle";
}

export function usePresence({
  channelName,
  profileId,
  surface,
}: {
  /** Must begin `coditu:` — the RLS policy on `realtime.messages` requires it. */
  channelName: string;
  profileId: string;
  /** `sprint`, `viewing`, `criteria`, `description` — reactive. */
  surface: string;
}): PresenceRosterEntry[] {
  const [members, setMembers] = useState<PresenceRosterEntry[]>([]);

  // The live handle, so the surface effect below can re-announce without
  // rejoining, and so the idle listeners can reach it.
  const handle = useRef<{
    announce: (patch: { state?: "online" | "idle"; surface?: string }) => void;
  } | null>(null);

  // Read inside the join effect without being a dependency of it: changing the
  // surface must re-announce, never re-join.
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let state: "online" | "idle" = "online";

    const goIdle = () => {
      if (state === "idle") return;
      state = "idle";
      handle.current?.announce({ state: "idle" });
    };

    const goActive = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(goIdle, IDLE_AFTER_MS);
      if (state === "online") return;
      state = "online";
      handle.current?.announce({ state: "online" });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") goIdle();
      else goActive();
    };

    void (async () => {
      const { joinPresence } = await import("@/lib/realtime/socket");
      // The route may have changed while the chunk was in flight.
      if (cancelled) return;

      const joined = await joinPresence({
        channelName,
        me: { profileId, surface: surfaceRef.current, state: "online" },
        onSync: (next) =>
          setMembers(
            next.map((m) => ({
              profileId: m.profileId,
              surface: m.surface,
              state: m.state,
            }))
          ),
      });

      if (cancelled) {
        joined.stop();
        return;
      }
      handle.current = joined;
      stop = joined.stop;

      idleTimer = setTimeout(goIdle, IDLE_AFTER_MS);
      window.addEventListener("keydown", goActive, { passive: true });
      window.addEventListener("pointermove", goActive, { passive: true });
      window.addEventListener("scroll", goActive, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
    })();

    return () => {
      cancelled = true;
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener("keydown", goActive);
      window.removeEventListener("pointermove", goActive);
      window.removeEventListener("scroll", goActive);
      document.removeEventListener("visibilitychange", onVisibility);
      handle.current = null;
      stop?.();
    };
  }, [channelName, profileId]);

  // Re-announce when the surface changes. Separate from the join effect so
  // opening an editor does not tear down and rebuild the channel — which would
  // make everybody else see you leave and arrive again.
  useEffect(() => {
    handle.current?.announce({ surface });
  }, [surface]);

  return members;
}
