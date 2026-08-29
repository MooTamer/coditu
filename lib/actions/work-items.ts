"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DOC_VERSION, flattenToText, isEmptyDocument } from "@/lib/blocks/schema";
import { documentSchema } from "@/lib/blocks/validate";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import { isDuplicateRetry, isMissingColumn } from "@/lib/supabase/schema";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { WORK_ITEM_STATUSES, WORK_ITEM_TYPES } from "@/lib/work-items";

/**
 * Every mutation on a work item.
 *
 * Invariant 3: zod-validate → re-check authorization server-side → write →
 * revalidate. The browser never writes with the anon key.
 *
 * Invariant 1: the project is re-derived from the item's own sprint on every
 * call. Nothing here accepts a project id from the caller, so a crafted request
 * cannot make one client's item revalidate — or appear — under another's.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const uuid = z.string().uuid();

/**
 * Resolve an item's project and sprint from the item itself, and confirm the
 * caller is an active profile. Returns null when either is untrue.
 */
async function resolveScope(itemId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("work_items")
    .select("id, key, assignee_id, reviewer_id, sprints!inner ( id, number, projects!inner ( slug ) )")
    .eq("id", itemId)
    .maybeSingle();

  if (!data) return null;

  return {
    profile,
    supabase,
    itemId: data.id,
    itemKey: data.key,
    assigneeId: data.assignee_id,
    reviewerId: data.reviewer_id,
    sprintId: data.sprints.id,
    slug: data.sprints.projects.slug,
    sprintNumber: data.sprints.number,
  };
}

function sprintPath(slug: string, number: number) {
  return `/app/projects/${slug}/sprints/${number}`;
}

/* -------------------------------------------------------------------------- */

const setStatusInput = z.object({
  itemId: uuid,
  status: z.enum(WORK_ITEM_STATUSES),
});

export async function setWorkItemStatus(input: unknown): Promise<ActionResult> {
  const parsed = setStatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That status is not one we recognise." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  // Re-check here as well as in RLS. The policy is the thing that actually
  // stops the write; this is so the user gets a sentence instead of a
  // permission error from Postgres.
  const isOwner = scope.assigneeId === scope.profile.id || scope.reviewerId === scope.profile.id;
  if (scope.profile.role === "engineer" && !isOwner) {
    return { ok: false, error: "Only the assignee or reviewer can move this item." };
  }

  const { error } = await scope.supabase
    .from("work_items")
    .update({ status: parsed.data.status })
    .eq("id", scope.itemId);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const setPersonInput = z.object({
  itemId: uuid,
  field: z.enum(["assignee_id", "reviewer_id"]),
  profileId: uuid.nullable(),
});

export async function setWorkItemPerson(input: unknown): Promise<ActionResult> {
  const parsed = setPersonInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a person we can assign." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can change who owns an item." };
  }

  // Written out rather than as a computed key: the generated row types reject
  // an index-signature object, and spelling both branches keeps the column
  // names checked against the schema.
  const patch =
    parsed.data.field === "assignee_id"
      ? { assignee_id: parsed.data.profileId }
      : { reviewer_id: parsed.data.profileId };

  const { error } = await scope.supabase.from("work_items").update(patch).eq("id", scope.itemId);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const reorderInput = z.object({
  itemId: uuid,
  /** The full ordered list of item ids in the sprint, after the move. */
  orderedIds: z.array(uuid).min(1).max(500),
});

export async function reorderWorkItems(input: unknown): Promise<ActionResult> {
  const parsed = reorderInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That reorder did not make sense." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  // The drag handle is only rendered for an admin or a lead. RLS would let an
  // engineer write `order_index` on the items they happen to own, which is a
  // fraction of a reorder — and a fraction of a reorder is worse than none,
  // because the order it leaves behind looks deliberate. Say so in a sentence
  // rather than handing back a list the database can only partly move.
  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can reorder this sprint." };
  }

  // One statement, one transaction.
  //
  // This used to send one UPDATE per item through PostgREST and await them
  // together: three queries plus twelve writes to move a single row, most of
  // it latency on a hosted database. Worse, nothing made them atomic, and RLS
  // does not raise on a row it filters out — it just updates nothing — so a
  // caller who could write half the list was told the whole thing had saved.
  //
  // The function re-derives the sprint from the item, rejects any id outside
  // it, and rolls the whole thing back unless every row moved.
  const { data, error } = await scope.supabase.rpc("reorder_work_items", {
    p_item_id: scope.itemId,
    p_ordered_ids: parsed.data.orderedIds,
  });

  if (error) {
    // The function raises `42501` when the row count came up short — the only
    // way it can tell a blocked write from a successful one.
    if (error.code === "42501") {
      return { ok: false, error: "You are not allowed to reorder every item in this sprint." };
    }
    return { ok: false, error: "The new order did not save. Nothing was lost — try again." };
  }

  if (data === "foreign-item") {
    return { ok: false, error: "That reorder referenced an item outside this sprint." };
  }
  if (data === "no-item") {
    return { ok: false, error: "You are not signed in, or that item no longer exists." };
  }

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const criterionInput = z.object({ criterionId: uuid, isDone: z.boolean() });

