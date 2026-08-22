import { redirect } from "next/navigation";

import { Rail } from "@/components/app/rail.client";
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
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            projects={projects}
            people={people}
            canCreate={profile.role === "admin" || profile.role === "lead"}
          />
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
