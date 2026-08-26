import { Bar, HeaderSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** The rate line, then one card per tracked sprint. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading team payouts">
      <HeaderSkeleton />

      <Bar w="min(46ch, 100%)" h={13} />

      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-5"
        >
          <Bar w={220} h={16} />
          <Bar w="min(52ch, 100%)" h={12} className="mt-3" />
          <div className="mt-5 flex flex-col gap-2">
            <Bar w="100%" h={30} />
            <Bar w="100%" h={30} />
            <Bar w="100%" h={30} />
          </div>
          <Bar w={190} h={38} className="mt-5 rounded-control" />
        </div>
      ))}
    </LoadingScreen>
  );
}
