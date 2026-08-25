import { notFound } from "next/navigation";

import { ClientAccessPanel } from "@/components/app/client-access-panel.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { listClientAccess } from "@/lib/data/client-access";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Clients" };

/**
 * Who outside the company can see our work, and what they can see.
 *
 * A section of its own rather than another panel on `/app/people`. People is
 * about the team — load, capacity, roles, who may sign up. This is about
 * somebody who does not work here, and the questions are different enough that
 * sharing a screen would make both worse: the email-and-note form on People
 * grants nothing, and this grants everything a client sees.
 *
 * A lead reads it; an admin changes it. That split is the same one the email
 * allowlist and role changes already use, and the reason is the same — a lead
 * runs delivery, and deciding what leaves the company is not a delivery
 * decision.
 */
export default async function ClientsPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  // An engineer has no business here. `notFound()` rather than a message: the
  // page is not a thing they are being refused, it is a thing that is not part
  // of their job, and the same answer the app gives for any other address that
  // does not resolve for them.
  if (profile.role === "engineer") notFound();

  const rows = await listClientAccess();
  const isAdmin = profile.role === "admin";

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.024em]">Clients</h1>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {isAdmin ? "access is yours to change" : "access is set by an admin"}
          </Mono>
        </div>
        <p className="mt-2 max-w-[72ch] text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">
          People at client companies who can sign in and see what has been published to them.
          Nothing is visible to them until a component is published with a summary written for
          them — access on its own shows an empty portal.
        </p>
      </Reveal>

      <Reveal tier="section" delay={0.06} as="section">
        <ClientAccessPanel rows={rows} isAdmin={isAdmin} />
      </Reveal>
    </main>
  );
}
