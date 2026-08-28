/**
 * The interactive-state contract — one answer for every control in the app.
 *
 * PF-4 was reported as "sorting does nothing for ~2s then sorts; every button
 * needs a loading state; hover, disabled, active all need to be right". The
 * temptation is to fix the sort button. The reason not to is that this app has
 * **206 `<button>` elements**, and a per-button fix produces 206 slightly
 * different answers to the same question, of which some number will be wrong
 * and nobody will ever know which.
 *
 * So: six states, named once, expressed the same way everywhere.
 *
 *   idle      nothing — the default
 *   hover     CSS `:hover`, native
 *   active    `aria-pressed` / `aria-current`, native and announced
 *   pending   `data-state="pending"` + `aria-busy`
 *   disabled  `disabled` (or `aria-disabled` where focus must survive), native
 *   error     `data-state="error"`
 *
 * **Four of the six are already native**, and that is the point of the split:
 * hover, active and disabled have had correct HTML and CSS answers for twenty
 * years, and re-implementing them in React is how they drift. Only `pending`
 * and `error` have no native spelling, so only those two are carried here.
 *
 * ── Where the appearance lives ────────────────────────────────────────────
 * In `app/globals.css`, under `[data-control]`, and NOT in this file. The app
 * shell has 0.6 KB of JavaScript budget left (`npm run budgets`); a styling
 * helper that ships class strings to the browser would spend it on something
 * a stylesheet does for free. This module ships attributes; the stylesheet
 * decides what they look like.
 */
export type ControlState = "idle" | "pending" | "error";

export interface ControlAttributes {
  "data-control": string;
  "data-state": ControlState;
  "aria-busy"?: true;
}

/**
 * Spread onto any control that triggers work.
 *
 *     <button {...control(pending ? "pending" : "idle")} disabled={pending}>
 *
 * `aria-busy` is set only while pending rather than written as `false`,
 * because `aria-busy="false"` on every control in a table is noise a screen
 * reader has to walk past. `disabled` stays the caller's decision: a control
 * that must keep focus through its own pending state wants `aria-disabled`
 * instead, and the two are not interchangeable.
 */
export function control(state: ControlState = "idle"): ControlAttributes {
  return {
    "data-control": "",
    "data-state": state,
    ...(state === "pending" ? { "aria-busy": true as const } : {}),
  };
}
