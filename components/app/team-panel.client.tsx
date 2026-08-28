"use client";

import { useRouter, unstable_rethrow } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Check, Copy, KeyRound, RotateCcw, UserMinus } from "lucide-react";

import { PersonAvatar } from "@/components/app/person-avatar";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { settle } from "@/lib/action-result";
import {
  setProfileActive,
  setProfileRole,
  setTemporaryPassword,
  setWeeklyCapacity,
} from "@/lib/actions/profiles";
import type { TeamMember } from "@/lib/data/profiles";
import { hours } from "@/lib/format";
import { APP_ROLES, type AppRole } from "@/lib/work-items";
import { cn } from "@/lib/utils";
import { control } from "@/lib/interactive";

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
  const [role, setRole] = useState<AppRole>(person.role);
  const [active, setActive] = useState(person.isActive);
  const [confirming, setConfirming] = useState(false);
  /**
   * The plaintext temporary password, held in this component and nowhere else.
   *
   * Not in a toast, not in the URL, not re-fetchable. The server returns it once
   * and never again, so if this state is lost the answer is to generate another
   * one — which is the honest answer, because the alternative is a readable
   * password stored somewhere.
   */
  const [temporary, setTemporary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      const result = await settle(() => setProfileRole({ profileId: person.id, role: next }), "That change did not save.");
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

  function issueTemporaryPassword() {
    setTemporary(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const result = await setTemporaryPassword({ profileId: person.id });
        if (!result.ok || !result.password) {
          toast(result.error ?? "That did not work.");
          return;
        }
        setTemporary(result.password);
        // No toast carrying the password. A toast is transient, it stacks, and
        // it would put the thing that grants access to somebody's account into
        // a element that disappears on its own.
        router.refresh();
      } catch (error) {
        // `unstable_rethrow` first, and it is not a formality. Next implements
        // `redirect()` and `notFound()` by THROWING, so a bare catch around a
        // Server Action swallows a working navigation and leaves a control that
        // appears to do nothing. This block guards more than the action call —
        // which is why it stays a block rather than becoming `settle()` — so the
        // rethrow has to be written here.
        unstable_rethrow(error);
        // A Server Action that THROWS never returns, so the branch above never
        // runs and the row would sit there looking as if nothing happened.
        toast("That did not work. Nothing has changed — try again.");
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
      const result = await settle(() => setProfileActive({
        profileId: person.id,
        isActive: next,
      }), "That change did not save.");
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
        <PersonAvatar
          person={person}
          size={34}
          fontSize={11}
          // Deactivated people are dimmed rather than hidden — an admin has to
          // be able to see who they are in order to bring them back.
          style={{ opacity: active ? 1 : 0.55 }}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">
              {person.fullName}
            </span>
            {!active ? <ToneChip tone="slate">deactivated</ToneChip> : null}
          </span>
          {/* Your own row keeps the control and disables it. It used to render
              the role as a word instead, which is the one shape this app has
              said all along it does not do: a control that disappears reads as
              a bug, and one that is present and says why reads as an answer.
              `lib/actions/profiles.ts` refuses the write either way — this is
              the half of the rule the reader can see. */}
          {isAdmin ? (
            <label className="mt-1 block">
              <span className="sr-only">{`Role for ${person.fullName}`}</span>
              <select
                value={role}
                disabled={pending || isSelf}
                title={
                  isSelf
                    ? "You cannot change your own role. Ask another admin — it takes a second person to undo."
                    : undefined
                }
                onChange={(event) => changeRole(event.target.value as AppRole)}
                className="h-[28px] rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 font-mono text-[11px] text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {APP_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {isSelf ? (
                <Mono size="meta" className="mt-1 block text-[var(--ink-faint)]">
                  you — another admin has to change this
                </Mono>
              ) : null}
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
              {/* The capacity half is editable by an admin, in hours, writing
                  minutes — invariant 2, and the reason it is a stepper rather
                  than a free text box. It drove the bar below and every
                  `v_person_load` row and was settable nowhere until
                  2026-08-25; the column has been named in
                  `guard_profile_privilege_columns` since the first migration,
                  so only the control was missing. */}
              <Mono size="meta" className="text-[var(--ink)]">
                {hours(person.load?.minutesLogged ?? 0)} /{" "}
                {isAdmin ? (
                  <CapacityField
                    profileId={person.id}
                    fullName={person.fullName}
                    minutes={person.weeklyCapacityMinutes}
                  />
                ) : (
                  hours(person.weeklyCapacityMinutes)
                )}
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
          onClickCapture={() => setActing("c1")}
          {...control(pending && acting === "c1" ? "pending" : "idle")}
            type="button"
            onClick={issueTemporaryPassword}
              disabled={pending || !active || isSelf}
              aria-label={
                isSelf
                  ? "You cannot set a temporary password for yourself"
                  : `Set a temporary password for ${person.fullName}`
              }
              title={
                isSelf
                  ? "Change your own password from your profile — a temporary one is what an admin issues to somebody else."
                  : active
                    ? "Generates a password, shows it once, and requires them to choose their own before the app opens."
                    : "They have no access at all while deactivated."
              }
              className={cn(
                "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-control border px-3 text-[12.5px]",
                "border-[var(--hairline)] text-[var(--ink-muted)] transition-colors duration-[var(--dur-micro)]",
                "hover:border-[var(--hairline-strong)] hover:text-[var(--ink)] disabled:opacity-50",
              )}
            >
              <KeyRound size={13} strokeWidth={1.8} aria-hidden />
              Temporary password
            </button>
          <button
          onClickCapture={() => setActing("c2")}
          {...control(pending && acting === "c2" ? "pending" : "idle")}
            type="button"
            onClick={toggleActive}
              disabled={pending || isSelf}
              aria-label={
                isSelf
                  ? "You cannot deactivate yourself"
                  : active
                    ? `Deactivate ${person.fullName}`
                    : `Give ${person.fullName} access again`
              }
              title={
                isSelf
                  ? "You cannot deactivate yourself. Ask another admin — otherwise one misclick locks you out of the tool you administer."
                  : active
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
        </div>
      ) : null}

      {/* Shown once, in the row it belongs to, spanning the whole grid. It is
          not a dialog: a dialog would have to be dismissed before the admin
          could read the password out, and closing it is how you lose the only
          copy that exists. */}
      {temporary ? (
        <div
          data-temporary-password
          role="status"
          className="col-span-full flex flex-wrap items-center gap-3 rounded-inner border border-[var(--hairline-strong)] bg-[var(--canvas)] px-4 py-3"
        >
          <Mono size="meta" className="text-[var(--ink-faint)]">
            temporary password for {person.fullName} — shown once
          </Mono>

          <Mono
            size="key"
            data-password-value
            className="select-all text-[15px] font-semibold tracking-[0.06em]"
          >
            {temporary}
          </Mono>

          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(temporary);
                setCopied(true);
              } catch {
                // A refused clipboard permission is not a failure worth a
                // toast — the password is on screen and selectable.
                setCopied(false);
              }
            }}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)]"
          >
            {copied ? (
              <Check size={13} strokeWidth={2.2} aria-hidden />
            ) : (
              <Copy size={13} strokeWidth={1.8} aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </button>

          <p className="w-full text-[12.5px] leading-[1.5] text-[var(--ink-muted)]">
            Give it to {person.fullName.split(" ")[0]} directly. It is stored nowhere and cannot be
            shown again — generate another if it is lost. They will be asked to choose their own
            password the moment they sign in, and nothing in the app opens until they do.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What somebody's week holds, in hours, stored in minutes.
 *
 * Half-hour steps, and the same reason as everywhere else in this app:
 * invariant 2 says the UI never holds a float, so the stepper moves by 30
 * minutes and the division happens once, in `hours()`, at the render edge.
 *
 * It is deliberately not a free text field. "37.5" is a fraction of an hour
 * somebody would have to type correctly, and a typo here silently reshapes
 * every load bar on the page.
 */
function CapacityField({
  profileId,
  fullName,
  minutes,
}: {
  profileId: string;
  fullName: string;
  minutes: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(minutes, (_current, next: number) => next);

  function set(next: number) {
    const clamped = Math.max(30, Math.min(10_080, next));
    if (clamped === minutes) return;
    startTransition(async () => {
      showOptimistic(clamped);
      const result = await settle(
        () => setWeeklyCapacity({ profileId, weeklyCapacityMinutes: clamped }),
        "That capacity did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else toast(result.error ?? "That capacity did not save.");
    });
  }

  return (
    <span className="inline-flex items-center gap-[2px] align-baseline">
      <button
        type="button"
        onClick={() => set(shown - 30)}
        disabled={pending || shown <= 30}
        aria-label={`Half an hour less for ${fullName}`}
        className="grid size-5 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] disabled:opacity-40 [@media(pointer:coarse)]:size-11"
      >
        &minus;
      </button>
      <output
        aria-live="polite"
        aria-label={`${fullName}'s weekly capacity`}
        className="min-w-[34px] text-center tabular-nums"
      >
        {hours(shown)}
      </output>
      <button
        type="button"
        onClick={() => set(shown + 30)}
        disabled={pending || shown >= 10_080}
        aria-label={`Half an hour more for ${fullName}`}
        className="grid size-5 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] disabled:opacity-40 [@media(pointer:coarse)]:size-11"
      >
        +
      </button>
    </span>
  );
}
