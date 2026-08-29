"use client";

import { setCriterionDone, setWorkItemStatus, logTime } from "@/lib/actions/work-items";

/**
 * The queue of writes the network refused, so a dropped connection does not
 * lose somebody's edit.
 *
 * ## What this is NOT
 *
 * It is not a local-first store and it is not a cache. `05-DECISIONS.md`
 * rejected local-first for this app and the reasons still hold: CRDTs merge
 * text, not business invariants, and this application has money in it. **The
 * server remains the only source of truth.** Nothing in here is ever read to
 * render a screen. The only thing stored is *"this write has not reached the
 * server yet"*, and the only thing done with it is sending it again.
 *
 * That distinction is the whole design. A dataset in IndexedDB would need
 * conflict resolution, would put RLS behind a client-side filter, and would
 * cost tens of kilobytes against a budget with about four to spare. A list of
 * unsent intentions needs none of that.
 *
 * ## Why descriptors rather than the calls themselves
 *
 * A Server Action is a build-time reference, not a value — it cannot be put in
 * IndexedDB and called tomorrow. So what is stored is a small plain object
 * saying *which* write and *with what*, and `REPLAY` below maps it back to the
 * real action at drain time.
 *
 * This is also why the queue does not weaken invariant 3. A replay goes through
 * the same Server Action as the original: zod-validated, re-authorized server
 * side, written, revalidated. A queued mutation gets no privilege the live one
 * did not have, and a person whose access was revoked while offline has their
 * replay refused exactly like a fresh attempt.
 *
 * ## Replaying is safe to do twice
 *
 * The failure this exists for — the request left, the answer never came back —
 * is indistinguishable from the request never leaving. So every replayable
 * write has to be idempotent or carry a token.
 *
 * `status` and `criterion` are *assignments*: setting a status to `in_qa` twice
 * leaves it `in_qa`. `time` is an *append*, and two identical half hours are
 * indistinguishable from somebody genuinely logging the same half hour twice —
 * so it carries the `idempotencyKey` the action already accepts, minted by the
 * composer before the first attempt and reused by every replay.
 */
export type PendingMutation =
  | { kind: "status"; itemId: string; status: string }
  | { kind: "criterion"; criterionId: string; isDone: boolean }
  | {
      kind: "time";
      itemId: string;
      minutes: number;
      workedOn: string;
      idempotencyKey: string;
    };

/** A queued mutation, plus what the reader needs to be told about it. */
export interface QueuedMutation {
  id: number;
  at: number;
  /** A short human sentence, so the UI can say what is waiting, not just how many. */
  label: string;
  mutation: PendingMutation;
}

const DB_NAME = "coditu";
const DB_VERSION = 1;
const STORE = "pending";

/**
 * The count, mirrored into `localStorage`.
 *
 * The app shell needs to know whether anything is waiting on *every* load, and
 * opening IndexedDB to find out would mean loading this module on every load —
 * which is the cost this module is dynamically imported to avoid. A single
 * integer in `localStorage` is synchronous, costs the shell about ten lines,
 * and is the only thing the shell reads.
 *
 * It is a mirror, never the truth. `count()` re-reads the store and rewrites
 * the mirror, so a mirror that drifts (a tab killed mid-drain, storage cleared
 * by hand) is corrected the first time the real queue is opened.
 */
export const COUNT_KEY = "coditu.pending.n";
const SAME_TAB_EVENT = "coditu:local-storage";

function publishCount(n: number) {
  try {
    if (n > 0) window.localStorage.setItem(COUNT_KEY, String(n));
    else window.localStorage.removeItem(COUNT_KEY);
  } catch {
    // Private mode, or storage disabled. The queue still works for this
    // session; only the badge across a reload is lost.
  }
  window.dispatchEvent(new Event(SAME_TAB_EVENT));
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      })
  );
}

/**
 * Ask the browser not to evict this.
 *
 * **Safari evicts script-writable storage after about seven days without
 * interaction** — IndexedDB included. Somebody who queues an edit on a Friday
 * train and does not open the app again until the following week would
 * otherwise find it silently gone. `persist()` is the documented way to ask for
 * an exemption; Firefox prompts, Chromium decides from engagement heuristics,
 * and Safari may simply say no.
 *
 * Which is why the answer is not load-bearing anywhere. It is requested, and
 * the reader is told what is unsent regardless — the durability story is "the
 * UI never lets this be the only copy", not "the browser promised".
 */
async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported, or refused. Both are fine; see above.
  }
}

/** Put a refused write on the queue. Returns the new depth. */
export async function enqueue(mutation: PendingMutation, label: string): Promise<number> {
  await requestPersistence();
  await withStore("readwrite", (store) =>
    store.add({ at: Date.now(), label, mutation } as Omit<QueuedMutation, "id">)
  );
  return count();
}

/** Everything still waiting, oldest first. */
export async function list(): Promise<QueuedMutation[]> {
  const all = await withStore<QueuedMutation[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.at - b.at);
}

/** How many writes are unsent. Also repairs the `localStorage` mirror. */
export async function count(): Promise<number> {
  const n = await withStore<number>("readonly", (store) => store.count());
  publishCount(n);
  return n;
}

const REPLAY: {
  [K in PendingMutation["kind"]]: (
    m: Extract<PendingMutation, { kind: K }>
  ) => Promise<{ ok: boolean; error?: string }>;
} = {
  status: (m) => setWorkItemStatus({ itemId: m.itemId, status: m.status }),
  criterion: (m) => setCriterionDone({ criterionId: m.criterionId, isDone: m.isDone }),
  time: (m) =>
    logTime({
      itemId: m.itemId,
      minutes: m.minutes,
      workedOn: m.workedOn,
      idempotencyKey: m.idempotencyKey,
    }),
};

export interface DrainResult {
  sent: number;
  /** Still queued: the network is still refusing. */
  kept: number;
  /** Removed because the server refused them on their merits, with its reasons. */
  rejected: string[];
}

/**
 * Send everything waiting, oldest first.
 *
 * Three outcomes per entry, and the difference between the last two is the
 * reason this is not a simple retry loop:
 *
 * - **Accepted** — dropped from the queue. Done.
 * - **Refused by the server** (`{ ok: false }`) — the write reached a server
 *   which read it and said no: not your item any more, that criterion is gone,
 *   that status is not one we recognise. Retrying cannot change that answer, so
 *   the entry is dropped and its reason is returned for the caller to show.
 *   Keeping it would mean a queue that can never empty and a badge that never
 *   clears.
 * - **Rejected promise** — nothing reached a server. Kept, and the drain stops
 *   there: order is preserved, and hammering a dead connection with the rest of
 *   the queue helps nobody.
 */
export async function drain(): Promise<DrainResult> {
  const pending = await list();
  const result: DrainResult = { sent: 0, kept: 0, rejected: [] };

  for (const entry of pending) {
    let outcome: { ok: boolean; error?: string };
    try {
      const replay = REPLAY[entry.mutation.kind] as (
        m: PendingMutation
      ) => Promise<{ ok: boolean; error?: string }>;
      outcome = await replay(entry.mutation);
    } catch {
      // Still no network. Stop; everything from here stays queued in order.
      result.kept = pending.length - result.sent - result.rejected.length;
      await count();
      return result;
    }

    await withStore("readwrite", (store) => store.delete(entry.id));
    if (outcome.ok) result.sent += 1;
    else result.rejected.push(outcome.error ?? `${entry.label} was refused.`);
  }

  await count();
  return result;
}

/** Forget everything. Only for a reader who has been shown what they are discarding. */
export async function clear(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
  publishCount(0);
}
