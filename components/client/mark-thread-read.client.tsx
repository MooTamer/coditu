"use client";

import { useEffect, useRef } from "react";

import { markThreadRead } from "@/lib/actions/client-threads";

/**
 * Marks a thread read, once, after it is genuinely open.
 *
 * Renders nothing. It is a component rather than a call inside the page body
 * because a Server Component runs on every render — including the one a
 * PREFETCH causes — and a GET that writes is a GET a link preview, a crawler,
 * or the router's own speculative fetch can fire. This repository has already
 * measured a prefetch rendering twenty-eight dynamic routes nobody visited.
 *
 * The ref guards React 18's double-invoke in development, which would otherwise
 * send two upserts on every open. They are idempotent, so it is tidiness rather
 * than correctness — but two writes per page view is two writes per page view.
 *
 * A failure is deliberately silent. The thread stays bold, which is wrong in
 * the harmless direction; the opposite failure hides a question nobody has
 * seen.
 */
export function MarkThreadRead({ threadId }: { threadId: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void markThreadRead({ threadId }).catch(() => {});
  }, [threadId]);

  return null;
}
