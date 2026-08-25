import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { createBreaker } from "@/lib/circuit-breaker";

/**
 * Guards `/app/*` and keeps the Supabase session cookie fresh.
 *
 * This is a gate, not the authorization model. It answers "is there a session"
 * and nothing else — roles are read server-side from `profiles` in the pages
 * and actions themselves. A middleware that tried to enforce roles would be
 * reading them from a token the client holds, which invariant 3 forbids.
 *
 * ── Why there is a circuit breaker in here ─────────────────────────────────
 * This function used to run on every request that was not a static file, and
 * every one of those requests made a network call to the auth server. That put
 * Supabase on the critical path of the **marketing site**, which has no
 * database, no session, and nothing to gate. An auth server having a bad
 * afternoon would have made `/` slow for people who had never signed in.
 *
 * Two changes, in the order that matters:
 *
 * 1. The matcher now covers `/app/*` and `/login` only. The cheapest way to
 *    stop a dependency dragging down an unrelated part of the app is not to
 *    call it from there.
 * 2. What remains gets a deadline and a breaker. `getUser()` revalidates
 *    against the auth server, so a slow auth server is a slow sign-in check on
 *    every single navigation inside the app, and once it is clearly unwell
 *    there is nothing to gain by asking it again 200 more times.
 *
 * When the breaker is open the gate stays SHUT: `/app` redirects to sign-in.
 * Failing open would be a considerably more interesting bug than a slow page.
 */

/**
 * Module scope, so it is per-instance. On a serverless host each warm instance
 * learns for itself, which is imperfect and still worth having — an instance
 * that has just waited 2.5s for nothing stops doing that to the next hundred
 * requests it serves.
 *
 * 2.5s: `getUser()` is one HTTP round trip to GoTrue and normally answers in
 * tens of milliseconds. Anything past this is not slow, it is broken.
 */
const authBreaker = createBreaker({
  name: "supabase-auth",
  failureThreshold: 3,
  resetAfterMs: 10_000,
  timeoutMs: 2_500,
});

/** Belt to the matcher's braces — this stays true if the matcher is edited. */
function needsSession(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/client" ||
    pathname.startsWith("/client/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!needsSession(pathname)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  let user: { id: string; app_metadata?: Record<string, unknown> } | null = null;
  let reachable = true;

  try {
    user = await authBreaker.run(async (signal) => {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          // supabase-js takes no abort signal of its own, so it is handed one
          // here. Without this the breaker's race would release the request
          // while the socket stayed open behind it — which is how you end up
          // with a fast page and an exhausted connection pool.
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, { ...init, signal }),
          },
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              for (const { name, value } of cookiesToSet) {
                request.cookies.set(name, value);
              }
              response = NextResponse.next({ request });
              for (const { name, value, options } of cookiesToSet) {
                response.cookies.set(name, value, options);
              }
            },
          },
        }
      );

      // getUser(), not getSession(). getSession() reads the cookie and trusts
      // it; getUser() revalidates against the auth server. On a gate, the
      // difference is the whole point — and it is also why this call is the one
      // worth putting a deadline on.
      const { data, error } = await supabase.auth.getUser();

      // "No session" is an ANSWER, not a failure: it arrives with an HTTP
      // status. Only a transport failure has none, and counting a signed-out
      // visitor as a failure would trip the breaker on ordinary traffic.
      if (error && !error.status) throw error;
      return data.user ?? null;
    });
  } catch {
    reachable = false;
  }

  if (!reachable) {
    // Fail closed on the gate, and let `/login` render. The form's own Server
    // Action will fail too, with a message — which is a better answer than a
    // page that hangs until the platform kills it.
    if (pathname !== "/login") {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      login.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(login);
    }
    return NextResponse.next({ request });
  }

  if (!user && pathname !== "/login") {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (user && pathname === "/login") {
    const app = request.nextUrl.clone();
    app.pathname = "/app";
    app.search = "";
    return NextResponse.redirect(app);
  }

  /**
   * ── The forced password change, at the edge ────────────────────────────────
   * An admin has handed this account a temporary password. It can sign in — it
   * has to, or the person could not set a new one — but nothing under `/app`
   * may render until they do.
   *
   * **This is a courtesy, not the gate.** `app/app/layout.tsx` re-reads
   * `profiles.must_set_password` server-side and that is what actually holds
   * the line; two things stop this from being the real check:
   *
   *  - `/auth/update-password` is outside the matcher below, deliberately, and
   *    widening it would put the auth server back on the critical path of a
   *    route it has no business gating. Read the circuit-breaker note at the
   *    top before touching that list.
   *  - This reads `app_metadata`, which the service-role client writes
   *    alongside the column in `setTemporaryPassword` and clears in
   *    `setPassword`. It is server-written and a client cannot forge it, but it
   *    is still a copy — and a copy can go stale. A stale copy here costs one
   *    extra redirect that the layout then resolves correctly; the layout's copy
   *    is the one that is never wrong.
   *
   * What it buys: a phone that is bounced without a dynamic render happening at
   * all. There is no second database call for it — `getUser()` above already
   * returned this object.
   *
   * ── And why it is document navigations only ───────────────────────────────
   * `Sec-Fetch-Dest: document` is the browser's own word for "this is a real
   * navigation" — a `fetch()` from JavaScript says `empty`. A 307 from
   * middleware in answer to the router's own fetch is not something the App
   * Router follows: it leaves the address bar on
   * the old URL and renders nothing, which is exactly what a person signing in
   * with a temporary password saw — the Server Action redirected to `/app`, the
   * router asked for it, middleware answered with a redirect the router
   * discarded, and the page simply stopped. Took an hour and a bisect to find,
   * because both gates were "working" and the failure was in the handshake
   * between them.
   *
   * A client-side navigation is already covered, correctly, by the layout: a
   * `redirect()` from a Server Component is encoded IN the RSC payload, which
   * the router does understand. So this handles the cold case — a typed URL, a
   * refresh, a PWA launch — and stays out of the way of the other.
   */
  const isDocumentNavigation = request.headers.get("sec-fetch-dest") === "document";

  if (
    user &&
    isDocumentNavigation &&
    user.app_metadata?.must_set_password === true &&
    pathname !== "/login"
  ) {
    const change = request.nextUrl.clone();
    change.pathname = "/auth/update-password";
    change.search = "";
    return NextResponse.redirect(change);
  }

  return response;
}

export const config = {
  // The surfaces that have anything to do with a session. Everything else —
  // the whole marketing site, every static asset, every image — is served
  // without touching the auth server at all.
  //
  // `/client` is on the list for the same reason `/app` is, and for no more
  // than that reason: this is a session gate, not the authorization model.
  // Which KIND of account may be here is decided by `app/client/layout.tsx`,
  // server-side, against the database — never here, where the only thing
  // available is a token the client holds.
  matcher: ["/app", "/app/:path*", "/client", "/client/:path*", "/login"],
};
