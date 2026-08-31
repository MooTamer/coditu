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
const LOCAL_NIGHTLY = read("scripts/local-nightly.sh");
const AGENT = read("scripts/install-nightly-agent.sh");
const TRIGGERS = read("scripts/reapply-managed-triggers.sh");
const VERIFIER = read("scripts/verify-backup-restore.sh");

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
    // The contract branch demands BYPASSRLS, select, and no insert, and it is
    // reached whether or not a deviation is named. `!permitted` then has only
    // one job left: refuse every other role.
    expect(PREFLIGHT).toMatch(
      /if \(role\.current_user === CONTRACT_ROLE\) \{[\s\S]*?if \(role\.can_read && !role\.can_write\) return \[\];/,
    );
    expect(PREFLIGHT).toMatch(
      /if \(!permitted\) \{[\s\S]*?connection role is not the read-only \$\{CONTRACT_ROLE\} contract/,
    );
  });

  it("accepts only the exact role named, not any role that is not the contract", () => {
    expect(PREFLIGHT).toMatch(/if \(role\.current_user !== permitted\)/);
  });

  it("still accepts the contract role while a deviation is named", () => {
    // A deviation WIDENS what is accepted; it must not replace it. Before
    // 2026-08-31 it replaced it, so `HOSTED_SCHEMA_PRIVILEGED_ROLE=postgres` —
    // which `ci.yml` carries — refused a secret narrowed to `coditu_backup`
    // with "neither coditu_backup nor the permitted postgres (got
    // coditu_backup)". That is the deploy failing on the exact action the
    // check's own warning asks somebody to take. Measured against the real
    // project both ways; see the ADR of 2026-08-31.
    expect(PREFLIGHT).toMatch(
      /if \(role\.current_user === CONTRACT_ROLE\) \{\s*\n\s*if \(role\.can_read && !role\.can_write\) return \[\];/,
    );
    // And the contract branch comes BEFORE the deviation is consulted, so no
    // value of the variable can turn the contract role into a failure.
    expect(PREFLIGHT.indexOf("if (role.current_user === CONTRACT_ROLE)")).toBeLessThan(
      PREFLIGHT.indexOf("if (role.current_user !== permitted)"),
    );
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
  const GUARD = read("scripts/lib/transport-guard.mjs");

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
    // The refusal itself moved to `scripts/lib/transport-guard.mjs` so that a
    // test can exercise it — Supabase's Enforce SSL now refuses a cleartext
    // connection before the assertion is reached, which took away the only way
    // this repository had of proving the assertion still worked. What is
    // asserted here is that the check still CALLS it on the socket it holds;
    // what it does when called is `tests/transport-guard.test.ts`.
    expect(PREFLIGHT).toMatch(/from "\.\/lib\/transport-guard\.mjs"/);
    expect(PREFLIGHT).toMatch(/socket: client\.connection\?\.stream/);
    expect(GUARD).toContain("database connection is not encrypted");
  });

  it("reports the transport it proved, so a run that proved it reads differently", () => {
    // Before this, a passing run and a run with the assertion deleted printed
    // the identical seven lines. Success indistinguishable from absence is the
    // fail-open shape arriving as an omission rather than as an `exit 0`.
    expect(PREFLIGHT).toMatch(/tls=\$\{transport\.encrypted \? "encrypted" : "cleartext"\}/);
    expect(PREFLIGHT).toMatch(/tls_issuer=/);
  });

  it("keeps a way to demand a verified chain, with somewhere to put the root", () => {
    expect(PREFLIGHT).toContain("HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS");
    expect(PREFLIGHT).toContain("HOSTED_SCHEMA_DB_CA");
  });
});

/**
 * The rollback drill. It moves production twice, so its safety properties are
 * asserted here rather than left to review.
 *
 * The one that matters most is the last: restoring runs on EVERY exit path. A
 * drill that can leave production on the previous release is worse than no
 * drill, and the way that happens is an early `exit` between the rollback and
 * the roll-forward.
 */
