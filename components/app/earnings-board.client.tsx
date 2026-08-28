"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

import { PersonAvatar } from "@/components/app/person-avatar";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { settle } from "@/lib/action-result";
import { confirmSprintPayout } from "@/lib/actions/earnings";
import type { NonParticipantNote, SprintEarnings } from "@/lib/data/earnings";
import { splitEqually } from "@/lib/earnings";
import {
  dateRange,
  egpFromPiastres,
  hoursLabel,
  piastresFromCents,
  rateFromMicros,
  timestamp,
  usdFromCents,
} from "@/lib/format";
import type { AppSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { control } from "@/lib/interactive";

/**
 * The earnings board: one card per sprint, phone first.
 *
 * ## What the rules look like on screen
 *
 * - **Provisional until confirmed**, and it says so in as many words. A
 *   provisional figure is recomputed on every render from the time entries as
 *   they stand; a confirmed one never moves again.
 * - **Equally, not proportionally.** The person with 40 hours and the person
 *   with 12 take the same amount. That is the team's rule and it is exactly why
 *   a human confirms it rather than a job.
 * - **The pot, the per-person amount and the rate are shown BEFORE the button**,
 *   never after. Nobody should have to press a thing to find out what it does.
 * - **A stale confirmation says so loudly** and keeps showing its own figures.
 *   Silently recomputing a number somebody has been paid against is the failure
 *   this whole design is arranged around.
 * - **A non-developer's minutes count toward the pot and take no share**, and
 *   the panel names them, because a surprise here is a surprise about money.
 *
 * ## Money is only ever formatted in `lib/format.ts`
 *
 * Every figure below arrives as integer cents and is divided in exactly one
 * place. There is no `/ 100` in this file, and there should never be one.
 */
export function EarningsBoard({
  sprints,
  settings,
  nonParticipants,
  isAdmin,
  meId,
}: {
  sprints: SprintEarnings[];
  settings: AppSettings;
  nonParticipants: Record<string, NonParticipantNote[]>;
  isAdmin: boolean;
  meId: string;
}) {
  const tracked = sprints.filter((sprint) => sprint.tracked);
  const untracked = sprints.filter((sprint) => !sprint.tracked);

  return (
    <div className="flex flex-col gap-4">
      <RateLine settings={settings} />

      {tracked.length === 0 ? (
        <p className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] px-5 py-4 text-[13.5px] text-[var(--ink-muted)]">
          No sprint is tracked for earnings yet. An admin picks the first one in Settings —
          everything before it reads “not tracked”, which is the truth; zero would be a claim.
        </p>
      ) : null}

      {tracked.map((sprint) => (
        <SprintCard
          key={sprint.sprintId}
          sprint={sprint}
          settings={settings}
          others={nonParticipants[sprint.sprintId] ?? []}
          isAdmin={isAdmin}
          meId={meId}
        />
      ))}

      {untracked.length > 0 ? (
        <section
          aria-label="Sprints before earnings were tracked"
          className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
        >
          <h2 className="border-b border-[var(--hairline)] px-5 py-3 text-[13px] font-medium text-[var(--ink-muted)]">
            Before earnings were tracked
          </h2>
          {untracked.map((sprint) => (
            <div
              key={sprint.sprintId}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-5 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{sprint.name}</span>
              <Mono size="meta" className="text-[var(--ink-faint)]">
                {dateRange(sprint.startsOn, sprint.endsOn)}
              </Mono>
              {/* "not tracked", never "$0.00". Zero is a claim about money that
                  was never counted. */}
              <ToneChip tone="slate" className="shrink-0">
                not tracked
              </ToneChip>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

/**
 * "EGP 50.86 / USD · live, 24 Aug 2026" — or the honest absence of one.
 *
 * Never a stale rate without its date, and never an invented one. With no rate
 * at all the board shows USD only and says where to set one by hand.
 */
function RateLine({ settings }: { settings: AppSettings }) {
  if (!settings.usdEgpRateMicros) {
    return (
      <p className="rounded-list border border-dashed border-[var(--hairline-strong)] px-4 py-3 text-[13px] text-[var(--ink-muted)]">
        No exchange rate yet, so these figures are in USD only. It is fetched daily in the
        background; an admin can also set one by hand in Settings.
      </p>
    );
  }

  return (
    <Mono size="meta" className="text-[var(--ink-faint)]">
      EGP {rateFromMicros(settings.usdEgpRateMicros)} / USD ·{" "}
      {settings.usdEgpSource === "manual" ? "set by hand" : "live"}
      {settings.usdEgpFetchedAt ? `, ${timestamp(settings.usdEgpFetchedAt).slice(0, 10)}` : ""}
    </Mono>
  );
}

function Money({ cents, rateMicros }: { cents: number; rateMicros: number | null }) {
  const piastres = piastresFromCents(cents, rateMicros);
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold tabular-nums">{usdFromCents(cents)}</span>
      {piastres !== null ? (
        <Mono size="meta" className="ml-2 text-[var(--ink-faint)]">
          {egpFromPiastres(piastres)}
        </Mono>
      ) : null}
    </span>
  );
}

function SprintCard({
  sprint,
  settings,
  others,
  isAdmin,
  meId,
}: {
  sprint: SprintEarnings;
  settings: AppSettings;
  others: NonParticipantNote[];
  isAdmin: boolean;
  meId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // Pre-ticked for anyone the app proposes, and every developer who logged
  // anything is listed so an admin can add or remove them before confirming.
  // The threshold is a suggestion engine; the confirmed set is the truth.
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(sprint.participants.filter((p) => p.proposed).map((p) => p.profileId))
  );

  const eligible = sprint.participants.filter((p) => p.isDeveloper);
  const shares = splitEqually(
    sprint.potCents,
    eligible.filter((p) => picked.has(p.profileId)).map((p) => ({
      profileId: p.profileId,
      minutesLogged: p.minutesLogged,
    }))
  );
  const perPerson = shares[0]?.shareCents ?? 0;

  const confirmed = sprint.confirmed;
  const rateMicros = confirmed?.usdEgpRateMicros ?? settings.usdEgpRateMicros;

  function confirm() {
    startTransition(async () => {
      const result = await settle(
        () =>
          confirmSprintPayout({
            sprintId: sprint.sprintId,
            participantIds: [...picked],
          }),
        "That confirmation did not save — check your connection."
      );
      if (result.ok) {
        toast(`${sprint.name} confirmed. The figures are a record now.`);
        router.refresh();
        return;
      }
      toast(result.error ?? "That confirmation did not save.");
    });
  }

  return (
    <section
      aria-label={`Earnings for ${sprint.name}`}
      className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-5 py-4">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{sprint.name}</span>
          <Mono size="meta" className="block text-[var(--ink-faint)]">
            {dateRange(sprint.startsOn, sprint.endsOn)} · {hoursLabel(sprint.totalMinutes)} logged
          </Mono>
        </span>

        {confirmed ? (
          <ToneChip tone="jade" className="shrink-0">
            confirmed
          </ToneChip>
        ) : (
          <ToneChip tone="amber" className="shrink-0">
            provisional
          </ToneChip>
        )}

        <span className="shrink-0 text-[15px]">
          <Money cents={confirmed?.potCents ?? sprint.potCents} rateMicros={rateMicros} />
        </span>
      </header>

      {/* Loudly. The confirmed figures keep being shown; they do not drift. */}
      {sprint.staleByMinutes !== null && confirmed ? (
        <p
          role="status"
          className="flex items-start gap-2 border-b border-[var(--hairline)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-5 py-3 text-[13px] leading-[1.5]"
          style={{ color: "var(--tone-amber-fg)" }}
        >
          <AlertTriangle size={14} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden />
          <span>
            Time logged on {sprint.name} has changed since this was confirmed —{" "}
            {hoursLabel(Math.abs(sprint.staleByMinutes))}{" "}
            {sprint.staleByMinutes > 0 ? "added" : "removed"}. The figures below are the confirmed
            ones.
            {isAdmin ? " Re-confirm to agree the new split; the old one stays in the record." : ""}
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-3 px-5 py-4">
        {confirmed ? (
          <>
            <Mono size="meta" className="text-[var(--ink-faint)]">
              confirmed by {confirmed.confirmedByName} · {timestamp(confirmed.confirmedAt)} ·{" "}
              {usdFromCents(confirmed.hourlyRateCents)}/h ·{" "}
              {confirmed.usdEgpRateMicros
                ? `EGP ${rateFromMicros(confirmed.usdEgpRateMicros)} / USD, ${confirmed.usdEgpSource === "manual" ? "set by hand" : "live"}`
                : "USD only"}
            </Mono>
            <ul className="flex flex-col gap-2">
              {confirmed.shares.map((share) => (
                <li key={share.profileId} className="flex items-center gap-3">
                  <PersonAvatar person={share} size={22} fontSize={9.5} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13.5px]",
                      share.profileId === meId && "font-semibold"
                    )}
                  >
                    {share.fullName}
                  </span>
                  <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                    {hoursLabel(share.minutesLogged)}
                  </Mono>
                  <span className="shrink-0 text-[13.5px]">
                    <Money cents={share.shareCents} rateMicros={confirmed.usdEgpRateMicros} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : sprint.totalMinutes === 0 ? (
          <p className="text-[13.5px] text-[var(--ink-faint)]">
            Nothing logged against this sprint yet, so there is nothing to confirm.
          </p>
        ) : (
          <>
            <Mono size="meta" className="text-[var(--ink-faint)]">
              provisional · recomputed from the time entries as they stand ·{" "}
              {usdFromCents(settings.hourlyRateCents)}/h
            </Mono>
            <ul className="flex flex-col gap-2">
              {sprint.participants.map((person) => (
                <li key={person.profileId} className="flex items-center gap-3">
                  <PersonAvatar person={person} size={22} fontSize={9.5} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13.5px]",
                      person.profileId === meId && "font-semibold",
                      !person.isDeveloper && "text-[var(--ink-muted)]"
                    )}
                  >
                    {person.fullName}
                    {person.isActive ? "" : " (deactivated)"}
                  </span>
                  <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                    {hoursLabel(person.minutesLogged)} · {person.sharePct}%
                  </Mono>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Never a surprise about money. A non-developer's hours count toward
            the pot and take no share, so they are named. */}
        {others.length > 0 ? (
          <p className="text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
            Includes{" "}
            {others
              .map((other) => `${hoursLabel(other.minutesLogged)} logged by ${other.fullName}`)
              .join(", ")}
            , who {others.length === 1 ? "takes" : "take"} no share.
          </p>
        ) : null}
      </div>

      {isAdmin && sprint.totalMinutes > 0 ? (
        <div className="border-t border-[var(--hairline)] bg-[var(--overlay)] px-5 py-4">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {confirmed ? "Re-confirm distribution" : "Confirm distribution"}
          </Mono>

          {eligible.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--ink-muted)]">
              Nobody who logged time on this sprint takes a share. Mark somebody a developer in
              Settings first.
            </p>
          ) : (
            <>
              <ul className="mt-3 flex flex-col gap-1">
                {eligible.map((person) => {
                  const on = picked.has(person.profileId);
                  return (
                    <li key={person.profileId}>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-[var(--canvas)]">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setPicked((was) => {
                              const next = new Set(was);
                              if (on) next.delete(person.profileId);
                              else next.add(person.profileId);
                              return next;
                            })
                          }
                          className="size-[18px] accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13.5px]">
                          {person.fullName}
                        </span>
                        <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                          {hoursLabel(person.minutesLogged)} · {person.sharePct}%
                          {person.proposed ? " · proposed" : ""}
                        </Mono>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <Mono size="meta" className="mt-2 block text-[var(--ink-faint)]">
                pre-ticked for anyone who logged {settings.payoutShareThresholdPct}% or more · split
                equally, not proportionally
              </Mono>

              {/* Before the button, not after it. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--hairline)] pt-3">
                <span className="text-[13px]">
                  <Mono size="meta" className="mr-2 text-[var(--ink-faint)]">
                    pot
                  </Mono>
                  <Money cents={sprint.potCents} rateMicros={settings.usdEgpRateMicros} />
                </span>
                <span className="text-[13px]">
                  <Mono size="meta" className="mr-2 text-[var(--ink-faint)]">
                    each
                  </Mono>
                  <Money cents={perPerson} rateMicros={settings.usdEgpRateMicros} />
                </span>
                <Mono size="meta" className="text-[var(--ink-faint)]">
                  {picked.size} {picked.size === 1 ? "person" : "people"}
                </Mono>
              </div>

              <button
        {...control(pending ? "pending" : "idle")}
                type="button"
                onClick={confirm}
                disabled={pending || picked.size === 0}
                className="signal-gradient mt-3 inline-flex h-[38px] items-center gap-2 rounded-control px-4 text-[13.5px] font-semibold text-[#07090E] disabled:opacity-60"
              >
                {pending ? (
                  <Loader2
                    size={14}
                    strokeWidth={2}
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : (
                  <Check size={14} strokeWidth={2.4} aria-hidden />
                )}
                {confirmed ? "Re-confirm" : "Confirm"} {usdFromCents(sprint.potCents)}
              </button>

              <Mono size="meta" className="ml-3 text-[var(--ink-faint)]">
                {confirmed
                  ? "the previous confirmation stays in the record"
                  : "this becomes a record and does not move again"}
              </Mono>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
