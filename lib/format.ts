/**
 * Presentation helpers.
 *
 * Invariant 2: time is stored as integer minutes. Division by 60 happens HERE
 * and nowhere else — the render edge is the only place hours are allowed to
 * exist, because a float that travels through the app is a float that gets
 * summed.
 *
 * Invariant 5: dates are rendered in Africa/Cairo, and a `date` column is
 * formatted as text without ever being handed to `new Date()`. `new
 * Date("2026-08-23")` parses as UTC midnight and shows the 22nd to half the
 * world.
 */

export const TIMEZONE = "Africa/Cairo";

/** 450 → "7.5". Always one decimal, so a column of them lines up. */
export function hours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

/** 450 → "7.5 h" */
export function hoursLabel(minutes: number): string {
  return `${hours(minutes)} h`;
}

/** 0 renders as an em dash — a logged zero is "nothing yet", not "0.0". */
export function hoursOrDash(minutes: number): string {
  return minutes > 0 ? hours(minutes) : "—";
}

/**
 * A `date` column, formatted for display. Takes the string apart rather than
 * parsing it: `2026-08-23` is a calendar date with no timezone, and the moment
 * you hand it to Date() you have invented one.
 */
export function calendarDate(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

/** A timestamptz, rendered in Cairo. `2026-08-19 14:02`. */
export function timestamp(value: string | null): string {
  if (!value) return "—";
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
  return formatted.replace(",", "");
}

/** "2026-08-17 → 2026-08-23" */
export function dateRange(from: string | null, to: string | null): string {
  return `${calendarDate(from)} → ${calendarDate(to)}`;
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "··";
}
