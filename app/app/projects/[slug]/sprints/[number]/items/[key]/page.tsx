import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageShell } from "@/components/app/page-shell";
import { ItemDetailBody } from "@/components/app/item-detail";
import { BackToPeek } from "@/components/app/back-to-peek.client";
import { ItemRealtime } from "@/components/app/realtime.client";
import { RecordVisit } from "@/components/app/record-visit.client";
import { listFavouritedTargets } from "@/lib/data/favourites";
import { getWorkItemRevisions } from "@/lib/data/revisions";
import { Mono } from "@/components/coditu/mono";
import { StatusChipDot } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { todayInCairo } from "@/lib/data/sprint";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getProjectBySlug, listSprintsForProject } from "@/lib/data/projects";
import { getWorkItem } from "@/lib/data/work-item";
import { getAppSettings } from "@/lib/settings";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string; key: string }>;
}) {
  const { slug, number, key } = await params;
  const item = await getWorkItem(slug, Number(number), key);
  return { title: item ? `${item.key} — ${item.title}` : "Item" };
}

/**
 * The full page. Reached by a hard navigation, a shared link, or a refresh —
 * the same URL the modal shows, rendering the same body with a real heading and
 * a way back to the sprint.
 */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ slug: string; number: string; key: string }>;
}) {
  const { slug, number, key } = await params;
  const item = await getWorkItem(slug, Number(number), key);
  if (!item) notFound();

  const [profile, people, settings] = await Promise.all([
    getCurrentProfile(),
    listActiveProfiles(),
    getAppSettings(),
  ]);
  if (!profile) notFound();

  // Ticking, and — since 2026-08-25 — saying what the box says. The same set
  // either way: an admin, a lead, or the person doing or reviewing the work.
  const involved = item.assignee?.id === profile.id || item.reviewer?.id === profile.id;
  const canToggle = profile.role !== "engineer" || involved;
  const canManage = profile.role === "admin" || profile.role === "lead";

  // Every sprint on THIS project, for the move control. Invariant 1: an item
  // cannot leave its project, so the list it can move within is its project's.
  const project = await getProjectBySlug(slug);
  const sprints = project ? await listSprintsForProject(project.id) : [];

  const [revisions, starred] = await Promise.all([
    getWorkItemRevisions(item.id),
    listFavouritedTargets(profile.id),
  ]);

  return (
    <PageShell measure="story">
      {/* The sprint is not rendered underneath this one, so nothing else is
          listening for the story changing. The modal does not need it. */}
      <ItemRealtime workItemId={item.id} />
      <RecordVisit
        href={`/app/projects/${slug}/sprints/${number}/items/${item.key}`}
        label={`${item.key} ${item.title}`}
        glyph="COD"
      />
      <Reveal tier="section" as="header" className="flex flex-wrap items-center gap-3">
        <Link
          href={`/app/projects/${slug}/sprints/${number}`}
          className="flex min-h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-3 text-[13.5px] hover:bg-[var(--raised)]"
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          {item.sprint.name}
        </Link>

        {/* The prototype's second `toggleFull` label. Not a link: the peek and
            this page are the SAME URL, so getting back into the peek means
            being on the sprint first. See `back-to-peek.client.tsx`. */}
        <BackToPeek
          itemHref={`/app/projects/${slug}/sprints/${number}/items/${item.key}`}
          className="hidden min-h-11 items-center gap-2 rounded-control border border-[var(--hairline)] px-3 text-[13px] text-[var(--ink-muted)] hover:bg-[var(--raised)] hover:text-[var(--ink)] disabled:opacity-60 md:inline-flex"
        />
        <Mono size="key" className="text-[var(--accent)]">
          {item.key}
        </Mono>
        <StatusChipDot status={item.status} />
        <Mono size="meta" className="text-[var(--ink-faint)]">
          {item.project.clientName} · {item.project.name}
        </Mono>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.06}
        className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--overlay)]"
      >
        <ItemDetailBody
          item={item}
          today={todayInCairo()}
          canToggleCriteria={canToggle}
          canEditCriteriaBody={canManage || involved}
          canManage={canManage}
          sprints={sprints.map((sprint) => ({
            id: sprint.id,
            number: sprint.number,
            name: sprint.name,
            status: sprint.status,
          }))}
          people={people}
          revisions={revisions}
          starred={starred.has(item.id)}
          maxImageBatch={settings.maxImageBatch}
          me={{
            id: profile.id,
            fullName: profile.full_name,
            initials: profile.initials,
            avatarUrl: profile.avatar_url,
            role: profile.role,
          }}
        />
      </Reveal>
    </PageShell>
  );
}
