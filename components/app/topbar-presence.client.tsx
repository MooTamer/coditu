"use client";

import { usePathname } from "next/navigation";

import { PersonAvatar } from "@/components/app/person-avatar";
import { usePresenceSurface, VIEWING } from "@/components/app/presence-surface.client";
import { Mono } from "@/components/coditu/mono";
import { usePresence } from "@/lib/hooks/use-presence";
import type { ProfileRef } from "@/lib/data/profiles";

/**
 * Who else is on this screen — in the shell, on every screen.
 *
 * The returned handoff's component table: *"56px topbar carries breadcrumbs,
 * **surface presence**, save chip, theme, search, New."* `05-DECISIONS.md`
 * recorded the absence as a deferred divergence — presence existed and was
 * good, but it lived on the story, so every other screen in the workspace was
 * silent about who else was on it. It is not deferred any more.
 *
 * ## The channel is the route
 *
 * `coditu:presence:route:<pathname>`, so two people on `/app/people` see each
 * other and somebody on `/app/trash` is not counted. The `coditu:` prefix is
 * required by the RLS policy on `realtime.messages` and is not decoration.
 *
 * The pathname is normalised before it becomes a channel name: a trailing
 * slash, a different letter case in a slug, or a query string would otherwise
 * put two people who are looking at the same screen on two different channels,
 * and each would be told they were alone.
 *
 * ## It says what they are doing, not what they are writing
 *
 * `usePresenceSurface()` is the same store the story's stack reads, so when
 * somebody opens an editor anywhere inside the shell the caption here becomes
 * *"editing the description"* rather than *"viewing"*. The value that crosses
 * the wire is a **name** — `criteria`, `description`, `comment` — and never a
 * character of what anybody typed; `e2e/presence.spec.ts` reads the socket
 * frames and asserts exactly that.
 *
 * ## Why this does not cost every page a websocket
 *
 * `usePresence` imports `lib/realtime/socket.ts` inside its effect, so
 * `@supabase/realtime-js` stays off the critical path — the rule the app shell
 * spent all of W1 establishing. The Supabase client multiplexes channels over
 * one socket, so a story page that already has a sprint channel gains a
 * subscription, not a connection.
 */

/** How many faces before the stack collapses into `+N`. The handoff's number. */
const VISIBLE = 3;

export function TopbarPresence({
  me,
  people,
}: {
  /** Only the id is read — the signed-in person is excluded from their own stack. */
  me: { id: string };
  people: ProfileRef[];
}) {
  const pathname = usePathname();
  const surface = usePresenceSurface();

  // Lower-cased and de-slashed. Two people on the same screen must land on the
  // same channel or presence reports each of them as alone.
  const route = (pathname || "/app").replace(/\/+$/, "").toLowerCase() || "/app";

  const members = usePresence({
    channelName: `coditu:presence:route:${route}`,
    profileId: me.id,
    surface,
  });

  const others = members
    .filter((member) => member.profileId !== me.id)
    .map((member) => ({
      person: people.find((p) => p.id === member.profileId),
      state: member.state,
      surface: member.surface,
    }))
    .filter((entry): entry is { person: ProfileRef; state: "online" | "idle"; surface: string } =>
      Boolean(entry.person)
    );

  if (others.length === 0) return null;

  // The most specific thing anybody is doing here. A reader who is only viewing
  // contributes nothing to this sentence — "Adam is viewing this page" is what
  // the avatars already say.
  const writing = others.find((entry) => entry.surface && entry.surface !== VIEWING);

  return (
    <div
      data-topbar-presence
      className="flex min-w-0 items-center gap-2"
      // The stack is decorative once the caption exists; the caption is the
      // accessible statement, and every avatar carries its own `sr-only` name.
    >
      <ul className="flex items-center -space-x-1.5">
        {others.slice(0, VISIBLE).map((entry) => (
          <li key={entry.person.id} className="relative">
            <PersonAvatar person={entry.person} size={24} />
            <span
              aria-hidden
              title={`${entry.person.fullName} — ${entry.state}`}
              className="absolute -bottom-px -right-px size-[8px] rounded-full border-2 border-[var(--raised)]"
              style={{ background: entry.state === "online" ? "var(--jade)" : "var(--amber)" }}
            />
            <span className="sr-only">
              {entry.person.fullName} — {entry.state}
            </span>
          </li>
        ))}
      </ul>

      <Mono
        size="meta"
        className="hidden truncate text-[10.5px] text-[var(--ink-faint)] lg:block"
        // Polite, because somebody arriving on a page must not interrupt what
        // the reader is doing.
        aria-live="polite"
      >
        {others.length > VISIBLE ? `+${others.length - VISIBLE} · ` : ""}
        {writing
          ? `${writing.person.fullName.split(" ")[0]} is editing the ${writing.surface}`
          : `${others.length} here now`}
      </Mono>
    </div>
  );
}
