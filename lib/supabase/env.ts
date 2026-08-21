import { z } from "zod";

/**
 * Environment, validated at the boundary.
 *
 * Split into two schemas on purpose. Everything in `publicEnv` is inlined into
 * the client bundle by Next; everything in `serverEnv` must never be. Keeping
 * them apart makes "did I just ship the service-role key to the browser" a
 * question the type system answers.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const parsed = publicSchema.safeParse({
  // Written out rather than read from a loop: Next replaces `process.env.X`
  // textually when it bundles for the browser, so a dynamic lookup would
  // resolve to undefined on the client with no build error to warn you.
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");

  // The build fails here on a host that has no environment set, so the message
  // has to be useful in BOTH places. Telling a Vercel build to run
  // `npm run db:start` sends whoever reads it down a road that does not exist.
  const onAHost = Boolean(process.env.VERCEL || process.env.CI);
  const fix = onAHost
    ? "Set them as project environment variables on the host (Vercel: Settings → Environment Variables), then redeploy. See .env.example for the full list."
    : "Copy .env.example to .env.local, then run `npm run db:start` — it prints the values.";

  throw new Error(`Supabase environment is not configured (${missing}). ${fix}`);
}

export const publicEnv = parsed.data;
