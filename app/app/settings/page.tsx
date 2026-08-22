import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, LogOut } from "lucide-react";

import { AvatarSettings } from "@/components/app/avatar-settings.client";
import { NameSettings } from "@/components/app/name-settings.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { signOut } from "@/lib/actions/auth";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

/**
 * Your profile: the two things about yourself you set, the two you do not, and
 * the way out.
 *
 * It used to edit a picture and nothing else, and — worse — **nothing anywhere
 * linked to it**. `grep -rn '/app/settings' app components lib` returned two
 * hits and both were `page.goto()` in a spec. The only way in was to type the
 * URL, which inside an installed PWA is not a thing you can do. It is reachable
 * from the account menu in the topbar and from the mobile navigation now.
 *
 * The boundary between this screen and People is the one `lib/actions/profiles.ts`
 * documents at length, and it is not blurred here: a name and a picture are how
 * a person presents themselves and they own both. Role, capacity and access are
 * decisions *about* a person, they are an admin's to make, and they are shown
 * here as facts with a pointer to where they are changed.
 */
export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">Settings</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Your profile, as the rest of the team sees it.
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.075}
        as="section"
        aria-labelledby="name"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="name" className="text-[16px] font-bold tracking-[-0.015em]">
            Your name
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            only you can change it
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          It is what appears on every item you are assigned, every hour you log and every comment
          you write. Your initials are derived from it, by the same rule that ran when the account
          was created — so a name corrected here and a name typed at sign-up agree.
        </p>

        <NameSettings fullName={profile.full_name} avatarUrl={profile.avatar_url} />
      </Reveal>

      <Reveal
        tier="section"
        delay={0.15}
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
        delay={0.225}
        as="section"
        aria-labelledby="account"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="account" className="text-[16px] font-bold tracking-[-0.015em]">
            Your account
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            an admin administers these
          </Mono>
        </div>

        {/* Facts, not fields. Rendering these as disabled inputs would have
            been the obvious thing and it would have been a lie — a disabled
            input reads as "not right now", and these are not yours to change
            at any time. Address and role live on People, with the rest of what
            an admin decides about a person. */}
        <dl className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <dt className="w-[92px] shrink-0">
              <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                Email
              </Mono>
            </dt>
            <dd className="min-w-0 break-all text-[14px]">{profile.email ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <dt className="w-[92px] shrink-0">
              <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                Role
              </Mono>
            </dt>
            <dd className="min-w-0 text-[14px]">{profile.role}</dd>
          </div>
        </dl>

        <p className="mt-4 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Your address and what you may do are set on People, where an admin decides who is on the
          team and what they hold.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-5">
          <Link
            href="/app/people"
            className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
          >
            Open People
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>

          {/* A real `<form>` with a Server Action, not an onClick. It is the one
              control on this page that has to work when nothing else does —
              including before hydration, which on a phone on a cold PWA launch
              is a real window. */}
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 rounded-control px-4 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
            >
              <LogOut size={14} strokeWidth={2} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </Reveal>
    </main>
  );
}
