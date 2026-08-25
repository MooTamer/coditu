/**
 * What somebody types into a link box, turned into something that can be one.
 *
 * A plain module rather than part of the editor, for the reason `lib/avatar.ts`
 * exists separately from `lib/actions/profiles.ts`: this is a pure string
 * function with sharp corners, and the corners are only testable if importing
 * it does not drag TipTap and ProseMirror into the test runner.
 *
 * It is the FIRST of two gates. `isSafeHref` in `lib/blocks/schema.ts` is the
 * second, and it is the one that matters — the renderer re-checks every href it
 * is about to make clickable, so nothing here is load-bearing for safety. This
 * exists to turn what a person meant into what a link needs, and to return null
 * rather than store a href that goes nowhere.
 */

/**
 * Whitespace and control characters.
 *
 * Refused outright rather than trimmed out of the middle: `java\tscript:` is a
 * real URL to a browser and is not one to a prefix check, which is exactly why
 * `isSafeHref` rejects whitespace too. Two gates, the same rule.
 */
const UNSAFE = /[\s\u0000-\u001F\u007F]/;

/**
 * Trailing punctuation a URL picked up from the sentence around it.
 *
 * `(see https://coditu.com/pricing).` pasted whole ends with `).`, and both
 * characters belong to the sentence rather than to the address. A closing
 * bracket is only stripped when it is unbalanced — `en.wikipedia.org/wiki/A_(B)`
 * is a real URL and the bracket is part of it.
 */
function trimSentencePunctuation(value: string): string {
  let out = value;
  for (;;) {
    const last = out.at(-1);
    if (last === "." || last === "," || last === ";" || last === ":" || last === "!" || last === "?") {
      out = out.slice(0, -1);
      continue;
    }
    if (last === ")" && (out.match(/\(/g)?.length ?? 0) < (out.match(/\)/g)?.length ?? 0)) {
      out = out.slice(0, -1);
      continue;
    }
    if (last === "]" && (out.match(/\[/g)?.length ?? 0) < (out.match(/\]/g)?.length ?? 0)) {
      out = out.slice(0, -1);
      continue;
    }
    return out;
  }
}

export function normaliseHref(raw: string): string | null {
  const value = trimSentencePunctuation(raw.trim());
  if (!value) return null;
  if (UNSAFE.test(value)) return null;

  // Already a scheme we are willing to draw. `isSafeHref` re-checks it.
  if (/^(https?:|mailto:)/i.test(value)) return value;

  // A bare address. `hello@coditu.com` is what somebody types when they mean
  // "email them", and `mailto:` is what a link needs.
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value)) return `mailto:${value}`;

  // Any other scheme — `javascript:`, `data:`, `file:`, `ftp:` — is left alone
  // rather than quietly rewritten to `https://javascript:…`, which would be a
  // nonsense URL that LOOKS like it was handled. The renderer refuses it.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  /**
   * A host needs a dot.
   *
   * `localhost` is not a domain, it is somebody still typing, and returning
   * null is what makes the editor unset the mark instead of storing a href that
   * goes nowhere.
   *
   * **`localhost:3000` is also null, and that is the decision** the brief asked
   * for. It is a real address on exactly one machine, and a link to it in a
   * comment is a link that works for its author and for nobody else on the
   * team — which is worse than a link that visibly did not take. Somebody who
   * genuinely means it can type `http://localhost:3000` and the first branch
   * above accepts it verbatim.
   */
  if (!/^[^\s/]+\.[^\s/]+/.test(value)) return null;

  return `https://${value}`;
}
