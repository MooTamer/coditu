"use client";

import { PersonAvatar } from "@/components/app/person-avatar";
import { usePresenceSurface, VIEWING } from "@/components/app/presence-surface.client";
import { Mono } from "@/components/coditu/mono";
import { usePresence } from "@/lib/hooks/use-presence";
import type { ProfileRef } from "@/lib/data/profiles";

/**
 * Who is on this story, and what they are doing on it.
 *
 * The design's line is `2 viewing · Abdelrahman editing criteria`, and its
 * viewer list marks the reader `Mohamed Tamer (you) — viewing`. So this differs
 * from the sprint header's stack in two deliberate ways:
 *
 * **You are in it.** On the sprint you are excluded — you know you are there,
 * and an avatar of yourself on every screen is noise. On one story the stack is
 * small and answers a different question: *is anybody else in here with me right
 * now, before I rewrite this description?* Your own face is what makes the
 * others countable at a glance.
 *
 * **It says what people are doing.** The surface arrives through presence
 * itself rather than a second channel, because "is editing the criteria" changes
 * when an editor opens or closes — a handful of times in a session, not per
 * keystroke. See `05-DECISIONS.md`; per-keystroke typing is deliberately not
 * built, and if it ever is, that is what broadcast and a throttle are for.
 */

const SURFACE_LABEL: Record<string, string> = {
  title: "renaming the story",
  description: "editing the description",
  highlight: "editing the highlight",
  criteria: "editing criteria",
  comment: "writing a comment",
  notes: "editing the notes",
};

export function ItemPresence({
  workItemId,
  me,
  people,
}: {
  workItemId: string;
  me: ProfileRef;
  /** Everyone internal, so an id can be drawn as a face without another fetch. */
  people: ProfileRef[];
}) {
  // What THIS reader is doing, from whichever editor is open. `viewing` when
  // none is.
  const surface = usePresenceSurface();

  const members = usePresence({
    channelName: `coditu:presence:item:${workItemId}`,
    profileId: me.id,
    surface,
  });

  const roster = members
    .map((member) => ({
      person: member.profileId === me.id ? me : people.find((p) => p.id === member.profileId),
      surface: member.surface,
      state: member.state,
      isSelf: member.profileId === me.id,
    }))
    .filter(
      (
        entry
      ): entry is { person: ProfileRef; surface: string; state: "online" | "idle"; isSelf: boolean } =>
        Boolean(entry.person)
    );

  // Alone, and not editing. Nothing worth a line — the overwhelmingly common
  // case, and it must cost no space.
  if (roster.length <= 1 && roster.every((entry) => entry.surface === VIEWING)) return null;

  const viewing = roster.length;
  const editors = roster
    .filter((entry) => entry.surface !== VIEWING && !entry.isSelf)
    .map((entry) => `${entry.person.fullName.split(" ")[0]} ${SURFACE_LABEL[entry.surface] ?? "editing"}`);

  return (
    <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1">
      <ul className="flex items-center -space-x-[6px]" aria-label="On this story">
        {roster.slice(0, 4).map((entry) => (
          <li key={entry.person.id} className="relative">
            <span className="block rounded-full ring-2 ring-[var(--overlay)]">
              <PersonAvatar person={entry.person} size={20} />
            </span>
            <span
              aria-hidden="true"
              title={`${entry.person.fullName}${entry.isSelf ? " (you)" : ""} — ${
                entry.surface === VIEWING ? "viewing" : SURFACE_LABEL[entry.surface] ?? "editing"
              }`}
              style={{ background: entry.state === "idle" ? "var(--amber)" : "var(--jade)" }}
              className="absolute -bottom-[1px] -right-[1px] size-[7px] rounded-full border-2 border-[var(--overlay)]"
            />
            <span className="sr-only">
              {entry.person.fullName}
              {entry.isSelf ? " (you)" : ""} —{" "}
              {entry.surface === VIEWING ? "viewing" : SURFACE_LABEL[entry.surface] ?? "editing"}
            </span>
          </li>
        ))}
      </ul>

      {/* The design's own line. `aria-live="polite"` because somebody starting
          to edit under you is the thing you would want to hear about without
          having to go and look — and polite rather than assertive, since it
          must never cut across what a screen reader is already saying. */}
      <Mono
        size="meta"
        aria-live="polite"
        className="text-[10.5px] text-[var(--ink-muted)]"
      >
        {viewing} viewing
        {editors.length > 0 ? ` · ${editors.join(" · ")}` : ""}
      </Mono>
    </div>
  );
}
