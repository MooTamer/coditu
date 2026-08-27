import { notFound } from "next/navigation";

import { CommentBody } from "@/components/app/comment-body";
import { PageEditor } from "@/components/app/page-editor.client";
import { RecordVisit } from "@/components/app/record-visit.client";
import { RevisionHistory } from "@/components/app/revision-history";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getPage, pageHref } from "@/lib/data/pages";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getPageRevisions } from "@/lib/data/revisions";
import { getAppSettings } from "@/lib/settings";
import { timestamp } from "@/lib/format";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * One page, whichever scope it belongs to.
 *
 * The workspace route and the project route are the same screen with a
 * different `projectId`, so they are one component. Two copies would be two
 * places for the version history to be wired up slightly differently, which is
 * exactly how a story's history and a note's history drifted apart before
 * `/app/history` merged them.
 *
 * ## The history is here, not on a second screen
 *
 * `PLAN.md` §11: *"Every story, sprint note, project note, acceptance criterion,
 * and comment should expose Version History."* Every one of them now does, at
 * the surface itself — a reader asking "what did this say last week" should not
 * have to leave the thing they are reading and filter a workspace-wide list
 * down to it.
 *
 * It is a Server Component with a `<details>` per entry, so the diffs are
 * computed here and arrive as markup: no JavaScript, keyboard-operable and
 * announced for free. `lib/diff.ts` and `lib/block-diff.ts` never reach the
 * browser.
 */
export async function PageSurface({
  projectId,
  projectSlug,
  slug,
}: {
  projectId: string | null;
  projectSlug: string | null;
  slug: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  // Scope and slug together. `/app/projects/other-client/pages/governance`
  // finds nothing rather than opening somebody else's page — the project is
  // re-derived from the row, never read off the address bar.
  const page = await getPage(projectId, slug);
  if (!page) notFound();

  const [people, settings, revisions] = await Promise.all([
    listActiveProfiles(),
    getAppSettings(),
    getPageRevisions(page.id),
  ]);

  const canEdit = profile.role === "admin" || profile.role === "lead";

  return (
    <main className="flex flex-1 flex-col gap-6 p-[var(--app-gutter)]">
      {/* Renders nothing. Puts this page in the sidebar's Recently opened after
          1.2s, so a mis-click that leaves immediately does not count as having
          opened it. */}
      <RecordVisit href={page.href} label={page.title} glyph="page" />

      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          {page.projectName ? `${page.projectName} · page` : "workspace page"}
          {page.publishedAt ? ` · published ${timestamp(page.publishedAt)}` : ""}
        </Mono>
      </Reveal>

      <Reveal tier="section" delay={0.06}>
        <PageEditor
          pageId={page.id}
          title={page.title}
          bodyDoc={page.bodyJson}
          body={<CommentBody doc={page.bodyJson} />}
          published={page.publishedAt !== null}
          canEdit={canEdit}
          people={people}
          maxImageBatch={settings.maxImageBatch}
          listHref={projectSlug ? `/app/projects/${projectSlug}/pages` : "/app/pages"}
        />
      </Reveal>

      <Reveal tier="section" delay={0.12}>
        <RevisionHistory
          entries={revisions}
          itemId={page.id}
          itemKey={page.slug}
          path={page.href}
          canRestore={canEdit}
        />
      </Reveal>
    </main>
  );
}

/** The title, for `generateMetadata`, without loading the body twice. */
export async function pageTitle(projectId: string | null, slug: string) {
  const page = await getPage(projectId, slug);
  return { title: page?.title ?? "Page", alternates: { canonical: pageHref(page?.projectSlug ?? null, slug) } };
}
