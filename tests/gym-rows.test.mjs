// 行 ↔ 画面の形の変換（src/gym-rows.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rowsToView, jstDate, rpeValue, assertSet, saveWorkoutChanges, deleteWorkoutChanges, durationValue,
  addExerciseChanges, deleteExerciseChanges, moveExerciseChanges, workoutKey, newWorkouts, importChanges, setMusclesChanges,
} from '../src/gym-rows.ts';
import { applyChanges, checkChanges, MAX_CHANGES_PER_OP } from '../src/data.ts';

let n = 0;
const newId = () => `id-${++n}`;
const set = (ex, kg, reps, rpe = null, note = '') => ({ ex, kg, reps, rpe, note });

const rows = () => ({
  gym_exercises: [
    { id: 'e1', name: 'ベンチ', position: 0, deleted_at: null },
    { id: 'e2', name: 'スクワット', position: 1, deleted_at: null },
    { id: 'e3', name: '昔の種目', position: 2, deleted_at: '2026-10-01T00:00:00Z' },
  ],
  gym_workouts: [
    { id: 'w1', performed_at: '2026-11-01T09:00:00+00:00', date: '2026-11-01', position: 0 },
    { id: 'w2', performed_at: '2026-11-03T09:00:00+00:00', date: '2026-11-03', position: 1 },
  ],
  gym_sets: [
    { id: 's2', workout_id: 'w1', exercise_id: 'e2', kg: '100', reps: 5, rpe: null, note: '', position: 1 },
    { id: 's1', workout_id: 'w1', exercise_id: 'e1', kg: 60, reps: 10, rpe: 8.5, note: 'メモ', position: 0 },
    { id: 's3', workout_id: 'w2', exercise_id: 'e3', kg: 20, reps: 12, rpe: null, note: '', position: 0 },
  ],
});

test('行から画面の形を作る: 新しい順・セットは位置順・消した種目の名前も記録に残る', () => {
  const v = rowsToView(rows());
  assert.deepEqual(v.exercises, ['ベンチ', 'スクワット'], '消した種目は一覧に出ない');
  assert.deepEqual(v.workouts.map(w => w.id), ['w2', 'w1']);
  assert.equal(v.workouts[0].sets[0].ex, '昔の種目');
  assert.deepEqual(v.workouts[1].sets, [set('ベンチ', 60, 10, 8.5, 'メモ'), set('スクワット', 100, 5)]);
  assert.equal(v.workouts[1].date, '2026-11-01T09:00:00.000Z');
});

test('日本時間の日', () => {
  assert.equal(jstDate(new Date('2026-11-05T14:59:59Z')), '2026-11-05');
  assert.equal(jstDate(new Date('2026-11-05T15:00:00Z')), '2026-11-06');
});

test('RPE は 1〜10 の小数1桁、それ以外は空', () => {
  assert.equal(rpeValue('8'), 8);
  assert.equal(rpeValue(8.25), 8.3);
  assert.equal(rpeValue(''), null);
  assert.equal(rpeValue(null), null);
  assert.equal(rpeValue('11'), null);
  assert.equal(rpeValue('0'), null);
  assert.equal(rpeValue('abc'), null);
});

test('DB の制約に合わないセットは保存前にエラー', () => {
  assert.throws(() => assertSet(set('a', -1, 5)), /重量/);
  assert.throws(() => assertSet(set('a', 10000, 5)), /重量/);
  assert.throws(() => assertSet(set('a', 60, 0)), /回数/);
  assert.throws(() => assertSet(set('a', 60, 1.5)), /回数/);
  assert.doesNotThrow(() => assertSet(set('a', 62.5, 8)));
});

