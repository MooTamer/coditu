"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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

  // Every id must belong to the SAME sprint as the dragged item. Without this
  // check a crafted payload could renumber another project's backlog, since
  // order_index is one of the two columns an engineer may write.
  const { data: sprintItems } = await scope.supabase
    .from("work_items")
    .select("id")
    .eq("sprint_id", (
      await scope.supabase.from("work_items").select("sprint_id").eq("id", scope.itemId).single()
    ).data!.sprint_id);

  const allowed = new Set((sprintItems ?? []).map((row) => row.id));
  if (parsed.data.orderedIds.some((id) => !allowed.has(id))) {
    return { ok: false, error: "That reorder referenced an item outside this sprint." };
  }

  const updates = parsed.data.orderedIds.map((id, index) =>
    scope.supabase.from("work_items").update({ order_index: index }).eq("id", id)
  );
  const results = await Promise.all(updates);
  if (results.some((r) => r.error)) {
    return { ok: false, error: "The new order did not save. Nothing was lost — try again." };
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
