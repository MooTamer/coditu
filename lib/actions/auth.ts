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

const registration = z.object({
  email: z.string().email("That does not look like an email address."),
  // Supabase's own floor is 6; asking for more here and less there would just
  // produce two different rejections for the same password.
  password: z.string().min(8, "Use at least 8 characters."),
  fullName: z.string().trim().min(2, "Tell us your name.").max(80),
  next: z.string().startsWith("/").default("/app"),
});

/**
 * Sign-up, gated by the allowlist.
 *
 * The database is the real gate: `enforce_email_allowlist` is a BEFORE INSERT
 * trigger on `auth.users`, and it refuses regardless of what any client sends.
 * But GoTrue swallows the trigger's message and returns a bare
 * `500 Database error saving new user`, which reads as a system fault rather
 * than an answer — so the allowlist is checked here first, purely to be able to
 * say something true.
 *
 * The check uses the service-role client rather than a public RPC. `allowed_emails`
 * is admin-only by policy, and adding an anonymous "is this email invited?"
 * endpoint would hand out the invite list one guess at a time.
 */
export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registration.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    next: formData.get("next") || "/app",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const email = parsed.data.email.trim().toLowerCase();

  const admin = createAdminClient();
  const { data: invited, error: lookupError } = await admin
    .from("allowed_emails")
    .select("email")
    .ilike("email", email)
    .maybeSingle();

  if (lookupError) {
    return { error: "We could not check that address just now. Try again in a moment." };
  }

  if (!invited) {
    return {
      error:
        "That email is not authorized. Coditu accounts are invite-only — ask an admin to add you, then sign up again.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    // `handle_new_user` reads `full_name` out of this to build the profile and
    // its initials; without it the profile falls back to the email local-part.
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) {
    if (/already registered|already been registered/i.test(error.message)) {
      return { error: "There is already an account for that email. Sign in instead." };
    }
    return { error: "That did not work. Nothing was created — try again." };
  }

  // No session means the project has email confirmation switched on, so the
  // account exists but cannot be used yet. Redirecting anyway would bounce off
  // the middleware straight back to this page with nothing said, which reads as
  // the form having failed.
  if (!data.session) {
    return {
      notice: `Account created. Check ${email} for a confirmation link, then sign in.`,
    };
  }

  redirect(parsed.data.next);
}

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
