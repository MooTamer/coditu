import { Bar, HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/**
 * The shape of the personal view before it arrives: three cards, the
 * calculation, then a row per sprint.
 *
 * Painted rows rather than one element per row, for the reason recorded in
 * `06-PROGRESS.md`: a `loading.tsx` fallback rides in the flight payload of
 * every page beneath it, at about a kilobyte per element in development.
 */
export default function Loading() {
  return (
    <LoadingScreen label="Reading what this sprint has paid you">
      <HeaderSkeleton wide />
      <ListSkeleton rows={1} rowHeight={132} />
      <ListSkeleton rows={1} rowHeight={220} />
      <Bar w={220} h={11} />
      <ListSkeleton rows={4} rowHeight={44} />
    </LoadingScreen>
  );
}
