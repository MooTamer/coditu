"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { establishSessionFromLink } from "@/lib/actions/auth";
import { settle } from "@/lib/action-result";

/**
 * Turn `#access_token=…&refresh_token=…` into a session, then get out of the way.
 *
 * Runs once, on mount, and the effect is the whole component — there is nothing
 * to click. The fragment is cleared from the address bar before navigating so a
 * refresh-token does not sit in history or in whatever the next page puts in a
 * referrer.
 *
 * Everything that is not a working pair of tokens ends at `/login?error=link`,
 * which is the same sentence the callback route gives for a dead link. There is
 * no third outcome worth inventing: from here a link either works or it does not.
 */
export function CompleteLink({ next }: { next: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=link");
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await settle(
        () => establishSessionFromLink({ accessToken, refreshToken }),
        "That link is no longer valid."
      );
      if (cancelled) return;

      // `replaceState` rather than assigning `location.hash`: assigning it
      // leaves the empty `#` and adds a history entry that goes back to a URL
      // still carrying the token.
      window.history.replaceState(null, "", window.location.pathname);

      // `settle` returns the action's own shape on success and `{ ok: false,
      // error }` on a rejection, and `AuthState` has no `ok` — so the one
      // question that covers both is whether an `error` came back at all.
      if (!("error" in result) || !result.error) {
        // `refresh` first: the cookies were written by the action, and without
        // this the client router would serve the destination from a cache taken
        // while nobody was signed in.
        router.refresh();
        router.replace(next);
      } else {
        setFailed(true);
        router.replace("/login?error=link");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [next, router]);

  return (
    <p role="status" className="text-[13.5px] text-[var(--ink-muted)]">
      {failed ? "That link is no longer valid." : "Signing you in…"}
    </p>
  );
}
