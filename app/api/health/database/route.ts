import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { publicEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" } as const;

/** The one word an external monitor watches for. Changing it breaks the monitor. */
export const DATABASE_AWAKE = "coditu-database-awake";

/** A wedged database must fail fast, not hold the monitor open until it times out. */
const DEADLINE_MS = 5_000;

/**
 * Keepalive, and the only honest one this app has.
 *
 * A free Supabase project pauses after about seven days of low **user database**
 * activity, which is downtime with no deploy involved. A monitor on `/login`
 * reaches Supabase Auth, a separate service; whether the provider counts that as
 * database activity is not something this repository can assert. `/api/backup-health`
 * must never be used for it — that endpoint means a real off-site archive was read,
 * and pinging it to keep a database awake would make the Recovery Centre lie.
 *
 * So this route does one thing: call `public.database_heartbeat()`, which performs a
 * bounded read of a user table and returns a fixed string. No session, no cookies,
 * no project data in or out. It is deliberately not on the `/app` middleware matcher.
 *
 * 200 with the keyword, or 503 with a reason. Never a cached anything.
 */
export async function GET() {
  const supabase = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), DEADLINE_MS);

  try {
    const { data, error } = await supabase
      .rpc("database_heartbeat")
      .abortSignal(deadline.signal);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "The database did not answer." },
        { status: 503, headers: NO_STORE },
      );
    }
    if (data !== DATABASE_AWAKE) {
      // A wrong answer is not a healthy one. Something else is behind that name.
      return NextResponse.json(
        { ok: false, error: "The database answered with something unexpected." },
        { status: 503, headers: NO_STORE },
      );
    }

    return new NextResponse(DATABASE_AWAKE, {
      status: 200,
      headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "The database did not answer in time." },
      { status: 503, headers: NO_STORE },
    );
  } finally {
    clearTimeout(timer);
  }
}
