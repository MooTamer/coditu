/**
 * The parts of Web Push that are pure functions, extracted so they can be
 * tested without a browser, a push service, or a network.
 *
 * Everything in here is decided by data alone: what a notification says, where
 * tapping it goes, whether a failure means "that device is gone" or "try
 * again", and whether this deployment is configured to send at all. The impure
 * half — the actual HTTP to a push service — lives in `lib/push/send.ts` and is
 * four lines around `web-push`.
 */

/** What crosses the wire to a device. Kept small: the payload is encrypted, not private. */
export interface PushPayload {
  title: string;
  body: string;
  /** Always a path on this origin. `sw.js` refuses anything that is not. */
  url: string;
}

export interface MentionNotice {
  /** Who wrote the comment. */
  authorName: string;
  itemKey: string;
  itemTitle: string;
  projectSlug: string;
  sprintNumber: number;
  /** The flattened comment text, or null when the walker produced nothing. */
  preview: string | null;
}

/**
 * A phone's lock screen shows about two lines, so the useful information has to
 * be in the first of them.
 *
 * Nothing here is secret. The recipient is MENTIONED on this item, so RLS
 * already grants them the row — a notification that said "you have a
 * notification" would make them open the app to find out what they already had
 * the right to read, which is the behaviour this workstream exists to replace.
 */
export function mentionPayload(notice: MentionNotice): PushPayload {
  const preview = (notice.preview ?? "").replace(/\s+/g, " ").trim();

  return {
    title: `${notice.authorName} mentioned you`,
    // The item first: it is what tells somebody whether this needs them now.
    // 140 characters is roughly what a notification will show before the OS
    // truncates it, and truncating here means we choose where the cut lands.
    body: truncate(preview ? `${notice.itemKey} · ${preview}` : `${notice.itemKey} — ${notice.itemTitle}`, 140),
    url: `/app/projects/${notice.projectSlug}/sprints/${notice.sprintNumber}/items/${notice.itemKey}`,
  };
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  // Cut on a word boundary where there is one within reach, so the last thing
  // a person reads is not half a word.
  const cut = value.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > limit - 24 ? cut.slice(0, space) : cut}…`;
}

/**
 * What a push service's status code means for the row we sent to.
 *
 * **404 and 410 are the only ones that mean "delete".** They are the push
 * service saying that installation no longer exists — the browser was
 * uninstalled, the profile wiped, the subscription expired. Anything else is
 * about this attempt: a 429 is rate limiting, a 500 is their bad afternoon, a
 * 413 is a payload we should have made smaller. Deleting a row on any of those
 * would silently unsubscribe somebody because a push service hiccupped, and
 * they would never find out — the Settings screen would simply show them as not
 * subscribed one day.
 */
export function isSubscriptionGone(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * The three variables, or nothing.
 *
 * Returns null rather than throwing, and that is the contract the caller
 * depends on: **a comment must never fail to save because push is not set up.**
 * A local checkout has no keys, a preview deployment may not either, and in
 * both cases the right behaviour is that comments work and notifications are
 * simply not sent.
 *
 * The subject is validated because the RFC requires `mailto:` or `https:` and
 * the push services enforce it — a wrong one fails at the service with a 403
 * that reads as an authentication problem.
 */
export function readVapidConfig(
  // A plain record rather than `NodeJS.ProcessEnv`: this reads three string
  // keys and nothing else, and Next augments `ProcessEnv` with a required
  // `NODE_ENV`, which would make every test fixture in `tests/push.test.ts`
  // carry a value it does not use.
  env: Record<string, string | undefined> = process.env
): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;

  return { publicKey, privateKey, subject };
}
