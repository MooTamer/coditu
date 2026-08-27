"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import { ToneChip, type ChipTone } from "@/components/coditu/status-chip";
import { settle } from "@/lib/action-result";

/**
 * The five words the whole application uses for "did that save".
 *
 * ## Why this exists
 *
 * The returned handoff's component table names them exactly:
 *
 * > **Save confidence** — Draft saved → Sending… → Saved (after acknowledgement)
 * > → Offline, will retry → Failed, draft kept. Duplicate submits are refused
 * > with a sentence. Nothing clears on failure.
 *
 * and `PLAN.md` §3 adds *"Recovered draft"*. The **behaviour** under all six was
 * already real and proven — `e2e/reliable-writes.spec.ts` holds that a
 * submission arriving twice happens once, and every composer keeps its draft on
 * failure. What was missing was one place that says which of the six you are
 * in, in the same words, everywhere. `05-DECISIONS.md` recorded that as a
 * deferred divergence; it is not deferred any more.
 *
 * ## A store, not provider state
 *
 * The exact lesson `presence-surface.client.tsx` learned and wrote down: a
 * provider whose `value` changes re-renders **everything inside it**, and this
 * provider wraps the entire application. A composer reporting `sending` would
 * otherwise re-render the sprint table, the thread and the criteria list to
 * change one word in the topbar — and worse, re-rendering a component that owns
 * `useOptimistic` state from above it strands the optimistic entry, which is the
 * bug that file records.
 *
 * `useSyncExternalStore` means only the chip re-renders. Nothing else in the
 * tree is touched, so nothing else can be disturbed.
 *
 * ## Offline is observed, not reported
 *
 * `navigator.onLine` plus the `online`/`offline` events, read here once rather
 * than in every composer. A write that fails while the browser says it is
 * offline is *"Offline — will retry"*; the same failure while it says it is
 * online is *"Failed — draft kept"*. The distinction is the whole point: one of
 * them is somebody's train going into a tunnel and the other is a bug.
 */

export const SAVE_STATES = [
  "idle",
  "draft",
  "sending",
  "saved",
  "offline",
  "failed",
  "recovered",
] as const;

export type SaveState = (typeof SAVE_STATES)[number];

/** What each state says on screen. `idle` says nothing at all. */
export const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  draft: "Draft saved",
  sending: "Sending…",
  saved: "Saved",
  offline: "Offline — will retry",
  failed: "Failed — draft kept",
  recovered: "Recovered draft",
};

/**
 * The tone each state is drawn in.
 *
 * Never the sole carrier of meaning — the label is always present, which is
 * `01-DESIGN-SYSTEM.md`'s rule. The tone is a second channel, not the first.
 */
export const SAVE_TONE: Record<SaveState, ChipTone> = {
  idle: "slate",
  draft: "amber",
  sending: "slate",
  saved: "jade",
  offline: "amber",
  failed: "rose",
  recovered: "cobalt",
};

interface SaveStore {
  report: (state: SaveState) => void;
  subscribe: (listener: () => void) => () => void;
  read: () => SaveState;
  /** Whether the browser currently believes it has a connection. */
  online: () => boolean;
}

const SaveStateContext = createContext<SaveStore | null>(null);

/**
 * How long `Saved` stays on screen before the chip goes quiet.
 *
 * A permanent "Saved" is not confidence, it is wallpaper — after the second
 * time you see it you stop reading the chip, and then you do not read it on the
 * day it says `Failed — draft kept`. The three states that mean *something is
 * outstanding* (`draft`, `offline`, `failed`) never expire on their own.
 */
const SAVED_FOR = 2600;

