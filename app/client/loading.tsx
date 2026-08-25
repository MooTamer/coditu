import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/**
 * The overview, at the shape it will be.
 *
 * Two card rows at the height `ComponentCard` actually draws — a summary line,
 * a progress line and a label — so the page does not jump when the real thing
 * arrives. The skeleton primitives already honour `prefers-reduced-motion`;
 * this reuses them rather than painting a second shimmer that would not.
 */
export default function Loading() {
  return (
    <LoadingScreen label="Loading your overview">
      <HeaderSkeleton wide />
      <ListSkeleton rows={1} rowHeight={132} header={false} />
      <ListSkeleton rows={2} rowHeight={148} header={false} />
    </LoadingScreen>
  );
}
