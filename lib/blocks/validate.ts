import { z } from "zod";

import { parseNode, type ProseMirrorNode } from "@/lib/blocks/schema";

/**
 * The zod half of the block schema, kept apart from the vocabulary.
 *
 * ## Why this is its own file
 *
 * Every Server Action that stores a document validates its input with zod, and
 * that is right: the boundary between a browser and a table is exactly where a
 * schema belongs. But `lib/blocks/schema.ts` is also reachable from the
 * **browser** — the sprint notes panel, the item's description and highlight,
 * and the composer all ask it whether a document is empty — and **zod is ~63KB
 * gzipped**.
 *
 * Keeping the two in one module put zod in the app shell's initial load and
 * took the sprint route from 69KB to 136KB against a 110KB budget. It was found
 * by `npm run budgets`, not by reading, because nothing about
 * `import { isEmptyDocument }` suggests it drags a validation library with it.
 *
 * `lib/supabase/env.ts` makes the same split for the same reason and says so in
 * its header. This is that rule applied a second time.
 *
 * ## What it validates, and what it does not
 *
 * The ROOT node only, one level deep — the same as before, and deliberately.
 * A recursive schema walks the whole tree while validating, so a deeply nested
 * document overflows the stack inside the validator before any depth guard runs,
 * and `body_json` is a jsonb column that will store 5,000 nested paragraphs
 * happily. Depth is handled where it belongs: `pruneToDepth` on the way out of
 * the server, and an allowlist in the renderer that draws known node types only.
 */
export const documentSchema = z
  .custom<unknown>((value) => parseNode(value) !== null, {
    message: "That is not a document we can read.",
  })
  // Transformed through `parseNode` so unknown root keys are STRIPPED rather
  // than stored — which is what `z.object` did here before, and is the half of
  // its behaviour that was load-bearing.
  .transform((value): ProseMirrorNode => parseNode(value)!);
