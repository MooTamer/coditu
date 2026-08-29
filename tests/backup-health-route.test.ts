import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { POST } from "@/app/api/backup-health/route";

const SECRET = "r".repeat(48);
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

function request(body: unknown, bearer = SECRET): Request {
  return new Request("https://coditu.example/api/backup-health", {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/backup-health", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T23:00:00Z"));
    process.env.BACKUP_CANARY_REPORT_SECRET = SECRET;
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BACKUP_CANARY_REPORT_SECRET;
  });

  it("rejects a caller without the scoped bearer before touching Supabase", async () => {
    const response = await POST(request(REPORT, "wrong"));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed and stale evidence", async () => {
    expect((await POST(request({ ...REPORT, storageObjects: -1 }))).status).toBe(422);
    expect(
      (await POST(request({ ...REPORT, lastModifiedAt: "2026-08-27T20:59:59Z" }))).status
    ).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("bounds the authenticated request body", async () => {
    const response = await POST(request({ ...REPORT, padding: "x".repeat(3_000) }));
    expect(response.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps one valid report to the out-of-order-safe RPC", async () => {
    const response = await POST(request(REPORT));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(rpc).toHaveBeenCalledWith("record_backup_health", {
      p_backup_id: REPORT.backupId,
      p_checked_at: "2026-08-28T23:00:00.000Z",
      p_last_modified_at: REPORT.lastModifiedAt,
      p_encrypted_bytes: REPORT.encryptedBytes,
      p_sha256: REPORT.sha256,
      p_database_tables: REPORT.databaseTables,
      p_database_rows: REPORT.databaseRows,
      p_storage_buckets: REPORT.storageBuckets,
      p_storage_objects: REPORT.storageObjects,
    });
  });

  it("keeps a database/reporting failure red without leaking its detail", async () => {
    rpc.mockResolvedValue({ error: { message: "sensitive provider detail" } });
    const response = await POST(request(REPORT));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive provider detail");
  });
});
