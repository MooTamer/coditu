"use server";

import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Recording that somebody opened something.
 *
 * ## It revalidates nothing, and that is the point
 *
 * This runs on almost every navigation. `revalidatePath` here would throw away
 * the render cache of the page that just loaded, on every page load, to refresh
 * a five-row convenience panel — the sidebar picks the new list up on the next
 * server render, which is soon enough for a list of where you have been.
 *
 * ## It fails silently, and that is also the point
 *
 * Nothing a reader is doing depends on this. A failure here must not produce a
 * toast, a chip, or a save-confidence state: it is not their write, they did not
 * ask for it, and telling them about it would be noise about something they
 * cannot act on. The one thing it must not do is throw — an unhandled rejection
 * from a `useEffect` is a console error on every page.
 */

const visit = z.object({
  href: z
    .string()
    .max(200)
    .regex(/^\/app\/[A-Za-z0-9/_-]*$/, "not a route in this app"),
  label: z.string().trim().min(1).max(160),
  glyph: z.enum(["COD", "note", "page", "proj"]),
});

export async function recordVisit(input: unknown): Promise<void> {
  const parsed = visit.safeParse(input);
  if (!parsed.success) return;

  const profile = await getCurrentProfile();
  if (!profile) return;

  const supabase = await createClient();
  // `onConflict` on the composite primary key: opening the same story eleven
  // times is one row whose timestamp moves, not eleven rows.
  await supabase.from("recent_views").upsert(
    {
      profile_id: profile.id,
      href: parsed.data.href,
      label: parsed.data.label,
      glyph: parsed.data.glyph,
      opened_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,href" }
  );
}
