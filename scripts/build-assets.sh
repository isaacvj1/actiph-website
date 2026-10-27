#!/usr/bin/env bash
# Builds web-ready assets from the untouched Figma exports in figma-assets/.
# Re-run after re-exporting anything from Figma.
#
# Needs: cwebp (brew install webp), python3 with fonttools + brotli
# (pip3 install fonttools brotli), and the Pragmatica fonts in ~/Library/Fonts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/figma-assets"
IMG="$ROOT/assets/img"
FONTS="$ROOT/assets/fonts"
FONT_SRC="${FONT_SRC:-$HOME/Library/Fonts}"

mkdir -p "$IMG" "$FONTS"

# webp <source> <output-name> <width>...
webp() {
  local src="$1" name="$2"; shift 2
  for w in "$@"; do
    cwebp -quiet -q 82 -m 6 -resize "$w" 0 "$SRC/$src" -o "$IMG/$name-$w.webp"
  done
}

webp hero-photo.png    hero-photo    1200 2305
webp track-photo.jpg   track-photo   800 1400 2305
webp bottle-side.png   bottle-side   800 1400 2800
webp bottle-front.png  bottle-front  500 900 1539
webp prize-hyrox.png   prize-hyrox   600 1100
webp prize-actiph.png  prize-actiph  400 800
webp prize-airpods.png prize-airpods 500 768
webp actiph-logo.png   actiph-logo   420 640

cp "$SRC"/*.svg "$IMG/"

# Latin + Latin Extended-A (covers Maltese ċ ġ ħ ż) and common punctuation.
UNICODES="U+0000-017F,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"

for f in Pragmatica-Light Pragmatica-Book Pragmatica-Bold Pragmatica-Black Pragmatica-MediumOblique \
         PragmaticaExtended-Bold PragmaticaExtended-BlackOblique; do
  python3 -m fontTools.subset "$FONT_SRC/$f.ttf" --unicodes="$UNICODES" \
    --layout-features='*' --flavor=woff2 --output-file="$FONTS/$f.woff2"
done

echo "Assets built:"
du -sh "$IMG" "$FONTS"
