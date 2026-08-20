#!/usr/bin/env bash
# Step 2 verification: every asset in the implementation brief §1 move table is present under public/.
# Legacy asset deletion is deliberately NOT checked here — the brief defers it to "after the Coditu
# marks are wired in" (steps 3 and 12).
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
check() { [ -f "$1" ] && echo "  ok   $1" || { echo "  MISS $1"; fail=1; }; }

echo "brand → public/brand/"
for f in design/project/assets/brand/*.svg; do check "public/brand/$(basename "$f")"; done

echo "clients → public/clients/"
check "public/clients/evim.svg"

echo "work → public/work/ (must be byte-identical, not merely present)"
for f in design/project/assets/work/*; do
  b=$(basename "$f")
  if [ ! -f "public/work/$b" ]; then echo "  MISS public/work/$b"; fail=1
  elif [ "$(shasum -a256 "$f" | cut -d' ' -f1)" != "$(shasum -a256 "public/work/$b" | cut -d' ' -f1)" ]; then
    echo "  DIFF public/work/$b"; fail=1
  else echo "  ok   public/work/$b"; fi
done

[ "$fail" -eq 0 ] && echo "assets: OK" || { echo "assets: FAILED"; exit 1; }
