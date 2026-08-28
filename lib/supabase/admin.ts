import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";

/**
 * The service-role client. Bypasses RLS entirely.
 *
 * Use it only behind a narrow server-side capability: account/bootstrap work,
 * private Storage signing, push cleanup, and the backup-canary reporter. A
 * caller must still constrain its own operation; holding this client is not an
 * authorization decision.
 *
 * The key is read lazily inside the function rather than at module scope, so
 * importing this file in an environment without the key is not a crash — it is
 * only a crash if you actually try to use it.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

export function createAdminClient() {
  const env = schema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
