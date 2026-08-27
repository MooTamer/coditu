import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { PageShell } from "@/components/app/page-shell";
import { AppearanceSettings } from "@/components/app/appearance-settings.client";
import { AvatarSettings } from "@/components/app/avatar-settings.client";
import { NameSettings } from "@/components/app/name-settings.client";
import { PersonAvatar } from "@/components/app/person-avatar";
import { PushSettings } from "@/components/app/push-settings.client";
import { SecuritySettings } from "@/components/app/security-settings.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { signOut } from "@/lib/actions/auth";
import { ROLE_LABEL, ROLE_SUMMARY, type Role } from "@/lib/roles";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Profile" };

/**
 * You, as this workspace holds you.
 *
 * ## Why this route exists
 *
 * `/app/settings` used to be two screens wearing one URL: your name and your
 * picture at the top, the workspace's hourly rate and image caps underneath.
 * They are not the same kind of thing and they do not have the same audience —
 * one is yours and everybody has one, the other is an admin's and most people
 * cannot change a single row of it. The design splits them and so does this:
 * `/app/profile` is yours, `/app/settings` is the workspace's.
 *
 * The old URL is not broken. A non-admin who opens `/app/settings` — from a
 * bookmark, or from the installed app's history — is redirected here, because
 * this is where the thing they were looking for went.
 *
 * ## The four sections, and the one that is not the design's
 *
 * Identity, Appearance, Notifications, Security. The prototype's Notifications
 * section is four per-account switches — mentions, review requested, assigned
 * to me, a daily digest. **This app has nowhere to store any of them.** A push
 * subscription belongs to a browser, `push_subscriptions` is keyed by
 * endpoint, and there is no per-person preference row anywhere in the schema.
 * Rendering four switches over `useState` would produce controls that forget
 * every answer on reload, which is worse than not offering them — the same
 * call W6d made about project spaces and W9 made about an invitations state
 * machine, and recorded rather than quietly made.
 *
 * So Notifications is the per-device subscription that genuinely exists, and
 * says that is what it is.
 */
export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const role = profile.role as Role;

  return (
    <PageShell measure="profile">
      {/* `data-identity` so a spec can scope to this surface rather than to the
          whole page — `07-FIELD-NOTES.md` records why that matters.

          On the `<header>` and not on `<Reveal as="header">`: `Reveal` takes an
          explicit prop list and forwards nothing it has not declared, and
          TypeScript does not check a JSX attribute whose name is not a valid
          identifier. `data-identity` passed to it compiles, type-checks, and
          reaches no element at all. The comment on `RevealProps` says so; this
          is the second time that has been worth reading. */}
      <header data-identity>
        <Reveal tier="section" className="flex flex-wrap items-center gap-4">
          <PersonAvatar
            person={{
              fullName: profile.full_name,
              initials: profile.initials,
              avatarUrl: profile.avatar_url,
            }}
            size={56}
            fontSize={18}
          />
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold tracking-[-0.022em]">
              {profile.full_name}
            </h1>
            <p className="mt-0.5 break-all text-[13.5px] text-[var(--ink-muted)]">
              {profile.email ?? "—"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-chip bg-[var(--tone-slate-bg)] px-2 py-[3px] text-[11.5px] font-semibold text-[var(--tone-slate-fg)]">
                {ROLE_LABEL[role] ?? profile.role}
              </span>
              <Mono size="meta" className="text-[var(--ink-faint)]">
                {ROLE_SUMMARY[role] ?? "—"}
              </Mono>
            </div>
          </div>
        </Reveal>
      </header>

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
          It is what appears on every item you are assigned, every hour you log
          and every comment you write. Your initials are derived from it, by the
          same rule that ran when the account was created — so a name corrected
          here and a name typed at sign-up agree.
        </p>

        <NameSettings
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
        />
      </Reveal>

      <Reveal
        tier="section"
        delay={0.15}
        as="section"
        aria-labelledby="picture"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2
            id="picture"
            className="text-[16px] font-bold tracking-[-0.015em]"
          >
            Your picture
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            only you can change it
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          It appears everywhere you do — the sprint board, the table, the team
          header, and beside every comment you write. Without one, your initials
          are shown instead.
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
        delay={0.2}
        as="section"
        aria-labelledby="appearance"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2
            id="appearance"
            className="text-[16px] font-bold tracking-[-0.015em]"
          >
            Appearance
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            per browser
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Cool paper is what this app opens in. The same choice is one click
          away in the top bar on every screen — this is where it says which one
          you are in, rather than only offering you the other.
        </p>

        <AppearanceSettings />
      </Reveal>

      <Reveal
        tier="section"
        delay={0.25}
        as="section"
        aria-labelledby="notifications"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2
            id="notifications"
            className="text-[16px] font-bold tracking-[-0.015em]"
          >
            Notifications
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            per device
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Being mentioned in a comment reaches your phone or your desktop, not
          just the dot on My work. Turned on per device, because a subscription
          belongs to the browser it was made in — your laptop and your phone are
          two separate answers. There is nothing to choose between: a mention is
          the only thing this app sends.
        </p>

        <PushSettings />
      </Reveal>

      <Reveal
        tier="section"
        delay={0.3}
        as="section"
        aria-labelledby="security"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2
            id="security"
            className="text-[16px] font-bold tracking-[-0.015em]"
          >
            Security
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            no email recovery in this app
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Coditu sends no mail, so there is no reset link — if you are locked
          out, an admin issues a temporary password and you set your own on the
          way back in. Which is also why signing a forgotten device out is worth
          having here.
        </p>

        <SecuritySettings />
      </Reveal>

      <Reveal
        tier="section"
        delay={0.35}
        as="section"
        aria-labelledby="private"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2
            id="private"
            className="text-[16px] font-bold tracking-[-0.015em]"
          >
            Private to you
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            never on a screen a client sees
          </Mono>
        </div>

        {/* No figure here, deliberately. This screen is not one of the two that
            may carry money — `tests/earnings-boundary.test.ts` walks every file
            in the app and would name this one the moment it imported a read. */}
        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          What each sprint has paid you, what is still provisional, and the
          arithmetic behind both. It appears on no project page, no sprint
          screen, no export, no report and nowhere in the client portal.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-5">
          <Link
            href="/app/earnings"
            className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
          >
            My earnings
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>

          <Link
            href="/app/people"
            className="inline-flex h-11 items-center gap-2 rounded-control px-4 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            Your role and access are set on People
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
              Sign out
            </button>
          </form>
        </div>
      </Reveal>
    </PageShell>
  );
}
