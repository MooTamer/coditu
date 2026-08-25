"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CLIENT_CAPABILITIES, resolveCapabilities } from "@/lib/client-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { generateTemporaryPassword } from "@/lib/temporary-password";

/**
 * Client access, administered.
 *
 * Invariant 3 throughout: zod-validate, re-check authorization server-side,
 * write, revalidate. The role check in each of these is **not** the security
 * boundary — RLS is, and every one of these tables is admin-only in the verbs
 * that matter — but a policy rejection surfaces as a silent no-op or a bare
 * PostgREST code, and a form that appears to work while doing nothing is worse
 * than one that says no.
 */

export interface AccessResult {
  ok: boolean;
  error?: string;
  /**
   * The temporary password, returned EXACTLY ONCE and stored nowhere.
   *
   * Not in a table, not in `activity`, not in a log line, and there is no
   * second endpoint that hands it out again. Losing it before the contact has
   * it means generating another, which is cheap — and is the only honest answer
   * when the alternative is keeping a readable password somewhere.
   */
  password?: string;
}

const uuid = z.string().uuid();

const capability = z.enum(CLIENT_CAPABILITIES);
const preset = z.enum(["observer", "collaborator", "custom"]);

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You are not signed in." as const };
  if (profile.role !== "admin") {
    // Deliberately not "lead or admin". A lead runs delivery and can create
    // clients and projects; deciding who OUTSIDE the company may see them is a
    // different question and it sits where the email allowlist and role changes
    // already sit.
    return { error: "Only an admin can change client access." as const };
  }
  const supabase = await createClient();
  return { profile, supabase };
}

/* -------------------------------------------------------------------------- */

const inviteInput = z.object({
  email: z.string().email("That does not look like an email address."),
  clientId: uuid,
  projectIds: z.array(uuid).min(1, "Choose at least one project."),
  preset,
  capabilities: z.array(capability).default([]),
});

/**
 * Invite a client contact, and hand back the password once.
 *
 * ── There is no email, and this does not pretend otherwise ─────────────────
 *
 * `docs/05-DECISIONS.md` (2026-08-22) is categorical: Coditu sends no email.
 * There is no transport this team can operate — Vercel's free tier allows two
 * an hour and Supabase's shared sender is rate-limited and documented as not
 * for production. So this creates the account and returns a password for an
 * admin to hand over, exactly as `setTemporaryPassword` does for a teammate.
 * Nothing here says "invitation sent", because nothing was sent.
 *
 * ── The order, and why it is this order ────────────────────────────────────
 *
 * The invitation row is written FIRST, before the account exists. It has to be:
 * `handle_new_user` reads it to decide the account is a client one, and creates
 * the contact and grants in the same transaction as the profile. Create the
 * account first and there is a window — short, unobservable, real — in which a
 * brand-new account is `internal` and reads the entire database.
 *
 * If account creation then fails, what is left is a pending invitation and no
 * account: visible on this screen, withdrawable, and harmless. The other order
 * leaves an internal account nobody meant to make.
 */
export async function inviteClientContact(input: unknown): Promise<AccessResult> {
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  const email = parsed.data.email.trim().toLowerCase();
  const capabilities = resolveCapabilities(parsed.data.preset, parsed.data.capabilities);

  if (capabilities.length === 0) {
    return { ok: false, error: "That would grant nothing at all. Choose what they may see." };
  }

  // Every project must belong to the company being invited into.
  // `guard_client_grant_company` refuses the grant regardless, but it fires
  // deep inside `handle_new_user` where the only thing the admin would see is a
  // failed sign-up hours later. Checked here so the answer arrives now.
  const { data: projects, error: projectError } = await scope.supabase
    .from("projects")
    .select("id")
    .eq("client_id", parsed.data.clientId)
    .in("id", parsed.data.projectIds);

  if (projectError) return { ok: false, error: "We could not check those projects. Try again." };
  if ((projects?.length ?? 0) !== parsed.data.projectIds.length) {
    return { ok: false, error: "One of those projects does not belong to this client." };
  }

  const admin = createAdminClient();

  // Already has an account? Say so by name rather than failing on a unique
  // index the person reading this cannot see.
  const { data: users } = await admin.auth.admin.listUsers();
  if (users?.users?.some((user) => user.email?.toLowerCase() === email)) {
    return {
      ok: false,
      error: `${email} already has an account. Give them access from their row instead of inviting them again.`,
    };
  }

  const { data: invitation, error: inviteError } = await scope.supabase
    .from("client_invitations")
    .insert({
      email,
      client_id: parsed.data.clientId,
      capabilities,
      created_by: scope.profile.id,
    })
    .select("id")
    .single();

  if (inviteError || !invitation) {
    if (inviteError?.code === "23505") {
      return { ok: false, error: `${email} already has an invitation waiting.` };
    }
    return { ok: false, error: "That invitation did not save. Nothing was created — try again." };
  }

  const { error: projectsError } = await scope.supabase
    .from("client_invitation_projects")
    .insert(parsed.data.projectIds.map((project_id) => ({ invitation_id: invitation.id, project_id })));

  if (projectsError) {
    // Roll the invitation back by hand: there is no transaction across two
    // PostgREST calls, and an invitation naming no projects would create a
    // contact with no access and no explanation.
    await scope.supabase.from("client_invitations").delete().eq("id", invitation.id);
    return { ok: false, error: "That invitation did not save. Nothing was created — try again." };
  }

  const password = generateTemporaryPassword();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Nothing authorization-related goes in here, and that is the point. The
    // account kind comes from the invitation row `handle_new_user` reads;
    // `raw_user_meta_data` is client-controlled on the public sign-up endpoint
    // and this app has already been bitten once by trusting it.
    user_metadata: { full_name: email.split("@")[0] },
  });

  if (createError) {
    await scope.supabase.from("client_invitations").delete().eq("id", invitation.id);
    return {
      ok: false,
      error: "That account could not be created. The invitation has been withdrawn — try again.",
    };
  }

  // Force a password change, the same way `setTemporaryPassword` does: the copy
  // in `app_metadata` is what the middleware reads, and the column is what the
  // layout enforces.
  const { data: created } = await admin.auth.admin.listUsers();
  const newUser = created?.users?.find((user) => user.email?.toLowerCase() === email);
  if (newUser) {
    await admin.from("profiles").update({ must_set_password: true }).eq("id", newUser.id);
    await admin.auth.admin.updateUserById(newUser.id, {
      app_metadata: { must_set_password: true },
    });
  }

  revalidatePath("/app/clients");
  return { ok: true, password };
}

