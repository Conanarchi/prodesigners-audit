#!/usr/bin/env bash
# Builds the static website for GitHub Pages into the folder given as $1.
set -euo pipefail
OUT="${1:-_site}"
SITE_URL="${SITE_URL:-https://conanarchi.github.io/prodesigners-audit}"
rm -rf "$OUT" && mkdir -p "$OUT"
cp -r public/* "$OUT"/
# dashboard and quote pages run on the server, not on Pages
rm -f "$OUT/admin.html" "$OUT/admin.js" "$OUT/quote.html"
sed -i "s|content=\"assets/og-image.jpg\"|content=\"$SITE_URL/assets/og-image.jpg\"|" "$OUT/index.html"
sed -i "s|<meta property=\"og:type\"|<meta property=\"og:url\" content=\"$SITE_URL/\">\n<meta property=\"og:type\"|" "$OUT/index.html"
touch "$OUT/.nojekyll"
echo "Built $OUT for $SITE_URL"
