import { notFound } from "next/navigation";
import { after } from "next/server";

import { EarningsBoard } from "@/components/app/earnings-board.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { refreshExchangeRate } from "@/lib/actions/earnings";
import { listSprintEarnings } from "@/lib/data/earnings";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Earnings" };

/**
 * What every sprint pays, and what has been agreed.
 *
 * **This is one of exactly two screens where money may appear** — the other is
 * `/app/settings`. Nothing under `/app/projects/**` renders a figure, and
 * neither does any export: those are the screens that get shared with a client,
 * and a leak there costs a relationship. `e2e/earnings.spec.ts` asserts it two
 * ways, once against the rendered markup of every shared screen and once as a
 * source-level grep, because a rendered assertion proves today and the grep
 * proves the next person cannot add it by accident.
 *
 * It is deliberately **not** linked from the top bar or the desktop rail. It
 * lives in the account menu and the mobile "More" sheet, where a shared screen
 * does not advertise it.
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

  const { settings, sprints, nonParticipants } = await listSprintEarnings();

  after(() => refreshExchangeRate());

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">Earnings</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Every sprint, what it paid, and who agreed to it. Everyone can read this;
          only an admin can confirm a distribution.
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
    </main>
  );
}
