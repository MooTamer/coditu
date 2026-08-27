"use client";

import Link from "next/link";

import { PersonAvatar } from "@/components/app/person-avatar";
import { Mono } from "@/components/coditu/mono";
import type { ProfileRef } from "@/lib/data/profiles";
import { usePresence } from "@/lib/hooks/use-presence";

/**
 * Who is in the workspace right now — the handoff's `Online now` card.
 *
 * ## The roster is the team; the dot is presence
 *
 * Everybody on the team is listed, in a stable order, and the dot beside each
 * face says whether they are actually here. A list that only contained the
 * people currently online would reorder itself under the reader's eye every
 * time somebody's laptop slept, and would say nothing at all most evenings.
 *
 * ## The channel is `coditu:presence:workspace`
 *
 * `realtime.messages` RLS requires the `coditu:` prefix and authorises the join
 * in SQL — the same policy `e2e/presence.spec.ts` asserts for the sprint
 * channel. Nothing is broadcast but the fact of being here: `usePresence`
 * announces a profile id and a surface, never anything typed.
 *
 * ## Never colour alone
 *
 * The dot has a text label beside it, because the handoff's presence rule is
 * *"dot plus text label (never colour alone)"* — and a green circle is
 * invisible to a reader who cannot see green.
 */
export function OnlineNow({
  me,
  people,
}: {
  me: { id: string };
  /** Active profiles. The shell already reads them for the topbar. */
  people: ProfileRef[];
}) {
  const members = usePresence({
    channelName: "coditu:presence:workspace",
    profileId: me.id,
    surface: "workspace",
  });

  const here = new Set(members.map((member) => member.profileId));
  const onlineCount = people.filter((person) => here.has(person.id)).length;

  return (
    <section className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5">
      <div className="flex items-baseline gap-2">
        <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          Online now
        </Mono>
        <Mono size="meta" className="tabular-nums text-[var(--ink-muted)]">
          {onlineCount} of {people.length}
        </Mono>
      </div>

      <ul className="mt-3 flex list-none flex-col gap-[10px]">
        {people.map((person) => {
          const online = here.has(person.id);
          return (
            <li key={person.id} className="flex items-center gap-[10px]">
              <span className="relative shrink-0">
                <PersonAvatar person={person} size={26} fontSize={9.5} />
                <span
                  aria-hidden
                  className="absolute -bottom-[2px] -right-[2px] size-[9px] rounded-pill border-2 border-[var(--overlay)]"
                  style={{ background: online ? "#23C97F" : "var(--hairline-strong)" }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
                  {person.fullName}
                </span>
                <Mono size="meta" className="block text-[var(--ink-faint)]">
                  {online ? "online" : "offline"}
                </Mono>
              </span>
              <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                {person.role}
              </Mono>
            </li>
          );
        })}
      </ul>

      <Link
        href="/app/people"
        className="mt-4 flex h-11 items-center justify-center rounded-control border border-[var(--hairline)] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--tint)] hover:text-[var(--ink)] md:h-[34px]"
      >
        People &amp; access
      </Link>
    </section>
  );
}
