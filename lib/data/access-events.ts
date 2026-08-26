import "server-only";

import { cache } from "react";

import { describeAccessEvent, type AccessEventKind } from "@/lib/access-events";
import { createClient } from "@/lib/supabase/server";

export interface AccessEventRow {
  id: string;
  kind: AccessEventKind;
  sentence: string;
  at: string;
}

/**
 * The access history, newest first.
 *
 * RLS decides who gets rows — admin and lead — so this query says nothing about
 * visibility and cannot disagree with the policy. An engineer gets `[]` and the
 * page says why rather than rendering an empty list.
 *
 * Bounded by a count and the heading says so: `Latest access changes`. The same
 * distinction the project page draws between its two activity panels — a count
 * bound answers "the last few", a time bound answers "has anything happened
 * lately", and a heading that promised all of history would be the one thing a
 * capped query cannot deliver.
 */
export const listAccessEvents = cache(async (limit = 40): Promise<AccessEventRow[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("access_events")
    .select(
      `id, kind, subject_label, from_value, to_value, created_at,
       actor:profiles!access_events_actor_id_fkey ( full_name ),
       projects ( name )`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as AccessEventKind,
    sentence: describeAccessEvent({
      kind: row.kind as AccessEventKind,
      subjectLabel: row.subject_label,
      fromValue: row.from_value,
      toValue: row.to_value,
      actor: row.actor ? { fullName: row.actor.full_name } : null,
      projectName: row.projects?.name ?? null,
    }),
    at: row.created_at,
  }));
});
