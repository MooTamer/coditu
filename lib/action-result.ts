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

export async function settle<T extends ActionOutcome>(
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
