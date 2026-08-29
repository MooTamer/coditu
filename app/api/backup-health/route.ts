import { NextResponse } from "next/server";

import {
  authorizesBackupReport,
  backupHealthReportSchema,
  reportTimingIsPlausible,
} from "@/lib/backup-health";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" } as const;
const MAX_REPORT_BYTES = 2_048;

function refuse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/**
 * The only public write path for backup evidence.
 *
 * The GitHub canary holds one high-entropy capability, not a service-role key
 * or a recovery-store credential in the application. A valid report can update one
 * singleton through an out-of-order-safe RPC and nothing else.
 */
export async function POST(request: Request) {
  const secret = process.env.BACKUP_CANARY_REPORT_SECRET;
  if (!secret || secret.length < 32) return refuse(503, "Backup reporting is not configured.");
  if (!authorizesBackupReport(request.headers.get("authorization"), secret)) {
    return refuse(401, "Not authorized.");
  }

  const declaredBytes = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_REPORT_BYTES) {
    return refuse(413, "Report is too large.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return refuse(400, "Report could not be read.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_REPORT_BYTES) return refuse(413, "Report is too large.");

  let unknown: unknown;
  try {
    unknown = JSON.parse(raw);
  } catch {
    return refuse(400, "Report is not valid JSON.");
  }

  const parsed = backupHealthReportSchema.safeParse(unknown);
  if (!parsed.success) return refuse(422, "Report shape is invalid.");

  const checkedAt = new Date().toISOString();
  if (!reportTimingIsPlausible(parsed.data, Date.parse(checkedAt))) {
    return refuse(422, "Report is outside the freshness window.");
  }

  const report = parsed.data;
  const { error } = await createAdminClient().rpc("record_backup_health", {
    p_backup_id: report.backupId,
    p_checked_at: checkedAt,
    p_last_modified_at: report.lastModifiedAt,
    p_encrypted_bytes: report.encryptedBytes,
    p_sha256: report.sha256,
    p_database_tables: report.databaseTables,
    p_database_rows: report.databaseRows,
    p_storage_buckets: report.storageBuckets,
    p_storage_objects: report.storageObjects,
  });

  if (error) return refuse(503, "Backup evidence could not be recorded.");
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
