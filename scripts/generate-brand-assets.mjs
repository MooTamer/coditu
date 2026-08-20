/**
 * Renders every raster brand asset from the SVG sources in `public/brand/`.
 *
 * The sources are the truth. Nothing in this script invents a colour, a radius,
 * or a crop — it scales the compositions designed in
 * `design/project/Coditu Brand.dc.html` §06 up to their shipping sizes.
 *
 * The social cards are rendered by headless Chromium rather than by an SVG
 * rasteriser, for one reason: the wordmark is Satoshi, and Satoshi is
 * self-hosted in `lib/fonts/files/` rather than installed on the machine. A
 * rasteriser would silently substitute a system sans and the card would ship
 * with the wrong typeface — a failure that looks fine until somebody who knows
 * the brand sees it. Chromium loads the real `.woff2`.
 *
 *   node scripts/generate-brand-assets.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(root, "public", "brand");
const out = join(root, "public");

const CANVAS = "#07090E";
const INK = "#EDF1F7";
const INK_MUTED = "#93A0B4";
const FROM = "#2B57FF";
const TO = "#21E2C6";

/** The mark's path, read from the source rather than copied into this file. */
async function markSvg() {
  return readFile(join(brand, "mark.svg"), "utf8");
}

async function iconSvg() {
  return readFile(join(brand, "icon.svg"), "utf8");
}

/** Satoshi as a data URI, so the rendered page has no network dependency. */
async function satoshiFace(weight) {
  const file = await readFile(join(root, "lib", "fonts", "files", `Satoshi-${weight}.woff2`));
  return `@font-face{font-family:Satoshi;font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${file.toString("base64")}) format("woff2")}`;
}

async function cardHtml({ width, height, square }) {
  const mark = (await markSvg()).replace(/width="32" height="32"/, "");
  const faces = [await satoshiFace(700)].join("");
  const scale = square ? width / 300 : width / 744;
  const px = (value) => `${(value * scale).toFixed(2)}px`;

  // The `t` sits 6% short of the cap line — the wordmark rule from the brand
  // sheet, applied here so the card matches the lockup everywhere else.
  const wordmark = (size) =>
    `<span style="font-size:${px(size)};font-weight:700;letter-spacing:-0.02em;line-height:1">Codi<span style="display:inline-block;transform:scaleY(0.94);transform-origin:bottom">t</span>u</span>`;

  // On the wide card the trace passes through the headline. The brand sheet's
  // own rule is that the gradient never sits behind text, so it runs at half
  // strength there — still the signature device, no longer competing with the
  // words. The square card's trace clears the wordmark and stays at full.
  const trace = square
    ? `<path d="M0 230 C 90 230 110 150 300 150" fill="none" stroke="url(#g)" stroke-width="2" />`
    : `<path d="M0 300 C 180 300 200 210 340 210 C 470 210 520 120 744 120" fill="none" stroke="url(#g)" stroke-width="2" stroke-opacity="0.5" />
       <circle cx="340" cy="210" r="4" fill="${TO}" />`;

  const body = square
    ? `<div style="position:relative">${wordmark(26)}
         <div style="margin-top:${px(10)};font-family:ui-monospace,monospace;font-size:${px(11)};letter-spacing:0.06em;text-transform:uppercase;color:${INK_MUTED}">Portals · Systems · RAG</div>
       </div>`
    : `<div style="position:relative">
         <div style="font-size:${px(44)};font-weight:700;letter-spacing:-0.03em;line-height:1.05;max-width:18ch">Portals, systems, and RAG assistants.</div>
         <div style="margin-top:${px(20)};font-family:ui-monospace,monospace;font-size:${px(13)};letter-spacing:0.06em;text-transform:uppercase;color:${INK_MUTED}">One team · Germany + Egypt · coditu.com</div>
       </div>`;

  const head = square
    ? `<div style="position:relative;width:${px(44)};height:${px(44)}">${mark}</div>`
    : `<div style="position:relative;display:flex;align-items:center;gap:${px(20)}">
         <div style="width:${px(52)};height:${px(52)}">${mark}</div>${wordmark(34)}
       </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${faces}
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${width}px;height:${height}px;background:${CANVAS};color:${INK};
         font-family:Satoshi,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
    .card{position:relative;width:100%;height:100%;padding:${px(square ? 32 : 52)};
          display:flex;flex-direction:column;justify-content:space-between}
    .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,0.025) 1px,transparent 1px);
          background-size:${px(32)} ${px(32)}}
    svg.trace{position:absolute;inset:0;width:100%;height:100%}
    svg{display:block;width:100%;height:100%}
  </style></head><body><div class="card">
    <div class="dots"></div>
    <svg class="trace" viewBox="0 0 ${square ? 300 : 744} ${square ? 300 : 391}" preserveAspectRatio="none">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/>
      </linearGradient></defs>${trace}
    </svg>
    ${head}${body}
  </div></body></html>`;
}

/**
 * A minimal ICO writer.
 *
 * `sharp` has no `.ico` encoder and the format needs no library: an ICO is a
 * 6-byte header, one 16-byte directory entry per size, and the PNG payloads
 * concatenated. A 256px entry writes its width as 0, which is the format's way
 * of saying "256" in one byte.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function main() {
  const icon = Buffer.from(await iconSvg());
  const mark = Buffer.from(await markSvg());

  const png = (source, size) =>
    sharp(source, { density: 384 }).resize(size, size, { fit: "contain" }).png().toBuffer();

  // Favicons and app icons come off `icon.svg` — the mark on its rounded
  // canvas square. At 16px the bare mark on transparency disappears against a
  // light browser chrome.
  await writeFile(
    join(out, "favicon.ico"),
    ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(icon, size) }))))
  );
  await writeFile(join(out, "apple-touch-icon.png"), await png(icon, 180));
  await writeFile(join(out, "icon-192.png"), await png(icon, 192));
  await writeFile(join(out, "icon-512.png"), await png(icon, 512));

  // A maskable icon is cropped to a circle by the launcher, so the mark has to
  // sit inside the 80% safe zone with the canvas colour bled to the edges.
  await writeFile(
    join(out, "icon-maskable-512.png"),
    await sharp({
      create: { width: 512, height: 512, channels: 4, background: CANVAS },
    })
      .composite([{ input: await png(mark, 328), gravity: "centre" }])
      .png()
      .toBuffer()
  );

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    for (const spec of [
      { file: "og.png", width: 1200, height: 630, square: false },
      { file: "og-square.jpg", width: 1200, height: 1200, square: true },
    ]) {
      const page = await browser.newPage({
        viewport: { width: spec.width, height: spec.height },
        deviceScaleFactor: 1,
      });
      await page.setContent(await cardHtml(spec), { waitUntil: "load" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        return true;
      });
      const shot = await page.screenshot({ type: "png" });
      await writeFile(
        join(out, spec.file),
        spec.file.endsWith(".jpg") ? await sharp(shot).jpeg({ quality: 90 }).toBuffer() : shot
      );
      await page.close();
      console.log(`${spec.file}  ${spec.width}×${spec.height}`);
    }
  } finally {
    await browser.close();
  }

  console.log("favicon.ico  16/32/48");
  console.log("apple-touch-icon.png  180");
  console.log("icon-192.png / icon-512.png / icon-maskable-512.png");
}

await main();
