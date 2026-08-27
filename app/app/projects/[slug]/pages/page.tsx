import Link from "next/link";
import { notFound } from "next/navigation";

import { NewPage } from "@/components/app/new-page.client";
import { PageList } from "@/components/app/page-list";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { listPages } from "@/lib/data/pages";
import { getProjectBySlug } from "@/lib/data/projects";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.name} · Pages` : "Pages" };
}

/**
 * A project's pages.
 *
 * `PLAN.md` §7 puts *"Project notes/pages"* on the project's home, and the
 * returned prototype draws the panel — `pgNotes`, three rows, every one of them
 * a `this.toast("Project page — same block editor, project-scoped")`. This is
 * where those rows go.
 *
 * **The project is resolved from the slug and the pages from the project.** Not
 * from the slug directly: `listPages` takes a `project_id`, so a URL naming a
 * project this reader cannot see returns `notFound()` before any page is read
 * rather than an empty list that looks like a project with no pages.
 */
export default async function ProjectPagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, profile] = await Promise.all([params, getCurrentProfile()]);
  if (!profile) notFound();

  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const pages = await listPages(project.id);
  const canCreate = profile.role === "admin" || profile.role === "lead";

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          {project.clientName} · {project.name}
        </Mono>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.022em]">Pages &amp; notes</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Writing that belongs to this project rather than to one story — constraints, conventions,
          decisions. Never exported, never client-visible.
        </p>
        <p className="mt-2">
          <Link
            href={`/app/projects/${project.slug}`}
            className="text-[12.5px] font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            Back to {project.name}
          </Link>
        </p>
      </Reveal>

      <Reveal tier="section" delay={0.06}>
        <NewPage projectId={project.id} canCreate={canCreate} />
      </Reveal>

      <Reveal tier="section" delay={0.12}>
        <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-2">
          <PageList
            pages={pages}
            empty={
              canCreate
                ? "No pages on this project yet. Start one above."
                : "No pages on this project yet. An admin or lead can start one."
            }
          />
        </div>
      </Reveal>
    </main>
  );
}
