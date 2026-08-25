"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/**
 * How an editor buried in the tree tells the story's presence stack that it is
 * open.
 *
 * The alternative was threading a callback from the item page down through the
 * criteria list, the composer and the field editors — five props that exist
 * only to carry one string, on components that otherwise know nothing about
 * realtime.
 *
 * ## Why this is a store and not `useState`
 *
 * The first version kept the surface in provider state. Opening any editor then
 * re-rendered **everything inside the provider** — the thread, the criteria, the
 * fields — to change one word in a caption. That was wasteful, and it also
 * broke something: `e2e/optimistic.spec.ts` → *"a failed post gives the draft
 * back rather than losing it"* started failing, with the optimistic comment
 * stuck on `sending…` for ever. The composer's rollback runs inside a
 * transition, and re-rendering the component that owns the `useOptimistic`
 * state from a provider above it left the optimistic entry in place.
 *
 * `useSyncExternalStore` fixes both halves at once: claims live in a ref, and
 * only the component that actually reads the surface — the presence stack —
 * re-renders when it changes. Nothing else in the tree is touched, so nothing
 * else can be disturbed.
 *
 * ## Claims are a stack, not a value
 *
 * Two editors can be open at once — somebody starts a comment, then clicks into
 * a criterion. If the surface were a single value, closing the *first* one
 * would clear the indicator while the second was still open, and the person
 * watching would see "editing criteria" vanish while criteria were being
 * edited. A claim is pushed on mount and dropped on unmount, and the surface is
 * the most recent live claim, so unmount order does not matter.
 *
 * ## The value is a name, never content
 *
 * `criteria`, `description`, `comment`. This crosses the wire, and the one rule
 * presence has is that nothing anybody typed goes with it —
 * `e2e/presence.spec.ts` reads the socket frames and asserts it.
 */

/** What a reader is doing when they are not editing anything. */
export const VIEWING = "viewing";

interface SurfaceStore {
  claim: (id: number, name: string) => void;
  release: (id: number) => void;
  subscribe: (listener: () => void) => () => void;
  read: () => string;
}

const PresenceSurfaceContext = createContext<SurfaceStore | null>(null);

export function PresenceSurfaceProvider({ children }: { children: React.ReactNode }) {
  const claims = useRef<Array<{ id: number; name: string }>>([]);
  const listeners = useRef(new Set<() => void>());

  // Stable for the life of the provider. A changing context value would
  // re-render every consumer, which is the thing this design exists to avoid.
  const store = useMemo<SurfaceStore>(() => {
    const notify = () => listeners.current.forEach((listener) => listener());
    return {
      claim: (id, name) => {
        claims.current = [...claims.current.filter((c) => c.id !== id), { id, name }];
        notify();
      },
      release: (id) => {
        claims.current = claims.current.filter((c) => c.id !== id);
        notify();
      },
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      // The most recent live claim. `getSnapshot` must return a stable value
      // for unchanged state or `useSyncExternalStore` loops — a string does.
      read: () => (claims.current.length > 0 ? claims.current[claims.current.length - 1].name : VIEWING),
    };
  }, []);

  return (
    <PresenceSurfaceContext.Provider value={store}>{children}</PresenceSurfaceContext.Provider>
  );
}

const NO_SURFACE = () => VIEWING;
const NO_SUBSCRIBE = () => () => {};

/** The surface to announce. `viewing` when no editor is open. */
export function usePresenceSurface(): string {
  const store = useContext(PresenceSurfaceContext);
  return useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIBE,
    store?.read ?? NO_SURFACE,
    // The server has no editor open, so the first paint says `viewing` and the
    // client agrees — no hydration mismatch to reconcile.
    NO_SURFACE
  );
}

let nextClaimId = 1;

/**
 * Announce that this editor is open, for as long as it is mounted.
 *
 * ```tsx
 * useAnnounceSurface(editing ? "criteria" : null);
 * ```
 *
 * Null claims nothing, so a component can call it unconditionally and let the
 * argument decide — which keeps the call out of a conditional and away from the
 * rules of hooks.
 *
 * Safe outside a provider: the context is optional, so a component that renders
 * both inside the item dialog and on some other screen does not have to care.
 */
export function useAnnounceSurface(name: string | null): void {
  const store = useContext(PresenceSurfaceContext);
  const [id] = useState(() => nextClaimId++);

  useEffect(() => {
    if (!store || !name) return;
    store.claim(id, name);
    return () => store.release(id);
  }, [store, name, id]);
}
