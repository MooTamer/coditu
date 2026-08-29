import type { Metadata } from "next";

import { CompleteLink } from "@/components/app/complete-link.client";

export const metadata: Metadata = {
  title: "Signing you in",
  robots: { index: false, follow: false },
};

/**
 * Where a link lands when its token is in the fragment rather than the query.
 *
 * `/auth/callback` is a Route Handler, and a Route Handler cannot see a URL
 * fragment — nothing on a server can, the browser does not send it. An admin
 * invitation comes back that way (see `establishSessionFromLink`), so the
 * callback hands over to this page, which is rendered in a browser and can
 * read it.
 *
 * The fragment survives the hop because a redirect whose target carries no
 * fragment of its own leaves the original one in place. That is specified
 * behaviour, not a browser accident, and it is the only reason this can be a
 * second page rather than a rewrite of the callback.
 *
 * `next` is re-checked here rather than trusted from the callback: it arrives
 * as a query parameter on a URL a person can edit, and the fact that our own
 * route wrote it last does not make it ours by the time it comes back.
 */
function safeNext(value: string | undefined): string {
  if (!value) return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  return value;
}

export default async function CompleteLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--canvas)] p-6 text-[var(--ink)]">
      <CompleteLink next={safeNext(next)} />
    </main>
  );
}
