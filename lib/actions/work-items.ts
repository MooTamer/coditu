"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { documentSchema, flattenToText, isEmptyDocument } from "@/lib/comments/schema";
import type { TablesUpdate } from "@/lib/supabase/database.types";
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
    .select("id, assignee_id, reviewer_id, sprints!inner ( number, projects!inner ( slug ) )")
    .eq("id", itemId)
    .maybeSingle();

  if (!data) return null;

  return {
    profile,
    supabase,
    itemId: data.id,
    assigneeId: data.assignee_id,
    reviewerId: data.reviewer_id,
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
    .select("id, work_item_id, work_items!inner ( key, sprints!inner ( number, projects!inner ( slug ) ) )")
    .eq("id", criterionId)
    .maybeSingle();

  if (!data) return null;
  return {
    profile,
    supabase,
    criterionId: data.id,
    itemId: data.work_item_id,
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
  if (scope.profile.role === "engineer") {
    // The database says the same thing in `guard_criteria_columns`; this is so
    // the answer is a sentence rather than a permission error.
    return { ok: false, error: "Only an admin or lead can rewrite a criterion." };
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
  });

  if (error) return { ok: false, error: "That time did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
  return { ok: true };
}

const setFieldInput = z.object({
  itemId: uuid,
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimateMinutes: z.number().int().nonnegative().max(100_000).nullable().optional(),
  grouping: z.number().int().positive().max(999).nullable().optional(),
  type: z.enum(WORK_ITEM_TYPES).optional(),
});

export async function setWorkItemFields(input: unknown): Promise<ActionResult> {
  const parsed = setFieldInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That value is not one we can store." };

  const scope = await resolveScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  if (scope.profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can change this field." };
  }

  const { deadline, estimateMinutes, grouping, type } = parsed.data;
  const patch: TablesUpdate<"work_items"> = {};
  if (deadline !== undefined) patch.deadline = deadline;
  if (estimateMinutes !== undefined) patch.estimate_minutes = estimateMinutes;
  if (grouping !== undefined) patch.grouping = grouping;
  if (type !== undefined) patch.type = type;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await scope.supabase.from("work_items").update(patch).eq("id", scope.itemId);
  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprintNumber));
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
