/**
 * Today, as a calendar date in Africa/Cairo.
 *
 * Its own module, and deliberately NOT in `lib/data/sprint.ts`: that file is
 * `server-only`, and the command palette needs this to log time from the
 * browser. Importing it from there poisons the client bundle with the whole
 * server data layer — which fails the build with an error about the import
 * chain rather than about the one function anybody wanted.
 *
 * Invariant 5: a `date` column is a calendar date with no timezone, so this
 * returns `YYYY-MM-DD` and never a `Date`. `en-CA` is the shortest way to get
 * ISO order out of `Intl`.
 */
export function todayInCairo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * The hour of the day in Cairo, 0–23.
 *
 * Separate from `todayInCairo` because the greeting needs the hour and nothing
 * else does, and because getting it by subtracting from `new Date()` is the bug
 * this whole module exists to prevent: the server runs in UTC and the team does
 * not.
 */
export function hourInCairo(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );
}

/**
 * `Good morning, Mohamed`.
 *
 * Cairo's clock, not the reader's: everyone on this team is in Cairo, Munich or
 * Ulm, and a greeting that says "good evening" to one person and "good
 * afternoon" to another on the same screenshot is worse than one that is simply
 * the workspace's time. It is also server-rendered, which a browser-local
 * greeting could not be without a hydration mismatch on every load.
 *
 * The first name only. "Good morning, Mohamed Tamer" reads like a letter from a
 * bank.
 */
export function greeting(fullName: string, hour = hourInCairo()): string {
  const first = fullName.trim().split(/\s+/)[0] || "there";
  if (hour < 5) return `Still up, ${first}`;
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 18) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

/** `Tuesday · 2026-08-25`, the design's own format, in Cairo. */
export function todayLabel(today = todayInCairo()): string {
  // Parsed as UTC noon rather than `new Date(today)`: a bare ISO date is UTC
  // midnight, which is the previous day in half the world — invariant 5, and
  // the trap `CLAUDE.md` names explicitly.
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return `${weekday} · ${today}`;
}
