import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowRight } from "lucide-react";

import { PageShell } from "@/components/app/page-shell";
import { MyEarnings } from "@/components/app/my-earnings";
import { MyEarningsHistory } from "@/components/app/my-earnings-history";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getMyEarnings, listMyEarningsHistory } from "@/lib/data/earnings";
import { refreshStoredRate } from "@/lib/exchange-rate";
import { createSnapshotClient, getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "My earnings" };

/**
 * Your own money, and nobody else's.
 *
 * **This is one of exactly three screens where money may appear** — the others
 * are `/app/settings/payouts`, which is the team's, and `/app/settings`, which
 * carries the rate that produces both. Nothing under `/app/projects/**`
 * renders a figure, and neither does any export or the client portal: those are
 * the screens that get shared, and a leak there costs a relationship.
 * `tests/earnings-boundary.test.ts` asserts it two ways — a denylist over every
 * shared surface, and an allowlist over the whole application, so a screen
 * added next year is covered without anybody remembering it.
 *
 * It is deliberately **not** linked from the top bar or the desktop rail. It
 * lives in the account menu and the phone's "More" sheet, where a shared screen
 * does not advertise it.
 *
 * ## Why Team payouts is linked from here
 *
 * The design reaches `/app/settings/payouts` from Workspace settings, and
 * Workspace settings is an admin's screen that redirects everybody else. Every
 * active internal member may **read** the team's payouts — that is the team's
 * own rule, recorded in `docs/coditu-thread-and-earnings-prompt.md` §E5 — so
 * without a link here a lead or an engineer would have a screen they are
 * allowed to read and no route to it. Only confirming is an admin's, and RLS
 * is what enforces that.
 *
 * ## Why the rate refresh is in `after()`
 *
 * The page renders from `app_settings.usd_egp_rate_micros` — the stored value
 * is the source of truth for rendering, always. The fetch only ever *updates*
 * it, and it happens once the response is already on the wire, so a slow or
 * dead provider changes nothing except the "as of" line on somebody's next
 * visit. `after()` rather than a floating promise for the reason `postComment`
 * documents: a promise left running when a response is sent can be killed the
 * moment it is, which works on every machine you test it on and not on Vercel.
 */
export default async function EarningsPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  // Both read `listSprintEarnings()` through React's per-request `cache`, so
  // this is two views of one query rather than two queries.
  const [mine, history] = await Promise.all([getMyEarnings(), listMyEarningsHistory()]);

  // Both arguments are prepared HERE, on the request, and the callback only
  // uses them. `after()` may not touch `cookies()`, so a client built the
  // ordinary way — or a second read of the settings row — throws inside it and
  // takes the refresh with it. That is not hypothetical: it is what production
  // was doing, silently, on every visit to this page.
  const supabase = await createSnapshotClient();
  if (mine) after(() => refreshStoredRate(supabase, mine.settings));

  return (
    <PageShell measure="earnings">
      <Reveal tier="section" as="header">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">My earnings</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          What this sprint is provisionally worth to you, what was last confirmed, and the
          arithmetic behind both.
        </p>
        <Mono size="meta" className="mt-2 block text-[var(--ink-faint)]">
          nothing here appears on a screen or an export a client sees
        </Mono>
      </Reveal>

      {mine ? (
        <Reveal tier="section" delay={0.06}>
          <MyEarnings
            isDeveloper={mine.isDeveloper}
            current={mine.current}
            lastConfirmed={mine.lastConfirmed}
            settings={mine.settings}
          />
        </Reveal>
      ) : null}

      <Reveal tier="section" delay={0.12}>
        <MyEarningsHistory rows={history} rateMicros={mine?.settings.usdEgpRateMicros ?? null} />
      </Reveal>

      <Reveal tier="section" delay={0.18}>
        <Link
          href="/app/settings/payouts"
          className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
        >
          Team payouts
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
        <Mono size="meta" className="mt-2 block text-[var(--ink-faint)]">
          everyone on the team reads it · only an admin confirms one
        </Mono>
      </Reveal>
    </PageShell>
  );
}
