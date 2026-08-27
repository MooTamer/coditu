import { notFound } from "next/navigation";

import { NewPage } from "@/components/app/new-page.client";
import { PageList } from "@/components/app/page-list";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { listPages } from "@/lib/data/pages";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Pages" };

/**
 * Workspace pages — the sixth writing surface, and the only one that belongs to
 * nobody's project.
 *
 * `PLAN.md` §3 lists *"Standalone workspace notes/pages"* among the surfaces the
 * one universal editor has to cover, and the returned prototype's command
 * palette offers `new note` as a first-class thing to make. Neither existed:
 * `new note` in the prototype navigates to **sprint** notes, which is a
 * different document belonging to a different scope.
 *
 * ## Global, and that does not break invariant 1
 *
 * `CLAUDE.md`'s first invariant is about **work items** — nothing global, no
 * query or export returning an item outside the active project's scope. A page
 * is not a work item: it is never exported, never in a sprint report, never in
 * a CSV, and never reachable by a client account, because `is_active_member()`
 * is the whole read predicate on `pages` and it is false for a client contact.
 * The migration states this at length.
 *
 * ## Who writes one
 *
 * Admin or lead, matching sprint notes and matching the returned prototype's
 * own data, where every page is authored by Mohamed (admin) or Adam (lead).
 * Whether an engineer should be able to start one is an open question the
 * handoff itself raises, and it is recorded in `05-DECISIONS.md` for Mohamed
 * rather than answered here.
 */
export default async function WorkspacePagesPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const pages = await listPages(null);
  const canCreate = profile.role === "admin" || profile.role === "lead";

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          the workspace&rsquo;s own writing · never client-visible
        </Mono>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.022em]">Pages</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Notes that belong to the team rather than to a project — conventions, runbooks, whatever
          needs writing down. Same editor as a story, same version history, same bin.
        </p>
      </Reveal>

      <Reveal tier="section" delay={0.06}>
        <NewPage projectId={null} canCreate={canCreate} />
      </Reveal>

      <Reveal tier="section" delay={0.12}>
        <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-2">
          <PageList
            pages={pages}
            empty={
              canCreate
                ? "No pages yet. Start one above."
                : "No pages yet. An admin or lead can start one."
            }
          />
        </div>
      </Reveal>
    </main>
  );
}
