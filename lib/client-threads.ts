/**
 * The question-thread vocabulary, and nothing that touches a database.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 *
 * `lib/data/client-threads.ts` starts with `import "server-only"`, which is the
 * guard rail that makes importing it from a client component a BUILD error
 * rather than a runtime surprise. `client-visibility-panel.client.tsx` needs
 * `THREAD_STATE_LABEL_INTERNAL` — a plain object — and pulling it from there
 * dragged the whole loader across the boundary:
 *
 *     Ecmascript file had an error
 *     > 1 | import "server-only";
 *
 * Worth noting how it was found: `npm run typecheck` and `npm run lint` both
 * passed. `server-only` is enforced by the BUNDLER, so nothing short of
 * building or running the app sees it. The screenshot did.
 *
 * So the words live here, where both sides may read them, and the loaders stay
 * server-only. Types would have been fine either way — they are erased — but a
 * const is a runtime value and has to be somewhere both halves can reach.
 */

export type ClientThreadState = "waiting_client" | "waiting_coditu" | "resolved";

export interface ClientMessageView {
  id: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  /** Whether Coditu wrote it. Drives the side of the thread it sits on. */
  fromCoditu: boolean;
  bodyJson: unknown;
  bodyText: string;
  createdAt: string;
  editedAt: string | null;
}

export interface ClientThreadView {
  id: string;
  title: string;
  state: ClientThreadState;
  componentId: string;
  componentName: string;
  componentSlug: string;
  projectId: string;
  projectSlug: string;
  createdAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  /** True when something arrived after this reader last opened it. */
  unread: boolean;
}

/**
 * What a client is being told, in words rather than an enum.
 *
 * Second person, because she is the person it is about: "waiting for YOUR
 * reply", not "awaiting client response".
 */
export const THREAD_STATE_LABEL: Record<ClientThreadState, string> = {
  waiting_client: "Waiting for your reply",
  waiting_coditu: "We're on it",
  resolved: "Resolved",
};

/** The same three states, said from Coditu's side of the conversation. */
export const THREAD_STATE_LABEL_INTERNAL: Record<ClientThreadState, string> = {
  waiting_client: "Waiting for client",
  waiting_coditu: "Needs our answer",
  resolved: "Resolved",
};
