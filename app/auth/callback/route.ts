import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where a Supabase auth link would land, if anything still sent one.
 *
 * **Nothing in this application sends email any more** — `docs/05-DECISIONS.md`
 * records why, and recovery is an admin handing out a temporary password. This
 * route is kept anyway, deliberately, for two reasons: it costs nothing, and
 * its open-redirect guard below is written and tested. Deleting a tested guard
 * because its caller went away is how it comes back untested. It also still
 * serves the `next` redirect that lands somebody on `/auth/update-password`.
 *
 * It is worth knowing how this route came to exist at all: the login page
 * offered to email a sign-in link for months, the mail was sent, and the link
 * arrived at a 404 — the route was never built and nothing anywhere called
 * `exchangeCodeForSession`. A control that looks finished and is connected to
 * nothing, which is a shape this repository has now met three times.
 *
 * `@supabase/ssr` uses the PKCE flow, so a link comes back with `?code=`, which
 * is exchanged for a session here and written to cookies by the server client.
 * The older implicit flow put the token in the URL *fragment*, which never
 * reaches the server at all — worth knowing if a link ever arrives with
 * `#access_token=` instead.
 */
export const dynamic = "force-dynamic";

/**
 * Only ever redirect somewhere inside this app.
 *
 * `next` arrives in a URL that is emailed to somebody, which makes it an open
 * redirect waiting to happen: `?next=https://evil.example` would turn our own
 * sign-in link into a credible way to send a signed-in person anywhere. A
 * leading `//` is the case people forget — the browser reads `//evil.example`
 * as protocol-relative and leaves the site.
 */
function safeNext(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  // Supabase reports a refused or expired link by redirecting here with an
  // error rather than a code. Say so plainly instead of showing a blank form.
  const errorCode = searchParams.get("error") ?? searchParams.get("error_code");
  if (errorCode) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  // No code is not necessarily a dead link any more.
  //
  // An admin-generated invitation has no PKCE verifier, so GoTrue answers with
  // the implicit flow and puts the tokens in the FRAGMENT — which a server
  // never sees. The note above predicted this shape; `sendInvitation` is what
  // finally produces it. `/auth/complete` is rendered in a browser and can read
  // it, and the fragment survives the hop because a redirect to a target with
  // no fragment of its own leaves the original in place.
  //
  // A bare visit with neither a code nor a fragment still ends at
  // `/login?error=link` — one redirect later, from that page.
  if (!code) {
    return NextResponse.redirect(
      new URL(`/auth/complete?next=${encodeURIComponent(next)}`, origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
