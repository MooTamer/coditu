"use server";

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

const magicLink = z.object({
  email: z.string().email("That does not look like an email address."),
  next: z.string().startsWith("/").default("/app"),
});

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = magicLink.safeParse({
    email: formData.get("email"),
    next: formData.get("next") || "/app",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // shouldCreateUser is false because sign-up is closed. The allowlist
      // trigger would refuse the insert anyway; this just avoids the round trip.
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback?next=${parsed.data.next}`,
    },
  });

  // Always the same message, whether or not the address exists. Same reason as
  // above: the response must not reveal who is on the allowlist.
  return { notice: "If that address is on the allowlist, a sign-in link is on its way." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
