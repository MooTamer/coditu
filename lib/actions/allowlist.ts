"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSiteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
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

/* -------------------------------------------------------------------------- */
/*  The door.                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Send an invited address a link it can turn into an account.
 *
 * ── What this fixes ────────────────────────────────────────────────────────
 * PF-10 removed the sign-up form, correctly: a four-person internal tool that
 * offers to make you an account describes something else. What it left behind
 * was recorded at the time and is PF-14 — there was no longer ANY path from
 * *on the allowlist* to *has an account*. `setTemporaryPassword` needs a
 * profile that already exists, and nothing sent mail, so the fifth person
 * could only be onboarded with a row inserted by hand.
 *
 * ── The gate is not what changed ───────────────────────────────────────────
 * `allowed_emails` and `enforce_email_allowlist` are untouched, and this action
 * deliberately does not write the allowlist. It READS it, and refuses an
 * address that is not on it — which is the check being a courtesy, not the
 * boundary. The boundary is still the BEFORE INSERT trigger on `auth.users`:
 * `inviteUserByEmail` inserts that row, so an uninvited address is refused by
 * the database even if this function's own check were deleted. `e2e/invite.spec.ts`
 * drives exactly that case with the check bypassed at the database level.
 *
 * So this adds a door for people an admin has already invited. It does not
 * reopen self-registration, and there is still no form anywhere that a stranger
 * can reach.
 *
 * ── Why the account is locked on the way out ───────────────────────────────
 * `inviteUserByEmail` creates an account with NO password, and the link grants
 * a real session. Without the flag below, whoever opens that link could walk
 * straight to `/app` and simply never set one — an account nobody can sign in
 * to as themselves, which is the same failure `setTemporaryPassword` guards
 * against from the other direction. `must_set_password` makes the app shell
 * hold them on `/auth/update-password` until they have chosen one.
 *
 * The flag is set AFTER the invitation, not before, and the order is forced:
 * there is no user to flag until GoTrue has made one. If the flag write then
 * fails the invitation has still gone out and the person can still use it —
 * they simply are not held at the password screen, which is recoverable by
 * sending it again. Saying the invitation failed would be the worse lie, since
 * the mail is already in their inbox.
 */
export async function sendInvitation(input: unknown): Promise<AllowlistResult> {
  const parsed = z.object({ email: z.string().email() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an address we recognise." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role !== "admin") return { ok: false, error: "Only an admin can send an invitation." };

  const email = parsed.data.email.trim().toLowerCase();

  // Read, never write. An address gets onto the allowlist by an admin deciding
  // it should be there — a separate, deliberate act with its own row and its
  // own `invited_by`. Folding that into "send them a link" would mean the list
  // grew as a side effect of a button whose label says nothing about it.
  const supabase = await createClient();
  const { data: allowed } = await supabase
    .from("allowed_emails")
    .select("email")
    .ilike("email", email)
    .maybeSingle();

  if (!allowed) {
    return { ok: false, error: `${email} is not on the invite list. Add it first.` };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    // `safeNext` in `app/auth/callback/route.ts` refuses anything that is not a
    // path on this site, so this cannot become an open redirect even if the
    // link is edited in transit.
    redirectTo: `${getSiteOrigin()}/auth/callback?next=/auth/update-password`,
  });

  if (error) {
    // GoTrue reports the allowlist trigger's refusal as a bare database error,
    // and reports an address that already has an account separately. Neither
    // message is one to show a person as-is.
    if (/already been registered|already exists/i.test(error.message)) {
      return { ok: false, error: `${email} already has an account. Send them a temporary password instead.` };
    }
    if (/rate limit|too many/i.test(error.message)) {
      return { ok: false, error: "Too many invitations have gone out just now. Try again in a few minutes." };
    }
    return { ok: false, error: `That invitation could not be sent to ${email}. Try again.` };
  }

  const invitedId = data?.user?.id;
  if (invitedId) {
    await admin.from("profiles").update({ must_set_password: true }).eq("id", invitedId);
    await admin.auth.admin.updateUserById(invitedId, { app_metadata: { must_set_password: true } });
  }

  revalidatePath("/app/people");
  return { ok: true };
}
