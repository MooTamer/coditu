import { Mono } from "@/components/coditu/mono";
import type { MyConfirmedPayout, MyCurrentSprint } from "@/lib/data/earnings";
import {
  egpFromPiastres,
  hoursLabel,
  piastresFromCents,
  rateFromMicros,
  timestamp,
  usdFromCents,
} from "@/lib/format";
import type { AppSettings } from "@/lib/settings";

/**
 * Your own money, and the arithmetic that produced it.
 *
 * ## A Server Component, and it stays one
 *
 * There is nothing to interact with. Three facts and a sum, rendered on the
 * server, shipping no JavaScript at all — which matters more here than on most
 * screens because this is the one people open on a phone to check a number.
 *
 * ## Why the sum is shown rather than asserted
 *
 * A share is `pot ÷ participants`, the pot is `minutes × rate ÷ 60`, and the
 * split is **equal rather than proportional** — which is the part that surprises
 * everybody the first time, because logging 81% of the hours and taking 50% of
 * the pot looks like an error unless the rule is on the screen beside it. Every
 * line below comes out of `listSprintEarnings`; nothing here recomputes
 * anything, so this screen and the confirmation screen cannot disagree.
 *
 * ## Counts, not colleagues
 *
 * The prototype's calculation block names each excluded person and their hours.
 * This says "2 of 4" instead. The difference between the two numbers is what
 * explains the pot — somebody's minutes counted and took no share — and it does
 * that without turning a private screen into a roster of who worked how much.
 */
export function MyEarnings({
  isDeveloper,
  current,
  lastConfirmed,
  settings,
}: {
  isDeveloper: boolean;
  current: MyCurrentSprint | null;
  lastConfirmed: MyConfirmedPayout | null;
  settings: AppSettings;
}) {
  const rate = settings.usdEgpRateMicros;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <Card
          label="This sprint"
          tag={current ? "provisional" : "nothing open"}
          tone="amber"
          usdCents={current && isDeveloper ? current.cents : null}
          rateMicros={rate}
          // `no share` rather than an em dash when the reason is known, and
          // never `$0.00`: zero claims a split was computed for you and came to
          // nothing. You are simply not in it.
          plain={current && isDeveloper && current.cents === null ? "no share" : undefined}
          note={
            !isDeveloper
              ? "Your hours count toward the pot; you do not take a share of it."
              : current
                ? `${current.name} · moves while hours are logged and the list is not final`
                : "No tracked sprint is running."
          }
        />

        <Card
          label="Last confirmed"
          tag={lastConfirmed ? "agreed" : "none yet"}
          tone="jade"
          usdCents={lastConfirmed?.cents ?? null}
          rateMicros={rate}
          note={
            lastConfirmed
              ? `${lastConfirmed.name} · confirmed ${timestamp(lastConfirmed.at)} · the snapshot cannot be rewritten`
              : "Nothing has been confirmed for you yet."
          }
        />

        <Card
          label="Logged this sprint"
          tag={current ? `${current.sharePct}%` : "—"}
          tone="slate"
          plain={current ? hoursLabel(current.minutesLogged) : "—"}
          note={
            current
              ? `of ${hoursLabel(current.totalMinutes)} across the team · the threshold is ${settings.payoutShareThresholdPct}%`
              : "Nothing to show until a tracked sprint is running."
          }
        />
      </div>

      {current && isDeveloper ? (
        <section
          aria-labelledby="calculation"
          data-my-calculation
          className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="calculation" className="text-[16px] font-bold tracking-[-0.015em]">
              How that figure is reached
            </h2>
            <Mono size="meta" className="text-[var(--ink-faint)]">
              {usdFromCents(settings.hourlyRateCents)}/h · threshold{" "}
              {settings.payoutShareThresholdPct}% · rate captured at confirmation
            </Mono>
          </div>

          <dl className="mt-4 flex flex-col gap-2.5">
            <Line
              label={`Team minutes on ${current.name}`}
              value={hoursLabel(current.totalMinutes)}
            />
            <Line
              label={`Pot · ${hoursLabel(current.totalMinutes)} × ${usdFromCents(settings.hourlyRateCents)}`}
              value={usdFromCents(current.potCents)}
            />
            <Line
              label="Participants above the threshold"
              value={`${current.participantCount} of ${current.contributorCount}`}
            />
            <Line
              label="Equal split · your share"
              value={current.cents === null ? "no share" : usdFromCents(current.cents)}
              emphasis
            />
          </dl>

          <p className="mt-4 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
            The split is <strong>equal, not proportional</strong> — that is the team&rsquo;s rule,
            and it is why a person confirms it rather than the app paying it out. A contributor
            below the threshold is named on the confirmation screen and takes no share, and their
            minutes still count toward the pot. Remainders are handed out one cent at a time in a
            fixed order, so the same inputs always produce the same split.
          </p>

          {!current.proposed ? (
            <p className="mt-3 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--tone-amber-fg)]">
              You are below the {settings.payoutShareThresholdPct}% threshold on this sprint, so no
              share is proposed for you. Your minutes still count toward the pot. Nothing is decided
              until an admin confirms it — and if your share of the hours passes{" "}
              {settings.payoutShareThresholdPct}% before then, you are in.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Card({
  label,
  tag,
  tone,
  usdCents,
  rateMicros,
  plain,
  note,
}: {
  label: string;
  tag: string;
  tone: "amber" | "jade" | "slate";
  usdCents?: number | null;
  rateMicros?: number | null;
  plain?: string;
  note: string;
}) {
  // A missing rate renders as a missing rate. Inventing one — falling back to
  // a constant, or hiding the line — is what `piastresFromCents` returning null
  // exists to prevent.
  const piastres =
    usdCents !== null && usdCents !== undefined ? piastresFromCents(usdCents, rateMicros ?? null) : null;

  return (
    <div
      data-earnings-card
      className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          {label}
        </Mono>
        <span
          className="rounded-chip px-2 py-[3px] text-[11px] font-semibold"
          style={{
            background: `var(--tone-${tone}-bg)`,
            color: `var(--tone-${tone}-fg)`,
          }}
        >
          {tag}
        </span>
      </div>

      <p className="mt-3 text-[26px] font-bold leading-none tracking-[-0.024em] tabular-nums">
        {plain ?? (usdCents === null || usdCents === undefined ? "—" : usdFromCents(usdCents))}
      </p>

      {piastres !== null && rateMicros ? (
        <Mono size="meta" className="mt-2 block text-[var(--ink-muted)]">
          {egpFromPiastres(piastres)} @ {rateFromMicros(rateMicros)}
        </Mono>
      ) : null}

      <p className="mt-3 text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">{note}</p>
    </div>
  );
}

function Line({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dashed border-[var(--hairline)] pb-2.5 last:border-0 last:pb-0">
      <dt className="min-w-0 text-[13.5px] text-[var(--ink-muted)]">{label}</dt>
      <dd
        className="shrink-0 text-[14px] font-semibold tabular-nums"
        style={emphasis ? { color: "var(--tone-amber-fg)" } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
