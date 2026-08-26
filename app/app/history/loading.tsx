import { Bar, HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** The filter row, then a version per line. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading version history">
      <HeaderSkeleton wide />
      <Bar w="min(70ch, 100%)" h={38} className="rounded-control" />
      <ListSkeleton rows={10} rowHeight={34} />
    </LoadingScreen>
  );
}
