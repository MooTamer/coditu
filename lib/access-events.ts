/**
 * Turning an access change into a sentence.
 *
 * The same shape as `lib/activity.ts` and for the same reason: the row stores
 * `kind` / `from` / `to` rather than prose, so the history can be re-worded
 * without rewriting what happened. This is the one place that does the wording.
 *
 * ## What each kind means, in the words the page uses
 *
 * The vocabulary is deliberately the vocabulary of the screens that caused the
 * event. `invited` and `withdrawn` are what the allowlist panel says; `active`
 * and `deactivated` are what the team panel says. A history that renamed them
 * would be a second glossary for one set of facts.
 */

export const ACCESS_EVENT_KINDS = [
  "role",
  "activation",
  "allowlist",
  "client_contact",
  "client_grant",
  "temporary_password",
] as const;

export type AccessEventKind = (typeof ACCESS_EVENT_KINDS)[number];

/** The chip beside each row, so the list can be skimmed by kind. */
export const ACCESS_EVENT_LABEL: Record<AccessEventKind, string> = {
  role: "role",
  activation: "account",
  allowlist: "sign-up",
  client_contact: "client",
  client_grant: "project access",
  temporary_password: "password",
};

export interface AccessEventLike {
  kind: AccessEventKind;
  subjectLabel: string;
  fromValue: string | null;
  toValue: string | null;
  actor: { fullName: string } | null;
  projectName?: string | null;
}

/**
 * `Mohamed made Ahmed Yehia a lead`.
 *
 * An event with no actor reads as `system`, and that is exactly right: it means
 * no session was behind the write — a migration, the service-role client, or
 * somebody at the SQL console. Those are the writes an audit trail is asked
 * about afterwards, and pretending they had an author would be the one lie this
 * table must not tell.
 */
export function describeAccessEvent(event: AccessEventLike): string {
  const who = event.actor?.fullName ?? "system";
  const subject = event.subjectLabel;
  const to = event.toValue ?? "—";

  switch (event.kind) {
    case "role":
      return `${who} made ${subject} ${article(to)} ${to}`;

    case "activation":
      return to === "deactivated"
        ? `${who} deactivated ${subject}`
        : `${who} reactivated ${subject}`;

    case "allowlist":
      return to === "withdrawn"
        ? `${who} withdrew the invitation for ${subject}`
        : `${who} invited ${subject} to sign up`;

    case "temporary_password":
      return `${who} issued a temporary password for ${subject}`;

    case "client_contact":
      if (to === "removed") return `${who} removed ${subject} as a client contact`;
      return event.fromValue
        ? `${who} moved ${subject} from ${event.fromValue} to ${to}`
        : `${who} added ${subject} as a client contact — ${to}`;

    case "client_grant": {
      const where = event.projectName ? ` on ${event.projectName}` : "";
      if (to === "revoked") return `${who} revoked ${subject}'s access${where}`;
      if (to === "granted") return `${who} restored ${subject}'s access${where}`;
      if (to === "removed") return `${who} removed ${subject}'s access${where}`;
      return event.fromValue
        ? `${who} changed what ${subject} can see${where} — ${to}`
        : `${who} gave ${subject} access${where} — ${to}`;
    }
  }
}

/** `a lead`, `an engineer`, `an admin`. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
