"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "./env";
import type { Database } from "./database.types";

/**
 * The browser client. Realtime subscriptions and session state only.
 *
 * Invariant 3: every mutation goes through a Server Action. The browser never
 * writes with this client, and it only ever holds the anon key.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
