import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";

import { publicEnv } from "@/lib/supabase/env";

/**
 * The realtime socket, without the rest of Supabase.
 *
 * ## Why this is not `createBrowserClient()`
 *
 * It used to be. `@supabase/ssr` builds a whole `SupabaseClient` — auth,
 * postgrest, storage, functions — and this application used exactly two things
 * from it in the browser: a JWT read out of a cookie, and a websocket. That
 * cost **65 KB gzipped**, which was 55% of the app shell's entire JS budget and
 * the single largest term in it.
 *
 * `@supabase/realtime-js` is the websocket half on its own. The JWT comes from
 * `/api/realtime-token`, which is the same cookie read on the server — see that
 * route for why handing it back is not an escalation.
 *
 * ## The construction is copied from supabase-js on purpose
 *
 * `SupabaseClient` builds its realtime client like this:
 *
 * ```js
 * this.realtimeUrl = new URL("realtime/v1", baseUrl);
 * this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws");
 * new RealtimeClient(this.realtimeUrl.href, { params: { apikey: supabaseKey }, accessToken })
 * ```
 *
 * Every part of that is load-bearing and none of it is guessable. Miss the
 * `apikey` param and the socket connects and receives nothing. Miss the
 * `http`→`ws` swap and it never connects at all. This module reproduces it
 * exactly rather than approximating it, because the failure mode of getting it
 * wrong is silence, not an error — a board that simply never updates, which
 * looks identical to a board where nothing has happened.
 *
 * ## One socket, not one per subscription
 *
 * Every `createClient()` call built a separate `RealtimeClient`, so a sprint
 * page with an item open held **two** websockets to the same server. One
 * module-level client multiplexes both topics over one connection, which is
 * what realtime-js is designed for.
 *
 * The client disconnects itself when its last channel is removed and reconnects
 * when the next one subscribes — `_schedulePendingDisconnect`, default 0 ms —
 * so nothing here has to ref-count the socket. Removing a channel still sends
 * `phx_leave` for its topic, which is what `e2e/palette-realtime.spec.ts`
 * asserts when a route changes.
 */

/** Refresh a little before the token actually dies, so a reconnect never races expiry. */
const EXPIRY_MARGIN_SECONDS = 60;

let cached: { token: string; expiresAt: number | null } | null = null;
let inFlight: Promise<string | null> | null = null;

function stillGood(entry: { expiresAt: number | null }): boolean {
  if (entry.expiresAt === null) return false;
  return entry.expiresAt - EXPIRY_MARGIN_SECONDS > Date.now() / 1000;
}

/**
 * The current access token, or null when nobody is signed in.
 *
 * realtime-js calls this on connect and on every reconnect, so it is on the
 * path of every dropped-wifi recovery. It is cached until the token is nearly
 * expired, and concurrent callers share one request rather than each opening
 * their own.
 */
export async function realtimeToken(): Promise<string | null> {
  if (cached && stillGood(cached)) return cached.token;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch("/api/realtime-token", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        cached = null;
        return null;
      }
      const body = (await response.json()) as { token?: unknown; expiresAt?: unknown };
      if (typeof body.token !== "string" || !body.token) {
        cached = null;
        return null;
      }
      cached = {
        token: body.token,
        expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
      };
      return cached.token;
    } catch {
      // Offline, or the server restarted mid-reconnect. Returning null lets
      // realtime-js back off and try again rather than throwing inside its
      // reconnect loop.
      cached = null;
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

let client: RealtimeClient | null = null;

function socket(): RealtimeClient {
  if (client) return client;

  const endpoint = new URL("realtime/v1", publicEnv.NEXT_PUBLIC_SUPABASE_URL);
  endpoint.protocol = endpoint.protocol.replace("http", "ws");

  client = new RealtimeClient(endpoint.href, {
    params: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    accessToken: realtimeToken,
  });

  return client;
}

export interface TableSubscription {
  channelName: string;
  table: string;
  filter: string;
  onChange: () => void;
}

/**
 * Subscribe to Postgres changes on one table, scoped by `filter`.
 *
 * Returns a teardown. Call it on unmount: a channel that outlives its route is
 * a leak that stays invisible until the socket limit is hit.
 *
 * **`setAuth` is awaited before `subscribe`, and that ordering is the bug this
 * comment exists for.** Realtime validates a filter with
 * `has_column_privilege(claims->>'role', …)`, so a channel that joins before
 * the JWT has landed is evaluated as `anon`, sees a table it has no grants on,
 * and the server answers "invalid column for filter sprint_id". The
 * subscription then sits there, connected and receiving nothing. Local timing
 * won that race every time; production lost it every time. The `accessToken`
 * callback alone is not enough — supabase-js sets the initial token explicitly
 * too, for exactly this reason.
 */
export async function subscribeToTable({
  channelName,
  table,
  filter,
  onChange,
}: TableSubscription): Promise<() => void> {
  const realtime = socket();

  const token = await realtimeToken();
  if (!token) {
    // Not signed in, or the session went away. Subscribing anonymously would
    // connect and receive nothing, which is worse than not subscribing.
    return () => {};
  }
  await realtime.setAuth(token);

  const channel: RealtimeChannel = realtime
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange)
    .subscribe();

  return () => {
    void realtime.removeChannel(channel);
  };
}
