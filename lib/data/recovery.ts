import "server-only";

import { cache } from "react";

import type { BackupHealthEvidence } from "@/lib/backup-health";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn, isMissingRelation } from "@/lib/supabase/schema";
import type { PersonRef } from "@/lib/data/sprint";
// The vocabulary lives in a plain module because the rehearsal control is a
// client component — see the note at the top of `lib/recovery.ts`.
import type { RecoveryCheck, RecoveryFinding } from "@/lib/recovery";
import { RECOVERY_CHECKS } from "@/lib/recovery";

/**
 * What application-level recovery rests on, and what has been rehearsed.
 *
 * ## Two responsibilities, kept apart on purpose
 *
 * **Infrastructure backups** — managed database backups, point-in-time
 * recovery, and Storage, which managed database backups do not cover at all.
 * This application cannot verify any of it from inside itself, so it does not
 * claim to. The screen renders whatever is known and labels the rest
 * unverified, which is the whole of §9's instruction on the subject.
 *
 * **Application recovery** — `document_revisions`, the bin, the access log and
 * the attachment rows. These the app owns and can prove things about, and
 * `rehearse_recovery()` is what proves them.
 */

export interface RecoveryRun {
  id: string;
  actor: PersonRef | null;
  startedAt: string;
  finishedAt: string;
  status: "passed" | "failed";
  scope: RecoveryCheck[];
  checked: number;
  failed: number;
  findings: RecoveryFinding[];
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string;
  status: "passed" | "failed";
  scope: string[];
  checked: number;
  failed: number;
  findings: RecoveryFinding[] | null;
  actor: { id: string; full_name: string; initials: string; avatar_url: string | null } | null;
}

/**
 * The rehearsals somebody has run, newest first.
 *
 * Returns `[]` rather than throwing when the table is not there yet — the same
 * argument every other read in this codebase makes, and the one that matters
 * most on this particular screen: a recovery page that 500s because the
 * recovery migration has not reached production is a bleak joke.
 */
export const listRecoveryRuns = cache(async (limit = 20): Promise<RecoveryRun[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recovery_runs")
    .select(
      "id, started_at, finished_at, status, scope, checked, failed, findings, " +
        "actor:profiles!recovery_runs_actor_id_fkey ( id, full_name, initials, avatar_url )"
    )
    .order("finished_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelation(error.code) || isMissingColumn(error.code)) return [];
    throw error;
  }

  return ((data ?? []) as unknown as RunRow[]).map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    scope: (row.scope ?? []).filter((s): s is RecoveryCheck =>
      (RECOVERY_CHECKS as readonly string[]).includes(s)
    ),
    checked: row.checked,
    failed: row.failed,
    findings: row.findings ?? [],
    actor: row.actor
      ? {
          id: row.actor.id,
          fullName: row.actor.full_name,
          initials: row.actor.initials,
          avatarUrl: row.actor.avatar_url,
        }
      : null,
  }));
});

export interface RecoveryStanding {
  revisions: number;
  binned: number;
  accessEvents: number;
  attachments: number;
}

interface BackupHealthRow {
  source: "r2-canary";
  backup_id: string;
  checked_at: string;
  last_modified_at: string;
  encrypted_bytes: number;
  sha256: string;
  database_tables: number;
  database_rows: number;
  storage_buckets: number;
  storage_objects: number;
}

/**
 * The newest infrastructure fact the independent R2 reader reported.
 *
 * `null` is intentionally the expand/contract answer. Until both the table and
 * a successful canary exist, the Recovery Centre keeps its warning and renders
 * no objective, size, count or timestamp.
 */
export const getBackupHealth = cache(async (): Promise<BackupHealthEvidence | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("backup_health")
    .select(
      "source, backup_id, checked_at, last_modified_at, encrypted_bytes, sha256, " +
        "database_tables, database_rows, storage_buckets, storage_objects"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.code) || isMissingColumn(error.code)) return null;
    throw error;
  }
  if (!data) return null;

  const row = data as unknown as BackupHealthRow;
  return {
    source: row.source,
    backupId: row.backup_id,
    checkedAt: row.checked_at,
    lastModifiedAt: row.last_modified_at,
    encryptedBytes: row.encrypted_bytes,
    sha256: row.sha256,
    databaseTables: row.database_tables,
    databaseRows: row.database_rows,
    storageBuckets: row.storage_buckets,
    storageObjects: row.storage_objects,
  };
});

/**
 * How much there is to recover, right now.
 *
 * Counts rather than contents. This screen is about whether recovery would
 * work, not about what is in it, and every one of these has its own screen for
 * that. `head: true` so each is a count and not a download — the revisions
 * table is the largest in the schema and nobody needs its rows here.
 */
export const getRecoveryStanding = cache(async (): Promise<RecoveryStanding> => {
  const supabase = await createClient();

  // The literal union rather than `string`: `from()` is typed against the
  // generated schema, and widening the parameter would give up the one check
  // that catches a table renamed out from under this file.
  type Countable = "document_revisions" | "work_items" | "access_events" | "attachments";

  const count = async (table: Countable, deletedOnly = false) => {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    if (deletedOnly) query = query.not("deleted_at", "is", null);
    const { count: n, error } = await query;
    // A table that is not there yet reads as nothing to recover, which is true.
    if (error) return 0;
    return n ?? 0;
  };

  const [revisions, binned, accessEvents, attachments] = await Promise.all([
    count("document_revisions"),
    count("work_items", true),
    count("access_events"),
    count("attachments"),
  ]);

  return { revisions, binned, accessEvents, attachments };
});
