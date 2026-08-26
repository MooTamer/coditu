/**
 * Proves the circuit breaker by actually breaking the dependency.
 *
 * Everything in this app goes through Supabase, so "what happens when Supabase
 * is slow" is not a question to answer by reading the code. This pauses the
 * local stack's gateway container and asserts three things about a real
 * production server talking to it:
 *
 *   1. The marketing site is unaffected. It has no session and no database, and
 *      it must not pay for a dependency it does not use.
 *   2. `/app` fails FAST and fails CLOSED. The first request pays the deadline
 *      once; after the breaker opens the rest are refused without a call.
 *   3. It recovers on its own. Once the dependency answers again, the app comes
 *      back with no restart and no deploy.
 *
 * ── Why `docker pause` and not a proxy ─────────────────────────────────────
 * The obvious version of this script puts a switchable proxy in front of
 * Supabase and points the app at it. It does not work, and it fails by passing:
 * Next **inlines** every `NEXT_PUBLIC_*` variable at build time, so a server
 * started with `NEXT_PUBLIC_SUPABASE_URL` overridden in its environment still
 * holds the URL it was built with. The proxy sits there receiving nothing while
 * every check goes green against a perfectly healthy database.
 *
 * `docker pause` is also the more honest simulation. A paused container still
 * has its listening socket, so the kernel completes the handshake and then
 * nothing ever answers — which is the failure that actually hurts. A stopped
 * container refuses the connection in a millisecond and proves nothing.
 *
 *   node scripts/check-degraded-dependency.mjs      # builds first
 *   SKIP_BUILD=1 node scripts/check-degraded-dependency.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}

const UPSTREAM = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";
if (!/localhost|127\.0\.0\.1/.test(UPSTREAM)) {
  console.error(`refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${UPSTREAM}).`);
  console.error("this script PAUSES the gateway container it is pointed at.");
  process.exit(1);
}

/** Matches `middleware.ts`. Kept here so a change there fails this loudly. */
const AUTH_DEADLINE_MS = 2_500;
const BREAKER_RESET_MS = 10_000;

const failures = [];
function check(ok, message, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${message}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures.push(`${message} ${detail}`.trim());
}

/* -------------------------------------------------------------------------- */
/* The dependency                                                              */
/* -------------------------------------------------------------------------- */

function docker(...args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function gatewayContainer() {
  const listed = docker("ps", "--filter", "name=supabase_kong", "--format", "{{.Names}}\t{{.Ports}}");
  if (listed.status !== 0) return null;
  const port = new URL(UPSTREAM).port || "80";
  for (const line of listed.stdout.split("\n").filter(Boolean)) {
    const [name, ports] = line.split("\t");
    if (ports?.includes(`:${port}->`)) return name;
  }
  return null;
}

let paused = false;
function pause(container) {
  docker("pause", container);
  paused = true;
}
function unpause(container) {
  if (!paused) return;
  docker("unpause", container);
  paused = false;
}

/* -------------------------------------------------------------------------- */

/** 15s is not a real budget — it is a guard so a genuinely hung route reports
 *  a number instead of hanging this script forever. */
function get(url, { cookie } = {}) {
  const started = Date.now();
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: cookie ? { cookie } : undefined,
  })
    .then(async (response) => {
      const body = await response.text();
      return { status: response.status, location: response.headers.get("location"), ms: Date.now() - started, body };
    })
    .catch((error) => ({ status: 0, location: null, ms: Date.now() - started, error: String(error) }));
}

