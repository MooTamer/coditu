"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

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
