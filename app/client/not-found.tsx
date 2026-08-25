import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Reached three ways, and the copy has to be true of all three: a mistyped
 * address, a component that has not been published, and a project belonging to
 * somebody else.
 *
 * **It must read the same for all three**, which is the whole point. A message
 * that distinguished "not shared with you" from "does not exist" would let
 * anyone with one project's URL discover the shape of another's by watching
 * which sentence came back. `app/app/not-found.tsx` makes the same choice for
 * the same reason; this one exists because that one offers "Go to the current
 * sprint" and links into `/app`, which a client cannot reach and should not be
 * told about.
 *
 * The tone matters too. A client who lands here has almost certainly followed a
 * link we sent her, so the page should not imply she did something wrong.
 */
export default function ClientNotFound() {
  return (
    <main className="flex flex-1 flex-col items-start justify-center gap-5 p-[var(--app-gutter)]">
      <div className="max-w-[60ch]">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">
          There is nothing at this address.
        </h1>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">
          This page either has not been shared with you or is not there any more. Nothing has gone
          wrong with your account, and the rest of your overview is unaffected.
        </p>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">
          If you followed a link from us and expected to see something here, tell whoever sent it —
          it is more likely our link than your click.
        </p>
      </div>

      <Link
        href="/client"
        prefetch={false}
        className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--raised)]"
      >
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        Back to your overview
      </Link>
    </main>
  );
}