test('保存: トレーニングとセットの追加。種目名は ID になる', () => {
  const at = new Date('2026-11-05T15:30:00Z');
  const ch = saveWorkoutChanges(rows(), [set('スクワット', 100, 5, '9', 'x'), set('ベンチ', 60, 10)], at, newId);
  assert.deepEqual(ch.map(c => `${c.table}:${c.action}`), ['gym_workouts:insert', 'gym_sets:insert', 'gym_sets:insert']);
  const wid = ch[0].id;
  assert.deepEqual(ch[0].row, { performed_at: '2026-11-05T15:30:00.000Z', date: '2026-11-06', note: '', position: 2 });
  assert.deepEqual(ch[1].row, { workout_id: wid, exercise_id: 'e2', kg: 100, reps: 5, rpe: 9, note: 'x', position: 0 });
  assert.equal(ch[2].row.exercise_id, 'e1');
  assert.equal(checkChanges(ch).length, 3);
});

test('保存: 一覧にない種目は、消した種目として先に作る（履歴にだけ残る）', () => {
  const ch = saveWorkoutChanges(rows(), [set('カスタム', 10, 10), set('カスタム', 10, 9)], new Date('2026-11-05T00:00:00Z'), newId);
  assert.deepEqual(ch.map(c => `${c.table}:${c.action}`), ['gym_exercises:insert', 'gym_workouts:insert', 'gym_sets:insert', 'gym_sets:insert']);
  assert.equal(ch[0].row.name, 'カスタム');
  assert.equal(ch[0].row.deleted_at, '2026-11-05T00:00:00.000Z');
  assert.equal(ch[2].row.exercise_id, ch[0].id);
  assert.equal(ch[3].row.exercise_id, ch[0].id, '同じ名前は同じ種目');
  // 画面の形にすると、一覧には出ず、記録には名前が出る
  const v = rowsToView(applyChanges(rows(), ch, 'now'));
  assert.ok(!v.exercises.includes('カスタム'));
  assert.equal(v.workouts[0].sets[0].ex, 'カスタム');
});

test('保存: 消した種目と同じ名前なら、その種目の ID を使う', () => {
  const ch = saveWorkoutChanges(rows(), [set('昔の種目', 1, 1)], new Date(), newId);
  assert.deepEqual(ch.map(c => c.table), ['gym_workouts', 'gym_sets']);
  assert.equal(ch[1].row.exercise_id, 'e3');
});

test('トレーニングを消す: 先にセットを消す（D23）', () => {
  const ch = deleteWorkoutChanges(rows(), 'w1');
  assert.deepEqual(ch.map(c => `${c.table}:${c.id}`), ['gym_sets:s2', 'gym_sets:s1', 'gym_workouts:w1']);
});

test('種目を足す・消す・戻す・並べ替える', () => {
  const add = addExerciseChanges(rows(), '自分だけの種目', newId);
  assert.equal(add[0].action, 'insert');
  assert.deepEqual(add[0].row, { name: '自分だけの種目', position: 3, deleted_at: null });
  // 消した種目と同じ名前を足すと、戻す（過去の記録とつながったまま）
  const back = addExerciseChanges(rows(), '昔の種目', newId);
  assert.deepEqual(back, [{ table: 'gym_exercises', action: 'update', id: 'e3', row: { deleted_at: null, position: 3 } }]);
  assert.deepEqual(deleteExerciseChanges(rows(), 'ベンチ', 'T'), [{ table: 'gym_exercises', action: 'update', id: 'e1', row: { deleted_at: 'T' } }]);
  assert.deepEqual(deleteExerciseChanges(rows(), 'ない', 'T'), []);
  const moved = applyChanges(rows(), moveExerciseChanges(rows(), 'ベンチ', 1), 'now');
  assert.deepEqual(rowsToView(moved).exercises, ['スクワット', 'ベンチ']);
  assert.deepEqual(moveExerciseChanges(rows(), 'ベンチ', -1), [], '一番上は上げられない');
});

