import { cn } from "@/lib/utils";

export interface AvatarPerson {
  fullName: string;
  initials: string;
  avatarUrl: string | null;
}

/**
 * One person, as a circle.
 *
 * Every screen in the app used to draw its own: a rounded span with the
 * person's initials in it, at seven different sizes with seven copies of the
 * same border. They are all this now, so a picture appears everywhere at once
 * instead of everywhere one place at a time.
 *
 * **The initials are always rendered, and the picture sits on top of them.**
 * That is what makes this degrade properly. The `<img>` carries `alt=""`,
 * because the initials underneath are the text — so a picture that 404s, or a
 * profile that has never had one, shows initials rather than a broken-image
 * glyph, and no JavaScript is involved in either case. This component stays a
 * plain function with no hooks for the same reason: it renders identically
 * inside a Server Component and inside a client one, and half the places a
 * person appears are the second kind.
 *
 * Plain `<img>` rather than `next/image`, matching `CommentImage`: the host is
 * whichever Supabase project the environment points at, so `remotePatterns`
 * would have to be built at build time from an env var that differs between
 * local and production — and the payoff would be optimising a 256px thumbnail
 * that the browser already caches.
 */
export function PersonAvatar({
  person,
  size,
  fontSize,
  className,
  style,
  title,
}: {
  /** Null renders the "nobody" circle — `··`, faint. */
  person: AvatarPerson | null;
  /** Diameter in px. Each call site keeps the size its design already had. */
  size: number;
  /** Initials size in px. Defaults to a little over a third of the diameter. */
  fontSize?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const url = person?.avatarUrl ?? null;

  return (
    <span
      // A stable hook for the specs, in the same spirit as `data-team-member`:
      // "has a picture" is otherwise only distinguishable by looking for a
      // child <img>, and the initials render either way.
      data-avatar={url ? "picture" : "initials"}
      title={title}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-pill border border-[var(--hairline-strong)]",
        className
      )}
      // `--ink-muted`, not `--ink-faint`: the "nobody" placeholder appears on
      // the grouping-tinted mobile cards, where faint measures 4.46:1 against
      // the tint and fails AA. Muted is 5.25:1 on the same background and is
      // still visibly quieter than a real set of initials.
      style={{ width: size, height: size, color: person ? undefined : "var(--ink-muted)", ...style }}
    >
      <span
        className="font-mono tabular-nums leading-none"
        style={{ fontSize: fontSize ?? Math.round(size * 0.36) }}
      >
        {person?.initials ?? "··"}
      </span>

      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}
