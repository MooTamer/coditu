/**
 * Public environment, validated at the boundary.
 *
 * Deliberately zod-free. This module is reachable from the browser — the
 * Supabase client imports it — and zod is ~63KB gzipped, which is a large
 * price for checking that two strings are present and one of them is a URL.
 * The server-side schemas still use zod, where its cost is paid once and never
 * shipped.
 *
 * Only `NEXT_PUBLIC_*` belongs here. Anything secret is read where it is used,
 * from a `server-only` module, so "did I just ship the service-role key to the
 * browser" stays a question with a structural answer.
 */

function readPublic(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  // Written out rather than read from a loop: Next replaces `process.env.X`
  // textually when it bundles for the browser, so a dynamic lookup would
  // resolve to undefined on the client with no build error to warn you.
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!value) return "";
  return value;
}

const url = readPublic("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = readPublic("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const missing: string[] = [];
if (!url || !URL.canParse(url)) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (anonKey.length < 20) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

if (missing.length > 0) {
  // The build fails here on a host that has no environment set, so the message
  // has to be useful in BOTH places. Telling a Vercel build to run
  // `npm run db:start` sends whoever reads it down a road that does not exist.
  const onAHost = Boolean(process.env.VERCEL || process.env.CI);
  const fix = onAHost
    ? "Set them as project environment variables on the host (Vercel: Settings → Environment Variables), then redeploy. See .env.example for the full list."
    : "Copy .env.example to .env.local, then run `npm run db:start` — it prints the values.";

  throw new Error(`Supabase environment is not configured (${missing.join(", ")}). ${fix}`);
}

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
};
