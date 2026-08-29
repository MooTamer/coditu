import { Bar, Dot } from "@/components/app/skeleton";

/**
 * The shape of a story, while the story is still being fetched.
 *
 * ── Why this is not a `loading.tsx` ────────────────────────────────────────
 * It would have been one line. `docs/07-FIELD-NOTES.md` records what that line
 * cost the last time: fifteen specs across eight files began failing one to
 * four at a time, and `notFound()` started answering 200 because the segment's
 * shell was flushed before the page ran. A `loading.tsx` is a Suspense boundary
 * you cannot see and cannot scope. This is the same mechanism written where it
 * can be read, around exactly the subtree that waits — the modal's chrome, its
 * key, its close button and its "Open as full page" link are all rendered from
 * the URL and need no database at all, so they are outside the boundary and
 * arrive in the first frame.
 *
 * ── Why it costs no JavaScript ─────────────────────────────────────────────
 * No `"use client"`. The app shell had 3.7 KB of headroom when this was written
 * and a skeleton is exactly the kind of thing that quietly spends it — the
 * field notes put the last one at ~1 KB per element. Every bar here is server
 * HTML that is thrown away on hydration.
 *
 * ── Matching the box, not the artwork ──────────────────────────────────────
 * `components/app/skeleton.tsx` states the rule and this obeys it: the same
 * `auto-fit` two-column grid as `ItemDetailBody`, the same `min(300px,100%)`
 * track, the same `p-6` and `gap-6`. The real body then replaces it in place
 * rather than shoving it sideways.
 */
export function ItemPeekSkeleton() {
  return (
    <div
      // `role="status"` with a name, and every bar below `aria-hidden`: "some
      // grey rectangles" is not information. No `aria-live` — the same reason
      // `LoadingScreen` gives, that this mounts before the reader has moved.
      role="status"
      aria-label="Loading the story"
      className="grid [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]"
    >
      <div className="flex min-w-0 flex-col gap-6 p-6">
        {/* Title, and the star beside it. */}
        <div className="flex items-start gap-2">
          <Bar w="72%" h={24} className="flex-1" />
          <Dot size={22} />
        </div>

        {/* The description: three lines, last one short, like prose. */}
        <div className="flex flex-col gap-2">
          <Bar w="100%" h={12} />
          <Bar w="96%" h={12} />
          <Bar w="61%" h={12} />
        </div>

        {/* Acceptance criteria — a checkbox and a line each, at the real row
            rhythm rather than an invented one. */}
        <div className="flex flex-col gap-3">
          <Bar w={104} h={11} />
          {[88, 74, 92, 67].map((w) => (
            <div key={w} className="flex items-center gap-3">
              <Bar w={16} h={16} className="shrink-0 rounded-[4px]" />
              <Bar w={`${w}%`} h={12} />
            </div>
          ))}
        </div>
      </div>

      {/* The property rail: label above value, five times. */}
      <div className="flex min-w-0 flex-col gap-5 border-[var(--hairline)] p-6 md:border-l">
        {[64, 82, 58, 76, 70].map((w) => (
          <div key={w} className="flex flex-col gap-[6px]">
            <Bar w={w} h={10} />
            <Bar w="70%" h={14} />
          </div>
        ))}
      </div>
    </div>
  );
}
