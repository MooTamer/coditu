"use client";

import { PersonAvatar } from "@/components/app/person-avatar";
import { Mono } from "@/components/coditu/mono";
import { usePresence } from "@/lib/hooks/use-presence";
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
 * ## What is here and what is in the hook
 *
 * This file is the sprint header's PRESENTATION. Joining the channel, the idle
 * timer and the teardown live in `lib/hooks/use-presence.ts`, shared with the
 * story's viewer stack — which differs from this one in ways that are entirely
 * about presentation (it includes you, and it says what people are doing) and
 * not at all about subscribing.
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
  const members = usePresence({ channelName, profileId: me.id, surface });

  // Yourself excluded: you know you are here, and a stack that includes you is
  // one avatar of noise on every screen.
  const others = members
    .filter((member) => member.profileId !== me.id)
    .map((member) => ({
      person: people.find((p) => p.id === member.profileId),
      state: member.state,
    }))
    .filter((entry): entry is { person: ProfileRef; state: "online" | "idle" } =>
      Boolean(entry.person)
    );

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
