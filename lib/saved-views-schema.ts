/**
 * The zod half of a saved view — §5.5's "validated on read **and** write".
 *
 * ## Why this is a file of its own
 *
 * Its twin, `lib/saved-views.ts`, holds the URL helpers that `view-menu.client.tsx`
 * needs, and a client component importing a module that imports zod ships **zod
 * to the browser**. It did, once: the app shell went from 77.9 KB to 143.1 KB
 * against a 110 KB budget, in a single 75.9 KB chunk, and `npm run budgets` was
 * the only thing that noticed.
 *
 * So the validation lives here and is imported only by the two server modules
 * that already have zod on their side of the line — `lib/actions/saved-views.ts`
 * and `lib/data/saved-views.ts`. Nothing here may ever be imported by a `.client`
 * component.
 *
 * The rule generalises: **anything under `lib/` that imports a heavy dependency
 * is one client import away from being in the browser bundle**, and the only
 * thing that will tell you is the budget.
 */

import { z } from "zod";

import { MAX_VALUE, VIEW_PARAMS, type ViewParam, type ViewSpec } from "@/lib/saved-views";

const value = z.string().trim().min(1).max(MAX_VALUE);

export const viewSpecSchema = z
  .object(
    Object.fromEntries(VIEW_PARAMS.map((key) => [key, value.optional()])) as Record<
      ViewParam,
      z.ZodOptional<typeof value>
    >
  )
  // Unknown keys are STRIPPED rather than rejected. A spec written by a newer
  // version of this app, or by hand, should lose the part this version does not
  // understand — not refuse to open at all.
  .strip();

/**
 * Whatever came out of the database, as a spec this version understands.
 *
 * Returns an empty spec for anything unusable, because a view that opens the
 * unfiltered sprint is a recoverable disappointment and a view that throws is a
 * screen nobody can get past.
 */
export function parseSpec(raw: unknown): ViewSpec {
  const parsed = viewSpecSchema.safeParse(raw);
  if (!parsed.success) return {};
  // Strip the undefineds by hand rather than storing `{"q": undefined}` and
  // writing `q=undefined` into a URL.
  return Object.fromEntries(
    Object.entries(parsed.data).filter(([, entry]) => typeof entry === "string" && entry.length > 0)
  ) as ViewSpec;
}
