// バックアップ（src/backup.ts）と保存（src/storage.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, backupFileName, parseBackup, mergeBackup, replaceWithBackup } from '../src/backup.ts';
import { loadWorkouts, saveWorkouts, loadExercises, saveExercises, DEFAULT_EXERCISES } from '../src/storage.ts';

const w = (date, ex = 'a') => ({ date, sets: [{ ex, kg: 60, reps: 10, rpe: null, note: '' }] });

test('バックアップの形は今までの版と同じ', () => {
  const now = new Date('2026-11-05T03:00:00.000Z');
  const b = buildBackup([w('2026-11-01T00:00:00.000Z')], ['a'], now);
  assert.deepEqual(Object.keys(b), ['app', 'version', 'exportedAt', 'workouts', 'exercises']);
  assert.equal(b.app, 'gym-tracker-backup');
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, '2026-11-05T03:00:00.000Z');
  assert.equal(backupFileName(now), 'gym-backup-2026-11-05.json');
});

test('読み込み: 壊れたファイルと形式違いを区別する', () => {
  assert.deepEqual(parseBackup('{'), { ok: false, reason: 'unreadable' });
  assert.deepEqual(parseBackup('null'), { ok: false, reason: 'format' });
  assert.deepEqual(parseBackup('{"workouts":1}'), { ok: false, reason: 'format' });
  assert.deepEqual(parseBackup('{"workouts":[]}'), { ok: true, workouts: [], exercises: null });
  const ok = parseBackup(JSON.stringify(buildBackup([w('2026-11-01T00:00:00.000Z')], ['a', 'b'], new Date())));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.exercises, ['a', 'b']);
});

test('マージ: 同じ記録は足さず、新しい順に並べ、知らない種目だけ足す', () => {
  const have = [w('2026-11-01T00:00:00.000Z'), w('2026-10-01T00:00:00.000Z')];
  const incoming = { workouts: [w('2026-11-01T00:00:00.000Z'), w('2026-11-03T00:00:00.000Z', 'c'), w('2026-09-01T00:00:00.000Z')], exercises: ['a', 'c'] };
  const r = mergeBackup(have, ['a', 'b'], incoming);
  assert.equal(r.added, 2);
  assert.deepEqual(r.workouts.map(x => x.date), ['2026-11-03T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']);
  assert.deepEqual(r.exercises, ['a', 'b', 'c']);
  assert.equal(have.length, 2, '元の配列は変えない');
});

test('置き換え: 種目は、読み込んだ中身が空でないときだけ', () => {
  const ws = [w('2026-11-01T00:00:00.000Z')];
  assert.deepEqual(replaceWithBackup(['x'], { workouts: ws, exercises: ['a'] }).exercises, ['a']);
  assert.deepEqual(replaceWithBackup(['x'], { workouts: ws, exercises: [] }).exercises, ['x']);
  assert.deepEqual(replaceWithBackup(['x'], { workouts: ws, exercises: null }).exercises, ['x']);
});

function fakeStore() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), raw: m };
}

test('保存のキーは今までと同じ（gw・gw_ex）で、往復できる', () => {
  const s = fakeStore();
  assert.deepEqual(loadWorkouts(s), []);
  saveWorkouts(s, [w('2026-11-01T00:00:00.000Z')]);
  saveExercises(s, ['a']);
  assert.deepEqual([...s.raw.keys()].sort(), ['gw', 'gw_ex']);
  assert.deepEqual(loadWorkouts(s), [w('2026-11-01T00:00:00.000Z')]);
  assert.deepEqual(loadExercises(s), ['a']);
});

test('種目の保存がなければ初期の12種目', () => {
  const ex = loadExercises(fakeStore());
  assert.equal(ex.length, 12);
  assert.deepEqual(ex, [...DEFAULT_EXERCISES]);
  assert.notEqual(ex, DEFAULT_EXERCISES, '初期の一覧そのものは渡さない（書き換えられないように）');
});
