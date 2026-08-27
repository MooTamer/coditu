"use client";

import { createContext, useContext } from "react";

import { usePresence, type PresenceRosterEntry } from "@/lib/hooks/use-presence";

/**
 * Who is in the workspace, subscribed once in the shell.
 *
 * ## The bug this fixes
 *
 * `Online now` called `usePresence` itself, from inside the card. A React
 * effect runs while its component is mounted and stops when it unmounts, so the
 * workspace channel existed **only while somebody was looking at Home** —
 * which is the one screen whose whole job is to say who else is here. A
 * teammate reading `/app/people`, or a story, or the sprint table, had never
 * joined it, so Home drew them with a grey dot and the word `offline` while
 * they were three feet away with the app open.
 *
 * Presence has to be a property of *being in the workspace*, so the
 * subscription belongs where the workspace begins: the `/app` layout. Every
 * authenticated route mounts it, so everybody in the app is on the channel and
 * Home reads a roster rather than owning one.
 *
 * ## This does not replace the topbar's channel
 *
 * `TopbarPresence` joins `coditu:presence:route:<pathname>` and answers a
 * different question — *who else is on **this screen***. That filtering is the
 * point of it, and it stays exactly as it was. Two channels, two questions;
 * the Supabase client multiplexes them over one socket, so this costs a
 * subscription rather than a connection.
 *
 * ## Why a context and not a second `usePresence` call
 *
 * Two components calling `usePresence` with the same channel name would open
 * two subscriptions and announce this person twice. One join, read by anybody
 * who asks.
 *
 * ## Why a roster sync does not re-render the shell
 *
 * `children` arrives as a prop from the layout, so it is the *same element
 * object* on every one of this component's own re-renders and React bails out
 * of reconciling that subtree. Only the components that actually call
 * `useWorkspacePresence` re-render when somebody's laptop sleeps.
 *
 * That distinction matters here specifically: `presence-surface.client.tsx`
 * records what happened the last time a provider re-rendered the tree beneath
 * it — a `useOptimistic` entry in the comment composer was stranded on
 * `sending…` for ever, and `e2e/optimistic.spec.ts` caught it. Anything added
 * to this provider later must keep `children` a pass-through prop.
 */
const WorkspacePresenceContext = createContext<PresenceRosterEntry[]>([]);

/** The RLS policy on `realtime.messages` requires the `coditu:` prefix. */
const CHANNEL = "coditu:presence:workspace";

export function WorkspacePresenceProvider({
  me,
  children,
}: {
  me: { id: string };
  children: React.ReactNode;
}) {
  const members = usePresence({
    channelName: CHANNEL,
    profileId: me.id,
    // Being in the workspace is the whole claim. What somebody is *doing* is
    // the route channel's business, and putting it here would broadcast every
    // reader's location to every reader.
    surface: "workspace",
  });

  return (
    <WorkspacePresenceContext.Provider value={members}>
      {children}
    </WorkspacePresenceContext.Provider>
  );
}

/** The workspace roster. Empty before the socket has synced, never null. */
export function useWorkspacePresence(): PresenceRosterEntry[] {
  return useContext(WorkspacePresenceContext);
}
