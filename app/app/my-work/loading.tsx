import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** Three columns on the same auto-fit grid the real page uses, so nothing reflows. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading your work">
      <HeaderSkeleton wide />
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <ListSkeleton rows={4} />
        <ListSkeleton rows={3} />
        <ListSkeleton rows={5} />
      </div>
    </LoadingScreen>
  );
}
