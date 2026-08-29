import { unstable_rethrow } from "next/navigation";

/**
 * Turns a Server Action that *threw* into one that returned a failure.
 *
 * Every optimistic control in this app was written the same way:
 *
 *     const result = await someAction(input);
 *     if (!result.ok) { rollback(); toast(result.error); }
 *
 * which is correct for the failure the action reports, and wrong for the one it
 * cannot. A Server Action call is a `fetch`. Lose the network, restart the
 * server, hit a serialization error, and the promise **rejects** — so the line
 * that rolls back and the line that explains why are both skipped, the
 * transition ends, `useOptimistic` silently reverts, and the reader watches
 * their change appear and then vanish with nothing said.
 *
 * That is precisely what invariant 4 forbids: *"a failed write that silently
 * reverts is worse than no optimism"*. The optimistic revert was already
 * correct; the sentence was missing.
 *
 * So: wrap the call, and the rollback runs on the path it was always meant to.
 *
 *     const result = await settle(() => someAction(input), "That did not save.");
 *
 * Redirects and `notFound()` are NOT failures — Next implements both by
 * throwing, and swallowing one turns a working `signOut` into a button that
 * appears to do nothing. `unstable_rethrow` lets those straight back out; it is
 * the documented way to catch around a Server Action without breaking them.
 */
export interface ActionOutcome {
  ok: boolean;
  error?: string;
}

/**
 * `T extends object`, not `T extends ActionOutcome`.
 *
 * Most actions here answer `{ ok, error? }` and most callers read `result.ok`.
 * A few do not — `signOutOtherDevices` answers `{ error?, notice? }`, because
 * "every other device has been signed out" is a notice and not an outcome — and
 * a constraint that excluded them would have left exactly the calls with an
 * unusual shape as the calls with no protection. The failure branch is still
 * `{ ok: false, error }` whatever went in, so a caller whose success type has no
 * `ok` narrows on `error` or with `in`, which is what it was doing anyway.
 */
export async function settle<T extends object>(
  run: () => Promise<T>,
  fallback: string
): Promise<T | { ok: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: fallback };
  }
}
