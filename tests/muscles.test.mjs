// 部位の定義と標準の割り当て（src/muscles.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLES, MUSCLE_LABEL, isMuscle, describeParts, DEFAULT_PARTS } from '../src/muscles.ts';

test('部位は14で、DB（maney-app の D24）の一覧と同じ値', () => {
  assert.deepEqual(MUSCLES.map(m => m.id), [
    'chest', 'delt_front', 'delt_side', 'delt_rear', 'lats', 'upper_back', 'biceps', 'triceps',
    'forearm', 'abs', 'glutes', 'quads', 'hamstrings', 'calves']);
  assert.ok(MUSCLES.every(m => m.label.length > 0));
  assert.equal(MUSCLE_LABEL.delt_side, '肩（中部）');
});

test('部位かどうか', () => {
  assert.equal(isMuscle('chest'), true);
  assert.equal(isMuscle('legs'), false);
  assert.equal(isMuscle(null), false);
  assert.equal(isMuscle(3), false);
});

test('標準の割り当て: 主は一覧の部位、補助は重複なし・主を含まない', () => {
  const names = Object.keys(DEFAULT_PARTS);
  assert.ok(names.length >= 39, '今の種目＋足した種目');
  for (const [name, p] of Object.entries(DEFAULT_PARTS)) {
    assert.ok(isMuscle(p.primary), `${name}: 主が部位ではありません`);
    assert.ok(p.secondary.every(isMuscle), `${name}: 補助に知らない部位があります`);
    assert.equal(new Set(p.secondary).size, p.secondary.length, `${name}: 補助が重複しています`);
    assert.ok(!p.secondary.includes(p.primary), `${name}: 主の部位が補助にもあります`);
  }
});

test('標準の割り当ての例', () => {
  assert.deepEqual(DEFAULT_PARTS['ベンチプレス'], { primary: 'chest', secondary: ['delt_front', 'triceps'] });
  assert.equal(DEFAULT_PARTS['ダンベルサイドレイズ'].primary, 'delt_side', 'サイドレイズは肩の中部');
  assert.equal(DEFAULT_PARTS['スミスショルダープレス'].primary, 'delt_front', 'プレスは肩の前部');
  assert.equal(DEFAULT_PARTS['バーベルスクワット'].primary, 'quads');
});

test('表示の文字', () => {
  assert.equal(describeParts({ primary: 'chest', secondary: ['delt_front', 'triceps'] }), '胸　補助: 肩（前部）・上腕三頭筋');
  assert.equal(describeParts({ primary: 'calves', secondary: [] }), 'ふくらはぎ');
  assert.equal(describeParts({ primary: null, secondary: [] }), null);
});
