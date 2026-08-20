import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";

/**
 * Satoshi — display and body. Self-hosted per the brief, which forbids silently
 * substituting anything else. The only sanctioned fallback if self-hosting is ever
 * blocked is Instrument Sans (Google Fonts).
 *
 * The .woff2 files live beside this module rather than in `public/` on purpose:
 * `next/font/local` fingerprints and serves them itself, so a copy in `public/`
 * would ship the same files twice.
 *
 * Three weights, all preloaded. §5 asks for "the two weights above the fold",
 * and `next/font/local` preloads per FAMILY, not per face — there is no way to
 * preload 400 and 700 while leaving 500 to be discovered. Splitting into two
 * families does not work either: font matching picks a family first and then
 * the nearest weight inside it, so a 500 request would render as 400 and never
 * reach the second family. Three faces it is; the unused fourth is gone.
 *
 * Licence: ITF Free Font Licence (Fontshare) — free for commercial use. See
 * `lib/fonts/files/LICENCE.md`.
 */
export const satoshi = localFont({
  variable: "--font-satoshi",
  display: "swap",
  preload: true,
  // Metric-matched to Helvetica so the swap does not shift layout. Satoshi's
  // cap height and x-height sit close enough that CLS stays inside budget.
  adjustFontFallback: "Arial",
  fallback: ["Instrument Sans", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
  src: [
    { path: "./files/Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./files/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./files/Satoshi-700.woff2", weight: "700", style: "normal" },
    // No 900. Nothing in the design uses it, and a preloaded face nobody
    // renders is ~30KB of an LCP budget spent on nothing.
  ],
});

/**
 * JetBrains Mono — every key, timestamp, count, metric, and status label.
 * Not decorative: the design uses mono to mark "this is a fact from the database".
 */
export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

/** Convenience for the root layout. */
export const fontVariables = `${satoshi.variable} ${jetbrainsMono.variable}`;
