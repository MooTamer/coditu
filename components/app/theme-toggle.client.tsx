"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { useMounted } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

/**
 * Renders a fixed placeholder until mounted. The server does not know the
 * stored theme, so rendering the "real" icon on the first pass guarantees a
 * hydration mismatch and a visible icon flip.
 */
export function ThemeToggle({ className }: { className?: string } = {}) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme"}
      className={cn(
        "flex size-11 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--tint)] md:size-[34px]",
        className
      )}
    >
      {mounted && !isDark ? (
        <Moon size={15} strokeWidth={1.7} aria-hidden />
      ) : (
        <Sun size={15} strokeWidth={1.7} aria-hidden />
      )}
    </button>
  );
}
