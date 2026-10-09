#!/bin/sh
# Resizes iPhone screenshots to the App Store Connect slot, alpha stripped
# (App Store Connect rejects PNGs with an alpha channel).
#   6.9" → 1320×2868 (the one slot Apple requires)
# With a captions.txt beside the shots (one line per shot, in file order),
# each lands under its caption instead of edge to edge.
#
# Usage: scripts/store-screenshots.sh <dir-of-pngs-or-jpgs> [out-dir]
set -e
IN=${1:?usage: $0 <input-dir> [out-dir]}
OUT=${2:-docs/release/screenshots}
HERE=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$OUT"

n=0
for f in "$IN"/*.png "$IN"/*.PNG "$IN"/*.jpg "$IN"/*.jpeg "$IN"/*.JPG "$IN"/*.HEIC; do
  [ -f "$f" ] || continue
  n=$((n + 1))
  name=$(basename "${f%.*}")
  caption=$([ -f "$IN/captions.txt" ] && sed -n "${n}p" "$IN/captions.txt" || true)
  if [ -n "$caption" ]; then
    swift "$HERE/tools/caption-screenshot.swift" "$f" "$OUT/$name.jpg" "$caption"
  else
    sips -s format jpeg -s formatOptions 80 -z 2868 1320 "$f" --out "$OUT/$name.jpg" >/dev/null
  fi
  echo "$name${caption:+  [$caption]}"
done
