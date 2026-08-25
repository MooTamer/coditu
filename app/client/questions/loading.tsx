import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** A heading and a handful of question rows, at the height they will be. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading your questions">
      <HeaderSkeleton wide />
      <ListSkeleton rows={4} rowHeight={96} header={false} />
    </LoadingScreen>
  );
}
