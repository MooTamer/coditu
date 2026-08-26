"use client";

import { useTheme } from "next-themes";

import { Mono } from "@/components/coditu/mono";
import { useMounted } from "@/lib/hooks/use-client-state";

/**
 * Which of the two themes this browser opens in.
 *
 * The toggle in the topbar has always been able to do this — it is one button
 * that flips to the other one. What it cannot do is *say what is currently
 * chosen*, which is the question a settings screen is asked, so this is the
 * same preference presented as a choice rather than as an action.
 *
 * ## Two options, and not a third
 *
 * The app is mounted with `enableSystem={false}` and `defaultTheme="light"` —
 * see `app/layout.tsx`, and `docs/05-DECISIONS.md` for the ADR that reversed
 * the original dark default. So "follow my system" is not a state this app can
 * be in, and offering it would be a control that quietly does nothing. What
 * *does* follow the system is reduced motion, and the line underneath says so
 * rather than leaving somebody to wonder.
 *
 * ## Native radios, deliberately
 *
 * Two swatch cards would be two `<button>`s in the prototype. They are real
 * radio inputs here because a radio group is what this is: arrow keys move
 * between the options, the group has one tab stop, the label is associated
 * without `aria-labelledby`, and none of that had to be written. The swatch is
 * the visual; the input is the control.
 *
 * ## Why nothing is checked until mounted
 *
 * The server does not know the stored theme — that is the whole reason
 * `ThemeToggle` renders a placeholder — and rendering a guess would produce a
 * hydration mismatch and a visible flip. Before mount neither option is
 * selected and the group is `aria-busy`, which is true rather than
 * decorative: it does not know yet.
 */

const OPTIONS = [
  {
    id: "light",
    label: "Cool paper",
    /** Straight from the bundle's own palette, both of them. */
    swatch: "linear-gradient(160deg, #EBEFF6 40%, #F8FAFC)",
  },
  {
    id: "dark",
    label: "Ink",
    swatch: "linear-gradient(160deg, #07090E 40%, #111826)",
  },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <div className="mt-4">
      <fieldset
        aria-busy={!mounted}
        className="flex flex-wrap gap-3 border-0 p-0"
        data-appearance
      >
        <legend className="sr-only">Theme</legend>

        {OPTIONS.map((option) => {
          const selected = mounted && theme === option.id;
          return (
            <label
              key={option.id}
              data-theme-option={option.id}
              data-selected={selected ? "true" : undefined}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3 py-2 text-[13.5px] font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]"
              style={{
                borderColor: selected ? "var(--accent)" : "var(--hairline)",
                color: selected ? "var(--ink)" : "var(--ink-muted)",
              }}
            >
              <input
                type="radio"
                name="coditu-theme"
                value={option.id}
                checked={selected}
                onChange={() => setTheme(option.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="size-6 shrink-0 rounded-[6px] border border-[var(--hairline-strong)]"
                style={{ background: option.swatch }}
              />
              {option.label}
            </label>
          );
        })}
      </fieldset>

      <Mono size="meta" className="mt-3 block text-[var(--ink-faint)]">
        stored in this browser · reduced motion follows your system setting
      </Mono>
    </div>
  );
}
