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

async function peopleNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name").eq("is_active", true);
  return (data ?? []).map((row) => row.full_name);
}

export async function previewImport(formData: FormData): Promise<PreviewResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was received." };
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: "That file is over 2MB." };

  const text = await file.text();
  const preview = buildPreview(text, await peopleNames());

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

  const names = await peopleNames();
  const preview = buildPreview(parsed.data.csv, names);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true);
  const byName = new Map((profiles ?? []).map((row) => [row.full_name, row.id]));

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

  // Hours become a time entry, attributed to the row's assignee where there is
  // one and to the importer otherwise — the hours were worked by somebody, and
  // dropping them would make the sprint total wrong.
  const entries = clean
    .map((row, index) => ({ row, id: inserted[index]?.id }))
    .filter(({ row, id }) => id && row.minutesWorked && row.minutesWorked > 0)
    .map(({ row, id }) => ({
      work_item_id: id!,
      profile_id: (row.assigneeName ? byName.get(row.assigneeName) : null) ?? profile.id,
      minutes: row.minutesWorked!,
      note: "Imported from Notion",
    }));

  if (entries.length > 0) await supabase.from("time_entries").insert(entries);

  const path = `/app/projects/${sprint.projects.slug}/sprints/${sprint.number}`;
  revalidatePath(path);
  revalidatePath("/app/import");

  return { ok: true, written: inserted.length, skipped: preview.skipped };
}
