"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "./env";

/**
 * The browser client. Realtime subscriptions and session state only.
 *
 * Invariant 3: every mutation goes through a Server Action. The browser never
 * writes with this client, and it only ever holds the anon key.
 */
export function createClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
