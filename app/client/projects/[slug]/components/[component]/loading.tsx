import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** The component page: a heading, its progress card, and the list of work. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading this component">
      <HeaderSkeleton wide />
      <ListSkeleton rows={1} rowHeight={96} header={false} />
      <ListSkeleton rows={4} rowHeight={92} header={false} />
    </LoadingScreen>
  );
}