describe("the rollback drill cannot leave production where it moved it", () => {
  const DRILL = read("scripts/rollback-drill.sh");
  const DRILL_WORKFLOW = read(".github/workflows/rollback-drill.yml");

  it("is dispatch-only — never scheduled, never on a push", () => {
    expect(DRILL_WORKFLOW).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(DRILL_WORKFLOW).not.toMatch(/^ {2}schedule:/m);
    expect(DRILL_WORKFLOW).not.toMatch(/^ {2}push:/m);
  });

  it("cannot run at the same time as a deploy", () => {
    expect(DRILL_WORKFLOW).toMatch(/group: production-deploy/);
    expect(CI).toMatch(/group: production-deploy/);
  });

  it("refuses to start when any value is missing, rather than skipping", () => {
    expect(DRILL_WORKFLOW).toMatch(/refusing to move production/);
    expect(DRILL_WORKFLOW).toMatch(/exit 1/);
  });

  it("restores on every exit path, not just the happy one", () => {
    expect(DRILL).toMatch(/trap restore EXIT/);
    expect(DRILL).toMatch(/trap 'exit 130' INT/);
    expect(DRILL).toMatch(/trap 'exit 143' TERM/);
    expect(DRILL).toMatch(/drill_restore_needed=1\nvercel_cli promote/);
    expect(DRILL).toContain("Production was NOT restored");
  });

  // The plan allows exactly one: `vercel rollback` refused with
  //   To rollback further than the previous production deployment, upgrade to pro. (402)
  // So the drill steps AWAY with promote and comes BACK with rollback, which is
  // the direction the deploy script's trap actually uses.
  it("steps away with promote and returns with rollback, which is the one step Hobby allows", () => {
    expect(DRILL).toMatch(/vercel_cli promote "\$drill_step_url"/);
    expect(DRILL).toMatch(/vercel_cli rollback "\$drill_live_id"/);
    expect(DRILL).toContain("upgrade to pro");
  });

  it("verifies by deployment id, not by commit", () => {
    // The two deployments can carry identical code — in the safest case they
    // do — so a commit comparison would pass without the domain having moved.
    expect(DRILL).toMatch(/domain_deployment_id\(\)/);
    expect(DRILL).toMatch(/await_domain "\$drill_step_id" \|\| fail/);
    expect(DRILL).toMatch(/await_domain "\$drill_live_id" \|\| fail/);
  });

  it("will not promote a deployment that is not serving", () => {
    expect(DRILL).toContain("refusing to promote it");
    expect(DRILL).toMatch(/vercel curl \/login --deployment "\$drill_step_url"/);
  });

  it("polls to a deadline instead of sleeping a guessed interval", () => {
    expect(DRILL).toMatch(/drill_deadline=\$\(\(SECONDS \+ 180\)\)/);
  });
});

/**
 * The deploy builds on Vercel, and the evidence file has to reach it.
 *
 * `vercel pull` writes `[SENSITIVE]` for a Sensitive environment variable —
 * they are write-only by design — so a build outside Vercel cannot have them,
 * and the first real run of the CI build died on the application's own
 * configuration check. The answer is not to downgrade four production variables
 * to readable; it is to let Vercel build, which is what it has always done.
 *
 * The trap that creates: without `.vercelignore`, the CLI falls back to
 * `.gitignore`, and `.gitignore` excludes `public/build-health.json` — the one
 * file CI writes right before deploying, and the one both smokes read. The
 * deploy would have uploaded everything except its own evidence.
 */
