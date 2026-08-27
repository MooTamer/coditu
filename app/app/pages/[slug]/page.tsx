import { PageSurface, pageTitle } from "@/components/app/page-surface";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return pageTitle(null, slug);
}

/** A workspace page. `projectId: null` is what makes it one. */
export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PageSurface projectId={null} projectSlug={null} slug={slug} />;
}
