"use client";

import { useEffect, useState } from "react";

import { PersonAvatar } from "@/components/app/person-avatar";
import { Mono } from "@/components/coditu/mono";
import type { ProfileRef } from "@/lib/data/profiles";

/**
 * Who else is looking at this.
 *
 * ## It never calls `router.refresh()`
 *
 * This is the rule that keeps presence cheap, and it is easy to break by
 * accident. An avatar appearing is a change to *this component's* state and
 * nothing else. If it refreshed the server tree, every arrival and departure
 * anywhere on the team would re-render the whole sprint — for a 24px circle.
 * Only `postgres_changes` refreshes, and that lives in `realtime.client.tsx`.
 *
 * ## Idle, and why 60 seconds
 *
 * A tab left open on a second monitor is not somebody working on the sprint,
 * and showing them as present makes the whole indicator untrustworthy — if it
 * is wrong about the person you can see across the desk, it is wrong about
 * everyone. Sixty seconds without a key, a pointer move or a scroll is long
 * enough not to flicker while somebody reads, and short enough that a forgotten
 * tab fades within a minute.
 *
 * `visibilitychange` is separate and immediate: switching tabs is unambiguous,
 * so there is nothing to wait for.
 *
 * ## State is a dot, not a faded avatar
 *
 * The design specifies a 9px dot in the avatar's corner — jade for online,
 * amber for idle — and its two hex values are `--jade` and `--amber` exactly.
 * The first draft here used opacity instead, which is both off-design and the
 * failure `01-DESIGN-SYSTEM.md` names: a faded face is colour as the sole
 * carrier of meaning, and carries nothing whatsoever to a screen reader. The
 * state now arrives three ways — dot, `title`, and a visually hidden word.
 *
 * ## The bundle
 *
 * `lib/realtime/socket.ts` is imported INSIDE the effect. It pulls
 * `@supabase/realtime-js`, and a static import would put it on the critical
 * path of every page that shows presence — the mistake the app shell spent all
 * of W1 undoing.
 */

const IDLE_AFTER_MS = 60_000;

export function Presence({
  channelName,
  me,
  surface,
  people,
}: {
  /** Must begin `coditu:` — the RLS policy on `realtime.messages` requires it. */
  channelName: string;
  me: ProfileRef;
  /** `sprint`, `item`, `notes` — what part of the screen this reader is on. */
  surface: string;
  /** Everyone internal, so an id can be drawn as a face without another fetch. */
  people: ProfileRef[];
}) {
  const [members, setMembers] = useState<{ profileId: string; state: string }[]>([]);

  useEffect(() => {
    let teardown: (() => void) | null = null;
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let retrack: ((state: "online" | "idle") => void) | null = null;
    let current: "online" | "idle" = "online";

    const goIdle = () => {
      if (current === "idle") return;
      current = "idle";
      retrack?.("idle");
    };

    const goActive = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(goIdle, IDLE_AFTER_MS);
      if (current === "online") return;
      current = "online";
      retrack?.("online");
    };

    const onVisibility = () => {
      // Switching away is unambiguous — no 60 second wait for that one.
      if (document.visibilityState === "hidden") goIdle();
      else goActive();
    };

    void (async () => {
      const { joinPresence } = await import("@/lib/realtime/socket");
      // The route may have changed while the chunk was in flight.
      if (cancelled) return;

      const handle = await joinPresence({
        channelName,
        me: { profileId: me.id, surface, state: "online" },
        onSync: (next) =>
          setMembers(next.map((m) => ({ profileId: m.profileId, state: m.state }))),
      });

      if (cancelled) {
        handle.stop();
        return;
      }
      teardown = handle.stop;
      // Announcing a new state is a fresh `track` with the same presence key,
      // which replaces this member's entry rather than adding one.
      retrack = handle.setState;

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
      teardown?.();
    };
  }, [channelName, me.id, surface]);

  // Yourself excluded: you know you are here, and a stack that includes you is
  // one avatar of noise on every screen.
  const others = members
    .filter((member) => member.profileId !== me.id)
    .map((member) => ({
      person: people.find((p) => p.id === member.profileId),
      state: member.state,
    }))
    .filter((entry): entry is { person: ProfileRef; state: string } => Boolean(entry.person));

  if (others.length === 0) return null;

  return (
    <div className="flex items-center gap-[7px]">
      <ul className="flex items-center -space-x-[6px]" aria-label="Also here">
        {others.slice(0, 4).map((entry) => (
          <li key={entry.person.id} className="relative">
            <span className="block rounded-full ring-2 ring-[var(--raised)]">
              <PersonAvatar person={entry.person} size={22} />
            </span>
            {/* A dot, as the design specifies, rather than opacity on the
                avatar. `01-DESIGN-SYSTEM.md` forbids colour as the sole
                carrier of meaning and a faded face carries nothing at all to a
                screen reader — so the state is a dot, a title, and a visually
                hidden word. The two hues are already tokens: the design's
                #23C97F and #FFB020 are --jade and --amber exactly. */}
            <span
              aria-hidden="true"
              title={`${entry.person.fullName} — ${entry.state}`}
              style={{
                background: entry.state === "idle" ? "var(--amber)" : "var(--jade)",
              }}
              className="absolute -bottom-[1px] -right-[1px] size-[8px] rounded-full border-2 border-[var(--raised)]"
            />
            <span className="sr-only">
              {entry.person.fullName} — {entry.state}
            </span>
          </li>
        ))}
      </ul>
      {/* "2 here now", the design's own caption. It is what tells this stack
          apart from the sprint-member avatars a few lines below, which look
          identical and mean something completely different — who is ASSIGNED
          work, not who is looking at the page. */}
      <Mono size="meta" className="text-[10.5px] text-[var(--ink-faint)]">
        {others.length > 4 ? `+${others.length - 4} · ` : ""}
        {others.length} here now
      </Mono>
    </div>
  );
}