export async function setCriterionDone(input: unknown): Promise<ActionResult> {
  const parsed = criterionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That criterion is not one we recognise." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { data: criterion } = await supabase
    .from("acceptance_criteria")
    .select("id, work_items!inner ( id, sprints!inner ( number, projects!inner ( slug ) ) )")
    .eq("id", parsed.data.criterionId)
    .maybeSingle();

  if (!criterion) return { ok: false, error: "That criterion no longer exists." };

  const { error } = await supabase
    .from("acceptance_criteria")
    .update({ is_done: parsed.data.isDone })
    .eq("id", parsed.data.criterionId);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  const item = criterion.work_items;
  revalidatePath(sprintPath(item.sprints.projects.slug, item.sprints.number));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

/**
 * Resolve a criterion's item and project from the criterion itself.
 *
 * Invariant 1 again: the revalidation path is read back out of the database,
 * never taken from the caller.
 */
async function resolveCriterionScope(criterionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("acceptance_criteria")
    .select(
      "id, work_item_id, work_items!inner ( key, assignee_id, reviewer_id, sprints!inner ( number, projects!inner ( slug ) ) )"
    )
    .eq("id", criterionId)
    .maybeSingle();

  if (!data) return null;
  return {
    profile,
    supabase,
    criterionId: data.id,
    itemId: data.work_item_id,
    itemKey: data.work_items.key,
    assigneeId: data.work_items.assignee_id,
    reviewerId: data.work_items.reviewer_id,
    slug: data.work_items.sprints.projects.slug,
    sprintNumber: data.work_items.sprints.number,
  };
}

/**
 * A criterion's text, from its document.
 *
 * Newlines are collapsed rather than kept. `body` is what the CSV and the
 * Markdown export read, and Markdown renders a criterion as one `- [ ] …` line
 * — a stored newline would split it into a list item and a stray paragraph.
 * The document keeps its shape; this is the one-line reading of it.
 */
function criterionText(doc: unknown): string {
  return flattenToText(doc).replace(/\s*\n+\s*/g, " ").trim();
}

/** Long enough for a paragraph and a picture, short of a document dump. */
const MAX_CRITERION_TEXT = 2000;

const criterionBody = z.object({
  doc: documentSchema,
});

const addCriterionInput = z.object({ itemId: uuid, doc: documentSchema });

/**
 * Add an acceptance criterion.
 *
 * The document is validated shallowly and flattened here, on the server, from
 * the same parsed value that gets stored — a client-supplied text projection
 * would be a second opinion about what the document says, and the exports read
 * the projection.
 */
export async function addCriterion(input: unknown): Promise<ActionResult> {
  const parsed = addCriterionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That criterion is not one we can store." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };
  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can add a criterion." };
  }

  if (isEmptyDocument(parsed.data.doc)) {
    return { ok: false, error: "A criterion needs something in it." };
  }

  const body = criterionText(parsed.data.doc).slice(0, MAX_CRITERION_TEXT);

  // Appended, never inserted at the top: the order is somebody's checklist.
  // `order_index` is omitted rather than computed — `assign_order_index` picks
  // the next one under a row lock on the item, which a read-then-write here
  // could not, and two people adding a criterion at once used to land on the
  // same number.
  const { error } = await scope.supabase.from("acceptance_criteria").insert({
    work_item_id: scope.itemId,
    body,
    body_json: parsed.data.doc as never,
  });

  if (error) return { ok: false, error: "That criterion did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  return { ok: true };
}

const editCriterionInput = criterionBody.extend({ criterionId: uuid });

export async function editCriterion(input: unknown): Promise<ActionResult> {
  const parsed = editCriterionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That criterion is not one we can store." };

  const scope = await resolveCriterionScope(parsed.data.criterionId);
  if (!scope) return { ok: false, error: "You are not signed in, or that criterion no longer exists." };

  // Widened 2026-08-25 at the team's request: the assignee and the reviewer —
  // the same set that may already tick — may now say what the box says. Adding
  // and removing criteria stays with admin/lead, because that is the shape of
  // the scope rather than the wording of one line. The row policy is what
  // actually enforces "assigned to or reviewing"; this is so an engineer
  // looking at somebody else's item gets a sentence instead of a write that
  // silently matches no row.
  const involved =
    scope.assigneeId === scope.profile.id || scope.reviewerId === scope.profile.id;
  if (scope.profile.role === "engineer" && !involved) {
    return { ok: false, error: "Only the assignee, the reviewer, or a lead can rewrite this criterion." };
  }

  if (isEmptyDocument(parsed.data.doc)) {
    return { ok: false, error: "A criterion needs something in it." };
  }

  const { error } = await scope.supabase
    .from("acceptance_criteria")
    .update({
      body: criterionText(parsed.data.doc).slice(0, MAX_CRITERION_TEXT),
      body_json: parsed.data.doc as never,
    })
    .eq("id", scope.criterionId);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  return { ok: true };
}

const reorderCriteriaInput = z.object({
  criterionId: uuid,
  /** The full ordered list of criterion ids on the item, after the move. */
  orderedIds: z.array(uuid).min(1).max(200),
});

/**
 * Renumber an item's checklist.
 *
 * One statement through `reorder_criteria`, for the reasons `reorder_work_items`
 * documents at length: N updates over the wire are not atomic, and RLS does not
 * raise on a row it filters out — it writes nothing and reports success, which
 * leaves a half-reordered checklist that looks deliberate.
 *
 * Reordering stays with admin and lead even though an assignee may now rewrite
 * what a criterion says. The order of a checklist is the shape of the scope;
 * the wording of one line is not.
 */
export async function reorderCriteria(input: unknown): Promise<ActionResult> {
  const parsed = reorderCriteriaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That reorder did not make sense." };

  const scope = await resolveCriterionScope(parsed.data.criterionId);
  if (!scope) return { ok: false, error: "You are not signed in, or that criterion no longer exists." };
  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can reorder this checklist." };
  }

  const { data, error } = await scope.supabase.rpc("reorder_criteria", {
    p_criterion_id: scope.criterionId,
    p_ordered_ids: parsed.data.orderedIds,
  });

  if (error) {
    // 42501 is either the function's own short-count check or
    // `guard_criteria_columns` refusing an engineer's `order_index`.
    if (error.code === "42501") {
      return { ok: false, error: "You are not allowed to reorder every criterion on this item." };
    }
    return { ok: false, error: "The new order did not save. Nothing was lost — try again." };
  }

  if (data === "foreign-criterion") {
    return { ok: false, error: "That reorder referenced a criterion on another item." };
  }
  if (data === "no-criterion") {
    return { ok: false, error: "That criterion no longer exists." };
  }

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  revalidatePath(`${sprintPath(scope.slug, scope.sprintNumber)}/items/${scope.itemKey}`);
  return { ok: true };
}

