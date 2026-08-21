import { notFound } from "next/navigation";

import { AllowlistPanel } from "@/components/app/allowlist-panel.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getAllowlist } from "@/lib/data/allowlist";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const isAdmin = profile.role === "admin";
  const allowlist = isAdmin ? await getAllowlist() : [];

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">Settings</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          You are signed in as {profile.full_name} ({profile.email}) — {profile.role}.
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.075}
        as="section"
        aria-labelledby="allowlist"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="allowlist" className="text-[16px] font-bold tracking-[-0.015em]">
            Who can sign up
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {isAdmin ? `${allowlist.length} invited` : "admin only"}
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Coditu is invite-only. An address has to be on this list before anyone can create an account
          with it — enforced by a trigger on the user table, so it holds no matter what a form sends.
          Anyone else who tries is told they are not authorized.
        </p>

        <div className="mt-5">
          {isAdmin ? (
            <AllowlistPanel rows={allowlist} />
          ) : (
            // Present and explained, never hidden. A control that disappears
            // reads as a bug; one that says why reads as an answer.
            <p className="text-[13.5px] text-[var(--ink-muted)]">
              Only an admin can invite people. Ask one of them to add the address.
            </p>
          )}
        </div>
      </Reveal>
    </main>
  );
}
