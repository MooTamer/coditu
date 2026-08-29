/**
 * Every Server Action call in a client component, and whether a network failure
 * would be reported or swallowed.
 *
 * PF-4's second half, and invariant 4. A Server Action call is a `fetch`. Lose
 * the network and the promise **rejects** — so `if (!result.ok)` never runs, the
 * rollback beside it never runs, `useOptimistic` reverts on its own, and the
 * reader watches their change appear and vanish with nothing said. That is
 * exactly what invariant 4 forbids.
 *
 * `lib/action-result.ts` fixes it — `settle()` turns the throw into
 * `{ ok: false, error }` and lets `redirect()` / `notFound()` straight back out
 * through `unstable_rethrow`. This counts who uses it.
 *
 * ── How a call is classified, said plainly so the number can be argued with ──
 *   settled     inside `settle(() => …)`, or inside `trackedSave(() => …)`,
 *               which calls `settle` itself (`save-state.client.tsx`) on its way
 *               to reporting `sending` / `saved` / `failed` on the save chip.
 *               Correct: the rejection becomes a failure result AND
 *               `redirect()` / `notFound()` are rethrown.
 *
 *               `trackedSave` is named here because leaving it out cost real
 *               work: the first version of this scan did not know about it,
 *               reported twenty already-correct call sites as bare, and a
 *               codemod acting on that report nested a second `settle` inside
 *               the first — which swallowed the rejection before `trackedSave`'s
 *               own fallback could fire and quietly changed the message on
 *               screen. `e2e/optimistic.spec.ts` caught it. A scan that does not
 *               know every idiom in the codebase is a scan that invents work.
 *   catch       `.catch(() => ({ ok: false, … }))` hung off the call.
 *   try         wrapped in a bare `try` / `catch` block.
 *   form        passed to `useActionState` / a `<form action=…>`; React routes a
 *               rejection to the nearest error boundary, which is loud rather
 *               than silent. A different failure mode, not this one.
 *   fire        `void action(…)` with no result read at all. Nothing to swallow.
 *   BARE        awaited, its result inspected, and nothing catches. This is the
 *               silent revert invariant 4 forbids.
 *
 * **`catch` and `try` are not free passes.** They report the failure, which is
 * the half that matters most — and they also swallow `redirect()` and
 * `notFound()`, because Next implements both by throwing. A `catch` without
 * `unstable_rethrow` turns a working navigation into a control that appears to
 * do nothing. That is counted separately below rather than waved through.
 *
 * The scan is lexical: it walks back up to six lines for a `settle(`, checks
 * the call and the two lines after it for a `.catch(`, and uses indentation to
 * decide whether an enclosing `try {` is really enclosing. It is a grep with a
 * memory, not a type checker — it will not see a call made through a variable,
 * and it says so rather than pretending.
 *
 *   node scripts/check-action-resilience.mjs          # report
 *   node scripts/check-action-resilience.mjs --check  # exit 1 if any BARE
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["components", "app"];
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/actions\/[^"]+"/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) out.push(path);
  }
  return out;
}

const rows = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    if (!source.startsWith('"use client"')) continue;

    const names = new Set();
    for (const match of source.matchAll(IMPORT)) {
      for (const raw of match[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (name && !/^[A-Z]/.test(name)) names.add(name);
      }
    }
    if (!names.size) continue;

    const lines = source.split("\n");
    for (const name of names) {
      const call = new RegExp(`\\b${name}\\s*\\(`);
      // `useActionState<AuthState, FormData>(signIn, …)` — the generics sit
    // between the name and the paren, and the first version of this pattern
    // did not allow for them, so every form action counted as something else.
    const asValue = new RegExp(`(useActionState\\s*(<[^>]*>)?\\s*\\(\\s*${name}\\b|action=\\{${name}\\})`);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (asValue.test(line)) {
          rows.push({ file, line: i + 1, name, kind: "form" });
          continue;
        }
        if (!call.test(line)) continue;
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (new RegExp(`(import|export)[^\\n]*\\b${name}\\b`).test(line)) continue;

        const back = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
        const forward = lines.slice(i, i + 3).join("\n");
        const indent = (line.match(/^\s*/) ?? [""])[0].length;

        // An enclosing `try {`: the nearest one above at a SHALLOWER indent,
        // with no `} catch` between it and here to have already closed it.
        let inTry = false;
        for (let j = i - 1; j >= 0 && j > i - 40; j -= 1) {
          const candidate = lines[j];
          const at = (candidate.match(/^\s*/) ?? [""])[0].length;
          if (at >= indent) continue;
          if (/^\s*\}\s*catch/.test(candidate)) break;
          if (/^\s*try\s*\{/.test(candidate)) { inTry = true; break; }
          if (/^\s*(function|const|export)\b/.test(candidate)) break;
        }

        const kind = /(settle|trackedSave)\s*\(/.test(back)
          ? "settled"
          : /\bvoid\s/.test(line)
            ? "fire"
            : /\.catch\s*\(/.test(forward)
              ? "catch"
              : inTry
                ? "try"
                : "BARE";
        rows.push({ file, line: i + 1, name, kind, rethrows: /unstable_rethrow/.test(source) });
      }
    }
  }
}

const tally = rows.reduce((acc, row) => ({ ...acc, [row.kind]: (acc[row.kind] ?? 0) + 1 }), {});
const bare = rows.filter((row) => row.kind === "BARE");

console.log("Server Action call sites in client components\n");
for (const kind of ["settled", "catch", "try", "form", "fire", "BARE"]) {
  console.log(`  ${kind.padEnd(8)} ${String(tally[kind] ?? 0).padStart(3)}`);
}
console.log(`  ${"total".padEnd(8)} ${String(rows.length).padStart(3)}\n`);

const swallowing = rows.filter((row) => (row.kind === "catch" || row.kind === "try") && !row.rethrows);

if (bare.length) {
  console.log("Awaited, inspected, and nothing catches — a network failure is silent here:\n");
  for (const row of bare) {
    console.log(`  ${relative(process.cwd(), row.file)}:${row.line}  ${row.name}()`);
  }
  console.log("");
}

if (swallowing.length) {
  console.log("Caught by hand, with no `unstable_rethrow` in the file —");
  console.log("a redirect() or notFound() from these is swallowed:\n");
  for (const row of swallowing) {
    console.log(`  ${relative(process.cwd(), row.file)}:${row.line}  ${row.name}()  [${row.kind}]`);
  }
  console.log("");
}

const wrong = bare.length + swallowing.length;
if (process.argv.includes("--check") && wrong) {
  console.log(`resilience: ${bare.length} bare, ${swallowing.length} swallowing a navigation`);
  process.exit(1);
}
console.log(wrong ? `resilience: REPORTED (${wrong})` : "resilience: OK");