export async function removeCriterion(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ criterionId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That criterion is not one we recognise." };

  const scope = await resolveCriterionScope(parsed.data.criterionId);
  if (!scope) return { ok: false, error: "You are not signed in, or that criterion no longer exists." };
  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can remove a criterion." };
  }

  const { error } = await scope.supabase
    .from("acceptance_criteria")
    .delete()
    .eq("id", scope.criterionId);

  if (error) return { ok: false, error: "That criterion did not go. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const logTimeInput = z.object({
  itemId: uuid,
  // Invariant 2: minutes. The UI steps in half hours, so this arrives as 30,
  // 60, 90 — never 0.5.
  minutes: z.number().int().positive().max(1440),
  workedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a calendar date."),
  note: z.string().max(500).optional(),
  /**
   * A retry token, stable across retries of one submission. See `postComment`
   * for the argument; the consequence here is arithmetic rather than social.
   * Two identical entries are indistinguishable from somebody genuinely
   * logging the same half hour twice, so nothing downstream can undo it, and
   * `minutes_logged` is a trigger-maintained rollup that a client sees.
   */
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export async function logTime(input: unknown): Promise<ActionResult> {
  const parsed = logTimeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That time entry did not make sense." };
  }

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  const { error } = await scope.supabase.from("time_entries").insert({
    work_item_id: scope.itemId,
    // Always the caller. RLS enforces it too; passing it from the client would
    // just be a value the server has to distrust.
    profile_id: scope.profile.id,
    minutes: parsed.data.minutes,
    worked_on: parsed.data.workedOn,
    note: parsed.data.note ?? null,
    idempotency_key: parsed.data.idempotencyKey ?? null,
  });

  // Already logged, by the attempt whose response was lost. The hours are in
  // the rollup; saying otherwise invites a second, real entry.
  if (isDuplicateRetry(error, "time_entries_idempotency_key")) {
    revalidateTimePaths(scope.slug, scope.sprintNumber, scope.itemKey);
    return { ok: true };
  }

  if (error) return { ok: false, error: "That time did not save. Nothing was lost — try again." };

  revalidateTimePaths(scope.slug, scope.sprintNumber, scope.itemKey);
  return { ok: true };
}

