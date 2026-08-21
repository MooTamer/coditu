"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Invite and un-invite.
 *
 * Invariant 3: zod-validate, re-check authorization server-side, write,
 * revalidate. The role check here is not the security boundary — RLS is, and
 * `allowed_emails` is admin-only in all four verbs — but a policy rejection
 * surfaces as a silent no-op, and a form that appears to work while doing
 * nothing is worse than one that says no.
 */
export interface AllowlistResult {
  ok: boolean;
  error?: string;
}

const invite = z.object({
  email: z.string().email("That does not look like an email address."),
  note: z.string().trim().max(120).optional(),
});

export async function addAllowedEmail(input: unknown): Promise<AllowlistResult> {
  const parsed = invite.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the address and try again." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role !== "admin") return { ok: false, error: "Only an admin can invite people." };

  // Stored lower-case. The trigger compares case-insensitively either way, but
  // a list showing the same address twice in different cases is a list nobody
  // trusts.
  const email = parsed.data.email.trim().toLowerCase();

  const supabase = await createClient();
  const { error } = await supabase.from("allowed_emails").insert({
    email,
    note: parsed.data.note?.length ? parsed.data.note : null,
    invited_by: profile.id,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: `${email} is already invited.` };
    return { ok: false, error: "That invite did not save. Try again." };
  }

  revalidatePath("/app/people");
  return { ok: true };
}

export async function removeAllowedEmail(input: unknown): Promise<AllowlistResult> {
  const parsed = z.object({ email: z.string().email() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an address we recognise." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role !== "admin") return { ok: false, error: "Only an admin can withdraw an invite." };

  const email = parsed.data.email.trim().toLowerCase();
  if (email === profile.email?.toLowerCase()) {
    return { ok: false, error: "You cannot remove your own address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("allowed_emails").delete().eq("email", email);
  if (error) return { ok: false, error: "That did not save. Try again." };

  revalidatePath("/app/people");
  return { ok: true };
}
