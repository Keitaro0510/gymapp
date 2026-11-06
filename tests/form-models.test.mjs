// フォームの 3D（src/form-models.ts）と、置いてある GLB のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FORM_MODELS, FORM_VIEWS, formModelFor } from '../src/form-models.ts';

test('種目名から GLB を引く。ない種目は null（3D の表示を出さない）', () => {
  assert.equal(formModelFor('バーベルスクワット'), 'forms/squat.glb');
  assert.equal(formModelFor('ベンチプレス'), null);
  assert.equal(formModelFor('constructor'), null, 'オブジェクトの組み込みの名前を、種目名として引かない');
  assert.equal(formModelFor('__proto__'), null);
});

test('対応表の GLB は、すべて存在し、GLB の形式で、アニメーションを含む', () => {
  for (const [name, file] of Object.entries(FORM_MODELS)) {
    const path = new URL(`../${file}`, import.meta.url);
    assert.ok(existsSync(path), `${name}: ${file} がありません`);
    const buf = readFileSync(path);
    assert.equal(buf.toString('latin1', 0, 4), 'glTF', `${name}: GLB の形式ではありません`);
    const len = buf.readUInt32LE(12);
    const json = JSON.parse(buf.toString('utf8', 20, 20 + len));
    assert.ok(json.animations?.length >= 1, `${name}: アニメーションがありません`);
    assert.ok(json.skins?.length >= 1, `${name}: 骨（スキン）がありません`);
    assert.ok(buf.length < 800 * 1024, `${name}: 大きすぎます（${(buf.length / 1024).toFixed(0)}KB）`);
    // IK の操作用ボーンは、書き出しに入れない
    const names = json.nodes.map(n => n.name);
    assert.ok(!names.some(n => /^(ik_|elbow_pole|knee_pole)/.test(n)), `${name}: 操作用ボーンが入っています`);
  }
});

test('見る向きは、横・正面・斜めの3つで、カメラは人（高さ 0〜1.7m）から離れている', () => {
  assert.deepEqual(Object.keys(FORM_VIEWS), ['side', 'front', 'angle']);
  for (const v of Object.values(FORM_VIEWS)) {
    const [cx, cy, cz] = v.camera; const [tx, ty, tz] = v.target;
    const dist = Math.hypot(cx - tx, cy - ty, cz - tz);
    assert.ok(dist > 3 && dist < 8, `${v.label}: カメラの距離 ${dist.toFixed(1)}`);
    assert.ok(ty > 0.5 && ty < 1.2);
  }
});
