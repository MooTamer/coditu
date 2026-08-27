import { notFound } from "next/navigation";

import { ItemDetailBody } from "@/components/app/item-detail";
import { listFavouritedTargets } from "@/lib/data/favourites";
import { getWorkItemRevisions } from "@/lib/data/revisions";
import { ItemModal } from "@/components/app/item-modal.client";
import { todayInCairo } from "@/lib/data/sprint";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getProjectBySlug, listSprintsForProject } from "@/lib/data/projects";
import { getWorkItem } from "@/lib/data/work-item";
import { getAppSettings } from "@/lib/settings";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * The intercepted modal. Same body as the full page, wrapped in a dialog.
 */
export default async function InterceptedItemPage({
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
    <ItemModal
      itemKey={item.key}
      fullHref={`/app/projects/${slug}/sprints/${number}/items/${item.key}`}
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
    </ItemModal>
  );
}
