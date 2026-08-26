import { Bar, HeaderSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** The tunables, then the three links out. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading workspace settings">
      <HeaderSkeleton />

      <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6">
        <Bar w={196} h={16} />
        <Bar w="min(70ch, 100%)" h={13} className="mt-3" />
        <div className="mt-5 flex flex-col gap-3">
          <Bar w="min(420px, 100%)" h={38} className="rounded-control" />
          <Bar w="min(420px, 100%)" h={38} className="rounded-control" />
          <Bar w="min(420px, 100%)" h={38} className="rounded-control" />
        </div>
      </div>

      <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6">
        <Bar w={152} h={16} />
        <div className="mt-4 flex flex-col gap-2">
          <Bar w="100%" h={54} className="rounded-control" />
          <Bar w="100%" h={54} className="rounded-control" />
          <Bar w="100%" h={54} className="rounded-control" />
        </div>
      </div>
    </LoadingScreen>
  );
}
