"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RotateCcw, UserMinus } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { setProfileActive, setProfileRole } from "@/lib/actions/profiles";
import type { TeamMember } from "@/lib/data/profiles";
import { hours } from "@/lib/format";
import { APP_ROLES, type AppRole } from "@/lib/work-items";
import { cn } from "@/lib/utils";

export interface TeamRow extends TeamMember {
  /** Load on the open sprint, when there is one. */
  load: { assigned: number; reviewQueue: number; minutesLogged: number } | null;
}

/**
 * The team.
 *
 * Capacity is stated as capacity, not as a target — a bar at 30% is not a
 * person underperforming, it is a person with room. The copy says so, because a
 * progress bar with no framing invites exactly the wrong reading.
 *
 * Role and access are admin-only controls, and for everyone else the role still
 * renders — as text. A control that disappears reads as a bug; a value that is
 * simply not a control reads as information.
 */
export function TeamPanel({
  rows,
  isAdmin,
  currentProfileId,
  hasSprint,
}: {
  rows: TeamRow[];
  isAdmin: boolean;
  currentProfileId: string;
  /** Whether there is an open sprint to have load on. */
  hasSprint: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
      {rows.map((person) => (
        <PersonRow
          key={person.id}
          person={person}
          isAdmin={isAdmin}
          isSelf={person.id === currentProfileId}
          hasSprint={hasSprint}
        />
      ))}
      {rows.length === 0 ? (
        <p className="px-5 py-[18px] text-[13.5px] text-[var(--ink-faint)]">
          Nobody here yet.
        </p>
      ) : null}
    </div>
  );
}

function PersonRow({
  person,
  isAdmin,
  isSelf,
  hasSprint,
}: {
  person: TeamRow;
  isAdmin: boolean;
  isSelf: boolean;
  hasSprint: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<AppRole>(person.role);
  const [active, setActive] = useState(person.isActive);
  const [confirming, setConfirming] = useState(false);

  // The confirm step expires on its own. A button left reading "Confirm?"
  // across a page the reader has moved on from is a trap for the next click.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const percent =
    person.load && person.weeklyCapacityMinutes > 0
      ? Math.min(
          Math.round(
            (person.load.minutesLogged / person.weeklyCapacityMinutes) * 100,
          ),
          100,
        )
      : 0;

  function changeRole(next: AppRole) {
    const previous = role;
    setRole(next);
    startTransition(async () => {
      const result = await setProfileRole({ profileId: person.id, role: next });
      if (result.ok) {
        toast(
          `${person.fullName} is ${next === "engineer" ? "an" : "a"} ${next}.`,
        );
        router.refresh();
      } else {
        // Invariant 4: the select snaps back AND the reason is on screen.
        setRole(previous);
        toast(result.error ?? "That change did not save.");
      }
    });
  }

  function toggleActive() {
    if (active && !confirming) {
      setConfirming(true);
      return;
    }
    const next = !active;
    setConfirming(false);
    setActive(next);
    startTransition(async () => {
      const result = await setProfileActive({
        profileId: person.id,
        isActive: next,
      });
      if (result.ok) {
        toast(
          next
            ? `${person.fullName} has access again.`
            : `${person.fullName} can no longer sign in. Their hours and comments are untouched.`,
        );
        router.refresh();
      } else {
        setActive(!next);
        toast(result.error ?? "That change did not save.");
      }
    });
  }

  return (
    <div
      // Two people can share a display name — the seed has two Mohamed Tamers,
      // and a real team eventually will too — so the row is what identifies a
      // person here, not their name.
      data-team-member
      data-self={isSelf ? "" : undefined}
      className={cn(
        "grid items-center gap-5 border-b border-[var(--hairline)] px-5 py-[18px] last:border-b-0",
        "[grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]",
        !active && "bg-[var(--canvas)]",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-[34px] shrink-0 items-center justify-center rounded-pill border border-[var(--hairline-strong)]"
          style={{ opacity: active ? 1 : 0.55 }}
        >
          <Mono size="meta">{person.initials}</Mono>
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">
              {person.fullName}
            </span>
            {!active ? <ToneChip tone="slate">deactivated</ToneChip> : null}
          </span>
          {isAdmin && !isSelf ? (
            <label className="mt-1 block">
              <span className="sr-only">{`Role for ${person.fullName}`}</span>
              <select
                value={role}
                disabled={pending}
                onChange={(event) => changeRole(event.target.value as AppRole)}
                className="h-[28px] rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 font-mono text-[11px] text-[var(--ink)] disabled:opacity-60"
              >
                {APP_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Mono
              size="meta"
              className="block truncate text-[var(--ink-faint)]"
            >
              {role}
              {isSelf ? " · you" : ""}
            </Mono>
          )}
        </span>
      </div>

      {hasSprint ? (
        <>
          <div>
            <Mono size="meta" className="block text-[var(--ink-faint)]">
              assigned
            </Mono>
            <Mono size="key" className="block text-[15px]">
              {person.load?.assigned ?? 0}
            </Mono>
          </div>

          <div>
            <Mono size="meta" className="block text-[var(--ink-faint)]">
              review queue
            </Mono>
            <Mono size="key" className="block text-[15px]">
              {person.load?.reviewQueue ?? 0}
            </Mono>
          </div>

          <div>
            <span className="flex items-baseline justify-between gap-2">
              <Mono size="meta" className="text-[var(--ink-faint)]">
                logged / capacity
              </Mono>
              <Mono size="meta" className="text-[var(--ink)]">
                {hours(person.load?.minutesLogged ?? 0)} /{" "}
                {hours(person.weeklyCapacityMinutes)}
              </Mono>
            </span>
            <span
              className="mt-2 block h-[6px] overflow-hidden rounded-pill bg-[var(--canvas)]"
              role="img"
              aria-label={`${person.fullName}: ${hours(person.load?.minutesLogged ?? 0)} of ${hours(
                person.weeklyCapacityMinutes,
              )} hours, ${percent} percent of capacity`}
            >
              <span
                className="block h-full"
                style={{
                  width: `${percent}%`,
                  background: "linear-gradient(90deg, #2B57FF, #21E2C6)",
                }}
              />
            </span>
          </div>
        </>
      ) : null}

      {/* Rendered for every row an admin sees, even their own, where it is
          empty. `auto-fit` counts tracks: one row with four cells beside four
          rows with five puts that row's numbers under different headings than
          everyone else's. */}
      {isAdmin ? (
        <div className="flex justify-end">
          {isSelf ? null : (
            <button
              type="button"
              onClick={toggleActive}
              disabled={pending}
              aria-label={
                active
                  ? `Deactivate ${person.fullName}`
                  : `Give ${person.fullName} access again`
              }
              title={
                active
                  ? "They lose access immediately. Their hours and comments stay exactly where they are."
                  : "They can sign in again, and reappear in the assignee and mention lists."
              }
              className={cn(
                "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-control border px-3 text-[12.5px]",
                "transition-colors duration-[var(--dur-micro)] disabled:opacity-50",
                confirming
                  ? "border-[var(--rose)] font-semibold text-[var(--rose)]"
                  : "border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)]",
              )}
            >
              {active ? (
                <UserMinus size={13} strokeWidth={1.8} aria-hidden />
              ) : (
                <RotateCcw size={13} strokeWidth={1.8} aria-hidden />
              )}
              {active ? (confirming ? "Confirm?" : "Deactivate") : "Reactivate"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
