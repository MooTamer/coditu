/**
 * What a client contact may do, defined once in TypeScript.
 *
 * Postgres defines the same vocabulary as the `client_capability` enum in
 * `20260825110200_client_access.sql`, and `tests/client-access.test.ts` reads
 * that migration to prove the two agree — the same drift guard the status
 * vocabulary and the component kinds already carry.
 *
 * The drift that would hurt is not a MISSING capability. It is an extra one
 * here: something the access screen can offer, that the database has never
 * heard of, which would be stored, would never match
 * `= any (g.capabilities)`, and would present to an admin as "I ticked it and
 * nothing happened".
 *
 * Nothing in this file decides access. `client_has_capability()` in Postgres
 * does, on every read, from the session. This is the vocabulary, the presets,
 * and the words an admin reads before saving.
 */

/** Declaration order of the `client_capability` enum. Also the display order. */
export const CLIENT_CAPABILITIES = [
  "view_project",
  "view_components",
  "view_work",
  "view_current_sprint",
  "view_past_sprints",
  "view_criteria",
  "view_effort",
  "read_questions",
  "reply_questions",
  "start_questions",
  "view_attachments",
] as const;

export type ClientCapability = (typeof CLIENT_CAPABILITIES)[number];

/** How a capability is named on the access screen. Plain, not technical. */
export const CAPABILITY_LABEL: Record<ClientCapability, string> = {
  view_project: "See the project",
  view_components: "See published components",
  view_work: "See published work",
  view_current_sprint: "See the current sprint",
  view_past_sprints: "See previous sprints",
  view_criteria: "See acceptance criteria",
  view_effort: "See total hours",
  read_questions: "Read questions",
  reply_questions: "Reply to questions",
  start_questions: "Start a new question",
  view_attachments: "Open shared files",
};

/**
 * What ticking it actually exposes, in one sentence.
 *
 * These are shown next to the toggles, not hidden behind a tooltip. The
 * decision an admin is making is "what may this person outside the company
 * see", and it should not be possible to make it without reading what the words
 * mean — particularly for hours, where "See the project" and "See what the
 * project cost" are a single mis-click apart.
 */
export const CAPABILITY_REVEALS: Record<ClientCapability, string> = {
  view_project:
    "The project's name and its client-safe summary. Nothing about who is working on it.",
  view_components:
    "Each published component and the summary written for this client. Draft components stay hidden.",
  view_work:
    "Published work items, by their title or a client-safe rewrite. Internal descriptions and discuss-before-implementing notes are never included.",
  view_current_sprint:
    "The running sprint's name, goal, dates, and progress in plain language. Never raw statuses or internal keys.",
  view_past_sprints: "The same for sprints that have already closed.",
  view_criteria: "The acceptance criteria on published work, and whether each one is met.",
  view_effort:
    "Total hours logged against this project. Commercially sensitive — it implies what the work cost. Never per person.",
  read_questions: "Questions we have asked this client, and the replies on those threads.",
  reply_questions: "Writing replies. Without this the threads are read-only.",
  start_questions:
    "Opening a new thread. Turns the portal into an inbox somebody has to watch — leave it off unless that is wanted.",
  view_attachments:
    "Downloading files explicitly marked client-safe. Internal attachments and comment images are never reachable.",
};

/**
 * The two that deserve a second look before they are saved.
 *
 * Not a security boundary — `client_has_capability()` treats every capability
 * identically. This is a UI honesty rule: these two are the ones an admin is
 * most likely to grant without thinking about what it means commercially.
 */
export const SENSITIVE_CAPABILITIES: readonly ClientCapability[] = [
  "view_effort",
  "view_attachments",
] as const;

/* -------------------------------------------------------------------------- */

export type PresetName = "observer" | "collaborator" | "custom";

