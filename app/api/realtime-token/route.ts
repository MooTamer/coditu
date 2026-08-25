import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * The access token realtime subscribes with.
 *
 * ## Why this endpoint exists at all
 *
 * Realtime needs two things from the browser: a websocket and a JWT. Getting
 * the JWT used to mean `createBrowserClient()` from `@supabase/ssr`, which
 * builds the whole `SupabaseClient` — auth, postgrest, storage, functions — to
 * read one string out of a cookie. That was **65 KB gzipped, 55% of the app
 * shell's entire JS budget**, for a token the page could already see.
 *
 * `@supabase/realtime-js` on its own is a fraction of that, and it takes the
 * token as an `accessToken: () => Promise<string | null>` callback. This route
 * is that callback's other end.
 *
 * ## Why handing the token back is not an escalation
 *
 * `@supabase/ssr` deliberately does **not** set `httpOnly` on the auth cookie —
 * `createBrowserClient` has to be able to read it from `document.cookie`, so
 * every line of JavaScript on the page already can. This route returns the same
 * token, to the same session, derived from the same cookie. It grants nothing
 * that was not already reachable; it just means the code that reads it is 65 KB
 * smaller.
 *
 * What it deliberately does NOT return is the refresh token. That one is the
 * long-lived credential, and nothing in the browser needs it: when the access
 * token expires, realtime-js calls this again and the middleware has already
 * refreshed the session on the way in.
 *
 * ## The parts that are load-bearing
 *
 * - **`no-store`, on every path including the 401.** A cached token is a token
 *   served to the next person through a shared proxy.
 * - **`getSession()`, not `getUser()`.** `getUser()` verifies with the auth
 *   server, which is the right call when a decision hangs on the answer. Here
 *   nothing is being authorized: the response is the caller's own token echoed
 *   back, and a forged cookie earns a forged token that realtime rejects on its
 *   own. A network round trip per reconnect would buy nothing.
 * - **No body on the 401.** "Not signed in" is the whole message, and the
 *   client treats a null token as "do not subscribe".
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" } as const;

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session?.access_token) {
    return new NextResponse(null, { status: 401, headers: NO_STORE });
  }

  return NextResponse.json(
    { token: session.access_token, expiresAt: session.expires_at ?? null },
    { headers: NO_STORE }
  );
}
