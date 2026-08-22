"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AVATAR_BUCKET, avatarObjectKey } from "@/lib/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { extensionFor, isAllowedImageType, looksLikeImage } from "@/lib/images";
import { initialsFor } from "@/lib/profile-initials";
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

/* -------------------------------------------------------------------------- */
/*  A temporary password.                                                      */
/* -------------------------------------------------------------------------- */

/**
 * No ambiguous glyphs. This password gets read out loud or typed off a screen,
 * and `I`/`l`/`1` and `O`/`0` are the difference between "it does not work" and
 * a support conversation. 31 characters, 16 of them, is about 79 bits.
 */
const READABLE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** The largest multiple of the alphabet that fits in a byte, for rejection sampling. */
const UNBIASED_CEILING = 256 - (256 % READABLE.length);

/**
 * Generated on the SERVER, from `crypto.getRandomValues`, and never anywhere
 * else.
 *
 * The admin does not choose it and cannot supply one: a human-chosen temporary
 * password is a guessable temporary password, and accepting one from the client
 * would mean the value that grants access to somebody else's account arrived
 * over the wire from a form.
 *
 * `% READABLE.length` on a raw byte would bias the first eight characters of
 * the alphabet upwards by about 3%. That is not an attack anybody is running,
 * and it is also two extra lines to do properly.
 */
function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let group = 0; group < 4; group += 1) {
    let out = "";
    while (out.length < 4) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (out.length === 4) break;
        if (byte >= UNBIASED_CEILING) continue;
        out += READABLE[byte % READABLE.length];
      }
    }
    groups.push(out);
  }
  return groups.join("-");
}

export interface TemporaryPasswordResult {
  ok: boolean;
  error?: string;
  /**
   * The plaintext, returned EXACTLY ONCE and never stored.
   *
   * It is not written to `profiles`, not to `activity`, not to a log line, and
   * there is no second endpoint that will hand it out again. If the admin loses
   * it before the person has it, the answer is to generate another one — which
   * is cheap, and is the only honest answer when the alternative is keeping a
   * readable password somewhere.
   */
  password?: string;
}

/**
 * An admin hands somebody a password they can sign in with once.
 *
 * ── What this is, said plainly ─────────────────────────────────────────────
 * Setting another person's password **is account takeover of that person**.
 * There is no framing that makes it not that. It is accepted here because the
 * alternative is a mail dependency the team cannot operate — see
 * `docs/05-DECISIONS.md` — and because the same four people already administer
 * each other's roles, access and allowlist. What can be limited is limited: the
 * flag set alongside it means the account cannot be *used* until its owner has
 * chosen a password of their own, so a takeover cannot be quiet.
 *
 * ── Ordering, and why the flag goes first ──────────────────────────────────
 * `auth.admin.updateUserById` is an HTTP call to GoTrue and the profile write
 * is a separate one to PostgREST; there is no transaction across the two. So
 * the flag is set FIRST. If the second call then fails, the account is
 * locked-but-recoverable — its owner is asked to choose a password and can,
 * because their existing one still works. The other order would leave it
 * reset-but-unflagged: a password only the admin knows and nothing insisting it
 * be changed.
 */
