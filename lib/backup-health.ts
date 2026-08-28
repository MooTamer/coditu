import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

/** The writer's 24-hour objective; the canary has two hours of alerting grace. */
export const BACKUP_RPO_SECONDS = 24 * 60 * 60;
export const BACKUP_CANARY_ACCEPT_SECONDS = 26 * 60 * 60;
export const BACKUP_REPORT_STALE_SECONDS = 2 * 60 * 60;
export const BACKUP_FUTURE_SKEW_SECONDS = 5 * 60;

export const backupHealthReportSchema = z.object({
  backupId: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$/),
  lastModifiedAt: z.iso.datetime({ offset: true }),
  encryptedBytes: z.number().int().positive().safe(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  databaseTables: z.number().int().positive().safe(),
  databaseRows: z.number().int().nonnegative().safe(),
  storageBuckets: z.number().int().nonnegative().safe(),
  storageObjects: z.number().int().nonnegative().safe(),
}).strict();

export type BackupHealthReport = z.infer<typeof backupHealthReportSchema>;

export interface BackupHealthEvidence extends BackupHealthReport {
  checkedAt: string;
  source: "r2-canary";
}

/** A bearer comparison whose timing does not reveal how many bytes matched. */
export function authorizesBackupReport(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Refuse a replay after the canary's own 26-hour acceptance window. */
export function reportTimingIsPlausible(
  report: BackupHealthReport,
  nowMs = Date.now()
): boolean {
  const modifiedMs = Date.parse(report.lastModifiedAt);
  if (!Number.isFinite(modifiedMs) || !Number.isFinite(nowMs)) return false;
  const ageSeconds = Math.floor((nowMs - modifiedMs) / 1000);
  return ageSeconds >= -BACKUP_FUTURE_SKEW_SECONDS && ageSeconds <= BACKUP_CANARY_ACCEPT_SECONDS;
}

export interface BackupHealthAssessment {
  state: "current" | "stale";
  reportAgeSeconds: number;
  backupAgeSeconds: number;
  rpoMet: boolean;
}

/** Old green evidence turns amber by time alone, even if no job updates it. */
export function assessBackupHealth(
  evidence: BackupHealthEvidence,
  nowMs = Date.now()
): BackupHealthAssessment {
  const reportAgeSeconds = Math.floor((nowMs - Date.parse(evidence.checkedAt)) / 1000);
  const backupAgeSeconds = Math.floor((nowMs - Date.parse(evidence.lastModifiedAt)) / 1000);
  const reportCurrent =
    reportAgeSeconds >= -BACKUP_FUTURE_SKEW_SECONDS &&
    reportAgeSeconds <= BACKUP_REPORT_STALE_SECONDS;
  const rpoMet =
    backupAgeSeconds >= -BACKUP_FUTURE_SKEW_SECONDS && backupAgeSeconds <= BACKUP_RPO_SECONDS;

  return {
    state: reportCurrent && rpoMet ? "current" : "stale",
    reportAgeSeconds,
    backupAgeSeconds,
    rpoMet,
  };
}
