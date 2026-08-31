import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CI runs on a self-hosted runner on Mohamed's Mac, and these are the tripwires
 * on that arrangement.
 *
 * On 2026-08-31 the account's GitHub Actions allowance ran out. Every job in
 * both repositories began finishing in two seconds with zero steps, `main`
 * froze because the one required check could not run, and the nightly backup
 * stopped. Measured burn was 4.3x sustainable, so the fix is not a smaller CI —
 * it is a runner GitHub does not meter.
 *
 * That fix brings two new ways to lose, and neither announces itself:
 *
 * 1. **CI drifts back to the metered pool.** One job edited to `ubuntu-latest`
 *    is a green run and a bill. So every job must read the `CI_RUNNER`
 *    variable, and every job must print where it ran.
 * 2. **CI eats the developer's database.** `supabase start` keys its containers
 *    off `project_id`, not off the directory it runs in. A hosted runner is an
 *    empty machine; this one is not. Without the isolation step, `supabase db
 *    reset` in CI drops the local stack somebody is working in.
 *
 * The deliberate exceptions are asserted too. `keepalive.yml` and
 * `rollback-drill.yml` stay metered ON PURPOSE — their whole reason to exist is
 * to work when this Mac does not — and an intention that is only written in a
 * comment is one refactor from being reversed by accident.
 */

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ci = read(".github/workflows/ci.yml");
const identity = read(".github/actions/runner-identity/action.yml");
const isolate = read(".github/actions/isolated-supabase/action.yml");

/** Every `jobs:` entry, as `name -> its own block of the file`. */
function jobs(workflow: string): Map<string, string> {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === "jobs:");
  expect(start).toBeGreaterThan(-1);

  const found = new Map<string, string>();
  let current: string | null = null;
  let body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([a-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      if (current) found.set(current, body.join("\n"));
      current = header[1];
      body = [];
      continue;
    }
    body.push(line);
  }
  if (current) found.set(current, body.join("\n"));
  return found;
}

const ciJobs = jobs(ci);

describe("every CI job runs where we chose, and says so", () => {
  it("finds the jobs this file is supposed to have", () => {
    expect([...ciJobs.keys()]).toEqual([
      "scope",
      "check",
      "browser",
      "preflight",
      "deploy",
      "lighthouse",
    ]);
  });

  it.each([...ciJobs.keys()])("%s asks for the self-hosted runner", (name) => {
    const body = ciJobs.get(name)!;
    // The expression, not a bare label: `CI_RUNNER` unset is the normal state
    // and resolves to the Mac; setting it is the one documented way back to the
    // metered pool, and it is visible in the repository's variables.
    expect(body).toMatch(
      /runs-on: \$\{\{ fromJSON\(vars\.CI_RUNNER \|\| '\["self-hosted","coditu-mac"\]'\) \}\}/,
    );
  });

  it("has no job left on a hardcoded hosted label", () => {
    expect(ci).not.toMatch(/runs-on: *(ubuntu|macos|windows)-/);
  });

  it.each([...ciJobs.keys()])("%s prints which runner executed it", (name) => {
    expect(ciJobs.get(name)!).toContain("uses: ./.github/actions/runner-identity");
  });

  it("puts the identity step behind a checkout, because it is a local action", () => {
    for (const [name, body] of ciJobs) {
      const checkout = body.indexOf("uses: actions/checkout@v4");
      const says = body.indexOf("uses: ./.github/actions/runner-identity");
      expect(checkout, `${name} checks out`).toBeGreaterThan(-1);
      expect(says, `${name} announces its runner after checking out`).toBeGreaterThan(checkout);
    }
  });
});

describe("CI can be started by hand", () => {
  it("accepts workflow_dispatch", () => {
    // On 2026-08-31 a push to a pull-request branch produced no run at all —
    // no job, no failure, no `github-actions` check suite — because the branch
    // had gone DIRTY and `refs/pull/N/merge` cannot be built for a conflicting
    // pull request. The checks list stays empty, which reads as "not started
    // yet" rather than as "will never start".
    expect(ci).toMatch(/^ {2}workflow_dispatch:$/m);
  });
});

describe("the runner identity reaches the summary, and names the cost", () => {
  it("writes to the step summary rather than only the log", () => {
    expect(identity).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });

  it("reads GitHub's own answer, not a label we could mislabel", () => {
    expect(identity).toContain("runner.environment");
  });

  it("says plainly when the run was metered", () => {
    expect(identity).toContain("consumed the Actions allowance");
  });
});

