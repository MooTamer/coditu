#!/usr/bin/env node
/**
 * Render `docs/15-EMERGENCY-CARD.md` to a printable PDF.
 *
 * The card's whole premise is that somebody reaches for it when the screen they
 * would normally read it on is the thing that is gone. A Markdown file in a
 * repository is not that. Paper is, and so is a PDF on a phone.
 *
 * No Markdown library: the repository has none, and adding a dependency to the
 * recovery path is the wrong direction — this handles exactly the constructs
 * the card uses and refuses anything it does not understand rather than
 * silently dropping it.
 *
 * Chromium comes from Playwright, which is already installed for the browser
 * suite, so this adds nothing to the tree.
 *
 *   node scripts/render-emergency-card.mjs [out.pdf]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "docs/15-EMERGENCY-CARD.md");
const out = resolve(process.argv[2] ?? resolve(root, "ops/emergency-card.pdf"));

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline: code, bold, italic, links, and the ballot box the card uses for a blank. */
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

const cell = (row) =>
  row
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((value) => value.trim());

function render(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith("```")) {
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // A table is a header row, an alignment row, then body rows.
    if (line.startsWith("|") && lines[index + 1]?.match(/^\|[\s:|-]+\|$/)) {
      const head = cell(line);
      index += 2;
      const body = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        body.push(cell(lines[index]));
        index += 1;
      }
      html.push(
        `<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>` +
          `<tbody>${body
            .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`,
      );
      continue;
    }

    if (line.startsWith("> ")) {
      const body = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        body.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${render(body.join("\n"))}</blockquote>`);
      continue;
    }

    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      index += 1;
      continue;
    }

    if (line === "---") {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\d+\. |^[-*] /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (index < lines.length && /^(\d+\. |[-*] )/.test(lines[index])) {
        let item = lines[index].replace(/^(\d+\. |[-*] )/, "");
        index += 1;
        // Continuation lines and fenced blocks indented under the item.
        while (index < lines.length && /^ {3,}\S/.test(lines[index])) {
          item += `\n${lines[index].replace(/^ {3}/, "")}`;
          index += 1;
        }
        items.push(`<li>${item.includes("```") ? render(item) : inline(item)}</li>`);
      }
      html.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() !== "" && !/^(#|>|\||```|---|\d+\. |[-*] )/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

const page = `<!doctype html><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 13mm; }
  body { font: 10pt/1.42 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; }
  h1 { font-size: 19pt; margin: 0 0 2mm; letter-spacing: -0.3pt; }
  h2 { font-size: 12pt; margin: 5mm 0 1.5mm; border-bottom: 0.6pt solid #bbb; padding-bottom: 1mm; }
  h3 { font-size: 10.5pt; margin: 3mm 0 1mm; }
  p { margin: 1.5mm 0; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0; font-size: 8.8pt; }
  th, td { border: 0.4pt solid #bbb; padding: 1.2mm 1.8mm; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  code { font: 8.6pt "SF Mono", Menlo, Consolas, monospace; background: #f4f4f4; padding: 0 0.6mm; }
  pre { background: #f4f4f4; border-left: 1.2pt solid #999; padding: 1.6mm 2.4mm; margin: 2mm 0;
        white-space: pre-wrap; word-break: break-word; }
  pre code { background: none; padding: 0; font-size: 8.2pt; }
  blockquote { border-left: 2pt solid #c00; background: #fff6f6; margin: 2.5mm 0;
               padding: 1.4mm 3mm; }
  blockquote p { margin: 1mm 0; }
  hr { border: 0; border-top: 0.4pt solid #ddd; margin: 3mm 0; }
  ul, ol { margin: 1.5mm 0; padding-left: 5mm; }
  li { margin: 0.8mm 0; }
  a { color: #111; text-decoration: none; }
</style>${render(readFileSync(source, "utf8"))}`;

const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.setContent(page, { waitUntil: "load" });
await tab.pdf({ path: out, format: "A4", printBackground: true });
await browser.close();
console.log(`emergency_card_pdf=${out}`);
