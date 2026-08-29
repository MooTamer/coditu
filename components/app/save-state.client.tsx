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
import { isUnreachable, settle, type UnreachableOutcome } from "@/lib/action-result";

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

/**
 * ── The queue behind "will retry" ──────────────────────────────────────────
 *
 * `Offline — will retry` has been on screen since this vocabulary was written,
 * and until now nothing retried. The sentence was aspirational, which is worse
 * than a sentence that promises less: somebody reading it had every reason to
 * close the tab believing their change was safe.
 *
 * `lib/pending-queue.ts` makes it true. What lives *here* is only the part the
 * shell cannot avoid paying for:
 *
 * - a synchronous `localStorage` read, so the shell knows on load whether
 *   anything is waiting;
 * - a `dynamic import()` of the queue, so its code is fetched the first time a
 *   write actually fails and never on a session where nothing does.
 *
 * The app shell had roughly four kilobytes of headroom against §5's total. A
 * queue that everybody downloads for a failure most people never have would
 * have spent most of it on nothing.
 */
const PENDING_COUNT_KEY = "coditu.pending.n";
const SAME_TAB_EVENT = "coditu:local-storage";

/** The mirrored depth of the unsent queue. Zero when there is nothing waiting. */
function readPendingCount(): number {
  try {
    return Number(window.localStorage.getItem(PENDING_COUNT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function subscribePending(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SAME_TAB_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SAME_TAB_EVENT, onChange);
  };
}

/**
 * How many of this reader's writes have not reached the server.
 *
 * Zero on the server render — there is no storage there, and claiming a number
 * before hydration is a mismatch blamed on something unrelated later
 * (`07-FIELD-NOTES.md`).
 */
export function usePendingCount(): number {
  return useSyncExternalStore(subscribePending, readPendingCount, () => 0);
}

/**
 * Drain the queue, at most once at a time.
 *
 * The guard is not theoretical: `online` can fire while a flush started by the
 * visibility check is still in flight, and two drains racing would replay the
 * same entry twice. `status` and `criterion` would survive that and `time`
 * would survive it only because of its idempotency key — which is a thin thing
 * to lean on when a boolean prevents it.
 */
let flushing = false;

async function flushPending(report?: (state: SaveState) => void): Promise<void> {
  if (flushing || readPendingCount() === 0) return;
  flushing = true;
  try {
    const { drain } = await import("@/lib/pending-queue");
    const result = await drain();
    if (result.rejected.length > 0) report?.("failed");
    else if (result.sent > 0) report?.("saved");
  } catch {
    // The import failed (offline, and the chunk was never cached) or IndexedDB
    // is unavailable. The queue is unchanged and the badge still shows it.
  } finally {
    flushing = false;
  }
}

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
      void flushPending(store.report);
    };

    // A tab that comes back to life after the `online` event already fired —
    // laptop reopened, phone unlocked — never sees the event. The queue would
    // then sit full until the next write. This is the cheapest way to notice:
    // one synchronous integer read, and the module is only fetched if it is
    // non-zero.
    if (navigator.onLine && readPendingCount() > 0) void flushPending(store.report);

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
      fallback: string,
      /**
       * What to replay if this write never reaches a server.
       *
       * Optional, and deliberately so. Passing it opts one call site into the
       * queue; every existing caller keeps exactly the behaviour it had. A
       * write is only queueable if replaying it later is *correct* — which is a
       * judgement about that specific write, not something this function can
       * infer. `lib/pending-queue.ts` explains what makes one replay-safe.
       */
      retry?: { mutation: import("@/lib/pending-queue").PendingMutation; label: string }
    ): Promise<T | UnreachableOutcome> => {
      report("sending");
      const result = await settle(run, fallback);

      // `saved` only after the server said so — the handoff's own wording is
      // *"Saved (after acknowledgement)"*, and a chip that says Saved because a
      // request was sent is the exact lie this vocabulary exists to prevent.
      if (result.ok) {
        report("saved");
        return result;
      }

      /**
       * Queue only what the network refused, never what the server refused.
       *
       * Both arrive as `{ ok: false }` and they want opposite treatment: a
       * rejected `fetch` means nobody has seen this write yet and it should be
       * sent again; `{ ok: false, error: "Only the assignee can move this
       * item" }` means a server read it and said no, and replaying it tomorrow
       * gets the same no. `isUnreachable` is the discriminator, set by `settle`
       * at the one place that can tell them apart.
       *
       * `navigator.onLine` is deliberately not used here. It answers "is there
       * a network interface", not "did this request arrive", and it is
       * cheerfully `true` on hotel wifi that resolves nothing.
       */
      if (retry && isUnreachable(result)) {
        try {
          const { enqueue } = await import("@/lib/pending-queue");
          await enqueue(retry.mutation, retry.label);
          report("offline");
          /**
           * The sentence is replaced, not passed through.
           *
           * Every call site toasts `result.error`, and the fallback it supplied
           * says the write did not save — which was true before there was a
           * queue and is now a contradiction of the chip sitting next to it
           * saying the same write will be retried. Changing it here fixes all
           * three call sites at once and costs them nothing.
           *
           * `ok` stays `false`. It has to: the server has not acknowledged
           * anything, so `router.refresh()` must not run and the optimistic
           * value must still fall back to what the server actually holds. The
           * reader is told where their change went instead of watching it
           * vanish unexplained, which is what invariant 4 asks for.
           */
          return {
            ok: false as const,
            error: "No connection — this is saved and will be sent when you are back online.",
            unreachable: true as const,
          };
        } catch {
          // Queueing failed — no IndexedDB, private mode, quota. Fall through
          // and report the plain failure rather than claiming a retry that
          // will not happen.
        }
      }

      report("failed");
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
  const pending = usePendingCount();

  /**
   * An unsent write outranks `idle`, and survives a reload.
   *
   * This is the half of the durability promise that is not the database. The
   * queue must never be the only copy of somebody's work — so whenever it holds
   * anything, the chip says so, in a count rather than a colour, whether or not
   * anything is currently being saved and whether or not this is the same page
   * load that queued it. Somebody who reloads with two changes outstanding sees
   * "2 unsent" rather than a screen that looks finished.
   */
  if (state === "idle" && pending === 0) return null;

  const queued = pending > 0;
  const tone = queued && state !== "sending" ? SAVE_TONE.offline : SAVE_TONE[state];
  const label = queued ? `${pending} unsent — will retry` : SAVE_LABEL[state];

  return (
    <ToneChip
      tone={tone}
      role="status"
      aria-live="polite"
      data-save-chip
      data-state={queued ? "offline" : state}
      data-pending={queued ? pending : undefined}
      className={`h-[26px] shrink-0 gap-1.5 ${className ?? ""}`}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: "currentColor", opacity: state === "sending" ? 0.5 : 1 }}
      />
      {label}
    </ToneChip>
  );
}