/**
 * Resolve a time entry, its item, and whether the caller may touch it.
 *
 * RLS has said `edit own time`, `delete own time`, and "admins may delete any"
 * since the first migration. There was no action and no control, so `logTime`
 * was append-only in practice: type 8 hours instead of 0.8 and it was in the
 * sprint total forever. After workstream E that is not a typo, it is what
 * somebody gets paid.
 */
async function resolveEntryScope(entryId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("time_entries")
    .select("id, profile_id, minutes, work_items!inner ( id, key, sprints!inner ( number, projects!inner ( slug ) ) )")
    .eq("id", entryId)
    .maybeSingle();

  if (!data) return null;
  const item = data.work_items;
  return {
    profile,
    supabase,
    entryId: data.id,
    ownerId: data.profile_id,
    minutes: data.minutes,
    itemKey: item.key,
    slug: item.sprints.projects.slug,
    sprintNumber: item.sprints.number,
  };
}

const updateTimeInput = z.object({
  entryId: uuid,
  minutes: z.number().int().positive().max(1440).optional(),
  workedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a calendar date.").optional(),
  note: z.string().max(500).nullable().optional(),
});

/**
 * Correct a time entry.
 *
 * Your own only — an admin may **delete** anyone's, which is the escape hatch
 * RLS grants, but nobody rewrites somebody else's record of what they did. That
 * asymmetry is deliberate and it is the policy's, not this file's.
 */
export async function updateTimeEntry(input: unknown): Promise<ActionResult> {
  const parsed = updateTimeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That correction did not make sense." };
  }

  const scope = await resolveEntryScope(parsed.data.entryId);
  if (!scope) return { ok: false, error: "You are not signed in, or that entry no longer exists." };
  if (scope.ownerId !== scope.profile.id) {
    return { ok: false, error: "Only the person who logged an entry can correct it." };
  }

  const patch: TablesUpdate<"time_entries"> = {};
  if (parsed.data.minutes !== undefined) patch.minutes = parsed.data.minutes;
  if (parsed.data.workedOn !== undefined) patch.worked_on = parsed.data.workedOn;
  if (parsed.data.note !== undefined) patch.note = parsed.data.note?.length ? parsed.data.note : null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await scope.supabase.from("time_entries").update(patch).eq("id", scope.entryId);
  if (error) return { ok: false, error: "That correction did not save. Nothing was lost — try again." };

  revalidateTimePaths(scope.slug, scope.sprintNumber, scope.itemKey);
  return { ok: true };
}

export async function deleteTimeEntry(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ entryId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an entry we recognise." };

  const scope = await resolveEntryScope(parsed.data.entryId);
  if (!scope) return { ok: false, error: "You are not signed in, or that entry no longer exists." };
  if (scope.ownerId !== scope.profile.id && scope.profile.role !== "admin") {
    return { ok: false, error: "Only the person who logged an entry, or an admin, can remove it." };
  }

  const { error } = await scope.supabase.from("time_entries").delete().eq("id", scope.entryId);
  if (error) return { ok: false, error: "That entry did not go. Nothing was lost — try again." };

  revalidateTimePaths(scope.slug, scope.sprintNumber, scope.itemKey);
  return { ok: true };
}

/**
 * Everywhere a change to logged minutes is visible.
 *
 * `/app/earnings` is on the list because a corrected entry changes what a
 * sprint pays, and a confirmed sprint whose minutes moved has to say so out
 * loud rather than quietly recomputing. Wiring that here rather than later is
 * the difference between two features that are individually correct and jointly
 * wrong.
 */
function revalidateTimePaths(slug: string, sprintNumber: number, itemKey: string) {
  const sprint = sprintPath(slug, sprintNumber);
  revalidatePath(sprint);
  revalidatePath(`${sprint}/items/${itemKey}`);
  revalidatePath("/app/my-work");
  revalidatePath("/app/people");
  revalidatePath("/app/earnings");
}

