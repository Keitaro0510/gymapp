// 画面とコードのつなぎのテスト: ボタンの名前の打ち間違い・index.html の決まりごとを見張る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const main = read('src/main.ts');
const sources = readdirSync(new URL('../src/screens/', import.meta.url)).map(f => read(`src/screens/${f}`));

const handlerNames = [...main.matchAll(/^\s*'([a-z-]+)':/gm)].map(m => m[1]);

test('画面のボタン（data-action）は、すべて main.ts に受け手がある', () => {
  const used = new Set([...[html, ...sources].join('\n').matchAll(/data-action="([a-z-]+)"/g)].map(m => m[1]));
  assert.ok(used.size > 10);
  for (const name of used) assert.ok(handlerNames.includes(name), `${name} の受け手が main.ts にありません`);
});

test('main.ts の受け手には、画面で使われていないものがない', () => {
  const used = new Set([...[html, ...sources].join('\n').matchAll(/data-action="([a-z-]+)"/g)].map(m => m[1]));
  for (const name of handlerNames) assert.ok(used.has(name), `${name} はどの画面からも呼ばれていません`);
});

test('index.html に onclick などの直接の書き込みはない', () => {
  assert.doesNotMatch(html, /\son(click|change|input)=/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)/, 'インラインの script は置かない');
  assert.doesNotMatch(html, /<style/, '見た目は css/app.css に置く');
});

test('モジュールの入口は src/main.ts だけ', () => {
  assert.deepEqual([...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(m => m[1]), ['src/main.ts']);
});

test('下のナビのタブは、すべて対応する画面がある', () => {
  const tabs = [...html.matchAll(/data-action="tab" data-tab="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['log', 'timer', 'cal', 'hist', 'ex', 'stats']);
  for (const t of tabs) assert.match(html, new RegExp(`id="sec-${t}"`));
});

test('main.ts と画面が使う要素の id は、すべて index.html にある', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const code = [main, ...sources].join('\n');
  const used = [...code.matchAll(/(?:byId(?:<[^>]*>)?\(|renderRedStats\()'([a-z-]+)'[),]/g)].map(m => m[1]);
  assert.ok(used.length > 20);
  // 画面を描くときに作る要素（種目の部位の編集フォーム）は、index.html にはない
  const dynamic = new Set(['mus-primary']);
  for (const id of used.filter(id => !dynamic.has(id))) assert.ok(ids.has(id), `#${id} が index.html にありません`);
});
