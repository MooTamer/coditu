import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { ClientNav } from "@/components/client/client-nav.client";
import { CoditusLockup, CoditusMark } from "@/components/coditu/coditus-mark";
import { signOut } from "@/lib/actions/auth";
import { listClientThreads } from "@/lib/data/client-threads";
import { getClientContact, getCurrentProfile } from "@/lib/supabase/server";

export const metadata = {
  title: { default: "Coditu", template: "%s · Coditu" },
  robots: { index: false, follow: false },
};

/**
 * The client portal's shell — and the point of it is what it does NOT do.
 *
 * `app/app/layout.tsx` fetches four things before it renders a pixel: every
 * project, every active profile, every project's component registry, and an
 * unread count. That is correct for a person who can see all of it, and it is
 * the reason this is a separate tree rather than a flag on that one. Hiding a
 * project switcher with CSS still ships the projects in the RSC payload, and
 * the internal shell was already measured at 116.2KB against a 110KB budget
 * before any of this — see `docs/06-PROGRESS.md`.
 *
 * So this layout reads exactly one row: who is asking. Everything else is
 * fetched per page, per capability, through the `client_*` RPCs.
 *
 * ── The gate ───────────────────────────────────────────────────────────────
 *
 * `middleware.ts` answers "is there a session" and nothing else. This answers
 * "is this a client contact", server-side, from the database, on every request
 * — which is what makes revocation immediate. Nothing is read from a JWT claim
 * or from `app_metadata`, because a claim goes stale and a revoked contact
 * would keep getting in until her token refreshed.
 *
 * An INTERNAL account that lands here is sent to `/app`, the mirror image of
 * the branch in the app shell. Neither redirect is a refusal: both are people
 * at the wrong door, and a sign-in form would be a lie to either of them.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const contact = await getClientContact();

  if (!contact) {
    const internal = await getCurrentProfile();
    if (internal) redirect("/app");
    redirect("/login?next=/client");
  }

  /**
   * The one number the shell fetches, and it earns its place: how many
   * questions are waiting on her. It is the reason to come back, so it belongs
   * where she can see it without navigating.
   *
   * Still one query, and still scoped by `can_read_client_thread()` — this is
   * not the internal shell's four eager reads arriving by another name.
   */
  const threads = await listClientThreads();
  const waiting = threads.filter((thread) => thread.state === "waiting_client").length;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--canvas)] text-[var(--ink)]">
      <header className="sticky top-0 z-10 flex h-[var(--topbar-h)] items-center gap-3 border-b border-[var(--hairline)] bg-[var(--canvas)]/92 px-[var(--app-gutter)] backdrop-blur-sm">
        {/* The wordmark yields first. At 390px the row is the lockup, two nav
            items and Sign out, and something has to give — "Sign out" wrapping
            onto two lines is the worst candidate, because it is the only
            control here that a person actually needs to find. The mark alone
            still says whose product this is. */}
        <CoditusLockup markSize={22} className="hidden sm:inline-flex" />
        <CoditusMark size={22} className="sm:hidden" />

        <ClientNav waiting={waiting} />

        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-3">
          <span className="hidden min-w-0 truncate text-[13.5px] text-[var(--ink-muted)] lg:inline">
            {contact.full_name}
          </span>

          {/* A form, not a link: signing out is a mutation, and it must not be
              something a prefetch or a link-preview can trigger. */}
          <form action={signOut}>
            {/* Icon-only below `sm`, and this is the second attempt.
                Hiding the wordmark alone was not enough at 320px: the label
                was CLIPPED rather than wrapped — no scrollbar, no scroll, just
                a control that could not be read or reliably hit. That is the
                same failure the topbar hit in step 7 and it is worth naming,
                because `overflow-x` reports nothing when `overflow-x-clip` is
                doing the hiding. The accessible name stays "Sign out" at every
                width, and the target stays 44px. */}
            <button
              type="submit"
              aria-label="Sign out"
              className="inline-flex h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-control px-3 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--ui-hover)] hover:text-[var(--ink)]"
            >
              <LogOut size={16} strokeWidth={2} aria-hidden className="sm:hidden" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </header>

      {/* The bottom inset is the home indicator's. There is no fixed tab bar
          here — the portal is shallow enough that one back gesture is the whole
          navigation model, and a bar that is mostly empty is furniture. */}
      <div className="flex min-w-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">{children}</div>
    </div>
  );
}
