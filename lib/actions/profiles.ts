"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { APP_ROLES } from "@/lib/work-items";

/**
 * Who is on the team, and what they may do.
 *
 * Invariant 3: zod-validate → re-check authorization server-side → write →
 * revalidate. RLS and `guard_profile_privilege_columns` are what actually stop
 * these writes — a lead calling this directly gets a `42501` from the trigger.
 * The checks here exist so the answer is a sentence.
 *
 * Two rules are enforced here and nowhere else, because neither is expressible
 * as a policy:
 *
 *  - **You cannot change your own role, or deactivate yourself.** Not a
 *    security boundary — an admin who demotes themselves has not escalated
 *    anything — but it is the single misclick that locks a person out of the
 *    tool they administer, and it needs a second person to undo.
 *  - **The last active admin stays an active admin.** A team with no admin has
 *    no way back: nobody can invite, nobody can promote, and the fix is a SQL
 *    console. The database cannot express "at least one row must satisfy this",
 *    so the application does, and it does it on the server.
 */

export interface ProfileResult {
  ok: boolean;
  error?: string;
}

const uuid = z.string().uuid();

/** Everyone who could still let the others back in. */
async function otherActiveAdmins(
  supabase: Awaited<ReturnType<typeof createClient>>,
  excluding: string
): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true)
    .neq("id", excluding);
  return count ?? 0;
}

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You are not signed in." } as const;
  if (profile.role !== "admin") {
    return { error: "Only an admin can change who is on the team." } as const;
  }
  return { profile, supabase: await createClient() } as const;
}

/* -------------------------------------------------------------------------- */

const roleInput = z.object({ profileId: uuid, role: z.enum(APP_ROLES) });

export async function setProfileRole(input: unknown): Promise<ProfileResult> {
  const parsed = roleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a role we recognise." };

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  if (parsed.data.profileId === scope.profile.id) {
    return { ok: false, error: "You cannot change your own role. Ask another admin." };
  }

  const { data: target } = await scope.supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", parsed.data.profileId)
    .maybeSingle();

  if (!target) return { ok: false, error: "That person is no longer on the team." };
  if (target.role === parsed.data.role) return { ok: true };

  if (target.role === "admin" && target.is_active) {
    if ((await otherActiveAdmins(scope.supabase, target.id)) === 0) {
      return { ok: false, error: `${target.full_name} is the only admin. Promote someone else first.` };
    }
  }

  const { error } = await scope.supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", target.id);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath("/app/people");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const activeInput = z.object({ profileId: uuid, isActive: z.boolean() });

/**
 * Deactivate or reactivate somebody.
 *
 * This is what "removing" a person means here, and it is the honest operation:
 * a profile row belongs to an `auth.users` row, and deleting that cascades
 * through their time entries — which are what the sprint totals and the client
 * invoice are built from. Their hours would silently change, retroactively, in
 * a report that has already been sent.
 *
 * Deactivating takes their access away immediately (`getCurrentProfile` returns
 * null for an inactive profile, so the shell redirects to sign-in), drops them
 * out of `v_person_load`, the mention list and the assignee menus, and leaves
 * every hour and comment they wrote exactly where it is.
 */
export async function setProfileActive(input: unknown): Promise<ProfileResult> {
  const parsed = activeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  if (parsed.data.profileId === scope.profile.id) {
    return { ok: false, error: "You cannot deactivate yourself. Ask another admin." };
  }

  const { data: target } = await scope.supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", parsed.data.profileId)
    .maybeSingle();

  if (!target) return { ok: false, error: "That person is no longer on the team." };
  if (target.is_active === parsed.data.isActive) return { ok: true };

  if (!parsed.data.isActive && target.role === "admin") {
    if ((await otherActiveAdmins(scope.supabase, target.id)) === 0) {
      return { ok: false, error: `${target.full_name} is the only admin. Promote someone else first.` };
    }
  }

  const { error } = await scope.supabase
    .from("profiles")
    .update({ is_active: parsed.data.isActive })
    .eq("id", target.id);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath("/app/people");
  return { ok: true };
}
