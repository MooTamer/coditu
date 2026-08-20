import { InlineClientMark, CLIENT_MARKS } from "@/components/app/client-marks";
import { cn } from "@/lib/utils";

/**
 * The client's mark in the topbar, the switcher, and the sprint header.
 *
 * A client with a registered mark gets it, tinted with their accent; everyone
 * else gets an accent square. See `client-marks.tsx` for why these are inlined
 * rather than loaded through `<img>`.
 */
export function ClientMark({
  logoPath,
  accentHex,
  size = 15,
  className,
}: {
  logoPath: string | null;
  accentHex: string | null;
  size?: number;
  className?: string;
}) {
  if (logoPath && CLIENT_MARKS[logoPath]) {
    return (
      <InlineClientMark
        logoPath={logoPath}
        size={size}
        color={accentHex ?? "currentColor"}
        style={{ display: "block" }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn("shrink-0 rounded-[2px]", className)}
      style={{ width: 8, height: 8, background: accentHex ?? "var(--slate)" }}
    />
  );
}
