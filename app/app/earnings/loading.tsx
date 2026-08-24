import { Bar, HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/**
 * The shape of the earnings board before it arrives: the rate line, then a card
 * per sprint.
 *
 * Painted rows rather than one element per row, for the reason recorded in
 * `06-PROGRESS.md`: a `loading.tsx` fallback rides in the flight payload of
 * every page beneath it, at about a kilobyte per element in development.
 */
export default function Loading() {
  return (
    <LoadingScreen label="Reading what each sprint paid">
      <HeaderSkeleton wide />
      <Bar w={220} h={11} />
      <ListSkeleton rows={3} rowHeight={92} />
      <ListSkeleton rows={2} rowHeight={92} />
    </LoadingScreen>
  );
}
