// Service Worker（sw.js）と公開の決まり（scripts/finalize-sw.mjs）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeServiceWorker } from '../scripts/finalize-sw.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sw = read('sw.js');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);

test('CACHE_NAME は、リポジトリでは gymapp-dev のまま（公開するときに中身の指紋に置き換える）', () => {
  assert.match(sw, /const CACHE_NAME = 'gymapp-dev';/);
  assert.equal(sw.split("'gymapp-dev'").length - 1, 1, "'gymapp-dev' は1か所だけ（2か所あると両方置き換わる）");
});

test('開発用 ASSETS のファイルは存在する', () => {
  for (const f of assets) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `${f} がありません`);
});

test('manifest は今までどおり ./index.html から始まり、アイコンがある', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.start_url, './index.html');
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(`../${icon.src}`, import.meta.url)), `${icon.src} がありません`);
});

async function fixture(t, moduleText = 'app') {
  const dir = await mkdtemp(join(tmpdir(), 'gymapp-sw-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'assets'));
  await mkdir(join(dir, 'css'));
  await writeFile(join(dir, 'sw.js'), sw);
  await writeFile(join(dir, 'index.html'), '<link rel="stylesheet" href="css/app.css"><script type="module" src="./assets/index-abc.js"></script>');
  await writeFile(join(dir, 'css/app.css'), 'body{}');
  await writeFile(join(dir, 'manifest.json'), '{}');
  await writeFile(join(dir, 'icon-192.png'), 'icon');
  await writeFile(join(dir, 'assets/index-abc.js'), moduleText);
  return dir;
}

test('ビルドした全ファイルを先読みし、同じ中身なら同じ版にする', async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  const a = await finalizeServiceWorker(first);
  const b = await finalizeServiceWorker(second);
  assert.equal(a.version, b.version);
  assert.match(a.version, /^gymapp-[0-9a-f]{12}$/);
  assert.ok(a.assets.includes('./assets/index-abc.js'));
  assert.ok(a.assets.includes('./css/app.css'));
  const output = await readFile(join(first, 'sw.js'), 'utf8');
  assert.match(output, new RegExp(`const CACHE_NAME = '${a.version}'`));
  assert.doesNotMatch(output, /const CACHE_NAME = 'gymapp-dev'/);
});

test('公開ファイルの内容が変わると版も変わる', async t => {
  const first = await fixture(t);
  const second = await fixture(t, 'changed app');
  assert.notEqual((await finalizeServiceWorker(first)).version, (await finalizeServiceWorker(second)).version);
});

test('index.html が参照するファイルが足りなければ公開を止める', async t => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'index.html'), '<script type="module" src="./assets/missing.js"></script>');
  await assert.rejects(finalizeServiceWorker(dir), /assets\/missing\.js が公開するファイルにありません/);
});
