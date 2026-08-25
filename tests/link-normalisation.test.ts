import { describe, expect, it } from "vitest";

import { normaliseHref } from "@/lib/links";
import { isSafeHref } from "@/lib/blocks/schema";

/**
 * The link box, corner by corner.
 *
 * Two gates, and the order matters. `normaliseHref` turns what a person typed
 * into what a link needs, or returns null so the editor unsets the mark rather
 * than storing a href that goes nowhere. `isSafeHref` is the one that actually
 * protects anything — the renderer re-checks every href before it draws an
 * anchor — and the last block below asserts that the two agree, because a gate
 * that lets something through which the other refuses is a link that renders as
 * plain text for a reason nobody can see.
 */

describe("what a person types", () => {
  it("a bare domain becomes https", () => {
    expect(normaliseHref("coditu.com")).toBe("https://coditu.com");
    expect(normaliseHref("coditu.com/pricing?ref=x#top")).toBe("https://coditu.com/pricing?ref=x#top");
  });

  it("a bare address becomes mailto", () => {
    expect(normaliseHref("hello@coditu.com")).toBe("mailto:hello@coditu.com");
    expect(normaliseHref("first.last+tag@sub.coditu.co.uk")).toBe(
      "mailto:first.last+tag@sub.coditu.co.uk"
    );
  });

  it("a real URL is left exactly as it is", () => {
    expect(normaliseHref("https://x.com")).toBe("https://x.com");
    expect(normaliseHref("http://x.com/a/b")).toBe("http://x.com/a/b");
    expect(normaliseHref("mailto:hello@coditu.com")).toBe("mailto:hello@coditu.com");
    expect(normaliseHref("HTTPS://X.COM")).toBe("HTTPS://X.COM");
  });

  it("surrounding whitespace goes; whitespace inside is refused", () => {
    expect(normaliseHref("  coditu.com  ")).toBe("https://coditu.com");
    expect(normaliseHref("")).toBeNull();
    expect(normaliseHref("   ")).toBeNull();
  });
});

describe("a URL pasted out of a sentence", () => {
  it("drops the full stop that ended the sentence", () => {
    expect(normaliseHref("https://coditu.com.")).toBe("https://coditu.com");
    expect(normaliseHref("coditu.com,")).toBe("https://coditu.com");
    expect(normaliseHref("coditu.com!")).toBe("https://coditu.com");
  });

  it("drops an UNBALANCED closing bracket, and keeps a balanced one", () => {
    expect(normaliseHref("(see https://coditu.com/pricing)".replace("(see ", ""))).toBe(
      "https://coditu.com/pricing"
    );
    // A bracket that belongs to the URL stays. This is the case a naive
    // `replace(/[).]+$/)` gets wrong, and Wikipedia is full of them.
    expect(normaliseHref("en.wikipedia.org/wiki/Bracket_(disambiguation)")).toBe(
      "https://en.wikipedia.org/wiki/Bracket_(disambiguation)"
    );
    expect(normaliseHref("en.wikipedia.org/wiki/Bracket_(disambiguation)).")).toBe(
      "https://en.wikipedia.org/wiki/Bracket_(disambiguation)"
    );
  });

  it("drops trailing punctuation in whatever order it arrives", () => {
    expect(normaliseHref("https://coditu.com/a).")).toBe("https://coditu.com/a");
    expect(normaliseHref("https://coditu.com/a.)")).toBe("https://coditu.com/a");
  });
});

describe("a host that is not one", () => {
  it("`localhost` is somebody still typing", () => {
    expect(normaliseHref("localhost")).toBeNull();
    expect(normaliseHref("intranet")).toBeNull();
  });

  it("`localhost:3000` is null too, and that is the decision", () => {
    // It is a real address on exactly one machine. A link to it in a comment
    // works for its author and for nobody else on the team, which is worse than
    // a link that visibly did not take. Somebody who genuinely means it types
    // the scheme, and that is accepted verbatim.
    expect(normaliseHref("localhost:3000")).toBeNull();
    expect(normaliseHref("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normaliseHref("127.0.0.1:54421")).toBe("https://127.0.0.1:54421");
  });

  it("an IDN host is passed through as typed", () => {
    // Not punycoded here. The browser does that, correctly, and doing it in
    // this function would mean shipping an IDNA table to make a link box work.
    expect(normaliseHref("münchen.de")).toBe("https://münchen.de");
    expect(normaliseHref("xn--mnchen-3ya.de")).toBe("https://xn--mnchen-3ya.de");
    expect(normaliseHref("مصر.eg/صفحة")).toBe("https://مصر.eg/صفحة");
  });
});

describe("the scheme is never invented", () => {
  it("refuses a dangerous one rather than rewriting it", () => {
    // The failure this guards against is not `javascript:` reaching the page —
    // `isSafeHref` refuses that at render time. It is `https://javascript:…`,
    // a nonsense URL that LOOKS like it was handled.
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "ftp://x.com"]) {
      expect(normaliseHref(bad)).toBeNull();
    }
  });

  it("refuses the whitespace tricks that defeat a prefix check", () => {
    // `java\tscript:` is a real URL to a browser: it strips the tab before
    // resolving. A check that looks for `javascript:` never sees it, which is
    // why whitespace is refused rather than stripped out of the middle.
    //
    // The last one is a leading space, and it is refused for a DIFFERENT
    // reason: `trim()` removes it and the scheme check then catches what is
    // left. Both paths end in null, and both are worth pinning.
    for (const bad of ["java\tscript:alert(1)", "java\nscript:alert(1)", "java\u0000script:alert(1)", " javascript:alert(1)"]) {
      expect(normaliseHref(bad)).toBeNull();
    }
  });
});

describe("the two gates agree", () => {
  it("anything this produces, the renderer will draw", () => {
    const typed = [
      "coditu.com",
      "hello@coditu.com",
      "https://x.com",
      "http://localhost:3000",
      "münchen.de",
      "en.wikipedia.org/wiki/Bracket_(disambiguation)",
      "coditu.com/pricing?ref=x#top",
    ];
    for (const value of typed) {
      const href = normaliseHref(value);
      expect(href, `${value} produced nothing`).not.toBeNull();
      expect(isSafeHref(href), `the renderer would refuse ${href}`).toBe(true);
    }
  });

  it("and the renderer refuses everything this refuses", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "java\tscript:alert(1)"]) {
      expect(normaliseHref(value)).toBeNull();
      expect(isSafeHref(value)).toBe(false);
    }
  });
});
