"use server";

import { revalidatePath } from "next/cache";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Marks the caller's unread notifications as read.
 *
 * The `profile_id` filter is belt and braces — the RLS policy already limits
 * the update to the caller's own rows — but writing it makes the intent legible
 * at the call site rather than only in a migration.
 */
export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false };

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("read_at", null);

  revalidatePath("/app/my-work");
  revalidatePath("/app");
  return { ok: true };
}