/** A real session, minted before the dependency is taken away. */
async function sessionCookie() {
  const response = await fetch(`${UPSTREAM}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "mohamed@coditu.com", password: "coditu" }),
  });
  if (!response.ok) throw new Error(`could not sign in: ${response.status} ${await response.text()}`);
  const session = await response.json();
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  });
  // @supabase/ssr keys the cookie on the first hostname label of the Supabase
  // URL, which is `127` for the local stack.
  return `sb-127-auth-token=base64-${Buffer.from(payload).toString("base64")}`;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */

let server;
let container;

async function main() {
  container = gatewayContainer();
  if (!container) {
    console.error(`no running Supabase gateway found for ${UPSTREAM}. Run \`npm run db:start\`.`);
    process.exitCode = 1;
    return;
  }
  console.log(`dependency: ${container} (${UPSTREAM})`);

  // Defensive: a previous run that was killed rather than exiting would have
  // left this paused, and every check below would then be measuring the wrong
  // thing in the wrong direction.
  docker("unpause", container);

  const cookie = await sessionCookie();

  if (process.env.SKIP_BUILD !== "1") {
    await new Promise((resolve, reject) => {
      const build = spawn("npm", ["run", "build"], { stdio: ["ignore", "ignore", "inherit"] });
      build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))));
    });
  }

  const appPort = await freePort();
  server = spawn("npx", ["next", "start", "-p", String(appPort)], { stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", () => undefined);
  server.stderr.on("data", () => undefined);

  const base = `http://127.0.0.1:${appPort}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if ((await get(`${base}/`)).status === 200) break;
    await sleep(250);
  }

  /**
   * Did this response reach the application, or get bounced to the door?
   *
   * Deliberately not "did it land on a particular screen". `/app` has been a
   * redirect to the active sprint and is now a rendered Home, and it may be
   * something else again — none of which changes what this script is asking,
   * which is whether the dependency being down turned a signed-in reader away.
   */
  const reachedTheApp = (response) =>
    response.status === 200 || !(response.location ?? "/login").includes("/login");

  // Healthy baseline, so a failure below is about the outage and not about the
  // server never having worked.
  //
  // "Reached the app" is `not bounced to /login`, and it has to be stated that
  // way rather than as a destination. This check used to require a redirect
  // whose location contained `/projects/`, which was correct while `/app` was a
  // pure redirect to the active sprint — and silently wrong from the moment W6
  // made `/app` the Workspace Home, which renders. It failed on the BASELINE,
  // before anything had been paused, and `npm run degraded` is not in the
  // routine gate so nothing noticed for seven phases.
  //
  // `07-FIELD-NOTES.md`: a route that stops redirecting leaves assertions
  // elsewhere asserting the redirect.
  const healthy = await get(`${base}/app`, { cookie });
  check(
    reachedTheApp(healthy),
    "baseline: a signed-in request reaches the app while the dependency is up",
    `${healthy.status} -> ${healthy.location ?? "(rendered)"} in ${healthy.ms}ms`
  );

  /* -- the other dependency: one browser per request --------------------- */
  console.log("\nchromium, asked for more reports than it is allowed to render");
  const REPORT = "/app/projects/meinevim/sprints/17/report/pdf";
  const burst = await Promise.all(
    Array.from({ length: 4 }, () => get(`${base}${REPORT}`, { cookie }))
  );
  const rendered = burst.filter((response) => response.status === 200);
  const refused = burst.filter(
    (response) => response.status === 503 && response.body?.includes("already rendering")
  );
  const missingChromium = burst.some(
    (response) => response.status === 503 && response.body?.includes("playwright install")
  );

  if (missingChromium) {
    console.log("  --    no Chromium on this machine; skipping the bulkhead check");
  } else {
    check(
      rendered.length <= 2,
      "at most two reports render at once",
      `${rendered.length} of 4 rendered`
    );
    check(
      refused.length >= 1,
      "the rest are refused immediately rather than queued behind a browser",
      `${refused.length} refused with 503`
    );
    check(
      refused.every((response) => response.ms < 2_000),
      "and refused fast — a queue would have made them wait for a render",
      `slowest refusal: ${Math.max(0, ...refused.map((response) => response.ms))}ms`
    );
  }

  console.log(`\npausing ${container}`);
  pause(container);

  /* -- 1. the unrelated part of the app ---------------------------------- */
  console.log("\nmarketing, while the auth server answers nothing");
  for (let attempt = 0; attempt < 3; attempt++) {
    const marketing = await get(`${base}/`);
    check(
      marketing.status === 200 && marketing.ms < 1_000,
      "GET / is 200 and under 1s for a visitor with no session",
      `${marketing.status} in ${marketing.ms}ms`
    );
  }

  // The one that actually distinguishes the two designs. With no cookie,
  // gotrue-js answers "no session" from the cookie alone and never reaches the
  // network, so an anonymous visitor looked fine either way. A SIGNED-IN
  // reader is the case where the old middleware made a live auth call on a
  // page that has no session, no database and nothing to gate.
  for (let attempt = 0; attempt < 3; attempt++) {
    const signedIn = await get(`${base}/`, { cookie });
    check(
      signedIn.status === 200 && signedIn.ms < 1_000,
      "GET / is 200 and under 1s for a SIGNED-IN reader",
      `${signedIn.status} in ${signedIn.ms}ms`
    );
  }
  const sitemap = await get(`${base}/sitemap.xml`);
  check(
    sitemap.status === 200 && sitemap.ms < 1_000,
    "GET /sitemap.xml is 200 and under 1s",
    `${sitemap.status} in ${sitemap.ms}ms`
  );

  /* -- 2. the gate: fast, and shut --------------------------------------- */
  console.log("\nthe app gate, while the auth server answers nothing");
  const first = await get(`${base}/app`, { cookie });
  check(
    first.status === 307 || first.status === 302,
    "the first /app request redirects rather than hanging",
    `${first.status} in ${first.ms}ms`
  );
  check((first.location ?? "").includes("/login"), "and it fails CLOSED, to /login", first.location ?? "no location");
  check(
    first.ms < AUTH_DEADLINE_MS * 2,
    `it gave up inside the ${AUTH_DEADLINE_MS}ms deadline rather than waiting`,
    `${first.ms}ms`
  );

  // Three consecutive failures opens the breaker; from then on nothing is
  // called at all, so these must be far faster than the deadline.
  for (let attempt = 0; attempt < 3; attempt++) await get(`${base}/app`, { cookie });
  const opened = [];
  for (let attempt = 0; attempt < 5; attempt++) opened.push(await get(`${base}/app`, { cookie }));
  const slowest = Math.max(...opened.map((response) => response.ms));
  check(slowest < 500, "once the breaker is open, /app is refused without calling out", `slowest of five: ${slowest}ms`);
  check(
    opened.every((response) => (response.location ?? "").includes("/login")),
    "and every one of them still fails closed"
  );

  const duringOutage = await get(`${base}/`);
  check(
    duringOutage.status === 200 && duringOutage.ms < 1_000,
    "the marketing site is still untouched by any of it",
    `${duringOutage.status} in ${duringOutage.ms}ms`
  );

  /* -- 3. recovery, without a restart ------------------------------------ */
  console.log("\nrecovery");
  unpause(container);
  console.log(`  dependency is answering again; waiting out the ${BREAKER_RESET_MS}ms window`);
  await sleep(BREAKER_RESET_MS + 1_000);

  let recovered = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    recovered = await get(`${base}/app`, { cookie });
    if (!(recovered.location ?? "").includes("/login")) break;
    await sleep(500);
  }
  check(
    reachedTheApp(recovered),
    "a signed-in request reaches the app again, with no restart",
    `${recovered.status} -> ${recovered.location ?? "(rendered)"} in ${recovered.ms}ms`
  );

  console.log("");
  if (failures.length) {
    console.error(`${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("degraded-dependency behaviour OK");
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (container && paused) {
    console.error(`\nunpausing ${container}`);
    unpause(container);
  }
  server?.kill("SIGTERM");
  await sleep(300);
  server?.kill("SIGKILL");
}
