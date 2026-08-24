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

/**
 * A `timestamptz`, reduced to the calendar date it fell on **in Cairo**.
 *
 * Not `value.slice(0, 10)`. That is the UTC date, and for anything logged
 * between midnight and 02:00 Cairo it is yesterday's.
 */
export function cairoDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/** "2026-08-17 → 2026-08-23" */
export function dateRange(from: string | null, to: string | null): string {
  return `${calendarDate(from)} → ${calendarDate(to)}`;
}

/* -------------------------------------------------------------------------- */
/* Money.                                                                     */
/*                                                                            */
/* Invariant 2, restated: money is stored in integer minor units — cents for  */
/* USD, piastres for EGP, rate × 1e6 for the exchange rate. A float never     */
/* touches a stored value and never touches a sum. THIS FILE is the only      */
/* place a minor unit is divided, exactly as it is the only place a minute is */
/* divided. If you find yourself writing `/ 100` anywhere else, the answer is */
/* here.                                                                      */
/* -------------------------------------------------------------------------- */

/** How much of a rate an integer micro-unit is. `12_345_678` → 12.345678. */
export const RATE_MICROS = 1_000_000;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const egp = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EGP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 120050 → "$1,200.50". */
export function usdFromCents(cents: number): string {
  return usd.format(cents / 100);
}

/** 120050 piastres → "EGP 1,200.50". */
export function egpFromPiastres(piastres: number): string {
  return egp.format(piastres / 100);
}

/**
 * Convert cents to piastres at a stored micro-rate, as an integer.
 *
 * Both ends are minor units and the rate is an integer, so this is integer
 * arithmetic all the way through with one rounding at the end — never a chain
 * of floats. Returns null when there is no rate, because a missing rate must
 * render as a missing rate; inventing one is the thing E3 forbids.
 */
export function piastresFromCents(cents: number, rateMicros: number | null): number | null {
  if (!rateMicros || !Number.isFinite(rateMicros) || rateMicros <= 0) return null;
  return Math.round((cents * rateMicros) / RATE_MICROS);
}

/** 50_860_000 → "50.86". The rate itself, at the render edge. */
export function rateFromMicros(rateMicros: number): string {
  return (rateMicros / RATE_MICROS).toFixed(2);
}