/* -------------------------------------------------------------------------- */

const setFieldInput = z.object({
  itemId: uuid,
  // The item's own words. These had no path at all after creation until
  // 2026-08-25 — `guard_work_item_columns` had always treated them as admin and
  // lead columns, so the database was ready and only the action and the screen
  // were missing. A title you cannot correct is not restraint, it is an
  // unfinished CRUD.
  title: z.string().trim().min(1, "An item needs a title.").max(200).optional(),
  /**
   * The block documents. `description` and `highlight` are derived from them
   * here and never accepted from the client — the CSV, the Markdown export and
   * the PDF read those columns, and a projection the caller supplies could say
   * something the story does not.
   *
   * The plain-text fields below stay in the schema because the Notion importer
   * and `createWorkItem` still write prose directly; a story that has never been
   * edited has text and no document.
   */
  descriptionDoc: documentSchema.nullable().optional(),
  highlightDoc: documentSchema.nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  highlight: z.string().trim().max(2000).nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimateMinutes: z.number().int().nonnegative().max(100_000).nullable().optional(),
  grouping: z.number().int().positive().max(999).nullable().optional(),
  type: z.enum(WORK_ITEM_TYPES).optional(),
});

export async function setWorkItemFields(input: unknown): Promise<ActionResult> {
  const parsed = setFieldInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That value is not one we can store." };
  }

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can change this field." };
  }

  const {
    title,
    description,
    highlight,
    descriptionDoc,
    highlightDoc,
    deadline,
    estimateMinutes,
    grouping,
    type,
  } = parsed.data;
  const patch: TablesUpdate<"work_items"> = {};
  // The columns a database that has not caught up may not have. Split out so
  // the write can shed them and try again rather than losing the edit.
  const documentPatch: TablesUpdate<"work_items"> = {};

  if (title !== undefined) patch.title = title;
  // An emptied field is null, not "". Every reader in this app asks "is there a
  // description?" and an empty string answers yes.
  if (description !== undefined) patch.description = description?.length ? description : null;
  if (highlight !== undefined) patch.highlight = highlight?.length ? highlight : null;

  // A document sets BOTH halves, in one statement. The projection cannot lag the
  // document if neither can be written without the other.
  if (descriptionDoc !== undefined) {
    const empty = descriptionDoc === null || isEmptyDocument(descriptionDoc);
    const text = descriptionDoc === null ? "" : flattenToText(descriptionDoc).trim();
    if (text.length > 4000) {
      return { ok: false, error: "That description is longer than we can store." };
    }
    patch.description = empty ? null : text;
    documentPatch.description_json = empty ? null : (descriptionDoc as unknown as Json);
    documentPatch.description_version = DOC_VERSION;
  }
  if (highlightDoc !== undefined) {
    const empty = highlightDoc === null || isEmptyDocument(highlightDoc);
    const text = highlightDoc === null ? "" : flattenToText(highlightDoc).trim();
    if (text.length > 2000) {
      return { ok: false, error: "That note is longer than we can store." };
    }
    patch.highlight = empty ? null : text;
    documentPatch.highlight_json = empty ? null : (highlightDoc as unknown as Json);
    documentPatch.highlight_version = DOC_VERSION;
  }
  if (deadline !== undefined) patch.deadline = deadline;
  if (estimateMinutes !== undefined) patch.estimate_minutes = estimateMinutes;
  if (grouping !== undefined) patch.grouping = grouping;
  if (type !== undefined) patch.type = type;
  if (Object.keys(patch).length === 0 && Object.keys(documentPatch).length === 0) {
    return { ok: true };
  }

  // Widest first, then without the document columns. Migrations here are pushed
  // by hand and the app deploys separately, so a write can reach a database that
  // has `description` and not `description_json` — and losing the edit to a
  // missing column is the worse half of that bug. `isMissingColumn` rather than
  // a bare `42703`: a refused WRITE answers `PGRST204` from PostgREST's schema
  // cache and never reaches Postgres.
  let { error } = await scope.supabase
    .from("work_items")
    .update({ ...patch, ...documentPatch })
    .eq("id", scope.itemId);

  if (error && isMissingColumn(error.code) && Object.keys(patch).length > 0) {
    ({ error } = await scope.supabase.from("work_items").update(patch).eq("id", scope.itemId));
  }

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  revalidatePath(`${sprintPath(scope.slug, scope.sprintNumber)}/items/${scope.itemKey}`);
  revalidatePath("/app/my-work");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

