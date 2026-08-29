"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Invariant 3: every mutation is a Server Action — zod-validate, re-check
 * server-side, write, revalidate. Sign-in is no exception, and the browser
 * never talks to the auth endpoint directly.
 */

const credentials = z.object({
  email: z.string().email("That does not look like an email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().startsWith("/").default("/app"),
});

export interface AuthState {
  error?: string;
  notice?: string;
}

/**
 * There is no `signUp`, and its absence is the feature.
 *
 * It existed until PF-10 and was never an open door: it checked
 * `allowed_emails` before calling GoTrue, and `enforce_email_allowlist` — a
 * BEFORE INSERT trigger on `auth.users` — refused an uninvited address no
 * matter who asked. Both of those gates are still here; `supabase/tests` and
 * `e2e/allowlist.spec.ts` still prove the trigger refuses a direct insert.
 *
 * What went is the form. Coditu is four people's internal tool, and a screen
 * that offers to make you an account describes something else.
 *
 * **The consequence, written down rather than discovered.** Nothing in this
 * application sends email (`docs/05-DECISIONS.md`), so `/auth/callback` has no
 * sender, and `setTemporaryPassword` in `lib/actions/profiles.ts` only works on
 * somebody who already has a profile. So there is currently NO in-app path from
 * "on the allowlist" to "has an account". Onboarding the fifth person needs an
 * admin-side create — the machinery is already written for the client portal at
 * `lib/actions/client-access.ts` — or a row inserted by hand. PF-10 in
 * `docs/10-PRODUCT-FEEDBACK.md` carries this.
 */

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || "/app",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately not "no account with that email". Distinguishing a wrong
    // password from an unknown address turns the login form into a way to
    // enumerate who works here.
    return { error: "That email and password do not match." };
  }

  redirect(parsed.data.next);
}

const newPassword = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Those two passwords do not match.",
    path: ["confirm"],
  });

/**
 * Sets a password on the session that is already open.
 *
 * There is no "current password" field and there does not need to be: you are
 * here because you are signed in, and the only way to be signed in is to have
 * used a password that works — either your own, or the temporary one an admin
 * read out to you.
 *
 * **Clearing `must_set_password` is the whole point of this action now.** While
 * it is true the app shell redirects here and nothing under `/app` renders, so
 * this is the only way out of the loop, and it must not be possible to take it
 * without actually changing the password. Hence the ordering below: the flag is
 * cleared only after `updateUser` has returned without an error.
 *
 * The clear goes through the SERVICE-ROLE client, and it has to.
 * `guard_profile_privilege_columns` refuses a non-admin write to
 * `must_set_password` — that refusal is what stops the person being forced from
 * simply switching it off — and the person clearing it here is, by definition,
 * not an admin acting on somebody else. The trigger takes an early return when
 * `auth.uid()` is null, which is exactly the service-role case.
 */
export async function setPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = newPassword.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "You are not signed in any more. Sign in with the password you were given and try again.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "That password could not be saved. Try a different one." };
  }

  const admin = createAdminClient();
  const { error: clearError } = await admin
    .from("profiles")
    .update({ must_set_password: false })
    .eq("id", user.id);

  if (clearError) {
    // The password IS changed — saying otherwise would be worse than this. The
    // person is still on the forced-change screen and setting the same password
    // again will clear the flag, which is a recoverable state; telling them the
    // change failed would have them try a different one for no reason.
    return {
      error:
        "Your password is changed, but we could not lift the requirement to change it. Set it once more.",
    };
  }

  // The middleware's copy, so a signed-in visitor stops being bounced at the
  // edge as well as in the layout. See `middleware.ts` for why there are two.
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { must_set_password: false },
  });

  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Sign out everywhere except here.
 *
 * `signOut()` above takes GoTrue's default scope, which is **global** — it
 * revokes every refresh token this account has, on every device. That is the
 * right answer for a sign-out button and a trap everywhere else, and
 * `docs/07-FIELD-NOTES.md` records it costing a parallel e2e run.
 *
 * `scope: "others"` is the same call with the current session spared: a phone
 * left signed in at a client's office stops being signed in, and the laptop
 * the person is asking from does not. There is no confirmation step because
 * there is nothing to undo and nothing to lose — the cost of pressing it by
 * accident is signing in again.
 *
 * Nothing is revalidated: this session is untouched, so every rendered page on
 * it is still correct. The other devices find out on their next request, when
 * the refresh they were about to make is refused.
 */
export async function signOutOtherDevices(): Promise<AuthState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You are not signed in any more." };
  }

  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    return { error: "Those sessions could not be signed out. Try again in a moment." };
  }

  return { notice: "Every other device has been signed out." };
}

/**
 * Finish a sign-in link that came back in the URL FRAGMENT.
 *
 * ── Why this exists, and why it is not `/auth/callback` ────────────────────
 * `app/auth/callback/route.ts` handles the PKCE flow: the link returns with
 * `?code=`, the server exchanges it, done. An **admin-generated invitation has
 * no PKCE verifier** — nobody ran `signInWithOtp` on the recipient's device, so
 * there is no challenge to answer — and GoTrue therefore falls back to the
 * implicit flow and returns:
 *
 *     /auth/callback#access_token=…&refresh_token=…&type=invite
 *
 * A fragment is never sent to a server. The callback route saw no `code`,
 * concluded the link was dead, and sent the invited person to
 * `/login?error=link`. That route's own comment predicted this exact case; it
 * simply had no caller until `sendInvitation` made one.
 *
 * ── Why an action and not a client Supabase instance ───────────────────────
 * The obvious fix is `createBrowserClient().setSession(...)` in a client
 * component. This app has NO `createBrowserClient` anywhere, on purpose —
 * `lib/supabase/env.ts` explains that even zod is too heavy to ship for this —
 * and adding one would put `@supabase/ssr` and `supabase-js` into a route's
 * bundle to run four lines once. So the tokens are handed to the server, which
 * already has a client, and the cookies are written where every other session
 * cookie in this app is written.
 *
 * A Server Action rather than a route handler because Next verifies the origin
 * of an action for us, and because invariant 3 says so.
 *
 * ── What this does not weaken ──────────────────────────────────────────────
 * The tokens ARE the credential. Anyone holding them can already call GoTrue
 * directly; handing them to our own origin grants nothing that was not already
 * granted. `setSession` verifies the signature — a forged or expired pair is
 * refused here, by the auth server, not by this function believing the caller.
 */
export async function establishSessionFromLink(input: unknown): Promise<AuthState> {
  const parsed = z
    .object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) })
    .safeParse(input);

  if (!parsed.success) return { error: "That link is no longer valid." };

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: parsed.data.accessToken,
    refresh_token: parsed.data.refreshToken,
  });

  if (error) return { error: "That link is no longer valid." };

  return {};
}
