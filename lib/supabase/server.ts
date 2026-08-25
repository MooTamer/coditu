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
 * The signed-in **internal** profile, read from the database rather than the JWT.
 *
 * Invariant 3: a client-held role is never trusted. The JWT says who you are;
 * `profiles.role` says what you may do, and only the second one is
 * authoritative. Returns null for a signed-out or deactivated user.
 *
 * ── And null for a client contact, which is the load-bearing part ───────────
 *
 * This function is the front door to every internal surface: every file under
 * `lib/actions/` calls it, and so does every page under `app/app/`. Twenty-two
 * of those call sites are written as a DENYLIST —
 *
 *     if (profile.role === "engineer") return { ok: false, error: … }
 *
 * — so anything that is not an engineer is privileged. If this function
 * answered for a client contact, every one of those twenty-two would wave her
 * through to reassign work items, create sprints and commit an import.
 *
 * Returning null instead makes them **unreachable** rather than merely
 * unfriendly: the caller has already bailed out before the role is ever
 * compared. That is why the fix is here, in one place, and not twenty-two
 * edits that the twenty-third call site would not inherit.
 *
 * A client contact is not signed out, and callers must not treat her as such.
 * `getClientContact()` below is who she is; `app/app/layout.tsx` uses both to
 * tell "no session" apart from "wrong door", and sends her to `/client` rather
 * than to a sign-in form that would imply her password is wrong.
 *
 * The database agrees independently: `is_active_member()` and `auth_role()`
 * both require `account_kind = 'internal'`, so even if this check were removed
 * the select below would return nothing but her own row and every other table
 * would be empty. Two layers, on purpose.
 */
export async function getCurrentProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, initials, avatar_url, role, weekly_capacity_minutes, is_active, is_developer, must_set_password, account_kind"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  if (profile.account_kind !== "internal") return null;
  return { ...profile, email: user.email ?? null };
}

/**
 * The signed-in client contact, or null.
 *
 * The mirror image of `getCurrentProfile()`, and deliberately a separate
 * function rather than a flag on the same one. A single `getProfile()` that
 * returned both kinds would put the burden of remembering which kind it got on
 * every one of its fifty callers, and the one that forgot would be a leak. Two
 * functions cannot be confused: `lib/actions/**` calls the first and never the
 * second, `app/client/**` calls the second and never the first.
 *
 * Read on **every request**, from the database, with no claim cached anywhere.
 * That is what makes revocation immediate: an admin who revokes access changes
 * a row, and the very next request this contact makes sees it. A copy in
 * `app_metadata` would be faster and would keep letting her in until her token
 * refreshed, which for a revocation is the wrong trade.
 *
 * Membership, grants and capabilities are NOT resolved here — they are decided
 * inside the `client_*` RPCs, per project. This answers only "who is this, and
 * is she still a client contact at all".
 */
export async function getClientContact() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // `"own profile read"` is what makes this readable: the broad
  // `is_active_member()` policy excludes her, so this is the one row she gets.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, initials, avatar_url, is_active, account_kind")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  if (profile.account_kind !== "client") return null;
  return { ...profile, email: user.email ?? null };
}
