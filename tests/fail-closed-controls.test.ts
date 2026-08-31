import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The rule these assertions exist to hold: **a safety control must fail CLOSED,
 * and the absence of its configuration is itself a failure condition worth
 * alerting on.** A control that is quiet when unconfigured is indistinguishable
 * from a control that is working, which is the worst property a control can
 * have. ADR 2026-08-30.
 *
 * Three of these were found in one night, all written the same way:
 *
 *     if [ -z "${SOMETHING:-}" ]; then
 *       echo "::notice::… is not set; X is NOT active"
 *       exit 0
 *     fi
 *
 * That shape reads as caution and behaves as a switch that turns the guard off.
 * It is easy to write, it looks considerate in review, and every instance of it
 * was added on purpose by somebody being careful. So the shape itself is what
 * is asserted against here, not any one workflow.
 *
 * ## The one direction that is deliberately the other way round
 *
 * The production deploy SKIPS when it is not configured, and that is correct:
 *
 *   a DEPLOY that is not configured should be skipped, because not deploying
 *   is safe. An ALARM that is not configured must be loud, because not
 *   alarming is not safe.
 *
 * A permanently-red trunk teaches people to stop reading red, and then the one
 * that matters goes unnoticed. So the deploy is gated by a `preflight` job
 * whose output the deploy's `if:` reads — and the tests below assert that the
 * gate is that output rather than a step that exits 1.
 */

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const CI = read(".github/workflows/ci.yml");
const KEEPALIVE = read(".github/workflows/keepalive.yml");
const CANARY = read("ops/recovery-repo/workflows/backup-canary.yml");
const NIGHTLY = read("ops/recovery-repo/workflows/nightly-backup.yml");

/**
 * The fail-open shape: an emptiness test whose branch ends in `exit 0`.
 *
 * Scanned line by line rather than with one regex over the whole file, because
 * a workflow holds several `run:` blocks and a regex spanning them matches an
 * `exit 0` that belongs to a different step. Ten lines is the whole of one of
 * these branches; anything longer is not this idiom.
 */
function failsOpenOnMissingValue(yaml: string): string[] {
  const lines = yaml.split("\n");
  const found: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/if \[ -z "\$\{[A-Z0-9_]+:?-?\}?" \]|if \[ -z "\$\{[A-Z0-9_]+:-\}"/.test(lines[i])) continue;
    const name = /\$\{([A-Z0-9_]+)/.exec(lines[i])?.[1] ?? "<unknown>";
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j += 1) {
      if (/^\s*fi\b/.test(lines[j])) break;
      if (/^\s*exit 0\s*$/.test(lines[j])) found.push(name);
    }
  }
  return found;
}

describe("the deploy is SKIPPED when unconfigured, never failed", () => {
  it("gates the deploy job on a preflight output, not on a step that exits 1", () => {
    expect(CI).toMatch(/^ {2}preflight:$/m);
    expect(CI).toMatch(/needs\.preflight\.outputs\.configured == 'true'/);
    expect(CI).toMatch(/needs: \[check, preflight\]/);
  });

  it("the preflight reports presence without ever failing on absence", () => {
    const preflight = CI.slice(CI.indexOf("\n  preflight:"), CI.indexOf("\n  deploy:"));
    expect(preflight).toContain("configured=false");
    expect(preflight).toContain("configured=true");
    // If this job starts failing, `deploy` is skipped for the right reason and
    // the trunk is red for the wrong one — which is what it did before.
    expect(preflight).not.toMatch(/^\s*exit 1\s*$/m);
  });

  it("names every missing value rather than saying only that something is", () => {
    const preflight = CI.slice(CI.indexOf("\n  preflight:"), CI.indexOf("\n  deploy:"));
    for (const name of [
      "VERCEL_ORG_ID",
      "VERCEL_PROJECT_ID",
      "VERCEL_TOKEN",
      "HOSTED_SCHEMA_DB_URL",
      "PRODUCTION_BASE_URL",
    ]) {
      expect(preflight).toContain(name);
    }
    expect(preflight).toContain('printf \'  MISSING  %s\\n\'');
  });
});

