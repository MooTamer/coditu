/**
 * How far along something is, for a reader who is not counting tickets.
 *
 * Items done out of items shown, drawn as one line. Deliberately not a
 * percentage in large type: "62%" invites the question "of what?", and the
 * honest answer — of the work we have chosen to show you — is not one a big
 * number carries. "5 of 8 done" carries it.
 *
 * ── Two things here were wrong in the first draft, and both were invisible ──
 *
 * **The track was `--ring-track`.** That token is `rgba(11,14,20,0.48)` — 48%
 * black. It is right for `progress-ring.tsx`, where it is a thin circular
 * stroke, and it is catastrophic as a 6px full-width bar: the empty track read
 * as a full bar, so "0 of 3 done" sat under something that looked finished.
 * `--hairline` is the token for a subtle horizontal rule, which is what an
 * empty track is.
 *
 * **The fill was `bg-[var(--signal)]`.** `--signal` is a `linear-gradient`, not
 * a colour. Tailwind's `bg-[…]` compiles to `background-color`, a gradient is
 * not a valid `background-color`, and the declaration was dropped — so the fill
 * painted nothing at all and every bar was 100% track. The one other use of
 * `--signal` in this repository is `background-image` in `globals.css`, which
 * is the tell.
 *
 * ── Why `clip-path` and not `transform: scaleX()` ──────────────────────────
 *
 * Scaling the fill would squeeze the whole blue→teal gradient into whatever
 * fraction is filled, so a bar at 10% shows the entire gradient in a sliver and
 * every bar looks the same. `clip-path: inset()` reveals a full-width gradient
 * instead, so the colour at a given x is the same on every bar and the line
 * reads as the signal trace being drawn. It composites like a transform — no
 * layout, no paint — and interpolates for the transition.
 */
export function ProgressLine({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  const empty = total === 0;
  const ratio = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0;
  const hidden = Math.round((1 - ratio) * 1000) / 10;

  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
        <span className="text-[13px] tabular-nums text-[var(--ink-faint)]">
          {empty ? "nothing shared yet" : `${done} of ${total} done`}
        </span>
      </div>

      <div
        className="h-[6px] w-full overflow-hidden rounded-pill bg-[var(--hairline)]"
        role="img"
        // The bar is the only thing carrying this shape visually, so it says it
        // in words too. A screen reader hears the sentence, not "6px".
        aria-label={empty ? `${label}: nothing shared yet` : `${label}: ${done} of ${total} done`}
      >
        <div
          className="h-full w-full rounded-pill transition-[clip-path] duration-[var(--dur-section)] ease-[var(--ease-entrance)] motion-reduce:transition-none"
          style={{
            backgroundImage: "var(--signal)",
            clipPath: `inset(0 ${hidden}% 0 0 round 999px)`,
          }}
        />
      </div>
    </div>
  );
}
