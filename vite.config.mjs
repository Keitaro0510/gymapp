// Vite の設定。maney-app の vite.config.mjs と同じ作り。
// - src/main.ts（入口）には指紋付きの名前を付ける。公開する一覧はビルド後に作る（scripts/finalize-sw.mjs）
// - index.html の css/・manifest・アイコンには vite-ignore を付け、Vite に触らせない。ビルドのあとで、そのまま出力にコピーする
// - JavaScript は縮める（3D の three.js が大きいため）。CSS は縮めない（そのまま出す）
import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

// まだ Vite を通さないファイル（そのまま公開する）
const STATIC_FILES = ['css', 'forms', 'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

function copyStaticFiles() {
  let outDir;
  return {
    name: 'copy-static-files',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      for (const f of STATIC_FILES) cpSync(f, resolve(outDir, f), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './', // GitHub Pages の /gymapp/ の下でも動くように、相対のパスにする
  appType: 'mpa', // 知らない場所には index.html ではなく 404 を返す（GitHub Pages と同じ）
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    cssMinify: false,
    target: 'es2021',
    modulePreload: false, // Service Worker がビルドした全ファイルを先読みする
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: { host: '127.0.0.1', port: 8766, strictPort: true },
  preview: { host: '127.0.0.1', port: 8766, strictPort: true },
  plugins: [copyStaticFiles()],
});