export async function setTemporaryPassword(input: unknown): Promise<TemporaryPasswordResult> {
  const parsed = z.object({ profileId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireAdmin();
  if ("error" in scope) return { ok: false, error: scope.error };

  if (parsed.data.profileId === scope.profile.id) {
    // Not a security boundary — an admin can already change their own password
    // from the sign-in screen. It is the misclick that hands you a password you
    // then have to read off your own screen to yourself.
    return { ok: false, error: "Use Settings to change your own password." };
  }

  const { data: target } = await scope.supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", parsed.data.profileId)
    .maybeSingle();

  if (!target) return { ok: false, error: "That person is no longer on the team." };

  if (!target.is_active) {
    return {
      ok: false,
      error: `${target.full_name} is deactivated, so a password would not let them in. Reactivate them first.`,
    };
  }

  // Belt to the same braces `setProfileRole` and `setProfileActive` wear. It
  // cannot fire while the caller is themselves an active admin who is not the
  // target — which `requireAdmin` and the check above guarantee — and it stays
  // because all three admin operations should refuse on the same grounds, and
  // because the guarantee is two edits away from not holding.
  if (target.role === "admin" && (await otherActiveAdmins(scope.supabase, target.id)) === 0) {
    return { ok: false, error: `${target.full_name} is the only admin. Promote someone else first.` };
  }

  const admin = createAdminClient();

  // 1. Flag first. See the note above on ordering.
  const flagged = await admin
    .from("profiles")
    .update({ must_set_password: true })
    .eq("id", target.id);

  if (flagged.error) {
    return { ok: false, error: "That did not save. Nothing has changed — try again." };
  }

  // 2. Then the password itself. `app_metadata` carries a copy of the flag for
  //    the middleware, which has only the auth server's answer to work with and
  //    deliberately makes no database call of its own.
  const password = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(target.id, {
    password,
    app_metadata: { must_set_password: true },
  });

  if (error) {
    return {
      ok: false,
      error: `${target.full_name}'s password is unchanged, and they will be asked to set one at their next sign-in. Try again.`,
    };
  }

  revalidatePath("/app/people");
  // Returned, shown once, and gone. Nothing on the way here wrote it down.
  return { ok: true, password };
}

/* -------------------------------------------------------------------------- */
/*  Your own name.                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The other thing on a profile that belongs to its owner.
 *
 * Where the boundary is, and why it is where it is: a display name and a
 * picture are how a person presents themselves, and they set both. Role,
 * capacity and access are decisions *about* a person and are an admin's, on
 * `/app/people`. That split is already documented at length at the top of this
 * file and `guard_profile_privilege_columns` enforces the half that matters —
 * so `full_name` is deliberately NOT in that trigger's list. It is not a
 * privilege.
 *
 * `initials` is re-derived rather than accepted. It is a *derived* column, and
 * the derivation already exists in `handle_new_user`; letting a form set it
 * would mean a name changed here and the same name typed at sign-up could
 * produce two different faces for one person.
 */
const displayName = z.object({
  // The same floor and ceiling the sign-up form uses. Two different limits for
  // one column is how you get a name that can be created and never corrected.
  fullName: z.string().trim().min(2, "Tell us your name.").max(80, "That is too long for a name."),
});

export interface NameResult {
  ok: boolean;
  error?: string;
  /** What was actually stored, so the caller can settle its optimistic state. */
  fullName?: string;
  initials?: string;
}

export async function setMyName(input: unknown): Promise<NameResult> {
  const parsed = displayName.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the name and try again." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const fullName = parsed.data.fullName;
  const initials = initialsFor(fullName);

  if (fullName === profile.full_name && initials === profile.initials) {
    return { ok: true, fullName, initials };
  }

  const supabase = await createClient();
  // `.eq("id", profile.id)` and not a bare update: the RLS policy allows an
  // admin to update anyone, so the scope has to come from the session rather
  // than from the request. Same reasoning as every other action here.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, initials })
    .eq("id", profile.id);

  if (error) return { ok: false, error: "That did not save. Your name is unchanged — try again." };

  revalidateEverywhereAPersonAppears();
  return { ok: true, fullName, initials };
}

/* -------------------------------------------------------------------------- */
/*  Your own picture.                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A picture is the one thing on a profile that its owner sets and nobody else
 * does. Role, capacity and access are administered on `/app/people` by an
 * admin; this is administered in Settings, by you, and there is deliberately no
 * "set someone else's photograph" path — `guard_profile_privilege_columns` does
 * not need to say anything about `avatar_url` because a picture is not a
 * privilege, and the storage policy already refuses a write outside your own
 * folder.
 */

/**
 * 2MB, and the bucket says so too.
 *
 * The browser downscales to 256px before it uploads, so a real picture arrives
 * at about 20KB and this cap is never the thing anyone meets. It is here for
 * the request that did not come from our form.
 */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export interface AvatarResult {
  ok: boolean;
  error?: string;
}

/**
 * Every replacement lands on a NEW random path, and the old object is deleted
 * after the profile has been repointed.
 *
 * Uploading over the same path would be less code and would be wrong: the
 * public URL would not change, and every browser and CDN holding the previous
 * picture would go on serving it. You would change your photograph, see the old
 * one, and have no way to tell whether the write failed. Ordering matters too —
 * the delete happens last and its failure is swallowed, because an orphaned
 * object costs 20KB and a profile pointing at a deleted object costs a broken
 * face on every screen.
 */
export async function setMyAvatar(formData: FormData): Promise<AvatarResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was received." };

  if (!isAllowedImageType(file.type)) {
    return { ok: false, error: "Pictures only — PNG, JPEG, WebP, GIF or AVIF." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "That picture is over 2MB, even after resizing. Try a smaller one." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(bytes, file.type)) {
    return { ok: false, error: "That file is not the image type it claims to be." };
  }

  const supabase = await createClient();
  const path = `${profile.id}/${crypto.randomUUID()}.${extensionFor(file.type)}`;

  const upload = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) return { ok: false, error: "That upload failed. Try again." };

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", profile.id);

  if (error) {
    // The row still points at the previous picture, so take the orphan back out
    // rather than leaving a file nothing references.
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return { ok: false, error: "The picture uploaded but did not save. Try again." };
  }

  await removeStoredAvatar(supabase, profile.avatar_url);
  revalidateEverywhereAPersonAppears();
  return { ok: true };
}

/** Back to initials. */
export async function removeMyAvatar(): Promise<AvatarResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (!profile.avatar_url) return { ok: true };

  const supabase = await createClient();

  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
  if (error) return { ok: false, error: "That did not save. Your picture is still there — try again." };

  await removeStoredAvatar(supabase, profile.avatar_url);
  revalidateEverywhereAPersonAppears();
  return { ok: true };
}

/**
 * Deletes the object a stored public URL points at. Best effort, by design:
 * anything that is not one of ours is left alone, and a failed delete leaves an
 * orphan rather than a profile pointing at nothing.
 */
async function removeStoredAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storedUrl: string | null
): Promise<void> {
  const key = avatarObjectKey(storedUrl);
  if (!key) return;
  await supabase.storage.from(AVATAR_BUCKET).remove([key]);
}

/**
 * A face is on nearly every screen in the app — the rail, the board, the table,
 * the People list, every comment — so the picture changing invalidates the
 * whole `/app` subtree rather than the one page Settings happens to be.
 */
function revalidateEverywhereAPersonAppears(): void {
  revalidatePath("/app", "layout");
}
