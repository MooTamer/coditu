import http from "node:http";
import { gunzipSync } from "node:zlib";

import { expect, test } from "./fixtures";

/**
 * What actually crosses the wire, and how many bytes of it.
 *
 * Every text response this app serves — documents, RSC payloads, Server Action
 * results, JS, CSS — is gzipped by Next's own server, and every already-
 * compressed one (woff2, avif, the PDF) is left alone. That is one boolean in
 * `next.config.ts` away from not being true any more, and nothing else in this
 * repository would notice: the pages still render, the tests still pass, the
 * build still succeeds, and the marketing document quietly goes from 24KB to
 * 128KB on every cold load.
 *
 * So it is asserted here, on the wire, in bytes.
 *
 * ── Why `node:http` and not `page.request` ─────────────────────────────────
 * Playwright decodes `Content-Encoding` before it hands you a body, so a test
 * written against it can only ever read the header and take the size on faith.
 * A raw request never pipes through a decompressor, so `bytes` below is
 * literally what came down the socket. That distinction has already mattered
 * once on this project — see the JS budget script, which measures transfer size
 * for the same reason.
 *
 * ── On brotli ──────────────────────────────────────────────────────────────
 * There isn't any, and these tests do not ask for it. `next start` compresses
 * through the `compression` package, which speaks gzip and deflate only; a
 * client that offers `br` alone gets the response uncompressed. The deploy
 * target is Vercel, whose edge adds brotli in front of this server, and the
 * alternative — a custom Node server — would be ignored by that same platform.
 * `docs/05-DECISIONS.md` records the call.
 */

interface WireResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** Bytes as they arrived, before any decoding. */
  bytes: number;
  body: Buffer;
}

function wire(url: string, acceptEncoding: string, cookie?: string): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "Accept-Encoding": acceptEncoding };
    if (cookie) headers.Cookie = cookie;

    const request = http.get(url, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({ status: response.statusCode ?? 0, headers: response.headers, bytes: body.length, body });
      });
      response.on("error", reject);
    });
    request.setTimeout(30_000, () => request.destroy(new Error(`timed out: ${url}`)));
    request.on("error", reject);
  });
}

function varies(headers: http.IncomingHttpHeaders): boolean {
  return String(headers.vary ?? "").toLowerCase().includes("accept-encoding");
}

/** The origin the suite is actually pointed at — dev, or the production build. */
async function originOf(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/login");
  return new URL(page.url()).origin;
}

