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

/* -------------------------------------------------------------------------- */

export interface PresenceMember {
  profileId: string;
  /** Which part of the screen they are on: `sprint`, `item`, `notes`. */
  surface: string;
  /** `online` until 60s without input, then `idle`. */
  state: "online" | "idle";
}

export interface PresenceSubscription {
  /** Must begin `coditu:` — see `20260825170000_private_realtime_channels.sql`. */
  channelName: string;
  me: PresenceMember;
  onSync: (members: PresenceMember[]) => void;
}

/**
 * Join a presence channel and announce yourself on it.
 *
 * ## Private, and what that changes
 *
 * `config: { private: true }` makes realtime authorize the join against
 * `realtime.messages` RLS rather than accepting any authenticated socket. The
 * policy requires `is_active_member()`, so a client contact is refused by the
 * database — not by this code, and not by the absence of a link to the page.
 *
 * A refused join surfaces as a `CHANNEL_ERROR` status rather than an exception,
 * which is why `subscribe` takes a callback here. Presence failing is not worth
 * an error to the reader — the page is entirely usable without knowing who else
 * is on it — so a refusal reports an empty roster and stops.
 *
 * ## Presence never touches a table
 *
 * The roster lives in the socket's own state and dies with the connection.
 * There is no `presence` table, no cleanup job, and no row to leak: somebody
 * who closes a laptop mid-sprint disappears when their socket does, which is
 * the behaviour a table would have to reimplement badly with heartbeats and a
 * sweeper.
 *
 * ## What is on the wire
 *
 * A profile id, a surface name, and a state. **Never text anybody has typed.**
 * `e2e/presence.spec.ts` reads the socket frames and asserts it, because this
 * is the one place in the application where content could leave the browser
 * without a Server Action having looked at it.
 */
export interface PresenceHandle {
  /** Announce a new state for yourself — a fresh `track` replaces your entry. */
  setState: (state: "online" | "idle") => void;
  /** Untrack, then leave. Call on unmount and on navigation. */
  stop: () => void;
}

export async function joinPresence({
  channelName,
  me,
  onSync,
}: PresenceSubscription): Promise<PresenceHandle> {
  if (!channelName.startsWith("coditu:")) {
    // Fail here rather than at the server. A topic without the prefix is
    // refused by the policy, and a refusal looks exactly like a quiet network
    // problem — this makes the mistake obvious at the call site instead.
    throw new Error(`presence topic must begin "coditu:" — got "${channelName}"`);
  }

  const realtime = socket();

  const token = await realtimeToken();
  if (!token) return { setState: () => {}, stop: () => {} };
  // Before `subscribe`, always. The same race the table subscription documents
  // at length: a channel that joins before the JWT lands is evaluated as anon,
  // and anon is not an active member, so the policy refuses it. Local timing
  // wins that race; production loses it.
  await realtime.setAuth(token);

  const channel = realtime.channel(channelName, {
    config: { private: true, presence: { key: me.profileId } },
  });

  const publish = () => {
    const state = channel.presenceState<PresenceMember>();
    // One entry per profile, not one per tab. Somebody with the sprint open in
    // two windows is one person, and an avatar stack that shows them twice
    // reads as a bug.
    const byProfile = new Map<string, PresenceMember>();
    Object.values(state)
      .flat()
      .forEach((entry) => {
        const member = entry as unknown as PresenceMember;
        if (!member?.profileId) return;
        const existing = byProfile.get(member.profileId);
        // Online beats idle when the same person is on two surfaces.
        if (!existing || existing.state === "idle") byProfile.set(member.profileId, member);
      });
    onSync([...byProfile.values()]);
  };

  channel
    .on("presence", { event: "sync" }, publish)
    .on("presence", { event: "join" }, publish)
    .on("presence", { event: "leave" }, publish)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track(me);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Refused, or the socket gave up. The page works without a roster; an
        // error toast for "we could not tell you who else is here" would be
        // noise about something nobody asked for.
        onSync([]);
      }
    });

  return {
    // `track` again with the same presence key, which REPLACES this member's
    // entry rather than adding a second one. That is what makes going idle a
    // one-line operation instead of a leave and a rejoin.
    setState: (state) => {
      void channel.track({ ...me, state });
    },
    stop: () => {
      // `untrack` before `removeChannel`, so the people still on the channel
      // see the leave immediately rather than when the server times the socket
      // out.
      void channel.untrack().then(() => realtime.removeChannel(channel));
    },
  };
}
