import { PeekReturner } from "@/components/app/peek-returner.client";

/**
 * The sprint segment renders its page and a parallel `@modal` slot.
 *
 * Clicking an item intercepts into the modal; a hard navigation to the same URL
 * has nothing to intercept and renders the full page instead. Both read the
 * same component, so the two can never drift.
 *
 * `PeekReturner` renders nothing and is here rather than on either page because
 * it is the only thing that survives a navigation **between** them — which is
 * exactly what "Back to side peek" needs. See that file.
 */
export default async function SprintLayout({
  children,
  modal,
  params,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;

  return (
    <>
      <PeekReturner sprintHref={`/app/projects/${slug}/sprints/${number}`} />
      {children}
      {modal}
    </>
  );
}
