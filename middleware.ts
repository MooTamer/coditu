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
  return pathname === "/login" || pathname === "/app" || pathname.startsWith("/app/");
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!needsSession(pathname)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  let user: { id: string } | null = null;
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

  return response;
}

export const config = {
  // The two surfaces that have anything to do with a session. Everything else —
  // the whole marketing site, every static asset, every image — is served
  // without touching the auth server at all.
  matcher: ["/app", "/app/:path*", "/login"],
};