/**
 * Observer reads. Collaborator reads and answers.
 *
 * Collaborator is a strict SUPERSET of Observer, and a test asserts it. Two
 * presets that merely overlap would make "upgrade her to Collaborator" a
 * sentence that can silently take something away.
 *
 * Neither grants `view_effort`, `view_attachments` or `start_questions`. Those
 * are explicit opt-ins: hours are commercially sensitive, files can carry
 * anything, and a client who can open threads turns this into a support queue
 * nobody agreed to staff.
 */
export const ACCESS_PRESETS = {
  observer: [
    "view_project",
    "view_components",
    "view_work",
    "view_current_sprint",
    "read_questions",
  ],
  collaborator: [
    "view_project",
    "view_components",
    "view_work",
    "view_current_sprint",
    "view_past_sprints",
    "view_criteria",
    "read_questions",
    "reply_questions",
  ],
} as const satisfies Record<string, readonly ClientCapability[]>;

/** The recommended default. Named once so the UI and the seed cannot disagree. */
export const DEFAULT_PRESET: PresetName = "collaborator";

export function presetFor(name: keyof typeof ACCESS_PRESETS): ClientCapability[] {
  return [...ACCESS_PRESETS[name]];
}

/* -------------------------------------------------------------------------- */

const KNOWN = new Set<string>(CLIENT_CAPABILITIES);

/** A guard, so a stored value can be narrowed without a cast. */
export function isClientCapability(value: string): value is ClientCapability {
  return KNOWN.has(value);
}

/**
 * The capability list to actually store.
 *
 * A named preset ignores whatever custom set came with the request — the two
 * cannot both be authoritative, and honouring a stray `view_effort` alongside
 * "Observer" is how a preset stops meaning anything.
 *
 * Unknown values are DROPPED rather than rejected or stored. A hand-posted
 * form field naming a capability that does not exist would otherwise store
 * cleanly and match nothing, which reads to an admin as a toggle that does not
 * work. The server action validates shape; this decides meaning.
 *
 * The result is de-duplicated and in canonical order, so two grants with the
 * same capabilities compare equal as arrays — in a test, and in the
 * before-and-after an admin is shown.
 */
export function resolveCapabilities(
  preset: PresetName,
  custom: readonly ClientCapability[] = []
): ClientCapability[] {
  if (preset !== "custom") return presetFor(preset);

  const chosen = new Set(custom.filter((value): value is ClientCapability => KNOWN.has(value)));
  return CLIENT_CAPABILITIES.filter((capability) => chosen.has(capability));
}

/**
 * Whether a grant carries a capability.
 *
 * Null-tolerant on purpose: a caller holding "the grant, if there is one" is
 * the normal shape at a render edge, and making every one of them write
 * `grant?.capabilities?.includes(...) ?? false` is how one of them ends up
 * writing `!== undefined`.
 *
 * This is a rendering convenience and **not** the access decision. The database
 * has already refused to return rows the caller may not read; this only decides
 * whether to draw a control.
 */
export function can(
  granted: readonly ClientCapability[] | null | undefined,
  capability: ClientCapability
): boolean {
  return granted?.includes(capability) ?? false;
}

/**
 * The effective access, as sentences, for the panel shown before saving.
 *
 * Empty returns a sentence rather than an empty array, because an empty panel
 * reads as "not loaded yet" and a sentence reads as a decision. The sensitive
 * ones carry their full "this reveals…" line so they cannot be granted without
 * it being on screen.
 */
export function describeAccess(granted: readonly ClientCapability[]): string[] {
  const resolved = CLIENT_CAPABILITIES.filter((capability) => granted.includes(capability));
  if (resolved.length === 0) return ["No access yet — this contact will see nothing."];

  return resolved.map((capability) =>
    SENSITIVE_CAPABILITIES.includes(capability)
      ? `${CAPABILITY_LABEL[capability]} — ${CAPABILITY_REVEALS[capability]}`
      : CAPABILITY_LABEL[capability]
  );
}
