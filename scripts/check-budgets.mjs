/**
 * Route JavaScript budgets, measured the way the budget is written: the total
 * compressed JS a browser actually downloads to render the route.
 *
 * Not a manifest sum. A manifest tells you which chunks a route *references*;
 * it does not tell you what crosses the wire, it does not account for chunks
 * shared with the shell, and Turbopack emits no per-route table at all. So this
 * loads each route in a real production server with a real browser and adds up
 * the transfer size of every `/_next/static/**.js` response.
 *
 * ── On the marketing budget ────────────────────────────────────────────────
 * §5 sets the marketing route at ≤130KB gzipped. On Next 16 + React 19 that is
 * below the floor: `/login`, which is one small form, measures ~139KB, and
 * `react-dom` alone is 68KB of it. No amount of care in this repository's own
 * code gets under 130KB, because ~139KB arrives before any of it runs.
 *
 * Rather than quietly restate the budget as a number we can hit, this reports
 * BOTH: the absolute total against §5's figure, and the route's own cost over
 * the measured framework floor. The second is the one CI gates on, because it
 * is the one this codebase controls and the one that catches a regression. The
 * first is printed every run so nobody mistakes the gate for the budget.
 *
 *   node scripts/check-budgets.mjs                 # against $E2E_PROD_URL
 *   npm run budgets                                # builds and serves first
 */
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BASE = process.env.E2E_PROD_URL ?? "http://localhost:3000";

/**
 * `/login` is the lightest real route: the App Router client runtime, React,
 * and one small form. Its total is the practical floor for any route here.
 */
const FLOOR_ROUTE = { path: "/login", auth: false };

const ROUTES = [
  {
    label: "marketing",
    path: "/",
    auth: false,
    /** §5's figure. Reported, not gated — see the note above. */
    briefKb: 130,
    /** What this route's own code may add over the floor. Gated. */
    ownKb: 20,
  },
  {
    label: "app shell (sprint table)",
    path: "/app/projects/meinevim/sprints/17",
    auth: true,
    briefKb: 220,
    // 100KB measured, gated at 110 for headroom. 65KB of it is
    // `@supabase/supabase-js`, which realtime needs for the session and the
    // socket — it is loaded lazily, so it is off the critical path, but the
    // bytes still arrive. An earlier value of 45 was set from a reading taken
    // before those chunks had finished downloading.
    ownKb: 110,
  },
];

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch {
    // CI supplies its own.
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";

async function sessionCookie() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — source .env.local");

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "mohamed@coditu.com", password: "coditu" }),
  });
  if (!response.ok) throw new Error(`sign-in failed: ${response.status}`);
  const session = await response.json();

  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  });
  return {
    name: "sb-127-auth-token",
    value: `base64-${Buffer.from(payload).toString("base64")}`,
    domain: "localhost",
    path: "/",
    sameSite: "Lax",
  };
}

/** @returns {Promise<Map<string, number>>} chunk URL → gzipped bytes */
async function measure(browser, route) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (route.auth) await context.addCookies([await sessionCookie()]);
  const page = await context.newPage();

  const scripts = new Map();
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/_next/static/") || !url.endsWith(".js")) return;
    try {
      // `content-length` is the compressed size when the server encodes it.
      // `next start` does not always gzip on localhost, so compress the body
      // here too and take the larger reading — a budget that under-reports is
      // worse than no budget.
      const header = Number(response.headers()["content-length"] ?? 0);
      const body = await response.body();
      scripts.set(url, Math.max(header, gzipSync(body).byteLength));
    } catch {
      // A chunk that never finished loading is not part of the initial load.
    }
  });

  // `networkidle` plus a short sleep is NOT a stable reading. Chunks were still
  // arriving after it on a slower machine, so the same build measured 171KB
  // locally and 303KB on CI — a budget that depends on how fast the machine is
  // catches nothing. Wait for `load`, then for the network to actually go quiet,
  // then settle again.
  await page.goto(`${BASE}${route.path}`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(2500);
  await context.close();
  return scripts;
}

