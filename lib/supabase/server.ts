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
 * The same client, built from a **snapshot** of this request's cookies.
 *
 * `createClient()` closes over the `cookies()` store and reads it lazily, on
 * every call. That is right everywhere except inside `after()`, where Next 16
 * refuses to hand back request state once the response is on the wire:
 *
 *   Route /app/earnings used `cookies()` inside `after()`. This is not supported.
 *
 * It is not a warning. The callback throws, and the work in it never happens —
 * which is how the exchange rate silently never refreshed in production while
 * every page still rendered perfectly from the stored value. Found in the
 * deployment's own logs, not by a test, because the failure is invisible from
 * the outside: the page is a 200 either way.
 *
 * So the cookies are read **eagerly, on the request**, and the returned client
 * carries a plain array instead of the store. Build it in the component body;
 * use it in the callback.
 *
 * `setAll` is a no-op rather than a `try`/`catch`: a response that has already
 * been sent has nowhere to put a refreshed session, and pretending otherwise
 * would hide that. The middleware refreshes the session on the next request,
 * exactly as it does for a Server Component.
 *
 * Still the anon key, still the caller's own RLS context — this widens no
 * privilege, it only changes *when* the cookies are read.
 */
export async function createSnapshotClient() {
  const cookieStore = await cookies();
  const snapshot = cookieStore.getAll().map(({ name, value }) => ({ name, value }));

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return snapshot;
        },
        setAll() {
          // Deliberately nothing. See above.
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
    .select("id, full_name, initials, avatar_url, role, weekly_capacity_minutes, is_active, is_developer, must_set_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return { ...profile, email: user.email ?? null };
}
