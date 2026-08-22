"use client";

import { fontVariables } from "@/lib/fonts";

import "./globals.css";

/**
 * The last resort: the root layout itself threw, so this REPLACES it — which
 * means it owns `<html>` and `<body>`, and nothing above it exists to inherit
 * from. No ThemeProvider, so no stored theme is read and `:root` decides; light
 * is the default the team asked for, so the page paints correctly anyway.
 *
 * Deliberately plain. Every dependency this file takes is a dependency that
 * could be the reason it is being shown, so it uses the token variables and the
 * font stack and nothing else — no rail, no topbar, no data, no icons.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className={fontVariables}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "var(--canvas)",
          color: "var(--ink)",
          fontFamily: "var(--font-satoshi), system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "60ch" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.022em" }}>
            Coditu could not start.
          </h1>
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: "var(--ink-muted)" }}>
            This is the application failing to load at all, not one screen failing to render.
            Nothing has been written and no data has been touched — reloading is safe, and if it
            keeps happening the deployment is the thing to look at.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              height: 44,
              padding: "0 16px",
              borderRadius: "var(--radius-control)",
              border: "1px solid var(--hairline-strong)",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload the application
          </button>

          {error.digest ? (
            <p
              style={{
                marginTop: 16,
                fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
                fontSize: 11,
                color: "var(--ink-faint)",
              }}
            >
              reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
