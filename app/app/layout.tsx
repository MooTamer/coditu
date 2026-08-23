import { redirect } from "next/navigation";

import { AppBadge } from "@/components/app/app-badge.client";
import { Rail } from "@/components/app/rail.client";
import { TabBar } from "@/components/app/tab-bar.client";
import { ToastProvider } from "@/components/app/toast.client";
import { Topbar } from "@/components/app/topbar.client";
import { countUnreadNotifications } from "@/lib/data/notifications";
import { listActiveProfiles } from "@/lib/data/profiles";
import { listProjects } from "@/lib/data/projects";
import { getCurrentProfile } from "@/lib/supabase/server";

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
  if (!profile) redirect("/login?next=/app");

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

  const [projects, unreadCount, people] = await Promise.all([
    listProjects(),
    countUnreadNotifications(),
    listActiveProfiles(),
  ]);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
        <Rail
          me={{
            fullName: profile.full_name,
            initials: profile.initials,
            avatarUrl: profile.avatar_url,
          }}
          role={profile.role}
          unreadCount={unreadCount}
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
            canCreate={profile.role === "admin" || profile.role === "lead"}
            me={{
              fullName: profile.full_name,
              initials: profile.initials,
              avatarUrl: profile.avatar_url,
              email: profile.email,
              role: profile.role,
            }}
          />
          {children}
        </div>

        <TabBar unreadCount={unreadCount} />

        {/* Renders nothing. Puts the same unread count the rail draws its dot
            from onto the installed app's icon. */}
        <AppBadge unreadCount={unreadCount} />
      </div>
    </ToastProvider>
  );
}
