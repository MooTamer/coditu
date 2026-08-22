import { Bar, LoadingScreen, Rows } from "@/components/app/skeleton";

/**
 * The sprint page: the three-column header card, the filter bar, and the table.
 *
 * 52px rows, because that is `rowHeight` at the default density — the compact
 * setting is 44px and lives in the URL, which a fallback cannot read. Twelve
 * rows is the sprint the team actually runs.
 */
export default function Loading() {
  return (
    <LoadingScreen label="Loading the sprint">
      <div className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--raised)]">
        <div className="grid gap-7 p-6 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          <div className="flex flex-col gap-3">
            <Bar w={92} h={11} />
            <Bar w="80%" h={22} />
            <Bar w="55%" h={12} />
          </div>
          <div className="flex flex-col gap-3">
            <Bar w={120} h={11} />
            <Bar w="55%" h={26} />
            <Bar w="100%" h={10} className="rounded-pill" />
          </div>
          <div className="flex flex-col gap-3">
            <Bar w={100} h={11} />
            <Bar w="100%" h={64} className="rounded-inner" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Bar w={168} h={34} className="rounded-control" />
        <Bar w={120} h={34} className="rounded-control" />
        <Bar w={104} h={34} className="rounded-control" />
      </div>

      <div className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
        <div className="flex items-center gap-4 border-b border-[var(--hairline)] px-4 py-3">
          <Bar w={120} h={10} className="shrink-0" />
          <Bar w={54} h={10} className="shrink-0" />
          <Bar w={64} h={10} className="ml-auto shrink-0" />
        </div>

        <Rows count={12} height={52} />
      </div>
    </LoadingScreen>
  );
}
