// 部位バランス（src/load.ts の期間の負荷・まとまりごとの割合）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { muscleLoad, muscleLoadRange, groupShares, muscleShares, MUSCLE_GROUPS } from '../src/load.ts';
import { MUSCLES } from '../src/muscles.ts';

const set = (ex, kg, reps) => ({ ex, kg, reps, rpe: null, note: '' });
const at = (d, h = 12) => new Date(2026, 10, d, h).toISOString();
const parts = new Map([
  ['ベンチ', { primary: 'chest', secondary: ['delt_front', 'triceps'] }],
  ['ロウ', { primary: 'lats', secondary: ['upper_back', 'biceps'] }],
  ['スクワット', { primary: 'quads', secondary: ['glutes', 'hamstrings'] }],
  ['クランチ', { primary: 'abs', secondary: [] }],
  ['未設定の種目', { primary: null, secondary: [] }],
]);

test('期間の負荷: 始まりを含み、終わりの日を含まない。複数の日を足す', () => {
  const ws = [
    { date: at(1), sets: [set('ベンチ', 100, 10)] },          // 範囲の前
    { date: at(2), sets: [set('ベンチ', 60, 10)] },           // 範囲の始まり
    { date: at(4, 20), sets: [set('ロウ', 50, 10)] },
    { date: at(6, 0), sets: [set('ベンチ', 999, 1)] },        // 範囲の終わりの日（含まない）
  ];
  const load = muscleLoadRange(ws, parts, new Date(2026, 10, 2), new Date(2026, 10, 6));
  assert.equal(load.raw.get('chest'), 600);
  assert.equal(load.raw.get('lats'), 500);
  assert.equal(load.raw.get('biceps'), 250, '補助は半分');
  assert.equal(load.hasWorkout, true);
  // 1日の関数は、1日分の期間と同じ答え
  const day = muscleLoad(ws, parts, new Date(2026, 10, 4, 3));
  assert.deepEqual([...day.raw], [...muscleLoadRange(ws, parts, new Date(2026, 10, 4), new Date(2026, 10, 5)).raw]);
  assert.equal(day.raw.get('lats'), 500);
  assert.equal(day.raw.get('chest'), undefined);
});

test('期間の負荷: 未設定の種目は数えず知らせる。記録がなければ hasWorkout は false', () => {
  const ws = [{ date: at(3), sets: [set('未設定の種目', 50, 10), set('知らない種目', 1, 1)] }];
  const load = muscleLoadRange(ws, parts, new Date(2026, 10, 2), new Date(2026, 10, 9));
  assert.equal(load.max, 0);
  assert.deepEqual(load.unset, ['未設定の種目', '知らない種目']);
  assert.equal(muscleLoadRange(ws, parts, new Date(2026, 10, 10), new Date(2026, 10, 12)).hasWorkout, false);
});

test('まとまり（押す・引く・脚・体幹）は、14 の部位を重複なく全部ふくむ', () => {
  const all = MUSCLE_GROUPS.flatMap(g => g.muscles);
  assert.equal(all.length, 14);
  assert.deepEqual([...new Set(all)].sort(), MUSCLES.map(m => m.id).sort());
  assert.deepEqual(MUSCLE_GROUPS.map(g => g.label), ['押す', '引く', '脚', '体幹']);
  assert.equal(MUSCLE_GROUPS.find(g => g.muscles.includes('delt_side')).id, 'push', '肩の中部（サイドレイズ）は押す');
  assert.equal(MUSCLE_GROUPS.find(g => g.muscles.includes('delt_rear')).id, 'pull', '肩の後部は引く');
});

test('まとまりごとの割合: 主 100%・補助 50% のボリュームの合計に対する割合。合計は 1', () => {
  const ws = [{ date: at(3), sets: [
    set('ベンチ', 100, 10),   // 胸 1000・肩前部 500・三頭 500 → 押す 2000
    set('ロウ', 100, 10),     // 広背筋 1000・僧帽筋 500・二頭 500 → 引く 2000
    set('スクワット', 100, 10), // 大腿四頭筋 1000・臀部 500・ハム 500 → 脚 2000
    set('クランチ', 20, 10),  // 腹 200 → 体幹 200
  ] }];
  const load = muscleLoadRange(ws, parts, new Date(2026, 10, 2), new Date(2026, 10, 9));
  const g = Object.fromEntries(groupShares(load).map(x => [x.id, x.share]));
  assert.ok(Math.abs(g.push - 2000 / 6200) < 1e-9);
  assert.ok(Math.abs(g.pull - 2000 / 6200) < 1e-9);
  assert.ok(Math.abs(g.legs - 2000 / 6200) < 1e-9);
  assert.ok(Math.abs(g.core - 200 / 6200) < 1e-9);
  assert.ok(Math.abs(Object.values(g).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const sh = muscleShares(load);
  assert.ok(Math.abs(sh.get('chest') - 1000 / 6200) < 1e-9);
  assert.ok(Math.abs([...sh.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('負荷がなければ、割合は全部 0（0 で割らない）', () => {
  const load = muscleLoadRange([], parts, new Date(2026, 10, 2), new Date(2026, 10, 9));
  assert.deepEqual(groupShares(load).map(g => g.share), [0, 0, 0, 0]);
  assert.equal(muscleShares(load).size, 0);
});
