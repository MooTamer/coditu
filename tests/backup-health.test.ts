import { describe, expect, it } from "vitest";

import {
  assessBackupHealth,
  authorizesBackupReport,
  backupHealthReportSchema,
  reportTimingIsPlausible,
  type BackupHealthEvidence,
} from "@/lib/backup-health";

const SECRET = "s".repeat(48);
const NOW = Date.parse("2026-08-28T23:00:00Z");
const REPORT = {
  backupId: "2026-08-28T210000Z",
  lastModifiedAt: "2026-08-28T21:00:00Z",
  encryptedBytes: 16_603_288,
  sha256: "a".repeat(64),
  databaseTables: 130,
  databaseRows: 5_245,
  storageBuckets: 3,
  storageObjects: 115,
};

function evidence(overrides: Partial<BackupHealthEvidence> = {}): BackupHealthEvidence {
  return {
    ...REPORT,
    checkedAt: "2026-08-28T22:47:00Z",
    source: "r2-canary",
    ...overrides,
  };
}

describe("backup canary reports", () => {
  it("accepts only the complete, exact report shape", () => {
    expect(backupHealthReportSchema.safeParse(REPORT).success).toBe(true);
    expect(backupHealthReportSchema.safeParse({ ...REPORT, storageObjects: -1 }).success).toBe(false);
    expect(backupHealthReportSchema.safeParse({ ...REPORT, invented: true }).success).toBe(false);
  });

  it("compares the whole bearer capability", () => {
    expect(authorizesBackupReport(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(authorizesBackupReport(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false);
    expect(authorizesBackupReport(null, SECRET)).toBe(false);
    expect(authorizesBackupReport(`Bearer ${SECRET}`, "short")).toBe(false);
  });

  it("refuses stale and implausibly future replays", () => {
    expect(reportTimingIsPlausible(REPORT, NOW)).toBe(true);
    expect(
      reportTimingIsPlausible({ ...REPORT, lastModifiedAt: "2026-08-27T20:59:59Z" }, NOW)
    ).toBe(false);
    expect(
      reportTimingIsPlausible({ ...REPORT, lastModifiedAt: "2026-08-28T23:05:01Z" }, NOW)
    ).toBe(false);
  });
});

describe("Recovery Centre backup claims", () => {
  it("calls a recent report and sub-24-hour copy current", () => {
    expect(assessBackupHealth(evidence(), NOW)).toEqual({
      state: "current",
      reportAgeSeconds: 780,
      backupAgeSeconds: 7_200,
      rpoMet: true,
    });
  });

  it("turns old canary evidence stale even while its copy remains inside the RPO", () => {
    expect(
      assessBackupHealth(evidence({ checkedAt: "2026-08-28T20:59:59Z" }), NOW).state
    ).toBe("stale");
  });

  it("does not call the 26-hour alert grace a met 24-hour objective", () => {
    const result = assessBackupHealth(
      evidence({ lastModifiedAt: "2026-08-27T22:30:00Z" }),
      NOW
    );
    expect(result.state).toBe("stale");
    expect(result.rpoMet).toBe(false);
  });
});