test.describe("compression in transit", () => {
  // Read-only throughout: these fetch documents and payloads, nothing writes.
  test.use({ sprintTotals: "read" });

  test("the marketing document is gzipped, and the bytes actually drop", async ({ page }) => {
    const origin = await originOf(page);

    const identity = await wire(`${origin}/`, "identity");
    const gzip = await wire(`${origin}/`, "gzip, deflate");

    expect(identity.status).toBe(200);
    expect(identity.headers["content-encoding"]).toBeUndefined();
    expect(gzip.headers["content-encoding"]).toBe("gzip");

    // `Vary` is not decoration. Without it a shared cache can hand a gzipped
    // body to a client that never asked for one, and the page is a blob.
    expect(varies(gzip.headers)).toBe(true);

    // The measured ratio on this page is ~5.5x. Asserted at 3x so a content
    // change cannot fail it, but a compression change will.
    expect(identity.bytes).toBeGreaterThan(50_000);
    expect(gzip.bytes * 3).toBeLessThan(identity.bytes);

    // And it still parses. A response that shrinks but arrives corrupt is the
    // failure this whole thing would be worth reverting for.
    //
    // Compared structurally rather than byte for byte, because two identity
    // requests to `next dev` do not match each other either: the dev server
    // stamps a fresh `self.__next_r` nonce into every response. Against a
    // production build the two bodies ARE identical, and the assertions below
    // hold in both.
    const decoded = gunzipSync(gzip.body).toString("utf8");
    const original = identity.body.toString("utf8");

    expect(decoded.trimEnd().endsWith("</html>")).toBe(true);
    expect(/<title>([^<]*)<\/title>/.exec(decoded)?.[1]).toBe(
      /<title>([^<]*)<\/title>/.exec(original)?.[1]
    );
    // Same document, give or take that nonce.
    expect(Math.abs(decoded.length - original.length)).toBeLessThan(original.length * 0.01);
  });

  test("the RSC payload is gzipped", async ({ page }) => {
    const origin = await originOf(page);

    // The header the router sends on a soft navigation. Same route, different
    // representation — and the one a person hits far more often than the
    // document, because every prefetch is one of these.
    const payload = await new Promise<WireResponse>((resolve, reject) => {
      const request = http.get(
        `${origin}/`,
        { headers: { "Accept-Encoding": "gzip, deflate", RSC: "1" } },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              bytes: Buffer.concat(chunks).length,
              body: Buffer.concat(chunks),
            })
          );
        }
      );
      request.on("error", reject);
    });

    expect(payload.status).toBe(200);
    expect(String(payload.headers["content-type"])).toContain("text/x-component");
    expect(payload.headers["content-encoding"]).toBe("gzip");
  });

  test("scripts and stylesheets are gzipped; fonts are left alone", async ({ page }) => {
    const origin = await originOf(page);
    await page.goto("/");

    const assets = await page.evaluate(() => ({
      scripts: [...document.querySelectorAll("script[src]")]
        .map((node) => (node as HTMLScriptElement).getAttribute("src") ?? "")
        .filter((src) => src.startsWith("/_next/static")),
      styles: [...document.querySelectorAll("link[rel='stylesheet']")]
        .map((node) => (node as HTMLLinkElement).getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/_next/static")),
    }));

    expect(assets.scripts.length).toBeGreaterThan(0);
    expect(assets.styles.length).toBeGreaterThan(0);

    for (const path of [...assets.scripts, ...assets.styles]) {
      const identity = await wire(origin + path, "identity");
      // Turbopack emits a few tiny stubs. The threshold is the point — a 282
      // byte chunk costs more in CPU than it saves in bytes — so only assert
      // compression on responses big enough for it to be worth doing.
      if (identity.bytes < 1024) continue;

      const gzip = await wire(origin + path, "gzip, deflate");
      expect(gzip.headers["content-encoding"], `${path} should be gzipped`).toBe("gzip");
      expect(varies(gzip.headers), `${path} should Vary on Accept-Encoding`).toBe(true);
      expect(gzip.bytes, `${path} should get smaller`).toBeLessThan(identity.bytes);
    }

    // Satoshi and JetBrains Mono ship as woff2, which is Brotli-compressed
    // already. Running gzip over it burns CPU on both ends to make the file
    // very slightly bigger.
    const font = await page.evaluate(() =>
      [...document.querySelectorAll("link[rel='preload'][as='font']")]
        .map((node) => (node as HTMLLinkElement).getAttribute("href") ?? "")
        .find((href) => href.endsWith(".woff2"))
    );
    expect(font, "the page should preload at least one woff2").toBeTruthy();

    const served = await wire(origin + font!, "gzip, deflate, br");
    expect(served.status).toBe(200);
    expect(served.headers["content-encoding"]).toBeUndefined();
  });

  test("a Server Action response is gzipped", async ({ adminPage: page }) => {
    // `loadPaletteTargets` — the largest Server Action response in the app, and
    // the only sizeable one that writes nothing.
    const encodings: string[] = [];
    page.on("response", (response) => {
      const request = response.request();
      if (request.method() !== "POST") return;
      const type = response.headers()["content-type"] ?? "";
      if (type.includes("text/x-component")) {
        encodings.push(response.headers()["content-encoding"] ?? "identity");
      }
    });

    await page.goto("/app/projects/meinevim/sprints/17");

    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect
      .poll(
        async () => {
          if (await dialog.isVisible()) return true;
          await page.keyboard.press("Meta+k");
          return dialog.isVisible();
        },
        { timeout: 15_000, intervals: [200, 300, 500, 800] }
      )
      .toBe(true);
    await expect(dialog.getByRole("option").first()).toBeVisible();

    expect(encodings.length).toBeGreaterThan(0);
    expect(encodings.every((encoding) => encoding === "gzip")).toBe(true);
  });

  test("the PDF is not compressed a second time, and still opens", async ({ adminPage: page }) => {
    const origin = await originOf(page);
    const cookies = await page.context().cookies();
    const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");

    const response = await wire(
      `${origin}/app/projects/meinevim/sprints/17/report/pdf`,
      "gzip, deflate, br",
      cookie
    );

    // No Chromium on this machine: the route says so in the body and the report
    // still prints from the browser. That is a documented state, not a failure
    // of this test.
    test.skip(response.status === 503, "no Chromium — see README, `/report` still prints");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("application/pdf");
    expect(response.headers["content-encoding"]).toBeUndefined();
    // The bytes are a PDF, not a gzip member wearing a PDF content type.
    expect(response.body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("responses below the threshold are left uncompressed", async ({ page }) => {
    const origin = await originOf(page);

    const identity = await wire(`${origin}/robots.txt`, "identity");
    expect(identity.status).toBe(200);

    // If robots.txt ever grows past the threshold, compressing it is correct
    // and this assertion should stop applying rather than start failing.
    test.skip(identity.bytes >= 1024, "robots.txt is over the threshold now");

    const offered = await wire(`${origin}/robots.txt`, "gzip, deflate, br");
    expect(offered.headers["content-encoding"]).toBeUndefined();
  });
});
