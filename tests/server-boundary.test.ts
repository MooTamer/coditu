import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The privilege boundary, asserted by shape rather than by behaviour.
 *
 * ## Why a source-level test and not a runtime one
 *
 * **`server-only` is a bundler rule.** It throws at build time and it is
 * invisible to `typecheck`, to `lint`, and to every unit test — W12 shipped a
 * client component importing a `server-only` data module, and the whole gate
 * stayed green while the page rendered blank. The build catches it, but only
 * once somebody runs a build, and `npm run build` is not in the routine gate
 * because it points at production.
 *
 * So this is the cheap half of that check: a fact about the files, failing in
 * one second on a laptop rather than in six minutes and a browser. Same
 * pattern, and the same reasoning, as `tests/earnings-boundary.test.ts`.
 *
 * ## The two things it protects
 *
 * 1. **The service-role key.** It is the credential that bypasses every policy
 *    in the database. It may be named in exactly one module, and that module
 *    must be `server-only`.
 * 2. **`server-only` modules must not be reachable from a `"use client"`
 *    file.** Not "should not" — the build refuses it, and this says so before
 *    the build does.
 */

const ROOT = join(__dirname, "..");
const TREE = ["app", "components", "lib"];

function sourceFiles(target: string): string[] {
  const full = join(ROOT, target);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) return [full];

  const found: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(full, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(relative(ROOT, path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

const ALL = TREE.flatMap(sourceFiles);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * `import … from "@/lib/x"` and `from "./x"`, resolved to a repo path.
 *
 * **`import type` is skipped**, because it is erased before the bundler ever
 * sees it. A client component naming a type from a `server-only` module is not
 * reaching it — `trash-row.client.tsx` has done exactly that since W4d and the
 * build has never minded.
 */
function localImports(path: string, body: string): string[] {
  const out: string[] = [];
  for (const match of body.matchAll(/(^|\n)\s*import\s+(type\s+)?[^;]*?from\s+["'](@\/[^"']+|\.\.?\/[^"']+)["']/g)) {
    if (match[2]) continue;
    const spec = match[3];
    if (spec.startsWith("@/")) {
      out.push(spec.slice(2));
    } else {
      // Relative, resolved against the importing file's directory.
      const dir = relative(ROOT, join(path, ".."));
      const joined = join(dir, spec);
      out.push(joined.split("\\").join("/"));
    }
  }
  return out;
}

/** Which repo-relative module a specifier means, if it is one of ours. */
function resolve(spec: string): string | null {
  for (const candidate of [`${spec}.ts`, `${spec}.tsx`, `${spec}/index.ts`, spec]) {
    try {
      if (statSync(join(ROOT, candidate)).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const SERVER_ONLY = new Set(
  ALL.filter((file) => /^\s*import\s+["']server-only["']/m.test(read(file))).map((file) =>
    relative(ROOT, file)
  )
);

describe("the service-role key", () => {
  it("is named in exactly one module", () => {
    const naming = ALL.filter((file) => read(file).includes("SUPABASE_SERVICE_ROLE_KEY")).map(
      (file) => relative(ROOT, file)
    );
    // One place to audit, one place to get wrong. Every caller goes through
    // `createAdminClient()` instead, which is the point of it existing.
    expect(naming).toEqual(["lib/supabase/admin.ts"]);
  });

  it("lives behind `server-only`", () => {
    expect(SERVER_ONLY.has("lib/supabase/admin.ts")).toBe(true);
  });
});

describe("`server-only` means what it says", () => {
  it("guards more than a couple of modules — a passing test over nothing proves nothing", () => {
    expect(SERVER_ONLY.size).toBeGreaterThan(10);
  });

  it("no `use client` file can reach one, directly or through a plain module", () => {
    // One hop of indirection is where this actually goes wrong: the client
    // component imports an innocent-looking `lib/` module, and THAT one is
    // `server-only`. W12 did exactly this with `lib/data/recovery.ts`.
    const offenders: string[] = [];

    const reaches = (file: string, seen: Set<string>): string | null => {
      const rel = relative(ROOT, file);
      if (seen.has(rel)) return null;
      seen.add(rel);
      if (SERVER_ONLY.has(rel)) return rel;

      // A `"use server"` module is a real boundary, not a leak. Server Actions
      // are the supported way for a client component to reach the server, and
      // the bundler replaces the import with a reference rather than following
      // it — which is why `lib/actions/*` may and must import `server-only`
      // things. Traversal stops here.
      if (/^\s*["']use server["']/m.test(read(file))) return null;

      for (const spec of localImports(file, read(file))) {
        const target = resolve(spec);
        if (!target) continue;
        const hit = reaches(join(ROOT, target), seen);
        if (hit) return hit;
      }
      return null;
    };

    for (const file of ALL) {
      const body = read(file);
      if (!/^\s*["']use client["']/m.test(body)) continue;

      for (const spec of localImports(file, body)) {
        const target = resolve(spec);
        if (!target) continue;
        const hit = reaches(join(ROOT, target), new Set([relative(ROOT, file)]));
        if (hit) {
          offenders.push(`${relative(ROOT, file)} → ${spec} → ${hit}`);
        }
      }
    }

    expect(
      [...new Set(offenders)],
      "a client component can reach a server-only module; the build refuses this and the page renders blank"
    ).toEqual([]);
  });
});
