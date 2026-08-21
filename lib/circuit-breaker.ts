/**
 * A circuit breaker, a deadline, and a bulkhead — for the two dependencies in
 * this app that can take the rest of it down with them.
 *
 * The failure this exists for is not "the dependency is down". It is "the
 * dependency is *slow*", which is worse: every request that touches it sits
 * there holding a connection until something upstream gives up, and requests
 * that never needed it at all queue behind them. A dependency that returns an
 * error in 5ms costs nothing; one that takes 30 seconds to do the same thing
 * costs the whole server.
 *
 * Three mechanisms, in the order they matter:
 *
 * - **A deadline.** Every call is given one. This is the only part that helps
 *   the very first slow request, and it is the part people leave out.
 * - **A bulkhead.** At most `maxConcurrent` calls are in flight; the rest are
 *   refused immediately rather than queued. Queueing is how you turn one slow
 *   dependency into an out-of-memory.
 * - **The breaker itself.** After `failureThreshold` consecutive failures it
 *   opens and stops calling out at all for `resetAfterMs`, then lets exactly
 *   one probe through. The probe is what makes recovery automatic instead of
 *   requiring a deploy.
 *
 * Deliberately dependency-free and ~100 lines. This runs in the Edge runtime as
 * well as Node, and it is imported by `middleware.ts`, which is on the path of
 * every request that is not a static file.
 *
 * State lives in the module, so it is per-instance: on a serverless host each
 * warm instance learns for itself. That is a real limitation and it is still
 * worth having — an instance that has just been burned stops burning the next
 * hundred requests it serves.
 */

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  /** Appears in the error message, so it should name the dependency. */
  name: string;
  /** Consecutive failures before the breaker opens. */
  failureThreshold: number;
  /** How long it stays open before letting a single probe through. */
  resetAfterMs: number;
  /** Deadline for one call. The `AbortSignal` handed to the work is aborted. */
  timeoutMs: number;
  /** In-flight calls allowed at once. Omit for no bulkhead. */
  maxConcurrent?: number;
  /** Injectable for tests. Nothing else should pass it. */
  now?: () => number;
}

/**
 * Thrown INSTEAD of calling out — the breaker is open, or the bulkhead is full.
 *
 * Distinct from a timeout on purpose: a timeout means we waited, this means we
 * did not. Callers use it to serve a fallback rather than to retry, and
 * retrying is exactly the wrong response to it.
 */
export class DependencyUnavailableError extends Error {
  readonly dependency: string;
  readonly reason: "open" | "saturated";

  constructor(dependency: string, reason: "open" | "saturated") {
    super(
      reason === "open"
        ? `${dependency} is failing; not calling it until it has had a moment`
        : `${dependency} already has as many calls in flight as it is allowed`
    );
    this.name = "DependencyUnavailableError";
    this.dependency = dependency;
    this.reason = reason;
  }
}

/** Thrown when a call was made and did not answer inside its deadline. */
export class DependencyTimeoutError extends Error {
  readonly dependency: string;

  constructor(dependency: string, timeoutMs: number) {
    super(`${dependency} did not answer within ${timeoutMs}ms`);
    this.name = "DependencyTimeoutError";
    this.dependency = dependency;
  }
}

export interface Breaker {
  /**
   * Run `work` under the deadline, the bulkhead, and the breaker.
   *
   * The caller is released when the deadline passes whether or not the work
   * stops. The signal is aborted too, so work that can be cancelled is — but
   * the deadline does not depend on it agreeing to be.
   *
   * Work that ignores the abort keeps its bulkhead slot until it really
   * finishes. It has not stopped consuming the dependency just because we
   * stopped waiting for it.
   */
  run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T>;
  /** For tests and for reporting. */
  state(): BreakerState;
  inFlight(): number;
  /** Tests only. */
  reset(): void;
}

export function createBreaker(options: BreakerOptions): Breaker {
  const now = options.now ?? (() => Date.now());
  const maxConcurrent = options.maxConcurrent ?? Number.POSITIVE_INFINITY;

  let consecutiveFailures = 0;
  let openedAt: number | null = null;
  /** True while the single half-open probe is out. */
  let probing = false;
  let inFlight = 0;

  function state(): BreakerState {
    if (openedAt === null) return "closed";
    return now() - openedAt >= options.resetAfterMs ? "half-open" : "open";
  }

  function onSuccess() {
    consecutiveFailures = 0;
    openedAt = null;
    probing = false;
  }

  function onFailure() {
    consecutiveFailures += 1;
    // A failed probe re-opens for the full window rather than letting the next
    // request through immediately. Otherwise a dependency that is down stays
    // under a steady trickle of probes, which is the load it least needs.
    if (probing || consecutiveFailures >= options.failureThreshold) {
      openedAt = now();
      probing = false;
    }
  }

  return {
    state,
    inFlight: () => inFlight,
    reset() {
      consecutiveFailures = 0;
      openedAt = null;
      probing = false;
      inFlight = 0;
    },

    async run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const current = state();

      if (current === "open") throw new DependencyUnavailableError(options.name, "open");
      // Half-open lets exactly one call through. Everything else keeps failing
      // fast, so recovery is tested by one request rather than by all of them.
      if (current === "half-open") {
        if (probing) throw new DependencyUnavailableError(options.name, "open");
        probing = true;
      }

      if (inFlight >= maxConcurrent) {
        // Not a failure of the dependency — a failure of ours to leave room —
        // so it does not count toward opening the breaker.
        if (current === "half-open") probing = false;
        throw new DependencyUnavailableError(options.name, "saturated");
      }

      const controller = new AbortController();
      let timedOut = false;
      let expire: (error: Error) => void = () => undefined;
      // Raced against the work rather than merely aborting it. An abort only
      // stops work that agreed to be stopped — `fetch` does, Playwright's page
      // methods do not — and a breaker whose deadline depends on the goodwill
      // of the thing it is protecting you from is not a deadline.
      const deadline = new Promise<never>((_, reject) => {
        expire = reject;
      });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        expire(new DependencyTimeoutError(options.name, options.timeoutMs));
      }, options.timeoutMs);

      inFlight += 1;
      const attempt = Promise.resolve().then(() => work(controller.signal));
      // The bulkhead slot is held until the work REALLY finishes, not until we
      // stop waiting for it. Releasing it at the deadline would give a hung
      // dependency an unlimited bulkhead, which is the one case it exists for.
      // The handlers also keep an abandoned rejection from going unhandled.
      const release = () => {
        inFlight -= 1;
      };
      attempt.then(release, release);

      try {
        const result = await Promise.race([attempt, deadline]);
        clearTimeout(timer);
        onSuccess();
        return result;
      } catch (error) {
        clearTimeout(timer);
        onFailure();
        // Once the deadline has passed, the deadline is the story — not
        // whatever "aborted" error the transport raised on its way out.
        if (timedOut && !(error instanceof DependencyTimeoutError)) {
          throw new DependencyTimeoutError(options.name, options.timeoutMs);
        }
        throw error;
      }
    },
  };
}
