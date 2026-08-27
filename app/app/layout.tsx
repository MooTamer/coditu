import { redirect } from "next/navigation";

import { AppBadge } from "@/components/app/app-badge.client";
import { PresenceSurfaceProvider } from "@/components/app/presence-surface.client";
import { Rail } from "@/components/app/rail.client";
import { SaveStateProvider } from "@/components/app/save-state.client";
import { TabBar } from "@/components/app/tab-bar.client";
import { ToastProvider } from "@/components/app/toast.client";
import { Topbar } from "@/components/app/topbar.client";
import { listComponentsByProject } from "@/lib/data/components";
import { listFavourites } from "@/lib/data/favourites";
import { favouriteLinks } from "@/lib/favourites";
import { countUnreadNotifications } from "@/lib/data/notifications";
import { listActiveProfiles } from "@/lib/data/profiles";
import { listProjects } from "@/lib/data/projects";
import { getClientContact, getCurrentProfile } from "@/lib/supabase/server";

export const metadata = {
  title: { default: "Coditu", template: "%s · Coditu" },
  robots: { index: false, follow: false },
};

/**
 * The app shell.
 *
 * `middleware.ts` already turns anonymous traffic away, but this re-checks
 * server-side rather than trusting that it ran. A layout is not a gate you get
 * to assume — the middleware matcher is one regex edit away from missing a
 * route, and the cost of checking twice is one cached query.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  /**
   * `getCurrentProfile()` returns null for two very different people, and
   * sending both to `/login` was measurably wrong.
   *
   * A client contact is signed in. Her password works. Bouncing her to a
   * sign-in form tells her it does not, and she would sign in again and be
   * bounced again — a loop with no way out and nothing on screen explaining it.
   *
   * So the two cases are separated before the redirect is chosen. This costs
   * one query, and only on the path that was going to redirect anyway.
   *
   * Verified against the failure it fixes: before this branch existed, a client
   * account that reached `/app` rendered the **internal shell** — rail, topbar,
   * New-item control and all — and landed on `/app/projects`, empty only
   * because RLS returned no rows. An empty internal shell is still the internal
   * shell.
   */
  if (!profile) {
    const contact = await getClientContact();
    if (contact) redirect("/client");
    redirect("/login?next=/app");
  }

  /**
   * The forced password change, and **this is the gate that holds the line**.
   *
   * An admin has set a temporary password on this account, so it can be signed
   * in with but must not be used for anything else until its owner has chosen
   * one of their own. `middleware.ts` turns the same traffic away at the edge,
   * but it can only read what the auth server already told it and
   * `/auth/update-password` sits outside its matcher — so the authoritative
   * check is here, on the `profiles` column, server-side, exactly like every
   * other authorization decision in this app.
   */
  if (profile.must_set_password) redirect("/auth/update-password");

  const [projects, unreadCount, people, componentsByProject, favourites] = await Promise.all([
    listProjects(),
    countUnreadNotifications(),
    listActiveProfiles(),
    // The New item dialog lives in the topbar and can create into any open
    // sprint, so it needs every project's registry. One query, request-cached
    // like the rest of the shell's reads.
    listComponentsByProject(),
    // The sidebar's first section. One query, embedded three ways — see
    // `lib/data/favourites.ts` for why it is not three reads.
    listFavourites(profile.id),
  ]);

  // Resolved here rather than in the sidebar: a starred row becomes an address
  // by way of the project list, and doing that in a client component put
  // `lib/favourites` in the browser bundle and the shell's §5 total over.
  const favouriteTargets = favouriteLinks(favourites, projects);

  /**
   * The sidebar's registry row is a live count, and an archived component is
   * not in it — the registry page it links to does not list them either, so a
   * number that included them would be a promise the destination breaks.
   */
  const componentCounts = Object.fromEntries(
    Object.entries(componentsByProject).map(([projectId, components]) => [
      projectId,
      components.filter((component) => !component.isArchived).length,
    ])
  );

  return (
    <ToastProvider>
      {/* Two stores that wrap the whole shell, and neither re-renders it.
          Both are `useSyncExternalStore` behind a context whose value never
          changes — the lesson `presence-surface.client.tsx` wrote down after a
          provider re-render stranded a `useOptimistic` entry.

          `PresenceSurfaceProvider` is HERE rather than on the story, which is
          where it used to be. The topbar's presence caption has to be able to
          say "Adam is editing the description", and a provider nested inside
          the story is invisible to a topbar rendered above it. One store, read
          by both. */}
      <PresenceSurfaceProvider>
        <SaveStateProvider>
          <div className="flex min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
        <Rail
          me={{
            fullName: profile.full_name,
            initials: profile.initials,
            avatarUrl: profile.avatar_url,
          }}
          role={profile.role}
          unreadCount={unreadCount}
          projects={projects}
          componentCounts={componentCounts}
          favourites={favouriteTargets}
          // The header's `workspace · N members`. `people` is already read
          // above for the topbar's presence and mention lists, so this is a
          // length rather than a query.
          memberCount={people.length}
        />
        <div
          // Below `md` the bottom tab bar is FIXED, so it overlaps the content
          // — without this the last row of the table sits permanently behind
          // it and cannot be read or tapped. The inset is the home indicator's,
          // on top of the bar's own height.
          className="flex min-w-0 flex-1 flex-col pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] md:pb-0"
        >
          <Topbar
            projects={projects}
            people={people}
            componentsByProject={componentsByProject}
            canCreate={profile.role === "admin" || profile.role === "lead"}
            unreadCount={unreadCount}
            componentCounts={componentCounts}
            favourites={favouriteTargets}
            me={{
              id: profile.id,
              fullName: profile.full_name,
              initials: profile.initials,
              avatarUrl: profile.avatar_url,
              email: profile.email,
              role: profile.role,
            }}
          />
          {children}
        </div>

        <TabBar unreadCount={unreadCount} role={profile.role} />

        {/* Renders nothing. Puts the same unread count the rail draws its dot
            from onto the installed app's icon. */}
            <AppBadge unreadCount={unreadCount} />
          </div>
        </SaveStateProvider>
      </PresenceSurfaceProvider>
    </ToastProvider>
  );
}
