import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** A heading, then a couple of companies' worth of contact rows. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading client access">
      <HeaderSkeleton wide />
      <ListSkeleton rows={3} rowHeight={104} header={false} />
      <ListSkeleton rows={2} rowHeight={104} header={false} />
    </LoadingScreen>
  );
}