export interface DeleteItemResult extends ActionResult {
  /** `COD-241`, so the caller can name what it just removed. */
  key?: string;
  /** The hours the deletion took out of the sprint. Shown before, not after. */
  minutesLogged?: number;
}

const deleteInput = z.object({ itemId: uuid });

/**
 * Delete a work item — softly, and reversibly.
 *
 * §8.6 was answered: soft. The row keeps its criteria, its thread and its hours;
 * the read policy makes it invisible to every query this app can write, which
 * is why no list, export or total had to learn about it. Restoring brings all
 * of it back.
 *
 * Not an UPDATE from here. The read policy hides the row from the person who
 * would restore it, so both directions go through `set_work_item_deleted`,
 * which is `security definer` and carries the admin/lead check in full.
 */
export async function deleteWorkItem(input: unknown): Promise<DeleteItemResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an item we recognise." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };
  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can delete an item." };
  }

  const { data, error } = await scope.supabase.rpc("set_work_item_deleted", {
    p_item_id: scope.itemId,
    p_deleted: true,
  });

  if (error || !data) {
    if (error?.code === "42501") {
      return { ok: false, error: "Only an admin or lead can delete an item." };
    }
    return { ok: false, error: "That item did not go. Nothing was lost — try again." };
  }

  const removed = data as { key: string; minutes_logged: number };
  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  revalidatePath("/app/my-work");
  return { ok: true, key: removed.key, minutesLogged: removed.minutes_logged ?? 0 };
}

export async function restoreWorkItem(input: unknown): Promise<DeleteItemResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an item we recognise." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can restore an item." };
  }

  // No `resolveScope` here, deliberately: the item is invisible to a SELECT
  // while it is deleted, which is the whole point of the read policy. The RPC
  // reads it as its owner and hands back the path to revalidate.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_work_item_deleted", {
    p_item_id: parsed.data.itemId,
    p_deleted: false,
  });

  if (error || !data) {
    if (error?.code === "42501") {
      return { ok: false, error: "Only an admin or lead can restore an item." };
    }
    return { ok: false, error: "That item did not come back. Try again." };
  }

  const restored = data as { key: string; project_slug: string; sprint_number: number };
  revalidatePath(sprintPath(restored.project_slug, restored.sprint_number));
  revalidatePath("/app/my-work");
  return { ok: true, key: restored.key };
}

/* -------------------------------------------------------------------------- */

const moveInput = z.object({ itemId: uuid, targetSprintId: uuid });

/**
 * Carry an item over to another sprint.
 *
 * "This slipped, move it to next week" is the most common thing anybody will
 * ask of this app in its first fortnight, and there was no way to do it.
 *
 * **Invariant 1 twice over.** The current project is re-derived from the item's
 * own sprint, the target project from the target sprint, and the move is
 * refused unless they are the same — the database refuses it as well, in
 * `guard_work_item_sprint_project`. A key already names its project, so an item
 * that changed clients would be carrying a key that lies, and its component
 * would point into a registry it can no longer see. That is why the answer to
 * "refuse the move or clear the component" is refuse the move.
 */
export async function moveWorkItem(input: unknown): Promise<ActionResult> {
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a sprint we can move it to." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };
  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can move an item." };
  }

  const { data: target } = await scope.supabase
    .from("sprints")
    .select("id, number, status, projects!inner ( slug )")
    .eq("id", parsed.data.targetSprintId)
    .maybeSingle();

  if (!target) return { ok: false, error: "That sprint no longer exists." };
  if (target.projects.slug !== scope.slug) {
    return { ok: false, error: "An item cannot move to another project's sprint." };
  }
  if (target.number === scope.sprintNumber) return { ok: true };
  if (target.status === "closed") {
    return { ok: false, error: "That sprint is closed. Reopen it, or pick another one." };
  }

  const { error } = await scope.supabase
    .from("work_items")
    .update({ sprint_id: target.id })
    .eq("id", scope.itemId);

  if (error) {
    if (error.code === CHECK_VIOLATION) {
      return { ok: false, error: "An item cannot move to another project's sprint." };
    }
    return { ok: false, error: "That move did not save. Nothing was lost — try again." };
  }

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  revalidatePath(sprintPath(scope.slug, target.number));
  revalidatePath("/app/my-work");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

/** `guard_work_item_component_project` raising. See the migration. */
const CHECK_VIOLATION = "23514";

