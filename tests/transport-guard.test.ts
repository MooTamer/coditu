import { describe, expect, it } from "vitest";

import {
  SUPABASE_ISSUER_O,
  describeTransport,
  transportFailures,
} from "@/scripts/lib/transport-guard.mjs";

/**
 * The deploy preflight's transport guard, exercised rather than read.
 *
 * ## Why this file exists, and why it exists NOW
 *
 * Until 2026-08-31 this assertion's capacity to fail was proved by experiment:
 * force `ssl: false` in `check-hosted-schema.mjs`, point it at the real
 * project, and watch it report `database connection is not encrypted`. That is
 * how the ADR of 2026-08-31 recorded it as "verified capable of failing".
 *
 * Mohamed then turned on **Enforce SSL on incoming connections**, which was
 * owed and is correct. Measured the same day, the experiment now dies one hop
 * earlier:
 *
 *     XX000  (ESSLREQUIRED) SSL connection is required for user: coditu_backup
 *
 * Supabase refuses the cleartext connection, so the guard is never reached and
 * the only proof it still worked is gone. **Two controls, and the outer one
 * conceals whether the inner one is alive** — the same shape as the canary that
 * was already red for a known reason and could no longer report an unknown one.
 * The answer both times is the same: give the inner control something that
 * exercises it directly.
 *
 * So the guard takes a socket, and these are the sockets — including the ones
 * the provider will not let us produce against the real database any more.
 *
 * ## What each case is standing in for
 *
 * | socket                              | the world it describes                          |
 * |-------------------------------------|-------------------------------------------------|
 * | `encrypted: false`                  | Enforce SSL turned back off AND the arranging half broken |
 * | issuer not Supabase                 | something is terminating TLS between here and them |
 * | `authorized: true`                  | a publicly-verified chain, once there is one     |
 * | `requireVerified` with no root      | the strong form asked for and not supplied       |
 */

/** The connection this repository actually gets, measured 2026-08-31. */
function supabaseSocket(overrides: Record<string, unknown> = {}) {
  return {
    encrypted: true,
    authorized: false,
    authorizationError: "SELF_SIGNED_CERT_IN_CHAIN",
    getProtocol: () => "TLSv1.3",
    getCipher: () => ({ name: "TLS_AES_256_GCM_SHA384" }),
    getPeerCertificate: () => ({
      issuer: { O: SUPABASE_ISSUER_O },
      subject: { CN: "*.pooler.supabase.com" },
    }),
    ...overrides,
  };
}

describe("the transport guard refuses cleartext", () => {
  it("refuses a socket that is not encrypted", () => {
    expect(transportFailures({ socket: { encrypted: false } })).toEqual([
      "database connection is not encrypted",
    ]);
  });

  it("refuses a missing socket rather than passing on a falsy read", () => {
    // `client.connection?.stream` is optional chaining on a driver internal.
    // If the driver ever renames it, the guard must refuse, not wave through.
    expect(transportFailures({ socket: undefined })).toHaveLength(1);
    expect(transportFailures({ socket: null })).toHaveLength(1);
  });

  it("names pg_stat_ssl in the message when the far hop disagrees", () => {
    // Supavisor terminates TLS at the pooler, so `pg_stat_ssl` describes the
    // pooler-to-Postgres leg and not ours. It read false on 2026-08-29 and true
    // on 2026-08-31, both times about the far hop. When it disagrees with the
    // socket, the socket wins and the message says so — a bare "not encrypted"
    // beside a `pg_stat_ssl` of true is how somebody talks themselves out of a
    // real finding.
    expect(transportFailures({ socket: { encrypted: false }, pgStatSslSaysEncrypted: true })).toEqual([
      "database connection is not encrypted on this leg (pg_stat_ssl disagrees; trust the socket)",
    ]);
  });
});

describe("the transport guard pins the chain when it cannot verify it", () => {
  it("accepts the real Supabase pooler certificate", () => {
    expect(transportFailures({ socket: supabaseSocket() })).toEqual([]);
  });

  it("refuses an unverified chain from anybody else", () => {
    const [failure] = transportFailures({
      socket: supabaseSocket({
        getPeerCertificate: () => ({ issuer: { O: "Some Other CA" }, subject: { CN: "*.example" } }),
      }),
    });
    expect(failure).toContain("neither publicly verified nor issued by");
    expect(failure).toContain("Some Other CA");
  });

  it("refuses encryption with no certificate behind it", () => {
    expect(
      transportFailures({ socket: supabaseSocket({ getPeerCertificate: () => null }) })[0],
    ).toContain("no certificate");
  });

  it("accepts a publicly-verified chain from any issuer", () => {
    // The pin is the fallback for a root no public store carries. Once the
    // chain verifies, the issuer is no longer this check's business.
    expect(
      transportFailures({
        socket: supabaseSocket({
          authorized: true,
          getPeerCertificate: () => ({ issuer: { O: "Some Public CA" }, subject: { CN: "x" } }),
        }),
      }),
    ).toEqual([]);
  });
});

describe("the strong form is asked for explicitly, and is not silently downgraded", () => {
  it("refuses the pinned-issuer posture when a verified chain is demanded", () => {
    const [failure] = transportFailures({ socket: supabaseSocket(), requireVerified: true });
    expect(failure).toContain("did not verify");
    expect(failure).toContain("SELF_SIGNED_CERT_IN_CHAIN");
  });

  it("is satisfied by a verified chain", () => {
    expect(
      transportFailures({ socket: supabaseSocket({ authorized: true }), requireVerified: true }),
    ).toEqual([]);
  });
});

describe("what the preflight reports", () => {
  it("describes an encrypted connection in the terms the summary prints", () => {
    expect(describeTransport(supabaseSocket())).toEqual({
      encrypted: true,
      protocol: "TLSv1.3",
      cipher: "TLS_AES_256_GCM_SHA384",
      issuer: SUPABASE_ISSUER_O,
      subject: "*.pooler.supabase.com",
      verified: false,
    });
  });

  it("says cleartext and nothing else when there is nothing to describe", () => {
    // The summary branches on this. A cleartext run must not print a protocol
    // it does not have.
    expect(describeTransport({ encrypted: false })).toEqual({ encrypted: false });
  });
});
