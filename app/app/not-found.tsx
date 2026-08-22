import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Reached two ways: a URL under `/app` that matches no route, and any page
 * calling `notFound()` — which several do when the slug, sprint number or item
 * key names something that is not there.
 *
 * So the copy has to be true of both, and it must not imply the thing was
 * deleted. "There is nothing at this address" covers a typo, a stale link in
 * somebody's chat window, and an item that really has gone.
 */
export default function AppNotFound() {
  return (
    <main className="flex flex-1 flex-col items-start justify-center gap-5 p-[var(--app-gutter)]">
      <div className="max-w-[60ch]">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">There is nothing at this address.</h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--ink-muted)]">
          The project, sprint or item in this URL does not exist — most often a link that was
          written before something was renamed. The rest of the app is fine and nothing has been
          removed.
        </p>
      </div>

      <Link
        href="/app"
        className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
      >
        Go to the current sprint
        <ArrowRight size={15} strokeWidth={2} aria-hidden />
      </Link>
    </main>
  );
}