describe("CI's Supabase stack cannot collide with the Mac's own", () => {
  // 543xx is the CLI default, 544xx the shared development stack, 545xx the
  // isolated e2e rehearsal, 546xx the nightly restore drill. CI is 547xx.
  const taken = [543, 544, 545, 546];

  const stackJobs = [...ciJobs].filter(([, body]) => body.includes("run: supabase start"));

  // Written down once, in the action. `lighthouse` was missed on the first
  // pass of this change and this list is how: it starts a stack without
  // resetting one, so it does not read like a job that could hurt anybody.
  it("finds the jobs that start a stack", () => {
    expect(stackJobs.map(([name]) => name)).toEqual(["check", "browser", "lighthouse"]);
  });

  it.each(stackJobs.map(([name]) => name))("%s moves off the shared ports first", (name) => {
    const body = ciJobs.get(name)!;
    const moved = body.indexOf("uses: ./.github/actions/isolated-supabase");
    const start = body.indexOf("run: supabase start");
    expect(moved, `${name} isolates its stack`).toBeGreaterThan(-1);
    expect(start, `${name} isolates before it starts`).toBeGreaterThan(moved);
  });

  it("claims no port block anybody else holds", () => {
    const rewritten = [...isolate.matchAll(/\/(?:shadow_)?port = (\d{5})\//g)].map(([, port]) =>
      Number(port),
    );
    expect(rewritten.length).toBeGreaterThan(0);
    for (const port of rewritten) {
      expect(taken, `${port} lands in a block already in use`).not.toContain(
        Math.floor(port / 100),
      );
    }
  });

  it("proves the rename landed rather than trusting sed's exit code", () => {
    expect(isolate).toContain(`grep -q '^project_id = "codituci"$'`);
  });

  it("names the remedy when the Mac's Docker is not running", () => {
    // Colima stopped between two runs of the change that introduced this, and
    // the required check went red on `Cannot connect to the Docker daemon` —
    // true, and not a sentence containing the fix. `main` is frozen while that
    // is red, so the minute this saves is not a convenience.
    expect(isolate).toContain("docker info");
    expect(isolate).toContain("colima start");
    expect(isolate).toContain("$GITHUB_STEP_SUMMARY");
  });

  it.each(stackJobs.map(([name]) => name))("%s tears its stack down even when red", (name) => {
    const body = ciJobs.get(name)!;
    expect(body).toContain("supabase stop --no-backup");
    // `always()`: a hosted runner is deleted when the job ends and this Mac is
    // not, so a failed suite that skips cleanup fills a 6 GiB VM with the
    // developer's stack still in it.
    expect(body).toMatch(/if: \$\{\{ always\(\) && runner\.environment == 'self-hosted' \}\}/);
  });
});

describe("the self-hosted runner is not asked to cache what it never loses", () => {
  // `~/.npm` survives between jobs on a persistent runner, so `cache: npm`
  // uploads a cache to replace something that did not go anywhere. Measured on
  // the first run of this change: 5 minutes of real work, 15 minutes of Post
  // Run actions/setup-node still uploading.
  // Directives only. This file explains itself at length, and the word
  // `cache:` appears in the prose above every one of them.
  const directives = ci
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => /^\s*cache:/.test(line))
    .map((line) => line.trim());

  it("asks for the npm cache only on a hosted runner", () => {
    expect(directives.length).toBe(4);
    for (const line of directives) {
      expect(line).toBe("cache: ${{ runner.environment == 'github-hosted' && 'npm' || '' }}");
    }
  });

  it("does not write the ternary that returns the same branch twice", () => {
    // `x && '' || 'npm'` reads as "empty when self-hosted" and is `npm` in both
    // cases: an empty string is falsy in a GitHub expression, so `||` wins.
    for (const line of directives) expect(line).not.toMatch(/&& '' \|\|/);
  });
});

describe("the jobs that stay metered stay metered on purpose", () => {
  // The rule: the metered runner is for the jobs whose whole reason to exist is
  // to work when this Mac does not. Keeping the hosted database awake, and
  // rolling production back, are both of those.
  it.each(["keepalive.yml", "rollback-drill.yml"])("%s still runs hosted", (file) => {
    expect(read(`.github/workflows/${file}`)).toMatch(/runs-on: ubuntu-latest/);
  });
});
