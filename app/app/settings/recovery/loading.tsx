import { Bar, HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** The coverage card, the counts, the rehearsal control, then the runs. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading backup and recovery">
      <HeaderSkeleton wide />
      <ListSkeleton rows={1} rowHeight={190} />
      <ListSkeleton rows={1} rowHeight={120} />
      <Bar w="min(60ch, 100%)" h={44} className="rounded-control" />
      <ListSkeleton rows={3} rowHeight={48} />
    </LoadingScreen>
  );
}
