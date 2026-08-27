import { notFound } from "next/navigation";

import { PageSurface, pageTitle } from "@/components/app/page-surface";
import { getProjectBySlug } from "@/lib/data/projects";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; page: string }>;
}) {
  const { slug, page } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: "Page" };
  return pageTitle(project.id, page);
}

/**
 * A project page.
 *
 * Two lookups rather than one, and that is invariant 1 rather than a
 * waterfall worth removing: the project comes from the slug, and the page comes
 * from `(project_id, slug)`. Naming another client's project in the URL finds no
 * project; naming this project and another project's page slug finds no page.
 * Neither can reach a document it does not scope.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; page: string }>;
}) {
  const { slug, page } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  return <PageSurface projectId={project.id} projectSlug={project.slug} slug={page} />;
}
