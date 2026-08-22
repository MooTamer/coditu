import { Bar, Dot, HeaderSkeleton, LoadingScreen } from "@/components/app/skeleton";

/** Your name, your picture, then the read-only account facts. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading your settings">
      <HeaderSkeleton />

      <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6">
        <Bar w={128} h={16} />
        <Bar w="min(64ch, 100%)" h={13} className="mt-3" />
        <Bar w="min(380px, 100%)" h={38} className="mt-5 rounded-control" />
      </div>

      <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6">
        <Bar w={112} h={16} />
        <Bar w="min(70ch, 100%)" h={13} className="mt-3" />
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <Dot size={72} />
          <div className="flex flex-col gap-2">
            <Bar w={168} h={38} className="rounded-control" />
            <Bar w={220} h={11} />
          </div>
        </div>
      </div>

      <div className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6">
        <Bar w={140} h={16} />
        <Bar w="min(60ch, 100%)" h={13} className="mt-3" />
        <Bar w={190} h={38} className="mt-5 rounded-control" />
      </div>
    </LoadingScreen>
  );
}
