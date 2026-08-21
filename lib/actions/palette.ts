"use server";

import { getPaletteTargets, type PaletteTargets } from "@/lib/data/palette";

/**
 * The palette's data, fetched the first time it opens.
 *
 * A Server Action rather than a route handler so it inherits the caller's
 * cookie session and therefore their RLS scope — the palette can only ever
 * list what the person opening it may already see.
 */
export async function loadPaletteTargets(): Promise<PaletteTargets> {
  return getPaletteTargets();
}
