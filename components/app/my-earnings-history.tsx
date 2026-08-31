import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import type { MyEarningsRow, MyEarningsState } from "@/lib/data/earnings";
import {
  egpFromPiastres,
  hoursOrDash,
  piastresFromCents,
  timestamp,
  usdFromCents,
} from "@/lib/format";

/**
 * Every sprint, from your side of it.
 *
 * ## Five states, and a legend that says what each one means
 *
 * The states are the ones the board has always had, narrowed to one person.
 * The legend is not decoration: *provisional* and *not tracked* look alike in a
 * table — both are unfinished — and they are opposites. One is a figure that
 * will move; the other is the absence of a figure, because nobody counted.
 *
 * **`—`, never `$0.00`, on a sprint that was not tracked.** Zero is a claim
 * about money; an em dash is the truth about a sprint from before the team
 * started logging time. That rule has been in this app since the earnings model
 * was built and it is why `cents` is nullable all the way up from the read.
 *
 * The fifth state, `unpayable`, follows the same rule for a different reason:
 * hourly pay came to more than the sprint took in, so there is no honest figure
 * to print. A zero there would claim the split was computed and came to
 * nothing. ADR 2026-08-31.
 *
 * ## A Server Component, and the table scrolls inside its own card
 *
 * Nothing here is interactive, so it ships no JavaScript. The horizontal
 * overflow lives on the wrapper — a table this wide has to scroll inside the
 * card and never move the page, which is the rule `docs/01-DESIGN-SYSTEM.md`
 * states and `a11y.spec.ts` measures at thirteen widths.
 */

const STATE_TONE: Record<MyEarningsState, "amber" | "jade" | "slate"> = {
  provisional: "amber",
  confirmed: "jade",
  // No rose chip pair exists in this design system, and adding one to carry a
  // distinction the label already makes would be a design-system change. Amber
  // is the tone for "look at this"; the word is what separates the two.
  changed: "amber",
  "not tracked": "slate",
  // Also amber, and for the same reason: the word carries the distinction. An
  // unpayable sprint is emphatically not "confirmed" and not "not tracked" —
  // it was counted, and the count does not work.
  unpayable: "amber",
};

const STATE_LABEL: Record<MyEarningsState, string> = {
  provisional: "provisional",
  confirmed: "confirmed",
  changed: "changed since confirmation",
  "not tracked": "not tracked",
  unpayable: "unpayable",
};

const LEGEND: ReadonlyArray<{ state: MyEarningsState; body: string }> = [
  {
    state: "provisional",
    body: "The sprint is open. Hours and the participant list can both still move.",
  },
  {
    state: "confirmed",
    body: "An immutable snapshot: the rate, the pot, the participants and the exchange rate as they were.",
  },
  {
    state: "changed",
    body: "Hours were edited after confirmation. The snapshot stands; confirming again would supersede it.",
  },
  {
    state: "not tracked",
    body: "The sprint is before the one earnings are tracked from. Not zero — uncounted, and shown as uncounted.",
  },
  {
    state: "unpayable",
    body: "Hourly pay on the sprint comes to more than it took in. There is nothing to split, so no figure is shown rather than a misleading zero.",
  },
];

export function MyEarningsHistory({
  rows,
  rateMicros,
}: {
  rows: MyEarningsRow[];
  rateMicros: number | null;
}) {
  return (
    <section
      aria-labelledby="my-history"
      data-my-history
      className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
    >
      <div className="flex flex-wrap items-baseline gap-3 border-b border-[var(--hairline)] px-5 py-3.5">
        <h2 id="my-history" className="text-[16px] font-bold tracking-[-0.015em]">
          Every sprint
        </h2>
        <Mono size="meta" className="text-[var(--ink-faint)]">
          provisional rows move · confirmed rows never do
        </Mono>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-4 text-[13.5px] text-[var(--ink-muted)]">
          There are no sprints yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-[var(--hairline)]">
                <Th>Sprint</Th>
                <Th>State</Th>
                <Th align="right">Your hours</Th>
                <Th align="right">USD</Th>
                <Th align="right">EGP</Th>
                <Th>Confirmed</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const piastres =
                  row.cents === null ? null : piastresFromCents(row.cents, rateMicros);
                return (
                  <tr
                    key={row.sprintId}
                    data-my-earnings-row
                    className="border-b border-[var(--hairline)] last:border-b-0"
                  >
                    <td className="px-5 py-2.5 font-medium">{row.name}</td>
                    <td className="px-5 py-2.5">
                      <ToneChip tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</ToneChip>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Mono size="meta" className="text-[var(--ink-muted)]">
                        {row.minutesLogged === null ? "—" : hoursOrDash(row.minutesLogged)}
                      </Mono>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {row.cents === null ? (
                        <span className="text-[var(--ink-faint)]">—</span>
                      ) : (
                        usdFromCents(row.cents)
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Mono size="meta" className="text-[var(--ink-muted)]">
                        {piastres === null ? "—" : egpFromPiastres(piastres)}
                      </Mono>
                    </td>
                    <td className="px-5 py-2.5">
                      <Mono size="meta" className="text-[var(--ink-faint)]">
                        {row.confirmedAt
                          ? `${timestamp(row.confirmedAt)} · ${row.confirmedByName ?? "an admin"}`
                          : row.state === "not tracked"
                            ? "before earnings were tracked"
                            : "not confirmed yet"}
                      </Mono>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <dl className="flex flex-col gap-2 border-t border-[var(--hairline)] px-5 py-4">
        {LEGEND.map((entry) => (
          <div key={entry.state} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <dt className="shrink-0">
              <ToneChip tone={STATE_TONE[entry.state]}>{STATE_LABEL[entry.state]}</ToneChip>
            </dt>
            <dd className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-[var(--ink-muted)]">
              {entry.body}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      scope="col"
      className={`px-5 py-2.5 font-normal ${align === "right" ? "text-right" : "text-left"}`}
    >
      <Mono size="eyebrow" className="text-[var(--ink-faint)]">
        {children}
      </Mono>
    </th>
  );
}
