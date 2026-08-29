import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft } from "lucide-react";

import { PageShell } from "@/components/app/page-shell";
import { EarningsBoard } from "@/components/app/earnings-board.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { listSprintEarnings } from "@/lib/data/earnings";
import { refreshStoredRate } from "@/lib/exchange-rate";
import { createSnapshotClient, getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Team payouts" };

/**
 * What every sprint paid the team, and who agreed to it.
 *
 * ## Everyone internal reads it; only an admin confirms
 *
 * The team's own words, recorded in `docs/coditu-thread-and-earnings-prompt.md`
 * §E5 before any of this was built: *everyone sees everyone's, but not on any
 * screen that gets shared with a client.* That has not changed here, and the
 * design agrees with it — the prototype shows a non-admin the participants with
 * the checkboxes locked and `Admin only` as the reason. So this page has no
 * role guard, and `EarningsBoard` renders the confirmation controls only for an
 * admin. The refusal that matters is not the missing button: `sprint_payouts`'
 * insert policy is `auth_role() = 'admin'`, and `e2e/earnings.spec.ts` posts an
 * engineer's own token straight at PostgREST to prove it.
 *
 * ## Why it sits under `/app/settings` while `/app/settings` does not
 *
 * `/app/settings` redirects a non-admin to their profile; this child does not.
 * The asymmetry is deliberate and it is the path the design names. A lead or an
 * engineer reaches this from `/app/earnings`, which links to it for exactly
 * that reason — a screen somebody may read and cannot navigate to is a screen
 * they do not have.
 *
 * ## Why the rate refresh moved here too
 *
 * Both money screens render from the stored rate and both refresh it in
 * `after()`. Same reasoning as `/app/earnings`: the stored value is what is
 * rendered, the fetch only updates it, and it runs once the response is already
 * on the wire. `createSnapshotClient` because `after()` cannot read `cookies()`
 * — which production was failing silently for months.
 */
export default async function TeamPayoutsPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const { settings, sprints, nonParticipants } = await listSprintEarnings();

  const supabase = await createSnapshotClient();
  after(() => refreshStoredRate(supabase, settings));

  return (
    <PageShell measure="payouts">
      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          everyone on the team reads this · only an admin confirms one
        </Mono>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.022em]">Team payouts</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Every sprint, what it paid, who took a share and who did not. A confirmation is a record
          of an agreement — it is written once and never rewritten, and confirming again supersedes
          it rather than editing it.
        </p>
        <Mono size="meta" className="mt-2 block text-[var(--ink-faint)]">
          nothing here appears on a screen or an export a client sees
        </Mono>
      </Reveal>

      <Reveal tier="section" delay={0.06}>
        <EarningsBoard
          sprints={sprints}
          settings={settings}
          nonParticipants={Object.fromEntries(nonParticipants)}
          isAdmin={profile.role === "admin"}
          meId={profile.id}
        />
      </Reveal>

      <Reveal tier="section" delay={0.12}>
        <Link
          href="/app/earnings"
          className="inline-flex h-11 items-center gap-2 rounded-control px-4 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          My earnings
        </Link>
      </Reveal>
    </PageShell>
  );
}