const setComponentInput = z.object({
  itemId: uuid,
  componentId: uuid.nullable(),
});

/**
 * Attribute an item to a component, or take the attribution away.
 *
 * Its own action rather than another field on `setWorkItemFields`, because it
 * is the only one of them that can fail for a reason the reader needs a
 * sentence for: a component from another project. The project is re-derived
 * from the item's own sprint by `resolveScope`, the database re-checks the same
 * thing in a trigger, and neither of them is given a project id by the caller.
 */
export async function setWorkItemComponent(input: unknown): Promise<ActionResult> {
  const parsed = setComponentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a component we can store." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can change an item's component." };
  }

  const { error } = await scope.supabase
    .from("work_items")
    .update({ component_id: parsed.data.componentId })
    .eq("id", scope.itemId);

  if (error) {
    if (error.code === CHECK_VIOLATION) {
      return { ok: false, error: "That component belongs to another project." };
    }
    return { ok: false, error: "That change did not save. Nothing was lost — try again." };
  }

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  revalidatePath(`/app/projects/${scope.slug}/components`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const setComponentsInput = z.object({
  itemId: uuid,
  /**
   * The complete set the item should end up with. Not a delta.
   *
   * A picker that stays open while several boxes are ticked has no natural
   * moment to send "added X" and then "removed Y", and two round trips would
   * leave a window where the item is in a state nobody chose. The client sends
   * what it is looking at; the server works out the difference.
   */
  /**
   * 200, not 24.
   *
   * The cap exists to refuse an absurd payload, and it was set below the size
   * of a real registry: MEINEvim has **40** live components, so PF-7's "select
   * all" — the whole point of which is a change that touches every component —
   * was rejected by validation before it reached the database. A cap a feature
   * cannot satisfy is not a guard, it is a bug with a good excuse. The registry
   * is synced from the delivery repository and only ever grows, so this leaves
   * room rather than tracking it.
   */
  componentIds: z.array(uuid).max(200),
});

/**
 * Set every component an item is about, in one call.
 *
 * Written as a difference rather than delete-then-insert, and that matters:
 * clearing the whole set first would write a `cleared` and a `set` row into
 * `activity` for every component that did not actually change, so re-ticking a
 * box nobody touched would fill the item's history with events that never
 * happened.
 *
 * The project is re-derived from the item's own sprint by `resolveScope`, and
 * `guard_work_item_component_scope` re-checks the same thing in the database.
 * Neither is handed a project id by the caller.
 */
export async function setWorkItemComponents(input: unknown): Promise<ActionResult> {
  const parsed = setComponentsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those are not components we can store." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can change an item's components." };
  }

  const wanted = [...new Set(parsed.data.componentIds)];

  const { data: current, error: readError } = await scope.supabase
    .from("work_item_components")
    .select("component_id")
    .eq("work_item_id", scope.itemId);

  if (readError) {
    return { ok: false, error: "That change did not save. Nothing was lost — try again." };
  }

  const held = new Set((current ?? []).map((row) => row.component_id));
  const toAdd = wanted.filter((id) => !held.has(id));
  const toRemove = [...held].filter((id) => !wanted.includes(id));

  if (toAdd.length === 0 && toRemove.length === 0) return { ok: true };

  if (toAdd.length > 0) {
    const { error } = await scope.supabase
      .from("work_item_components")
      .insert(toAdd.map((componentId) => ({ work_item_id: scope.itemId, component_id: componentId })));

    if (error) {
      // `guard_work_item_component_scope` refusing a component from another
      // project. Nothing was written — the insert is one statement.
      if (error.code === CHECK_VIOLATION) {
        return { ok: false, error: "That component belongs to another project." };
      }
      return { ok: false, error: "That change did not save. Nothing was lost — try again." };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await scope.supabase
      .from("work_item_components")
      .delete()
      .eq("work_item_id", scope.itemId)
      .in("component_id", toRemove);

    if (error) {
      // The additions above already landed. Saying "nothing was lost" here
      // would be false, so it says what is true instead.
      return { ok: false, error: "Some of that saved and some did not — reload and check." };
    }
  }

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  revalidatePath(`/app/projects/${scope.slug}/components`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const createInput = z.object({
  /** The sprint the item is created in. Everything else is derived FROM it. */
  sprintId: uuid,
  title: z.string().trim().min(1, "An item needs a title.").max(200),
  type: z.enum(WORK_ITEM_TYPES),
  status: z.enum(WORK_ITEM_STATUSES),
  description: z.string().trim().max(4000).optional(),
  highlight: z.string().trim().max(2000).optional(),
  assigneeId: uuid.nullable().optional(),
  reviewerId: uuid.nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a calendar date.").nullable().optional(),
  estimateMinutes: z.number().int().nonnegative().max(100_000).nullable().optional(),
  grouping: z.number().int().positive().max(999).nullable().optional(),
  /** The thing this item changes. Must belong to the sprint's project — the
   *  database refuses the mismatch, so a crafted payload cannot borrow another
   *  client's registry. */
  componentId: uuid.nullable().optional(),
  criteria: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
});

export interface CreateItemResult extends ActionResult {
  /** `COD-152`, so the caller can navigate straight to what it just made. */
  key?: string;
  path?: string;
}

/**
 * Create a work item.
 *
 * The caller names a SPRINT and nothing else about where the item lands.
 * Invariant 1 is satisfied the same way every other action here satisfies it:
 * the project and sprint number used for the revalidation path are read back
 * out of the database from that sprint id, never taken from the request. A
 * crafted payload can pick a sprint it is allowed to write to; it cannot make
 * the item appear under a project it did not pick.
 *
 * `key` is deliberately not settable. The `COD-nnn` sequence is the one thing
 * in this table that must never have two opinions about it.
 */
export async function createWorkItem(input: unknown): Promise<CreateItemResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That item could not be created." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can create an item." };
  }

  const supabase = await createClient();

  // Read the scope back out of the sprint. This is the invariant-1 step.
  const { data: sprint } = await supabase
    .from("sprints")
    .select("id, number, status, projects!inner ( slug )")
    .eq("id", parsed.data.sprintId)
    .maybeSingle();

  if (!sprint) return { ok: false, error: "That sprint no longer exists." };
  if (sprint.status === "closed") {
    return { ok: false, error: "That sprint is closed. Reopen it, or pick another one." };
  }

  // Append. `order_index` is the sprint's manual order, and a new item joining
  // at position 0 would silently reshuffle a backlog somebody arranged by hand.
  //
  // It is omitted rather than computed. This used to read `max(order_index)`
  // and add one, which is a read-modify-write with no lock in the middle:
  // planning day is exactly when ten items get created in one sitting, and ten
  // of those races all land on the same number. `assign_order_index` does it
  // inside the insert, under a row lock on the sprint.
  const { data: created, error } = await supabase
    .from("work_items")
    .insert({
      sprint_id: sprint.id,
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      description: parsed.data.description?.length ? parsed.data.description : null,
      highlight: parsed.data.highlight?.length ? parsed.data.highlight : null,
      assignee_id: parsed.data.assigneeId ?? null,
      reviewer_id: parsed.data.reviewerId ?? null,
      deadline: parsed.data.deadline ?? null,
      estimate_minutes: parsed.data.estimateMinutes ?? null,
      grouping: parsed.data.grouping ?? null,
      component_id: parsed.data.componentId ?? null,
    })
    .select("id, key")
    .single();

  if (error || !created) {
    // 23514 is `guard_work_item_component_project` refusing a component from
    // another project. It cannot happen from the dialog, which drops the
    // choice when the sprint moves — but it is the one insert failure with a
    // better sentence than "try again", and it is the invariant-1 boundary.
    if (error?.code === CHECK_VIOLATION) {
      return { ok: false, error: "That component belongs to another project." };
    }
    return { ok: false, error: "That item did not save. Nothing was lost — try again." };
  }

  const criteria = (parsed.data.criteria ?? []).filter(Boolean);
  if (criteria.length > 0) {
    const { error: criteriaError } = await supabase.from("acceptance_criteria").insert(
      criteria.map((body, index) => ({
        work_item_id: created.id,
        body,
        // Stated, because these arrive in the order somebody typed them and
        // that order is the checklist. `assign_order_index` leaves a stated
        // position alone.
        order_index: index,
      }))
    );
    // The item exists either way, and saying so is better than pretending the
    // whole thing failed — the criteria are the recoverable half.
    if (criteriaError) {
      revalidatePath(sprintPath(sprint.projects.slug, sprint.number));
      return {
        ok: false,
        key: created.key,
        error: `${created.key} was created, but its acceptance criteria did not save.`,
      };
    }
  }

  const path = sprintPath(sprint.projects.slug, sprint.number);
  revalidatePath(path);
  revalidatePath("/app/my-work");
  return { ok: true, key: created.key, path: `${path}/items/${created.key}` };
}
