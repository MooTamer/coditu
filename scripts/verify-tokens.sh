#!/usr/bin/env bash
# Step 3 verification: the token and motion layer survives the production build.
#
# This exists because of a trap that fails SILENTLY. Tailwind v4 prunes
# `@layer utilities` down to the utilities it sees used, and an attribute
# selector such as `[data-reveal="section"]` is not a class name — it and its
# @keyframes vanish from the output with nothing in the build log to say so, and
# every reveal on the site quietly stops animating. Grep the built CSS, not the
# source.
#
# Usage: npm run build && ./scripts/verify-tokens.sh
set -uo pipefail
cd "$(dirname "$0")/.."

CSS=$(find .next/static -name '*.css' -type f | head -1)
if [ -z "$CSS" ]; then
  echo "no built CSS found — run 'npm run build' first" >&2
  exit 1
fi
echo "built CSS: $CSS ($(wc -c < "$CSS" | tr -d ' ') bytes)"

# The built CSS is minified: `--canvas: #ebeff6` becomes `--canvas:#ebeff6` and
# `[data-reveal="micro"]` loses its quotes. Compare with whitespace and quotes
# stripped from both sides so the check tracks meaning, not formatting.
NORM=$(tr -d ' \n\t"'"'" < "$CSS")

fail=0
need() {
  needle=$(printf '%s' "$2" | tr -d ' \t"'"'")
  if printf '%s' "$NORM" | grep -qF -- "$needle"; then
    echo "  ok   $1"
  else
    echo "  MISS $1  (looked for: $2)"; fail=1
  fi
}

echo
echo "surface + ink tokens, both themes"
need "light canvas"        "--canvas: #ebeff6"
need "dark canvas"         "--canvas: #07090e"
need "light ink"           "--ink: #0b0e14"
need "dark ink"            "--ink: #edf1f7"
need "light accent"        "--accent: #1e4ae0"
need "dark accent"         "--accent: #21e2c6"
need ".light mirror"       ".light"

echo
echo "status chip pairs — a light-only value would sit at ~2.4:1 on the dark canvas"
need "dev_started light"   "--chip-dev-started-fg: #183fbf"
need "dev_started dark"    "--chip-dev-started-fg: #89a7ff"
need "peer review light"   "--chip-ready-for-peer-review-fg: #7a4f00"
need "peer review dark"    "--chip-ready-for-peer-review-fg: #ffc24d"
need "done light"          "--chip-done-fg: #0e6b4b"
need "done dark"           "--chip-done-fg: #63e3a9"

echo
echo "grouping — opaque, pre-mixed sticky cells"
need "group 1 hue"         "--group-1: #5b8cff"
need "group 2 hue"         "--group-2: #12a594"
need "group 1 sticky light" "--group-1-sticky: #f4f7fe"
need "group 1 sticky dark"  "--group-1-sticky: #111827"

echo
echo "motion — the rules Tailwind is most likely to prune"
need "micro tier"          '[data-reveal="micro"]'
need "surface tier"        '[data-reveal="surface"]'
need "section tier"        '[data-reveal="section"]'
need "micro keyframes"     "cd-reveal-micro"
need "surface keyframes"   "cd-reveal-surface"
need "section keyframes"   "cd-reveal-section"
need "on-view pause gate"  "[data-reveal-on-view]"
need "spinner"             "cd-spin"
need "mark draw-on"        "cd-mark-draw"
need "mark node overshoot" "cd-mark-node-in"
need "mark hover travel"   "cd-mark-node-travel"
need "reduced motion"      "prefers-reduced-motion"

echo
echo "server-rendered content must never ship hidden"
# A JS-driven reveal serialises its own hidden state, so the HTML arrives with
# real content at opacity 0 and stays invisible until React hydrates. `<Reveal>`
# is CSS-driven precisely to avoid that. The pre-Coditu landing sections still
# use the old Framer reveal and still do it — step 12 replaces them.
offenders=$(grep -lF 'opacity:0' .next/server/app/*.html 2>/dev/null || true)
if [ -n "$offenders" ]; then
  for f in $offenders; do
    echo "  WARN $f prerenders content at opacity:0 (expected until step 12 — legacy landing reveals)"
  done
else
  echo "  ok   no prerendered content shipped hidden"
fi

# /dev/tokens must not exist in a production build. It renders every token in
# both themes, which is useful to us and pointless noise on a real deployment.
if [ -f .next/server/app/dev/tokens.html ]; then
  if grep -qiE '404|not.?found' .next/server/app/dev/tokens.html; then
    echo "  ok   /dev/tokens is 404 in a production build"
  else
    echo "  MISS /dev/tokens rendered in a production build — the guard is not working"; fail=1
  fi
fi

echo
if [ "$fail" -eq 0 ]; then echo "tokens: OK"; else echo "tokens: FAILED"; exit 1; fi
