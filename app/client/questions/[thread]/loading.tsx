import { HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** The question, the conversation, and the box to answer in. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading this question">
      <HeaderSkeleton wide />
      <ListSkeleton rows={3} rowHeight={110} header={false} />
      <ListSkeleton rows={1} rowHeight={140} header={false} />
    </LoadingScreen>
  );
}