test('記録の同一判定: DB を通って RPE が文字から数値になっても同じ記録', () => {
  const a = { date: '2026-11-01T09:00:00.000Z', sets: [set('ベンチ', 60, 10, '8', 'm')] };
  const b = { date: '2026-11-01T09:00:00+00:00', sets: [set('ベンチ', 60, 10, 8, 'm')] };
  assert.equal(workoutKey(a), workoutKey(b));
  assert.notEqual(workoutKey(a), workoutKey({ ...a, sets: [set('ベンチ', 60, 11, '8', 'm')] }));
  assert.deepEqual(newWorkouts([a], [b, { ...a, date: '2026-11-02T09:00:00.000Z' }, { ...a, date: '2026-11-02T09:00:00.000Z' }]).length, 1, '同じものは足さず、取り込みの中の重複も1つにする');
});

test('取り込み: 種目が先、記録はまとめて。1回の操作は500件まで', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ date: new Date(2026, 0, 1 + i).toISOString(), sets: Array.from({ length: 20 }, (_, k) => set(k % 2 ? '新種目' : 'ベンチ', 50, 8)) }));
  const ops = importChanges(rows(), many, ['ベンチ', '新種目', '昔の種目'], new Date('2026-11-05T00:00:00Z'), newId);
  assert.ok(ops.length >= 2);
  for (const op of ops) { assert.ok(op.length <= MAX_CHANGES_PER_OP); checkChanges(op); }
  // 最初の操作は種目だけ: 新種目を足し、消した種目を戻す
  assert.deepEqual(ops[0].map(c => `${c.action}:${c.row.name ?? c.id}`), ['insert:新種目', 'update:e3']);
  // 記録とそのセットは、同じ操作に入る（セットが別の操作の記録を指さない）
  for (const op of ops.slice(1)) {
    const workoutIds = new Set(op.filter(c => c.table === 'gym_workouts').map(c => c.id));
    for (const c of op.filter(c => c.table === 'gym_sets')) assert.ok(workoutIds.has(c.row.workout_id));
  }
  assert.equal(ops.slice(1).flat().filter(c => c.table === 'gym_workouts').length, 30);
  assert.equal(ops.slice(1).flat().filter(c => c.table === 'gym_sets').length, 600);
  // 全部重ねると、画面の形に30件が増える
  let r = rows();
  for (const op of ops) r = applyChanges(r, op, 'now');
  assert.equal(rowsToView(r).workouts.length, 32);
  assert.deepEqual(rowsToView(r).exercises, ['ベンチ', 'スクワット', '新種目', '昔の種目']);
});

test('取り込み: 範囲外のセットは、何も作らずエラー', () => {
  assert.throws(() => importChanges(rows(), [{ date: new Date().toISOString(), sets: [set('a', 60, 0)] }], null, new Date(), newId), /回数/);
});

test('行から、種目の部位（主1つ＋補助）も読む。部位のない種目は未設定', () => {
  const r = rows();
  r.gym_exercises[0] = { ...r.gym_exercises[0], primary_muscle: 'chest', secondary_muscles: ['delt_front', 'triceps'] };
  const infos = rowsToView(r).exerciseInfos;
  assert.deepEqual(infos.map(e => e.name), ['ベンチ', 'スクワット'], '消した種目は入らない');
  assert.deepEqual(infos[0], { id: 'e1', name: 'ベンチ', primary: 'chest', secondary: ['delt_front', 'triceps'], notes: '', videoUrl: null });
  assert.deepEqual([infos[1].primary, infos[1].secondary], [null, []]);
  // 知らない値は読み捨てる（DB の check があるので、通常は来ない）
  r.gym_exercises[1] = { ...r.gym_exercises[1], primary_muscle: 'legs', secondary_muscles: ['quads', 'wing'] };
  assert.deepEqual([rowsToView(r).exerciseInfos[1].primary, rowsToView(r).exerciseInfos[1].secondary], [null, ['quads']]);
});