describe("an alarm that is not configured is a failed alarm", () => {
  it("the backup canary fails without HEARTBEAT_URL", () => {
    expect(failsOpenOnMissingValue(CANARY)).toEqual([]);
    expect(CANARY).toContain("HEARTBEAT_URL");
    // The step that turns an unconfigured alarm into the red.
    expect(CANARY).toMatch(/if: always\(\) && steps\.alarm\.outputs\.configured != 'true'/);
  });

  it("the canary treats its report target as required too", () => {
    const alarm = CANARY.slice(CANARY.indexOf("- id: alarm"), CANARY.indexOf("Read the newest off-site"));
    for (const name of ["HEARTBEAT_URL", "PRODUCTION_BASE_URL", "BACKUP_CANARY_REPORT_SECRET"]) {
      expect(alarm).toContain(name);
    }
  });

  it("the keepalive fails without PRODUCTION_BASE_URL", () => {
    expect(failsOpenOnMissingValue(KEEPALIVE)).toEqual([]);
    expect(KEEPALIVE).toMatch(/::error title=The keepalive is not configured::/);
  });

  it("the nightly backup reads the store back instead of trusting its own exit code", () => {
    // `backup.sh` defaults BACKUP_UPLOAD to 0. Drop that line from the env
    // block and the job dumps the workspace into the runner's temp directory,
    // exits 0, and is destroyed with the runner.
    expect(NIGHTLY).toContain("./scripts/check-backup-freshness.sh");
    expect(NIGHTLY).toMatch(/BACKUP_MAX_AGE_SECONDS: "3600"/);
    expect(NIGHTLY).toMatch(/BACKUP_UPLOAD: "1"/);
  });
});

describe("no workflow anywhere reintroduces the shape", () => {
  it("has no `if [ -z \"$X\" ]; then … exit 0` branch left", () => {
    // The one exception is `scope`, whose emptiness test is about a changed-file
    // list rather than a configuration value: it reports `code=true` and runs
    // everything, which is the fail-CLOSED direction for that job. It is
    // matched by name below so a new one cannot hide behind it.
    const offenders = [
      ...failsOpenOnMissingValue(CI),
      ...failsOpenOnMissingValue(KEEPALIVE),
      ...failsOpenOnMissingValue(CANARY),
      ...failsOpenOnMissingValue(NIGHTLY),
    ];
    expect(offenders).toEqual([]);
  });
});

describe("a report-only job cannot decide what colour the trunk is", () => {
  /**
   * A job that exceeds `timeout-minutes` is CANCELLED, and `continue-on-error`
   * covers a failure rather than a cancellation — so a report-only job that ran
   * long took the whole run's conclusion with it on `main` at `cdbd011`, while
   * the blocking job had passed. A STEP that exceeds its own `timeout-minutes`
   * fails, and a step-level `continue-on-error` swallows that.
   */
  const browser = CI.slice(CI.indexOf("\n  browser:"), CI.indexOf("\n  preflight:"));

  it("puts the timeout on the suite steps, not only on the job", () => {
    const steps = [...browser.matchAll(/timeout-minutes: (\d+)/g)].map((m) => Number(m[1]));
    // The job ceiling and both suite steps.
    expect(steps).toHaveLength(3);
    const [job, ...suites] = steps;
    const budget = suites.reduce((total, minutes) => total + minutes, 0);
    // The job ceiling must sit ABOVE the steps' budget, or it fires first and
    // cancels the run — which is the thing being prevented.
    expect(job).toBeGreaterThan(budget);
  });

  it("keeps continue-on-error on the job and on both suite steps", () => {
    expect(browser).toMatch(/^ {4}continue-on-error: true$/m);
    expect(browser.match(/continue-on-error: true/g) ?? []).toHaveLength(3);
  });

  it("still turns a red suite into a visible red job", () => {
    expect(browser).toContain("Preserve a visible red result without blocking release");
    expect(browser).toMatch(/steps\.development_e2e\.outcome == 'failure'/);
  });
});

describe("the guards that were only reachable by remembering are in a gate", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const GATE = read("scripts/gate.sh");

  it("the recovery-repo drift check has a script name, a gate and a CI step", () => {
    expect(pkg.scripts["recovery:check"]).toBe("./scripts/sync-recovery-repo.sh --check");
    expect(GATE).toContain("npm run recovery:check");
    expect(CI).toContain("npm run recovery:check");
  });
});

/**
 * The role deviation added on 2026-08-31, asserted as a SHAPE rather than as
 * its current value.
 *
 * `HOSTED_SCHEMA_DB_URL` names `postgres` and the preflight's contract is
 * `coditu_backup`. The tempting fix — relax the role assertion until whatever
 * connects is acceptable — is the fail-open shape this file exists to catch,
 * arriving as a convenience. So the deviation is named, it is in `ci.yml` where
 * a diff shows it, and the check is HARDER to satisfy when it is absent.
 *
 * The assertion that matters most is the last one: what makes a wider role
 * tolerable is not the name in the exception, it is that the connection is
 * proved unable to write.
 */