describe("the release stamps its commit and that stamp reaches Vercel", () => {
  const DEPLOY = read("scripts/deploy-production.sh");
  const STAMP = read("scripts/write-build-health.mjs");
  const VERCELIGNORE = read(".vercelignore");
  const GITIGNORE = read(".gitignore");

  const rules = VERCELIGNORE.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  // Comments are stripped before asserting an ABSENCE. Both files explain at
  // length why `--prebuilt` is gone, and a test that reads the explanation as
  // the thing it forbids fails for the one reason that is not a defect.
  const code = (text: string) =>
    text
      .split("\n")
      .filter((line) => !/^\s*(#|\/\/)/.test(line))
      .join("\n");

  it("deploys from source, because a Sensitive variable cannot be pulled", () => {
    expect(DEPLOY).toContain("vercel_cli deploy --prod --skip-domain --yes");
    expect(code(DEPLOY)).not.toContain("--prebuilt");
    expect(code(CI)).not.toMatch(/vercel build --prod/);
    expect(code(CI)).not.toMatch(/vercel pull .*--environment=production/);
  });

  it("writes the stamp where an uploaded build will carry it", () => {
    expect(STAMP).toContain('resolve(import.meta.dirname, "../public/build-health.json")');
    expect(DEPLOY).toContain("$release_repo_root/public/build-health.json");
  });

  it("keeps the stamp out of git and INTO the upload", () => {
    // Both are needed, and they pull in opposite directions — which is exactly
    // why .vercelignore has to exist rather than being left to the fallback.
    expect(GITIGNORE).toContain("public/build-health.json");
    expect(rules.some((rule) => rule.includes("build-health"))).toBe(false);
    expect(rules).toContain("node_modules");
    expect(rules).toContain(".env*");
  });

  it("still refuses to deploy a stamp that is not this commit", () => {
    expect(DEPLOY).toMatch(/fail "local build-health commit does not match GITHUB_SHA"/);
    expect(DEPLOY).toContain(`[ "$(jq -er '.commit' "$release_health_file")" = "$GITHUB_SHA" ]`);
  });
});

/**
 * `vercel curl` and the flag it leaks.
 *
 * Vercel CLI 59.9.1 reads `--token` for authentication and then forwards it to
 * curl with everything else, so the staged smoke died on `curl: option
 * --token: is unknown` and the first deliberate deploy never promoted. The leak
 * is INVISIBLE with an invalid token — the CLI rejects that before reaching
 * curl — which is exactly why every rehearsal against a fake provider passed.
 *
 * Measured against the real CLI: `--token` after the path leaks; `VERCEL_TOKEN`
 * in the environment does not, and the CLI names it by that variable when it is
 * wrong.
 */
describe("the staged smoke does not hand curl a flag it cannot read", () => {
  const DEPLOY = read("scripts/deploy-production.sh");

  it("gives vercel curl no --token flag at all", () => {
    // Comments stripped first. The block above explains the leak at length and
    // names the flag; a test that reads its own explanation as the defect
    // fails for the one reason that is not one.
    const code = DEPLOY.split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    const calls = code.match(/vercel curl[\s\S]*?\n\s*--silent[^\n]*/g) ?? [];
    expect(calls.length).toBe(2);
    for (const call of calls) expect(call).not.toContain("--token");
  });

  it("exports the token instead, because the CLI reads it from there", () => {
    expect(DEPLOY).toMatch(/^export VERCEL_TOKEN$/m);
    // And still refuses to start without it.
    expect(DEPLOY).toMatch(/for release_required in VERCEL_TOKEN /);
  });

  it("leaves the other CLI calls using the wrapper, which is unaffected", () => {
    // `deploy`, `inspect`, `promote` and `rollback` have no passthrough section,
    // so a trailing --token is consumed there and always was.
    expect(DEPLOY).toContain('vercel "$@" --token "$VERCEL_TOKEN"');
  });
});


/**
 * The nightly moved to the Mac on 2026-08-31, and it took the restore drill
 * with it.
 *
 * Two reasons it had to. The drill needs the age **private** key, which is
 * deliberately not on GitHub and which age gives no decrypt-only form of, so no
 * scheduled cloud job could ever run it. And Actions minutes belong to the
 * account rather than the repository, so CI and the backup drew on one pool —
 * which ran out at 08:20Z that morning, took every job in both repositories to
 * zero steps, and stopped the nightly. The backup was 47 of the month's
 * minutes. 1.4% of the burn, and the first thing to die.
 *
 * A local job trades one failure mode for another on purpose: the Mac can be
 * asleep. The whole design is that the new failure mode is **visible** — a
 * missed heartbeat at healthchecks.io — where a GitHub run that never happened
 * is nothing at all. These assertions are about keeping it that way.
 */
describe("the nightly runs on the Mac, and cannot run quietly", () => {
  it("is no longer on a schedule in Actions, and still dispatchable", () => {
    // Moved, not duplicated. Two nightlies writing to one release store is two
    // things to keep in step and twice the chance of a half-published set.
    expect(NIGHTLY).not.toMatch(/^\s*schedule:/m);
    expect(NIGHTLY).toMatch(/^\s*workflow_dispatch:/m);
  });

  it("refuses to run at all without the heartbeat", () => {
    // The one that matters. Unconfigured alerting must not mean "run without
    // alerting" — a 02:00 job with no outside observer is a job whose success
    // and whose absence look identical.
    expect(LOCAL_NIGHTLY).toMatch(/nightly_required="[^"]*HEARTBEAT_URL/);
    expect(LOCAL_NIGHTLY).toMatch(/\[ -z "\$nightly_missing" \] \|\| \{[\s\S]*?exit 1/);
    // And it is loud where a person can see it, not only in a log file.
    expect(LOCAL_NIGHTLY).toContain("display notification");
  });

  it("refuses a secrets file anybody can read", () => {
    expect(LOCAL_NIGHTLY).toMatch(/it must be 600/);
    expect(LOCAL_NIGHTLY).toMatch(/\[ "\$nightly_mode" = "600" \] \|\|/);
  });

  it("pings success only AFTER the restore has verified", () => {
    // A copy that was written and never restored is a file, not a backup. The
    // success ping must be downstream of the drill, so a night that published
    // and could not restore reads as a failure rather than as a green tick.
    const drill = LOCAL_NIGHTLY.indexOf("verify-backup-restore.sh");
    const success = LOCAL_NIGHTLY.lastIndexOf('ping_heartbeat ""');
    expect(drill).toBeGreaterThan(-1);
    expect(success).toBeGreaterThan(drill);
    // And exit 0 from the verifier is not enough on its own.
    expect(LOCAL_NIGHTLY).toContain("restore_verified=true");
  });

  it("reads the store back rather than trusting the writer's exit status", () => {
    // `BACKUP_UPLOAD` defaults to 0, so one dropped line turns this into a
    // script that writes the whole workspace to a local directory, prints every
    // count and exits 0. The same trapdoor the Actions job had, and the same
    // one-hour window closing it.
    expect(LOCAL_NIGHTLY).toContain("BACKUP_UPLOAD=1");
    expect(LOCAL_NIGHTLY).toMatch(/BACKUP_MAX_AGE_SECONDS=3600/);
  });

  it("never lets a partial run look like a complete one", () => {
    // `--drill-only` proves a set restores and proves nothing about a set being
    // written, so it must not be able to send the ping that says both.
    expect(LOCAL_NIGHTLY).toMatch(
      /ping_heartbeat\(\) \{\s*\n\s*\[ "\$nightly_drill_only" = 0 \] \|\| return 0/,
    );
  });

  it("refuses to install a schedule for a job that cannot run", () => {
    // An agent installed against a broken configuration is how a backup ends up
    // automated and absent at the same time.
    expect(AGENT).toMatch(/local-nightly\.sh" --dry-run \|\|/);
    expect(AGENT).toContain("StartCalendarInterval");
    // `StartInterval` drifts and skips; a calendar interval fires on the next
    // wake after a missed slot, which is most of what a laptop needs. Matched
    // as a plist key, because the header explains why it is not used and a bare
    // substring match reads that explanation as the thing it warns against.
    expect(AGENT).not.toMatch(/<key>StartInterval<\/key>/);
    // Installing must not itself write a release.
    expect(AGENT).not.toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
  });
});


/**
 * The half a dump of this project cannot carry, and the two opt-ins that let an
 * unattended drill do the whole runbook rather than a subset of it.
 *
 * Both default OFF. An absent variable makes `verify-backup-restore.sh` HARDER
 * to satisfy, never easier — the same rule as the schema preflight's role
 * exception, and the reason is the same: a recovery at 3am must meet the strict
 * version, and only a harness that owns a disposable target may relax it.
 */
describe("the drill does the whole recovery, and the relaxations are opt-in", () => {
  it("keeps both relaxations off unless something asks for them", () => {
    expect(VERIFIER).toMatch(/\$\{RESTORE_WIDEN_MANAGED_COLUMNS:-0\}" = "1"/);
    expect(VERIFIER).toMatch(/if \[ -n "\$\{RESTORE_MIGRATE_CMD:-\}" \]/);
    // Still refuses by default when the target is older than the backup.
    expect(VERIFIER).toContain("the restore target is missing columns this backup carries");
    // And still refuses to call an un-migrated database restored.
    expect(VERIFIER).toContain("the data restored but the database is NOT usable");
  });

  it("says on every run what it had to widen", () => {
    // A relaxation nobody can see is a relaxation nobody revisits.
    expect(VERIFIER).toContain("restore_target_widened=");
    expect(LOCAL_NIGHTLY).toContain("target widened to accept");
  });

  it("compares the row counts BEFORE re-applying anything", () => {
    // Otherwise the counts measure the migrated database rather than the
    // restore, and a migration that inserted a row would make the drill green
    // about an archive that was short.
    expect(VERIFIER.indexOf("RESTORE_MIGRATE_CMD")).toBeGreaterThan(
      VERIFIER.indexOf("restore_missing_rows"),
    );
  });

  it("derives the managed triggers from the migrations rather than listing them", () => {
    // A hand-kept list is silent about the trigger somebody adds next — the
    // defect this repository has now found in a guard, a test and three CI
    // controls.
    expect(TRIGGERS).toMatch(/supabase\/migrations\/\*\.sql/);
    expect(TRIGGERS).not.toMatch(/enforce_email_allowlist|on_auth_user_created/);
    // Slurped, not line-based: `create trigger x` and `on auth.users` are never
    // on the same line, and the line-based version of this scan found nothing
    // and reported success.
    expect(TRIGGERS).toContain("perl -0777");
    expect(TRIGGERS).toContain("drop trigger if exists");
  });

  it("refuses to report success when the scan finds nothing", () => {
    expect(TRIGGERS).toMatch(/\[ -n "\$triggers_sql" \] \|\|/);
    expect(TRIGGERS).toContain("this scan has gone blind");
  });

  it("does not tell anybody to run `supabase db push` over a restore", () => {
    // It does not work: the archive carries no `supabase_migrations`, so the
    // CLI replays all forty migrations over a full schema and dies on
    // `create type app_role`. Measured 2026-08-31.
    expect(read("docs/12-RECOVERY-RUNBOOK.md")).not.toMatch(
      /5a\.[\s\S]{0,200}supabase db push/,
    );
    expect(LOCAL_NIGHTLY).toContain("reapply-managed-triggers.sh");
  });
});