test('部位を設定する: 主と補助。主は補助に入れない・知らない部位は断る', () => {
  const ch = setMusclesChanges(rows(), 'e1', 'chest', ['triceps', 'delt_front', 'triceps']);
  assert.deepEqual(ch, [{ table: 'gym_exercises', action: 'update', id: 'e1', row: { primary_muscle: 'chest', secondary_muscles: ['triceps', 'delt_front'] } }]);
  assert.equal(checkChanges(ch).length, 1);
  assert.deepEqual(setMusclesChanges(rows(), 'e1', null, [])[0].row, { primary_muscle: null, secondary_muscles: [] }, '未設定に戻せる');
  assert.throws(() => setMusclesChanges(rows(), 'e1', 'chest', ['chest']), /補助にも/);
  assert.throws(() => setMusclesChanges(rows(), 'e1', 'legs', []), /知らない部位/);
  assert.throws(() => setMusclesChanges(rows(), 'e1', 'chest', ['wing']), /知らない部位/);
  assert.throws(() => setMusclesChanges(rows(), 'ない', 'chest', []), /見つかりません/);
  // 画面の形に重ねると、部位が出る
  const v = rowsToView(applyChanges(rows(), ch, 'now'));
  assert.deepEqual([v.exerciseInfos[0].primary, v.exerciseInfos[0].secondary], ['chest', ['triceps', 'delt_front']]);
});

test('種目を足すとき、標準の割り当てがある名前なら部位を最初から入れる', () => {
  const known = addExerciseChanges(rows(), 'ダンベルサイドレイズ', newId);
  assert.deepEqual([known[0].row.primary_muscle, known[0].row.secondary_muscles], ['delt_side', ['upper_back']]);
  const unknown = addExerciseChanges(rows(), '自分だけの種目', newId);
  assert.ok(!('primary_muscle' in unknown[0].row), '知らない名前は、部位なし（未設定）');
  // 消した種目を戻すときは、前の部位のまま（上書きしない）
  const back = addExerciseChanges(rows(), '昔の種目', newId);
  assert.deepEqual(back[0].row, { deleted_at: null, position: 3 });
});

test('所要時間: 0〜86400 の数だけ使い、それ以外は未計測（null）。D26', () => {
  assert.equal(durationValue(3600), 3600);
  assert.equal(durationValue('90'), 90);
  assert.equal(durationValue(0), 0, '0 は未計測ではない');
  assert.equal(durationValue(59.6), 60);
  for (const bad of [null, undefined, '', -1, 86401, NaN, 'abc']) assert.equal(durationValue(bad), null, String(bad));
});

test('保存: 所要時間を gym_workouts.duration_sec に入れる。測っていなければ列を送らない', () => {
  const at = new Date('2026-11-05T15:30:00Z');
  const withDur = saveWorkoutChanges(rows(), [set('ベンチ', 60, 10)], at, newId, 1800);
  assert.equal(withDur[0].row.duration_sec, 1800);
  const without = saveWorkoutChanges(rows(), [set('ベンチ', 60, 10)], at, newId);
  assert.ok(!('duration_sec' in without[0].row), '列を足す前の DB にも送れる形のまま');
  // 画面の形に戻すと、所要時間が出る。無い記録は null
  const v = rowsToView(applyChanges(rows(), withDur, 'now'));
  assert.equal(v.workouts[0].durationSec, 1800);
});

test('取り込み: バックアップの所要時間を引き継ぐ', () => {
  const w = (date, durationSec) => ({ date, sets: [set('ベンチ', 60, 10)], ...(durationSec === undefined ? {} : { durationSec }) });
  const ops = importChanges(rows(), [w('2026-11-01T00:00:00Z', 1200), w('2026-11-02T00:00:00Z')], null, new Date(), newId);
  const wk = ops.flat().filter(c => c.table === 'gym_workouts');
  assert.equal(wk[0].row.duration_sec, 1200);
  assert.ok(!('duration_sec' in wk[1].row));
});