describe("the schema preflight's role exception fails closed", () => {
  const PREFLIGHT = read("scripts/check-hosted-schema.mjs");

  it("falls back to the strict coditu_backup contract when nothing is named", () => {
    // No deviation named => the branch that runs demands the contract role,
    // BYPASSRLS, select, and NO insert. Unset must mean stricter, not looser.
    expect(PREFLIGHT).toContain('const CONTRACT_ROLE = "coditu_backup"');
    expect(PREFLIGHT).toMatch(
      /if \(!permitted\) \{[\s\S]*?role\.current_user === CONTRACT_ROLE && role\.can_read && !role\.can_write/,
    );
  });

  it("accepts only the exact role named, not any role that is not the contract", () => {
    expect(PREFLIGHT).toMatch(/if \(role\.current_user !== permitted\)/);
  });

  it("says on every run that it is not using the least-privilege role", () => {
    expect(PREFLIGHT).toContain(
      "::warning title=Schema preflight is not using the least-privilege role::",
    );
  });

  it("carries the deviation in the workflow, where a diff shows it", () => {
    expect(CI).toMatch(/^ {10}HOSTED_SCHEMA_PRIVILEGED_ROLE: postgres$/m);
    // Beside the step it applies to, not as a job-wide default that would
    // silently widen anything added to the job later.
    expect(CI).toMatch(
      /HOSTED_SCHEMA_PRIVILEGED_ROLE: postgres\n\s+run: node scripts\/check-hosted-schema\.mjs/,
    );
  });

  it("proves the connection cannot write instead of trusting the role name", () => {
    expect(PREFLIGHT).toContain('await client.query("begin read only")');
    expect(PREFLIGHT).toContain('const READ_ONLY_SQL_TRANSACTION = "25006"');
    expect(PREFLIGHT).toContain('await client.query("show transaction_read_only")');
    expect(PREFLIGHT).toMatch(/create temp table hosted_schema_write_probe/);
    // Unconditional: the proof does not sit behind the same env var whose
    // presence it is supposed to make safe.
    expect(PREFLIGHT).toMatch(/^\s*failures\.push\(\.\.\.\(await readOnlyFailures\(client\)\)\);$/m);
  });
});

/**
 * The transport guarantee, after the first CI run refused with
 * `database connection is not encrypted`.
 *
 * The secret's URL had no usable `sslmode`, so the deploy preflight was reading
 * production in cleartext. The assertion caught it — the defect was that the
 * guarantee lived in a query string inside an opaque secret, where nobody can
 * review it and where `sslmode` does not even mean the same thing to `pg` as it
 * does to `psql`.
 *
 * These assert the two halves stay separate: the check ARRANGES encryption and
 * separately ASSERTS it. Either alone would have been enough to pass CI on the
 * day; both together are what makes the guarantee survive an edit to one.
 */
describe("the schema preflight decides its own transport", () => {
  const PREFLIGHT = read("scripts/check-hosted-schema.mjs");

  it("does not hand the connection string to the client", () => {
    // `connectionString` would let a `sslmode` in the secret win — measured:
    // `require` died with SELF_SIGNED_CERT_IN_CHAIN and `disable` connected in
    // cleartext, even with an explicit `ssl` option beside it.
    expect(PREFLIGHT).not.toMatch(/new Client\(\{[^}]*connectionString/);
    expect(PREFLIGHT).toMatch(/host: parsedUrl\.hostname/);
    expect(PREFLIGHT).toMatch(/password: decodeURIComponent\(parsedUrl\.password\)/);
  });

  it("arranges encryption for every non-local target", () => {
    expect(PREFLIGHT).toMatch(/ssl: localHost\s*\n\s*\? false/);
    expect(PREFLIGHT).toContain("rejectUnauthorized: false");
  });

  it("still asserts the socket afterwards rather than trusting the arrangement", () => {
    expect(PREFLIGHT).toContain("database connection is not encrypted");
    expect(PREFLIGHT).toMatch(/failures\.push\(\.\.\.transportFailures\(client/);
  });

  it("keeps a way to demand a verified chain, with somewhere to put the root", () => {
    expect(PREFLIGHT).toContain("HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS");
    expect(PREFLIGHT).toContain("HOSTED_SCHEMA_DB_CA");
  });
});
