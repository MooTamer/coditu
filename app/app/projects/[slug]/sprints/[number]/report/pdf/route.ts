import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { buildExportPayload } from "@/lib/data/export";
import { exportSlug } from "@/lib/export/types";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * Streams the sprint report as a PDF.
 *
 * Node runtime, not edge: it drives a real browser. One layout, two outputs —
 * Chromium prints the SAME `/report` route the preview shows, so the file a
 * client receives cannot drift from what was approved on screen.
 *
 * The renderer is a second visitor to our own server, and it has no session
 * cookie. Rather than give it one, it carries a short-lived signed token in the
 * URL that names exactly which sprint it may render and expires in a minute.
 * A leaked token is worth one report, once.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_MS = 60_000;

function secret(): string {
  const value = process.env.REPORT_TOKEN_SECRET;
  if (!value) throw new Error("REPORT_TOKEN_SECRET is not set — see .env.example");
  return value;
}

export function signReportToken(slug: string, sprintNumber: number, expiresAt: number): string {
  const payload = `${slug}:${sprintNumber}:${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${expiresAt}.${signature}`;
}

export function verifyReportToken(token: string, slug: string, sprintNumber: number): boolean {
  const [expiresRaw, signature] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = createHmac("sha256", secret())
    .update(`${slug}:${sprintNumber}:${expiresAt}`)
    .digest("hex");

  const a = Buffer.from(signature ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  // Length-check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and the length itself is not a secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; number: string }> }
) {
  const { slug, number } = await context.params;
  const sprintNumber = Number(number);

  const profile = await getCurrentProfile();
  if (!profile) return new NextResponse("Not signed in", { status: 401 });

  const payload = await buildExportPayload(slug, sprintNumber, null);
  if (!payload) return new NextResponse("No such sprint", { status: 404 });

  const items = request.nextUrl.searchParams.get("items") ?? "";
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const token = signReportToken(slug, sprintNumber, expiresAt);

  const origin = request.nextUrl.origin;
  const target = new URL(`${origin}/app/projects/${slug}/sprints/${sprintNumber}/report`);
  if (items) target.searchParams.set("items", items);
  target.searchParams.set("token", token);

  let browser: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage();

    // Forward the caller's cookies so the report route authorises normally.
    // The token is the belt: it scopes what this render may reach even if the
    // cookie stops working.
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) await page.setExtraHTTPHeaders({ cookie: cookieHeader });

    await page.goto(target.toString(), { waitUntil: "networkidle" });

    // Fonts must be RESOLVED before the print, or Chromium lays the page out
    // with fallback metrics and every line break moves. `document.fonts.ready`
    // resolves to a FontFaceSet, which is not serialisable — returning it makes
    // the evaluate fail without ever awaiting, so return a plain value instead.
    await page.evaluate(async () => {
      await document.fonts.ready;
      return true;
    });

    const meta = `${payload.project.clientName} · Sprint ${payload.sprint.number}`;

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", right: "0.7in", bottom: "0.55in", left: "0.7in" },
      preferCSSPageSize: true,
      // Chromium's own header and footer, because `counter(page)` inside a
      // fixed element is not populated during print — it renders "Page 0 of 0".
      // These templates get no page CSS, so everything is inline.
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width:100%;padding:0 0.7in;font-family:Helvetica,Arial,sans-serif;font-size:8px;
                    color:#5F6B80;display:flex;align-items:center;border-bottom:1px solid rgba(11,14,20,0.14);
                    padding-bottom:4px;">
          <span style="font-weight:700;color:#0B0E14;font-size:9px;letter-spacing:-0.02em;">Coditu</span>
          <span style="margin-left:auto;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(meta)}</span>
        </div>`,
      footerTemplate: `
        <div style="width:100%;padding:0 0.7in;font-family:Helvetica,Arial,sans-serif;font-size:8px;
                    color:#5F6B80;display:flex;align-items:center;border-top:1px solid rgba(11,14,20,0.14);
                    padding-top:4px;">
          <span>hello@coditu.com</span>
          <span style="margin-left:auto;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${exportSlug(payload)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // A missing browser is a deployment problem, not a bug in the report, and
    // the message should say which.
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      {
        error: "The PDF could not be rendered.",
        detail: message,
        hint:
          "The report itself is fine — open it in the browser and print to PDF. " +
          "This route needs a headless Chromium: `npx playwright install chromium` locally, " +
          "or @sparticuz/chromium-min on a serverless host. See docs/04-EXPORT-SPEC.md.",
      },
      { status: 503 }
    );
  } finally {
    await browser?.close();
  }
}

/** Templates are raw HTML, so anything interpolated has to be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Launches a browser.
 *
 * `playwright-core` is imported dynamically so the module is only resolved when
 * somebody actually asks for a PDF — a static import would pull it into every
 * build of this route, including hosts where it cannot run at all.
 */
async function launch() {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    executablePath: executablePath || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
