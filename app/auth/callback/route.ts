import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where every email link lands.
 *
 * This route did not exist. `sendMagicLink` has always pointed
 * `emailRedirectTo` at `/auth/callback`, and the login page has always offered
 * "Send a sign-in link" — so the fallback was advertised, the mail was sent, and
 * the link arrived at a 404. Nothing anywhere called `exchangeCodeForSession`,
 * so even a link that resolved would not have produced a session. Same shape as
 * the ⌘K badge that did nothing: a control that looks finished and is not
 * connected to anything.
 *
 * A password reset needs exactly the same landing, which is why one route
 * serves both — `next` decides where the person ends up once the session
 * exists.
 *
 * `@supabase/ssr` uses the PKCE flow, so the link comes back with `?code=`,
 * which is exchanged for a session here and written to cookies by the server
 * client. The older implicit flow put the token in the URL *fragment*, which
 * never reaches the server at all — worth knowing if a link ever arrives with
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

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
