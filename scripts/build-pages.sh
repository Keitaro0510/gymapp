#!/usr/bin/env bash
# GitHub Pages に出すファイルを Vite でビルドし、sw.js の先読み一覧と版を作る。
# 公開の手順（.github/workflows/deploy.yml）と、PR のテスト（.github/workflows/test.yml）が使う。先に npm ci（または npm install）しておく。
#
#   bash scripts/build-pages.sh          # _site にビルドする。最後に版の名前（gymapp-1a2b3c4d5e6f など）を出す
#   bash scripts/build-pages.sh 出す先    # ビルドする場所を変える
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${1:-_site}"

rm -rf "$OUT"
mkdir -p "$OUT"

npx vite build --outDir "$OUT" --emptyOutDir --logLevel warn >&2

fail() { echo "$1" >&2; exit 1; }
grep -q '<script type="module"' "$OUT/index.html" || fail "index.html にアプリのモジュールがありません"
grep -q 'rel="manifest" href="manifest.json"' "$OUT/index.html" || fail "index.html の manifest の場所が変わっています（vite-ignore を確かめる）"
grep -q 'rel="stylesheet" href="css/app.css"' "$OUT/index.html" || fail "index.html に css/app.css がありません（vite-ignore を確かめる）"

node scripts/finalize-sw.mjs "$OUT"
