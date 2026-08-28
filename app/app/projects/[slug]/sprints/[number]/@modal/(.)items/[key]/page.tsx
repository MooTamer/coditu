import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ItemDetailBody } from "@/components/app/item-detail";
import { listFavouritedTargets } from "@/lib/data/favourites";
import { getWorkItemRevisions } from "@/lib/data/revisions";
import { ItemModal } from "@/components/app/item-modal.client";
import { ItemPeekSkeleton } from "@/components/app/item-peek-skeleton";
import { todayInCairo } from "@/lib/data/sprint";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getProjectBySlug, listSprintsForProject } from "@/lib/data/projects";
import { getWorkItem } from "@/lib/data/work-item";
import { getAppSettings } from "@/lib/settings";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * The intercepted modal. Same body as the full page, wrapped in a dialog.
 *
 * ── PF-9: the frame does not wait for the story ────────────────────────────
 * This used to be one async component, so nothing at all rendered until every
 * query had answered — measured at a median **1607 ms on a production build**,
 * with `clickToReady` landing ~5 ms after first paint every time. The panel
 * appeared fully formed after a second and a half of nothing happening.
 *
 * The dialog's chrome needs no database: its label, its key, its close button
 * and its full-page link are all derivable from the URL. So the shell is
 * rendered here, immediately, and only the body — which really does have to
 * wait — sits inside a `Suspense`. Not a `loading.tsx`; see the note on
 * `ItemPeekSkeleton` for what that cost last time.
 *
 * `key` comes from the URL rather than from `item.key`, which is the point: the
 * old version could not name the item in the header without first fetching it.
 * The two agree — every link to this route is built from `item.key`.
 */
export default async function InterceptedItemPage({
  params,
}: {
  params: Promise<{ slug: string; number: string; key: string }>;
}) {
  const { slug, number, key } = await params;

  return (
    <ItemModal
      itemKey={key}
      fullHref={`/app/projects/${slug}/sprints/${number}/items/${key}`}
    >
      <Suspense fallback={<ItemPeekSkeleton />}>
        <PeekBody slug={slug} number={number} itemKey={key} />
      </Suspense>
    </ItemModal>
  );
}

/**
 * Everything that genuinely has to wait for the database.
 *
 * `notFound()` still lives in here. It answers 200 rather than 404 once the
 * shell has been flushed — which was ALREADY true of this route before this
 * change, because the sprint segment owns a `loading.tsx`; `docs/05-DECISIONS.md`
 * records that trade and `e2e/item-detail.spec.ts` asserts the `next-error`
 * marker and the rendered page rather than the status because of it.
 */
async function PeekBody({
  slug,
  number,
  itemKey: key,
}: {
  slug: string;
  number: string;
  itemKey: string;
}) {

  /**
   * Two rounds, not five.
   *
   * PF-9 measured this route at a median **2137 ms** from click to the dialog
   * existing — and it was five sequential database round trips, four of which
   * were waiting on something they did not need. `getWorkItem`,
   * `getCurrentProfile`, `listActiveProfiles`, `getAppSettings` and
   * `getProjectBySlug` share no inputs beyond the URL; only the second round
   * genuinely depends on the first (`sprints` on the project, `revisions` on
   * the item, `starred` on the profile).
   *
   * `notFound()` moves BELOW both rounds deliberately. Called between them it
   * would throw while the second `Promise.all` was still in flight, and an
   * unhandled rejection out of an abandoned promise is a server log nobody can
   * explain later.
   */
  const [item, profile, people, settings, project] = await Promise.all([
    getWorkItem(slug, Number(number), key),
    getCurrentProfile(),
    listActiveProfiles(),
    getAppSettings(),
    getProjectBySlug(slug),
  ]);
  if (!item) notFound();
  if (!profile) notFound();

  // Ticking, and — since 2026-08-25 — saying what the box says. The same set
  // either way: an admin, a lead, or the person doing or reviewing the work.
  const involved = item.assignee?.id === profile.id || item.reviewer?.id === profile.id;
  const canToggle = profile.role !== "engineer" || involved;
  const canManage = profile.role === "admin" || profile.role === "lead";

  // Round two: the three that genuinely needed round one. `sprints` is every
  // sprint on THIS project, for the move control — invariant 1, an item cannot
  // leave its project, so the list it can move within is its project's.
  const [sprints, revisions, starred] = await Promise.all([
    project ? listSprintsForProject(project.id) : Promise.resolve([]),
    getWorkItemRevisions(item.id),
    listFavouritedTargets(profile.id),
  ]);

  return (
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
  );
}
