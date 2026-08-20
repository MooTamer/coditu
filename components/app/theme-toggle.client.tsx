"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { useMounted } from "@/lib/hooks/use-client-state";

/**
 * Renders a fixed placeholder until mounted. The server does not know the
 * stored theme, so rendering the "real" icon on the first pass guarantees a
 * hydration mismatch and a visible icon flip.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme"}
      className="flex size-[34px] items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
    >
      {mounted && !isDark ? (
        <Moon size={15} strokeWidth={1.7} aria-hidden />
      ) : (
        <Sun size={15} strokeWidth={1.7} aria-hidden />
      )}
    </button>
  );
}
