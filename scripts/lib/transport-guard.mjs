/**
 * Whether the leg this process is responsible for is encrypted, and what it is
 * encrypted with.
 *
 * Extracted from `check-hosted-schema.mjs` on 2026-08-31, for a reason that is
 * not tidiness. Until that morning the assertion's capacity to fail was proved
 * by experiment: force `ssl: false` against the real project and watch the
 * check report `database connection is not encrypted`. **That experiment no
 * longer reaches the assertion.** With "Enforce SSL on incoming connections"
 * turned on, Supabase refuses the cleartext connection first:
 *
 *     XX000  (ESSLREQUIRED) SSL connection is required for user: coditu_backup
 *
 * which is the provider control working, and is also a second control standing
 * in front of the first one and hiding whether it still works. The same shape
 * as the canary that was already red for a known reason — a control nothing can
 * exercise stops being a control and becomes a comment.
 *
 * So the guard moves here, takes a socket rather than a live client, and is
 * exercised by `tests/transport-guard.test.ts` against sockets that describe
 * every case including the ones the provider will not let us produce any more.
 *
 * ## Why the socket and not `pg_stat_ssl`
 *
 * Supabase reaches the database through **Supavisor**, which terminates TLS at
 * the pooler and opens its own connection to Postgres inside the VPC.
 * `pg_stat_ssl` therefore describes the pooler-to-Postgres hop and not ours.
 * Measured 2026-08-29 it answered `false` on a session that was TLSv1.3 end to
 * end from here; measured again 2026-08-31, after Enforce SSL was turned on, it
 * answers `true`. Both readings are about the far hop, and neither is evidence
 * about ours — which is the whole reason this reads the client socket. It is
 * kept as corroboration when it agrees and explained rather than believed when
 * it does not.
 *
 * ## Why the issuer is pinned by name
 *
 * `authorized` is false against the pooler because the chain ends at "Supabase
 * Root 2021 CA", which is in no public trust store, so full verification needs
 * that root supplied out of band. Until it is, the chain is pinned by issuer
 * organisation instead: a downgrade to cleartext fails, and so does a
 * certificate that is not Supabase's.
 */

export const SUPABASE_ISSUER_O = "Supabase Inc";

/**
 * What the transport is, as plain values, for the summary the check prints.
 *
 * Reporting is not decoration here. Before this, a run that verified the
 * encryption and a run in which the assertion had been deleted printed the
 * identical seven lines — success indistinguishable from absence, which is the
 * property `docs/07-FIELD-NOTES.md` calls the fail-open shape. The check now
 * says what it proved.
 */
/** @param {object | null | undefined} socket */
export function describeTransport(socket) {
  if (socket?.encrypted !== true) return { encrypted: false };
  const certificate =
    typeof socket.getPeerCertificate === "function" ? socket.getPeerCertificate(true) : null;
  return {
    encrypted: true,
    protocol: typeof socket.getProtocol === "function" ? socket.getProtocol() : null,
    cipher: typeof socket.getCipher === "function" ? (socket.getCipher()?.name ?? null) : null,
    issuer: certificate?.issuer?.O ?? null,
    subject: certificate?.subject?.CN ?? null,
    verified: socket.authorized === true,
  };
}

/**
 * Every reason to refuse this connection's transport. Empty means acceptable.
 *
 * @typedef  {object}       TransportCheck
 * @property {object | null} [socket]                 the client's own socket
 * @property {boolean}       [pgStatSslSaysEncrypted] the far hop's opinion, for the message only
 * @property {boolean}       [requireVerified]        demand a chain that verifies against a supplied root
 *
 * @param {TransportCheck} options
 * @returns {string[]}
 */
export function transportFailures({ socket, pgStatSslSaysEncrypted = false, requireVerified = false }) {
  if (socket?.encrypted !== true) {
    return [
      pgStatSslSaysEncrypted
        ? "database connection is not encrypted on this leg (pg_stat_ssl disagrees; trust the socket)"
        : "database connection is not encrypted",
    ];
  }

  const transport = describeTransport(socket);

  // Verified against a supplied root is the strong form. Ask for it explicitly
  // rather than silently accepting the weaker one, so that turning it on is a
  // deliberate act and turning it off cannot happen by accident.
  if (requireVerified && !transport.verified) {
    return [
      `database TLS certificate did not verify (${socket.authorizationError ?? "unknown"}); ` +
        "supply the project CA and use sslmode=verify-full",
    ];
  }

  if (!transport.verified && transport.issuer !== SUPABASE_ISSUER_O) {
    return [
      "database TLS certificate is neither publicly verified nor issued by " +
        `${SUPABASE_ISSUER_O} (got ${transport.issuer ?? "no certificate"})`,
    ];
  }

  return [];
}
