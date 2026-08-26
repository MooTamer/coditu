import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);

/**
 * The guard is the point of the script.
 *
 * `scripts/add-local-user.mjs` holds a service-role key and writes straight to
 * `auth.users`, `allowed_emails` and `profiles`. Pointed at the hosted project
 * it would create a real sign-in, on a real allowlist, with a password that is
 * published in this repository — so "it refuses anything that is not loopback"
 * is not a nicety, it is the reason the script is allowed to exist.
 *
 * Everything asserted here happens BEFORE the script opens a database
 * connection, which is what lets it live in the unit suite: `npm run test` does
 * not need Supabase running, and this file must not be the thing that changes
 * that. The half that does need a database — that an address with a pending
 * client invitation is refused rather than quietly turned into a client
 * account — is covered by `supabase/tests/access-events.sql`'s sibling
 * reasoning and by the refusal being read back in `06-PROGRESS.md`.
 */
const SCRIPT = join(process.cwd(), "scripts", "add-local-user.mjs");

const LOCAL = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54421",
  SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
};

async function attempt(args: string[], env: Record<string, string> = {}) {
  try {
    const { stdout, stderr } = await run("node", [SCRIPT, ...args], {
      env: { ...process.env, ...LOCAL, ...env },
      timeout: 20_000,
    });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, out: (failure.stdout ?? "") + (failure.stderr ?? "") };
  }
}

describe("add-local-user refuses anything that is not the local stack", () => {
  it("refuses a hosted Supabase URL", async () => {
    const { code, out } = await attempt(["someone@coditu.com"], {
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklm.supabase.co",
    });
    expect(out).toContain("is not the local stack");
    expect(code).toBe(1);
  });

  it("refuses a hosted database URL even when the API URL is loopback", async () => {
    const { code, out } = await attempt(["someone@coditu.com"], {
      LOCAL_DATABASE_URL: "postgresql://postgres:pw@db.abcdefghijklm.supabase.co:5432/postgres",
    });
    expect(out).toContain("is not the local database");
    expect(code).toBe(1);
  });

  /**
   * The check is on the parsed hostname, not on the string, so a host that
   * merely CONTAINS a loopback address is refused. `127.0.0.1.example.com`
   * resolves wherever its owner points it.
   */
  it("refuses a hostname that only looks like loopback", async () => {
    const { code, out } = await attempt(["someone@coditu.com"], {
      NEXT_PUBLIC_SUPABASE_URL: "https://127.0.0.1.example.com",
    });
    expect(out).toContain("is not the local stack");
    expect(code).toBe(1);
  });

  /**
   * `isLoopback` parses rather than matches, so anything `new URL` cannot read
   * is refused rather than falling through. There is no third branch: a value
   * this function cannot understand is not a value it may run against.
   *
   * Deliberately NOT tested by blanking both variables: the script falls back
   * to `.env.local` then, which on a working checkout IS the local stack — so
   * that version of this test creates a real account as a side effect. It did,
   * once, and the account had to be deleted by hand.
   */
  it("refuses a URL it cannot parse", async () => {
    const { code, out } = await attempt(["someone@coditu.com"], {
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url-at-all",
    });
    expect(out).toContain("is not the local stack");
    expect(code).toBe(1);
  });
});

describe("add-local-user argument handling", () => {
  it("names the three internal roles and refuses anything else", async () => {
    const { code, out } = await attempt(["someone@coditu.com", "--role", "owner"]);
    expect(out).toContain("--role must be one of: admin, lead, engineer");
    expect(code).toBe(1);
  });

  it("refuses a client role as firmly as an invented one", async () => {
    const { out } = await attempt(["someone@coditu.com", "--role", "client"]);
    expect(out).toContain("--role must be one of: admin, lead, engineer");
  });

  it("asks for an address when given only flags", async () => {
    const { code, out } = await attempt(["--name", "Nobody At All"]);
    expect(out).toContain("usage:");
    expect(code).toBe(1);
  });

  /**
   * `--name "Two Words"` puts a non-flag word in the middle of the list. Taking
   * the first non-flag argument would make "Two Words" the address.
   */
  it("does not mistake a flag's value for the address", async () => {
    const { out } = await attempt(["--name", "Nadia Payoutless", "nadia@coditu.com"], {
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklm.supabase.co",
    });
    expect(out).toContain("is not the local stack");
    expect(out).not.toContain("usage:");
  });
});
