"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildPreview, type ImportPreview } from "@/lib/import/notion";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * The Notion importer's two actions.
 *
 * `previewImport` and `commitImport` run the SAME `buildPreview` over the SAME
 * text. What you approve on screen is what gets written, because it is the same
 * computation — a preview produced by different code is not a preview.
 */

const MAX_CSV_BYTES = 2 * 1024 * 1024;

export interface PreviewResult {
  ok: boolean;
  preview?: ImportPreview;
  error?: string;
}

/**
 * Names the importer can resolve to exactly one person.
 *
 * A duplicated name is left OUT, so the preview flags it as unmatched. That is
 * the same rule the commit applies — and it has to be, because the preview is
 * the thing a person approves. A preview that calls a row ready while the
 * commit quietly leaves it unassigned is the one failure this whole
 * preview-then-commit design exists to prevent.
 */
async function resolvableNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name").eq("is_active", true);

  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.full_name, (counts.get(row.full_name) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n === 1).map(([name]) => name);
}

export async function previewImport(formData: FormData): Promise<PreviewResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was received." };
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: "That file is over 2MB." };

  const text = await file.text();
  const preview = buildPreview(text, await resolvableNames());

  if (preview.rows.length === 0) {
    return { ok: false, error: "That file has no rows we could read." };
  }
  return { ok: true, preview };
}

const commitInput = z.object({
  csv: z.string().min(1).max(MAX_CSV_BYTES),
  sprintId: z.string().uuid(),
});

export interface CommitResult {
  ok: boolean;
  written?: number;
  skipped?: number;
  error?: string;
}

export async function commitImport(input: unknown): Promise<CommitResult> {
  const parsed = commitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That import could not be read." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can import work items." };
  }

  const supabase = await createClient();

  // Invariant 1: the sprint decides the project, so an import lands where the
  // sprint lives. There is no project id in the payload to disagree with it.
  const { data: sprint } = await supabase
    .from("sprints")
    .select("id, number, projects!inner ( slug )")
    .eq("id", parsed.data.sprintId)
    .maybeSingle();

  if (!sprint) return { ok: false, error: "That sprint no longer exists." };

  const names = await resolvableNames();
  const preview = buildPreview(parsed.data.csv, names);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true);

  // A name is not a key. Two people can share one — it has already happened
  // here — and `new Map(pairs)` keeps whichever came last, so the importer
  // would assign work to an arbitrary one of them and never say a word.
  // Ambiguous names resolve to nothing, which makes the row unmatched rather
  // than wrongly matched.
  const nameCounts = new Map<string, number>();
  for (const row of profiles ?? []) {
    nameCounts.set(row.full_name, (nameCounts.get(row.full_name) ?? 0) + 1);
  }
  const byName = new Map(
    (profiles ?? [])
      .filter((row) => nameCounts.get(row.full_name) === 1)
      .map((row) => [row.full_name, row.id])
  );

  // Only clean rows. A row with any issue is skipped, never guessed at.
  const clean = preview.rows.filter((row) => row.issues.length === 0);
  if (clean.length === 0) {
    return { ok: false, error: "Every row has something to fix — nothing was written." };
  }

  const { data: existing } = await supabase
    .from("work_items")
    .select("order_index")
    .eq("sprint_id", sprint.id)
    .order("order_index", { ascending: false })
    .limit(1);

  let nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("work_items")
    .insert(
      clean.map((row) => ({
        sprint_id: sprint.id,
        title: row.title,
        status: row.status,
        type: row.type,
        assignee_id: row.assigneeName ? (byName.get(row.assigneeName) ?? null) : null,
        reviewer_id: row.reviewerName ? (byName.get(row.reviewerName) ?? null) : null,
        deadline: row.deadline,
        grouping: row.grouping,
        order_index: nextOrder++,
      }))
    )
    .select("id, title");

  if (error || !inserted) {
    return { ok: false, error: "The import did not save. Nothing was written." };
  }

  // Hours become a time entry attributed to the IMPORTER, always.
  //
  // Not to the row's assignee, however tempting: the `log own time` policy
  // permits a person to insert time only for themselves, so attributing an
  // entry to somebody else is rejected — and this insert used to discard its
  // result, so the hours simply vanished and the work item landed showing 0.
  // The sprint total is the number this whole app's credibility rests on, and
  // it was quietly wrong for every imported row that belonged to anyone but
  // the person clicking Commit.
  //
  // Attributing to the importer keeps the sprint total right. The note carries
  // who the row was actually assigned to, so the per-person view is recoverable
  // rather than invented.
  const entries = clean
    .map((row, index) => ({ row, id: inserted[index]?.id }))
    .filter(({ row, id }) => id && row.minutesWorked && row.minutesWorked > 0)
    .map(({ row, id }) => ({
      work_item_id: id!,
      profile_id: profile.id,
      minutes: row.minutesWorked!,
      note: row.assigneeName
        ? `Imported from Notion — worked by ${row.assigneeName}`
        : "Imported from Notion",
    }));

  if (entries.length > 0) {
    const { error: entriesError } = await supabase.from("time_entries").insert(entries);
    if (entriesError) {
      // The items are in and the hours are not, so say exactly that. A silent
      // failure here shows a sprint whose totals are wrong and whose rows all
      // look fine.
      return {
        ok: false,
        error: `${inserted.length} ${inserted.length === 1 ? "item was" : "items were"} created, but their hours did not save. Log them by hand — the totals are short until you do.`,
      };
    }
  }

  const path = `/app/projects/${sprint.projects.slug}/sprints/${sprint.number}`;
  revalidatePath(path);
  revalidatePath("/app/import");

  return { ok: true, written: inserted.length, skipped: preview.skipped };
}
