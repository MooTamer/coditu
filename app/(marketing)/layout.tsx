import type { ReactNode } from "react";

/**
 * TEMPORARY — delete in step 12.
 *
 * The app is dark-first, and step 3 repointed the shadcn semantic tokens
 * (`--background`, `--foreground`, `--primary`, ...) at the Coditu palette. The
 * marketing sections in here are still the pre-Coditu ones, written against the
 * old light-only palette, so on the dark canvas they render dark text on a dark
 * ground.
 *
 * Pinning this route to `.light` keeps the live site presentable while steps
 * 4-11 build the app. Step 12 rewrites these sections under Coditu and this
 * file goes away — the marketing site ships dark, like the rest of the design.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  // `body` paints `var(--canvas)` from the root theme, and it sits outside this
  // wrapper — so the wrapper has to paint its own light ground, or the page
  // shows the dark body behind light-mode sections.
  return (
    <div className="light min-h-dvh" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
      {children}
    </div>
  );
}
