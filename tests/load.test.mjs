// 部位ごとの負荷（src/load.ts）と人体図（src/body-svg.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { muscleLoad, intensity, SECONDARY_WEIGHT } from '../src/load.ts';
import { bodySvg } from '../src/body-svg.ts';
import { MUSCLES } from '../src/muscles.ts';
import { rowsToView } from '../src/gym-rows.ts';

const set = (ex, kg, reps) => ({ ex, kg, reps, rpe: null, note: '' });
const at = (d, h = 12) => new Date(2026, 10, d, h).toISOString();
const parts = new Map([
  ['ベンチプレス', { primary: 'chest', secondary: ['delt_front', 'triceps'] }],
  ['ダンベルサイドレイズ', { primary: 'delt_side', secondary: ['upper_back'] }],
  ['未設定の種目', { primary: null, secondary: [] }],
]);
const today = new Date(2026, 10, 5, 20);

test('主の部位は 100%、補助の部位は 50% で、ボリューム（重量×回数）を足す', () => {
  const load = muscleLoad([{ date: at(5), sets: [set('ベンチプレス', 60, 10), set('ベンチプレス', 60, 10)] }], parts, today);
  assert.equal(SECONDARY_WEIGHT, 0.5);
  assert.equal(load.raw.get('chest'), 1200);
  assert.equal(load.raw.get('delt_front'), 600);
  assert.equal(load.raw.get('triceps'), 600);
  assert.equal(load.raw.get('lats'), undefined, '関係ない部位は入らない');
  assert.equal(load.max, 1200);
  assert.equal(load.hasWorkout, true);
});

test('色の濃さは、いちばん負荷が高い部位を 1 として割合にする', () => {
  const load = muscleLoad([{ date: at(5), sets: [set('ベンチプレス', 60, 10)] }], parts, today);
  assert.equal(intensity(load, 'chest'), 1);
  assert.equal(intensity(load, 'triceps'), 0.5);
  assert.equal(intensity(load, 'calves'), 0);
  // 重量が変わっても、最大の部位は1（その日の分布を見る）
  const heavy = muscleLoad([{ date: at(5), sets: [set('ベンチプレス', 120, 10)] }], parts, today);
  assert.equal(intensity(heavy, 'chest'), 1);
});

test('複数のトレーニング・複数の種目を足し、別の日は入れない', () => {
  const load = muscleLoad([
    { date: at(5, 9), sets: [set('ベンチプレス', 50, 10)] },
    { date: at(5, 19), sets: [set('ダンベルサイドレイズ', 10, 20)] },
    { date: at(4), sets: [set('ベンチプレス', 100, 10)] },   // 昨日
    { date: at(6, 1), sets: [set('ベンチプレス', 100, 10)] }, // 明日
  ], parts, today);
  assert.equal(load.raw.get('chest'), 500, '昨日・明日の記録は入らない');
  assert.equal(load.raw.get('delt_side'), 200);
  assert.equal(load.raw.get('upper_back'), 100, '補助は半分');
});

test('部位が未設定の種目は数えず、知らせる。記録がない日は hasWorkout が false', () => {
  const load = muscleLoad([{ date: at(5), sets: [set('未設定の種目', 50, 10), set('知らない種目', 50, 10), set('未設定の種目', 40, 8)] }], parts, today);
  assert.equal(load.max, 0);
  assert.equal(load.hasWorkout, true);
  assert.deepEqual(load.unset, ['未設定の種目', '知らない種目']);
  const none = muscleLoad([{ date: at(4), sets: [set('ベンチプレス', 60, 10)] }], parts, today);
  assert.equal(none.hasWorkout, false);
  assert.equal(none.max, 0);
  assert.equal(intensity(none, 'chest'), 0, '0 で割らない');
});

test('日付は端末の日で数える（日付をまたぐ直前・直後）', () => {
  const load = muscleLoad([
    { date: new Date(2026, 10, 5, 0, 1).toISOString(), sets: [set('ベンチプレス', 10, 10)] },
    { date: new Date(2026, 10, 4, 23, 59).toISOString(), sets: [set('ベンチプレス', 10, 10)] },
  ], parts, new Date(2026, 10, 5, 23, 59));
  assert.equal(load.raw.get('chest'), 100);
});

test('人体図: 前面と背面があり、14 の部位がどちらかに出る。濃さが色に出る', () => {
  const t = m => (m === 'chest' ? 1 : m === 'triceps' ? 0.5 : 0);
  const front = bodySvg('front', t), back = bodySvg('back', t);
  assert.match(front, /aria-label="人体図（前面）"/);
  assert.match(back, /aria-label="人体図（背面）"/);
  for (const m of MUSCLES) assert.ok(front.includes(`data-muscle="${m.id}"`) || back.includes(`data-muscle="${m.id}"`), `${m.id} が人体図にありません`);
  assert.ok(front.includes('data-muscle="chest" data-t="1.00"'));
  assert.match(front, /data-muscle="chest"[^>]*style="fill-opacity:1\.00"/, '最大は不透明');
  assert.match(back, /data-muscle="triceps"[^>]*style="fill-opacity:0\.60"/, '半分は 0.2 + 0.8×0.5');
  assert.match(back, /data-muscle="lats"[^>]*style="fill-opacity:0"/, '負荷がなければ塗らない');
  assert.ok(front.includes('scale(-1 1)'), '左半身は左右反転で作る');
  assert.doesNotMatch(bodySvg('front', () => 5), /fill-opacity:[2-9]/, '範囲外の値は 0〜1 に丸める');
});

test('行から、種目名 → 部位の対応を作る（消した種目も。同じ名前は消していない種目が優先）', () => {
  const v = rowsToView({
    gym_exercises: [
      { id: 'e1', name: 'ベンチ', position: 0, deleted_at: null, primary_muscle: 'chest', secondary_muscles: ['triceps'] },
      { id: 'e2', name: '昔の種目', position: 1, deleted_at: '2026-10-01T00:00:00Z', primary_muscle: 'biceps', secondary_muscles: [] },
      { id: 'e3', name: '部位なし', position: 2, deleted_at: null, primary_muscle: null, secondary_muscles: [] },
      { id: 'e4', name: 'ベンチ', position: 3, deleted_at: '2026-10-01T00:00:00Z', primary_muscle: 'lats', secondary_muscles: [] },
    ],
    gym_workouts: [], gym_sets: [],
  });
  assert.deepEqual(v.partsByName.get('ベンチ'), { primary: 'chest', secondary: ['triceps'] });
  assert.deepEqual(v.partsByName.get('昔の種目'), { primary: 'biceps', secondary: [] });
  assert.equal(v.partsByName.has('部位なし'), false);
});
