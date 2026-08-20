import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";

/**
 * Satoshi — display and body. Self-hosted per the brief, which forbids silently
 * substituting anything else. The only sanctioned fallback if self-hosting is ever
 * blocked is Instrument Sans (Google Fonts).
 *
 * The .woff2 files live beside this module rather than in `public/` on purpose:
 * `next/font/local` fingerprints and serves them itself, so a copy in `public/`
 * would ship the same four files twice.
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
    { path: "./files/Satoshi-900.woff2", weight: "900", style: "normal" },
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