/* -------------------------------------------------------------------------- */

const grantInput = z.object({
  contactProfileId: uuid,
  projectId: uuid,
  preset,
  capabilities: z.array(capability).default([]),
});

/** Change what one contact may do in one project. */
export async function setClientGrant(input: unknown): Promise<AccessResult> {
  const parsed = grantInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  const capabilities = resolveCapabilities(parsed.data.preset, parsed.data.capabilities);

  // `upsert` rather than update-then-insert: the row may not exist yet, and the
  // primary key is exactly the pair being written. `guard_client_grant_company`
  // still refuses a project belonging to another company.
  const { error } = await scope.supabase.from("client_project_grants").upsert(
    {
      contact_profile_id: parsed.data.contactProfileId,
      project_id: parsed.data.projectId,
      capabilities,
      granted_by: scope.profile.id,
      revoked_at: null,
    },
    { onConflict: "contact_profile_id,project_id" }
  );

  if (error) {
    if (error.code === "23514") {
      return { ok: false, error: "That project belongs to a different client." };
    }
    return { ok: false, error: "That did not save. Try again." };
  }

  revalidatePath("/app/clients");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const contactInput = z.object({ contactProfileId: uuid });

/**
 * Withdraw access.
 *
 * Both the contact's status and every grant are stamped, and neither is
 * deleted. Two reasons: `client_has_capability()` checks both, so stamping both
 * means neither half can be missed by a later restore; and "who could see this
 * in March" stays answerable, which is the question that gets asked after
 * something goes wrong rather than before.
 *
 * The account itself is untouched. She can still sign in and will see the
 * "your access is being set up" screen — which is honest, and is a much better
 * answer than a login form rejecting a password that works.
 */
export async function revokeClientAccess(input: unknown): Promise<AccessResult> {
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  const now = new Date().toISOString();

  const { error } = await scope.supabase
    .from("client_contacts")
    .update({ status: "revoked", revoked_at: now })
    .eq("profile_id", parsed.data.contactProfileId);

  if (error) return { ok: false, error: "That did not save. Try again." };

  await scope.supabase
    .from("client_project_grants")
    .update({ revoked_at: now })
    .eq("contact_profile_id", parsed.data.contactProfileId)
    .is("revoked_at", null);

  revalidatePath("/app/clients");
  return { ok: true };
}

/** Put it back. The grants that were live at revocation come back live. */
export async function restoreClientAccess(input: unknown): Promise<AccessResult> {
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  const { error } = await scope.supabase
    .from("client_contacts")
    .update({ status: "active", revoked_at: null })
    .eq("profile_id", parsed.data.contactProfileId);

  if (error) return { ok: false, error: "That did not save. Try again." };

  await scope.supabase
    .from("client_project_grants")
    .update({ revoked_at: null })
    .eq("contact_profile_id", parsed.data.contactProfileId);

  revalidatePath("/app/clients");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

/**
 * Withdraw an invitation nobody has claimed.
 *
 * A real delete, and it is the one place in this feature that deletes anything.
 * An unclaimed invitation is not history — nothing happened, nobody signed in,
 * and there is no message with a name on it. Keeping it would leave an address
 * that can still open an account looking, on this screen, like it cannot.
 */
export async function withdrawInvitation(input: unknown): Promise<AccessResult> {
  const parsed = z.object({ invitationId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  const { error } = await scope.supabase
    .from("client_invitations")
    .delete()
    .eq("id", parsed.data.invitationId)
    .eq("status", "pending");

  if (error) return { ok: false, error: "That did not save. Try again." };

  revalidatePath("/app/clients");
  return { ok: true };
}
