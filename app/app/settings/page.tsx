import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { AdminSettings } from "@/components/app/admin-settings.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { listTeam } from "@/lib/data/profiles";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getAppSettings } from "@/lib/settings";

export const metadata = { title: "Workspace settings" };

/**
 * Every number this app makes a decision with, and where the rest of the admin
 * work lives.
 *
 * ## What left, and where it went
 *
 * This page was 344 lines and two screens: your name, your picture, your
 * notifications and your account facts at the top; the workspace's rate,
 * threshold and image caps underneath. They shared a URL and nothing else —
 * different owner, different audience, different frequency. `/app/profile` has
 * the first half now.
 *
 * **A non-admin is redirected there rather than shown a refusal.** That is the
 * opposite of the call W9 made about the three self-controls on People, and
 * deliberately: those are controls *on your own row* that you can see the
 * consequence of, so hiding them taught nothing and disabling them with a
 * reason taught the rule. This is a whole route with nothing on it for you,
 * reached from a bookmark that used to be your profile. Sending somebody to
 * the page they were actually looking for beats a 404 or a locked door — and
 * `docs/05-DECISIONS.md` records it.
 *
 * ## Why the links at the bottom are links and not sections
 *
 * The design's Workspace settings gathers `Access and recovery` as three rows
 * that open elsewhere. Same here: People & Access and Trash are real screens
 * with their own permissions, and a settings page that reimplemented a corner
 * of each would be a fourth place for those rules to drift.
 */
export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Not `notFound()`. See the note above: this URL was somebody's profile
  // until today, and the profile is one redirect away.
  if (profile.role !== "admin") redirect("/app/profile");

  const [settings, team] = await Promise.all([getAppSettings(), listTeam()]);

  // Every sprint, newest first, for the effective-from picker. Read here rather
  // than in the client component so the picker is server-rendered with the
  // rest of the page.
  const supabase = await createClient();
  const { data: sprintRows } = await supabase
    .from("sprints")
    .select("id, name, starts_on, projects!inner ( name )")
    .order("starts_on", { ascending: false, nullsFirst: false });

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          admin only · nothing here is per-person
        </Mono>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.022em]">Workspace settings</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Every number this app makes a decision with, in one place, with what it affects. None of
          them is a constant in the source — a rate that needs a deploy to change is a rate nobody
          changes.
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.075}
        as="section"
        aria-labelledby="tunables"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="tunables" className="text-[16px] font-bold tracking-[-0.015em]">
            Rates, limits and capacity
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            one row · applies workspace-wide
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          A change to the rate or the threshold affects the <strong>next</strong> confirmation and
          nothing that has already been agreed. Confirmed payouts carry their own copy of both, and
          cannot be rewritten.
        </p>

        <div className="mt-5">
          <AdminSettings
            settings={settings}
            sprints={(sprintRows ?? []).map((sprint) => ({
              id: sprint.id,
              label: `${sprint.projects?.name ?? "—"} · ${sprint.name}`,
            }))}
            developers={team.map((person) => ({
              id: person.id,
              fullName: person.fullName,
              isDeveloper: person.isDeveloper,
              isActive: person.isActive,
            }))}
          />
        </div>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.15}
        as="section"
        aria-labelledby="elsewhere"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="elsewhere" className="text-[16px] font-bold tracking-[-0.015em]">
            Earnings, access and recovery
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            each one has its own rules
          </Mono>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <SettingsLink
            href="/app/settings/payouts"
            label="Team payouts"
            hint="Participants, exclusions, and the confirmation that turns a provisional figure into a record. Everyone on the team reads it; only an admin confirms one."
          />
          <SettingsLink
            href="/app/people"
            label="People &amp; Access"
            hint="Roles, who can sign up, client contacts and the access history."
          />
          <SettingsLink
            href="/app/clients"
            label="Clients"
            hint="Which client contact exists, and what each of them may see."
          />
          <SettingsLink
            href="/app/settings/recovery"
            label="Backup &amp; recovery"
            hint="Whether the work could actually be got back, and when anybody last checked. A rehearsal copies into an isolated schema and writes nothing back."
          />
          <SettingsLink
            href="/app/trash"
            label="Trash"
            hint="Recoverable stories, comments and documents. Emptying it is the one thing here that cannot be undone."
          />
        </div>
      </Reveal>
    </main>
  );
}

function SettingsLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control border border-[var(--hairline)] px-4 py-2.5 hover:bg-[var(--canvas)]"
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-[12.5px] leading-[1.5] text-[var(--ink-muted)]">{hint}</span>
      </span>
      <ArrowRight size={14} strokeWidth={2} aria-hidden className="shrink-0" />
    </Link>
  );
}