export function SaveStateProvider({ children }: { children: React.ReactNode }) {
  const state = useRef<SaveState>("idle");
  const listeners = useRef(new Set<() => void>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const online = useRef(true);

  const store = useMemo<SaveStore>(() => {
    const notify = () => listeners.current.forEach((listener) => listener());
    const set = (next: SaveState) => {
      if (state.current === next) return;
      state.current = next;
      notify();
    };
    return {
      report: (next) => {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        // A failure while the browser is offline is a different sentence from
        // the same failure while it is online, and only this module knows which
        // one is true. Callers report `failed`; the distinction is made here so
        // it is made once.
        const resolved = next === "failed" && !online.current ? "offline" : next;
        set(resolved);
        if (resolved === "saved") {
          timer.current = setTimeout(() => set("idle"), SAVED_FOR);
        }
      },
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      read: () => state.current,
      online: () => online.current,
    };
  }, []);

  useEffect(() => {
    online.current = navigator.onLine;

    const goOffline = () => {
      online.current = false;
      // Only when something is actually outstanding. Announcing "Offline — will
      // retry" to somebody who is reading is noise about a state that costs
      // them nothing.
      if (state.current === "sending" || state.current === "draft") store.report("offline");
    };
    const goOnline = () => {
      online.current = true;
      if (state.current === "offline") store.report("draft");
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [store]);

  return <SaveStateContext.Provider value={store}>{children}</SaveStateContext.Provider>;
}

/**
 * How a composer says what just happened.
 *
 * Returns a stable function, so it can sit in a dependency array without
 * re-running the effect that holds it. Outside the provider it is a no-op
 * rather than a throw: a component rendered in isolation — a test, a Storybook
 * page, the login screen — should not crash because the shell is not there.
 */
export function useSaveReporter(): (state: SaveState) => void {
  const store = useContext(SaveStateContext);
  return useCallback(
    (state: SaveState) => {
      store?.report(state);
    },
    [store]
  );
}

/**
 * `settle`, with the chip told what happened.
 *
 * Every writing surface in this app already had the same four lines — report
 * in flight, await, roll back and toast on failure, refresh on success — and
 * the only thing missing was the sentence saying which of those it was. This
 * wraps `settle` rather than replacing it, so the rejection handling that
 * `lib/action-result.ts` exists for is unchanged: a Server Action that
 * *rejects* still becomes `{ ok: false }` rather than a stranded transition.
 *
 *     const save = useTrackedSave();
 *     const result = await save(() => publishPage({ pageId, doc }), "That did not save.");
 *
 * The caller still decides what to do with `result`. This only narrates.
 */
export function useTrackedSave() {
  const report = useSaveReporter();
  return useCallback(
    async <T extends { ok: boolean; error?: string }>(
      run: () => Promise<T>,
      fallback: string
    ): Promise<T | { ok: false; error: string }> => {
      report("sending");
      const result = await settle(run, fallback);
      // `saved` only after the server said so — the handoff's own wording is
      // *"Saved (after acknowledgement)"*, and a chip that says Saved because a
      // request was sent is the exact lie this vocabulary exists to prevent.
      report(result.ok ? "saved" : "failed");
      return result;
    },
    [report]
  );
}

/** The current state, for the one component that draws it. */
export function useSaveState(): SaveState {
  const store = useContext(SaveStateContext);
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.read ?? (() => "idle" as SaveState),
    // The server render is always `idle`: there is nothing outstanding before
    // hydration, and returning anything else is a hydration mismatch waiting to
    // be blamed on something unrelated (`07-FIELD-NOTES.md`).
    () => "idle" as SaveState
  );
}

/**
 * The chip, in the topbar, where the handoff puts it.
 *
 * `role="status"` and `aria-live="polite"`: the whole point is that it changes
 * without anybody looking at it, so a screen reader has to be told. Polite
 * rather than assertive, because none of these six interrupts what somebody is
 * doing — `Failed — draft kept` is followed by a toast, which is the thing that
 * does interrupt.
 *
 * Renders nothing at all when idle, rather than an empty pill. A chip that is
 * always there is a chip nobody reads.
 */
export function SaveChip({ className }: { className?: string }) {
  const state = useSaveState();
  if (state === "idle") return null;

  return (
    <ToneChip
      tone={SAVE_TONE[state]}
      role="status"
      aria-live="polite"
      data-save-chip
      data-state={state}
      className={`h-[26px] shrink-0 gap-1.5 ${className ?? ""}`}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: "currentColor", opacity: state === "sending" ? 0.5 : 1 }}
      />
      {SAVE_LABEL[state]}
    </ToneChip>
  );
}
