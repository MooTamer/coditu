import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/app/page-shell";
import { CommentBody } from "@/components/app/comment-body";
import { RecordVisit } from "@/components/app/record-visit.client";
import { RevisionHistory } from "@/components/app/revision-history";
import { SprintNotes } from "@/components/app/sprint-notes.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { documentFromText } from "@/lib/blocks/schema";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getSprintRevisions } from "@/lib/data/revisions";
import { getProjectBySlug } from "@/lib/data/projects";
import { getSprint } from "@/lib/data/sprint";
import { calendarDate } from "@/lib/format";
import { getAppSettings } from "@/lib/settings";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { number } = await params;
  return { title: `Sprint ${number} notes` };
}

/**
 * Sprint notes, on their own page, with their own history.
 *
 * ## This route was already being linked to, and it did not exist
 *
 * `lib/data/revisions.ts` has built
 * `/app/projects/{slug}/sprints/{number}/notes` as the target of every
 * sprint-note revision since `/app/history` was written. There was no such
 * route: every one of those rows linked to a 404, on the workspace's own
 * version-history screen. Found by this audit reading the target builder
 * against `find app -name page.tsx`.
 *
 * ## And it is where Version History belongs
 *
 * The reopened audit asks to *"expose Version History directly from Sprint
 * Notes"*. The notes live inside the sprint header, in a collapsible panel
 * beside a burn-down chart and a filter bar — there is no room there for a
 * timeline, and putting one in would push the table below the fold on the
 * screen the team spends its day on. So the panel stays where it is and gains a
 * link, and the link lands here: the same editor, the same publish, and the
 * whole history underneath it.
 *
 * `/app/sprint/notes` is an entrance to this, the way `/app/sprint` is an
 * entrance to the sprint — the handoff's navigation hierarchy names the flat
 * route and this application's canonical URL is scoped, because invariant 1
 * lives in the URL.
 */
export default async function SprintNotesPage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const [{ slug, number }, profile] = await Promise.all([params, getCurrentProfile()]);
  if (!profile) notFound();

  const sprintNumber = Number(number);
  if (!Number.isInteger(sprintNumber) || sprintNumber <= 0) notFound();

  // The project first, then the sprint inside it. `getSprint` takes a project
  // id, not a slug — invariant 1 in the read path: a sprint is found *within* a
  // project a reader can see, never by number alone.
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const sprint = await getSprint(project.id, sprintNumber);
  if (!sprint) notFound();

  const [people, settings, revisions] = await Promise.all([
    listActiveProfiles(),
    getAppSettings(),
    getSprintRevisions(sprint.id),
  ]);

  const canEdit = profile.role === "admin" || profile.role === "lead";
  const sprintPath = `/app/projects/${slug}/sprints/${sprintNumber}`;

  return (
    <PageShell measure="notes" innerClassName="gap-6">
      <RecordVisit
        href={`${sprintPath}/notes`}
        label={`Sprint notes — ${sprint.name}`}
        glyph="note"
      />

      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          {sprint.name}
          {sprint.notesWrittenOn ? ` · written ${calendarDate(sprint.notesWrittenOn)}` : ""}
        </Mono>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.022em]">Sprint notes</h1>
        <p className="mt-2">
          <Link
            href={sprintPath}
            className="text-[12.5px] font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            Back to {sprint.name}
          </Link>
        </p>
      </Reveal>

      <Reveal tier="section" delay={0.06}>
        {/* The same component the sprint header mounts. One editor, one publish
            path, one set of failure words — a second copy here would be a second
            place for "Publish to the team" to start meaning something else. */}
        <div className="-mx-[var(--app-gutter)] border-y border-[var(--hairline)]">
          <SprintNotes
            sprintId={sprint.id}
            notes={sprint.notes ?? ""}
            notesDoc={sprint.notesDoc}
            body={
              <CommentBody
                doc={
                  sprint.notesDoc ??
                  (sprint.notes?.trim()
                    ? documentFromText(sprint.notes, { starsAreCallouts: true })
                    : null)
                }
              />
            }
            author={sprint.notesAuthor?.fullName ?? null}
            writtenOn={sprint.notesWrittenOn}
            canEdit={canEdit}
            people={people}
            maxImageBatch={settings.maxImageBatch}
          />
        </div>
      </Reveal>

      <Reveal tier="section" delay={0.12}>
        <RevisionHistory
          entries={revisions}
          itemId={sprint.id}
          itemKey={sprint.name}
          projectSlug={slug}
          sprintNumber={sprintNumber}
          path={`${sprintPath}/notes`}
          canRestore={canEdit}
        />
      </Reveal>
    </PageShell>
  );
}
