import { Bar, HeaderSkeleton, ListSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** The team, then the allowlist card beneath it. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading the team">
      <HeaderSkeleton wide />

      <div className="flex flex-col gap-4">
        <Bar w={92} h={16} />
        <ListSkeleton rows={4} rowHeight={64} header={false} />
      </div>

      <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6">
        <Bar w={140} h={16} />
        <Bar w="min(68ch, 100%)" h={13} className="mt-3" />
        <Bar w="min(54ch, 100%)" h={13} className="mt-2" />
        <Bar w="100%" h={44} className="mt-5 rounded-control" />
      </div>
    </LoadingScreen>
  );
}
