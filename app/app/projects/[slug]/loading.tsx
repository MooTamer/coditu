import { Bar, HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** A project and the sprints beneath it. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading the project">
      <HeaderSkeleton />
      <div className="flex flex-col gap-4">
        <Bar w={90} h={16} />
        <ListSkeleton rows={6} rowHeight={58} header={false} />
      </div>
    </LoadingScreen>
  );
}
