import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "./env";
import type { Database } from "./database.types";

/**
 * The Supabase client for Server Components, Server Actions, and Route
 * Handlers. Reads the session from cookies; carries the anon key and therefore
 * the caller's own RLS context, never elevated rights.
 *
 * `server-only` at the top is the guard rail: importing this from a client
 * component is a build error rather than a runtime surprise.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. The middleware refreshes
            // the session on every request, so a failure here is expected and
            // harmless — swallowing it is correct, not lazy.
          }
        },
      },
    }
  );
}

/**
 * The signed-in profile, read from the database rather than the JWT.
 *
 * Invariant 3: a client-held role is never trusted. The JWT says who you are;
 * `profiles.role` says what you may do, and only the second one is
 * authoritative. Returns null for a signed-out or deactivated user.
 */
export async function getCurrentProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, initials, avatar_url, role, weekly_capacity_minutes, is_active, must_set_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return { ...profile, email: user.email ?? null };
}
