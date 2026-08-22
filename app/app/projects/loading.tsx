import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** Five client rows at the height the real list draws them. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading projects">
      <HeaderSkeleton />
      <ListSkeleton rows={5} rowHeight={62} header={false} />
    </LoadingScreen>
  );
}