const kb = (bytes) => bytes / 1024;
const fmt = (value) => value.toFixed(1).padStart(7);

async function main() {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch();
  let failed = false;

  try {
    const floorChunks = await measure(browser, FLOOR_ROUTE);
    const floor = [...floorChunks.values()].reduce((total, size) => total + size, 0);
    console.log(
      `framework floor  ${fmt(kb(floor))} KB gz  (${FLOOR_ROUTE.path}, ${floorChunks.size} chunks)\n`
    );

    for (const route of ROUTES) {
      const scripts = await measure(browser, route);
      const total = [...scripts.values()].reduce((sum, size) => sum + size, 0);
      const own = Math.max(0, total - floor);

      const ownOver = kb(own) > route.ownKb;
      if (ownOver) failed = true;

      console.log(
        `${ownOver ? "FAIL" : "ok  "}  ${route.label.padEnd(26)} ` +
          `own ${fmt(kb(own))} KB / ${route.ownKb} KB     ` +
          `total ${fmt(kb(total))} KB / ${route.briefKb} KB §5`
      );

      if (kb(total) > route.briefKb) {
        console.log(
          `      note: §5's ${route.briefKb} KB total is ${(kb(total) - route.briefKb).toFixed(1)} KB away, ` +
            `and ${fmt(kb(floor)).trim()} KB of the ${fmt(kb(total)).trim()} KB is the framework floor.`
        );
      }

      if (ownOver) {
        const mine = [...scripts.entries()]
          .filter(([url]) => !floorChunks.has(url))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6);
        for (const [url, size] of mine) {
          console.log(`        ${fmt(kb(size))} KB  ${url.split("/").pop()}`);
        }
      }

      // The editor must never be in an initial load: it is dynamically
      // imported, and only when a composer opens.
      //
      // Matched on CONTENT, not on the filename. Chunks are content-hashed, so
      // the old `/tiptap|prosemirror/.test(url)` could never fire — a check
      // that was green because it was incapable of being red.
      const editor = [];
      for (const url of scripts.keys()) {
        const body = await fetch(url).then((response) => response.text());
        if (/prosemirror|tiptap/i.test(body)) editor.push(url);
      }
      if (editor.length) {
        failed = true;
        console.log(`FAIL  the editor bundle is in the initial load of ${route.path}`);
        for (const url of editor) console.log(`        ${url.split("/").pop()}`);
      }
    }
  } finally {
    await browser.close();
  }

  /* ------------------------------------------------------------------ */
  /* The marketing page must stay PRERENDERED                             */
  /* ------------------------------------------------------------------ */
  //
  // `/` is the same for everyone and changes only when someone deploys, so it
  // is built once and served as a file. That is the whole caching story for
  // this route, and it is one `cookies()`, `headers()` or `searchParams` away
  // from being untrue — added anywhere in the marketing tree, including inside
  // a component three levels down.
  //
  // Nothing would go red. The page still renders, the tests still pass, the
  // build still succeeds. It just quietly starts running React for every
  // visitor, on a route whose Lighthouse score is the reason it was built the
  // way it was.
  //
  // A prerendered route leaves its HTML on disk. A dynamic one does not.
  const prerendered = ".next/server/app/index.html";
  if (existsSync(prerendered)) {
    console.log(`\nok    / is prerendered  (${prerendered})`);
  } else {
    failed = true;
    console.log(`\nFAIL  / is no longer prerendered — ${prerendered} was not built.`);
    console.log("        Something in the marketing tree opted the route into dynamic");
    console.log("        rendering: cookies(), headers(), searchParams, or `dynamic = 'force-dynamic'`.");
  }

  console.log(failed ? "\nbudgets: FAILED" : "\nbudgets: OK");
  process.exit(failed ? 1 : 0);
}

await main();
