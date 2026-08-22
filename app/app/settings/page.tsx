import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { AvatarSettings } from "@/components/app/avatar-settings.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

/**
 * Who you are signed in as, the one thing about yourself you set, and where the
 * things that used to be here went.
 *
 * Your picture is here rather than on People because it is the only part of a
 * profile its owner owns. Role, capacity and access are administered by an
 * admin on People — deciding who may sign up, what they hold and whether they
 * still have access is one job, and it is not this one.
 */
export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

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
        aria-labelledby="picture"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="picture" className="text-[16px] font-bold tracking-[-0.015em]">
            Your picture
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            only you can change it
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          It appears everywhere you do — the sprint board, the table, the team header, and beside
          every comment you write. Without one, your initials are shown instead.
        </p>

        <AvatarSettings
          me={{
            fullName: profile.full_name,
            initials: profile.initials,
            avatarUrl: profile.avatar_url,
          }}
        />
      </Reveal>

      <Reveal
        tier="section"
        delay={0.15}
        as="section"
        aria-labelledby="access"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="access" className="text-[16px] font-bold tracking-[-0.015em]">
            Team and access
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            moved to People
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Roles, deactivation, and the sign-up allowlist all live on People now — one screen for
          who is on the team and what they may do.
        </p>

        <Link
          href="/app/people"
          className="mt-4 inline-flex h-[38px] items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
        >
          Open People
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </Reveal>
    </main>
  );
}
