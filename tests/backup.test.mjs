// バックアップ（src/backup.ts）と、端末に残った古い記録の読み込み（src/storage.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, backupFileName, parseBackup } from '../src/backup.ts';
import { loadWorkouts, loadExercises, DEFAULT_EXERCISES } from '../src/storage.ts';

const w = (date, ex = 'a') => ({ date, sets: [{ ex, kg: 60, reps: 10, rpe: null, note: '' }] });

test('バックアップの形は今までの版と同じ（行の id は入れない）', () => {
  const now = new Date('2026-11-05T03:00:00.000Z');
  const b = buildBackup([{ id: 'row-1', ...w('2026-11-01T00:00:00.000Z') }], ['a'], now);
  assert.deepEqual(Object.keys(b), ['app', 'version', 'exportedAt', 'workouts', 'exercises']);
  assert.equal(b.app, 'gym-tracker-backup');
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, '2026-11-05T03:00:00.000Z');
  assert.deepEqual(b.workouts, [w('2026-11-01T00:00:00.000Z')]);
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

function fakeStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

test('端末に残った古い記録は、今までと同じキー（gw・gw_ex）から読む', () => {
  const s = fakeStore({ gw: JSON.stringify([w('2026-11-01T00:00:00.000Z')]), gw_ex: JSON.stringify(['a']) });
  assert.deepEqual(loadWorkouts(s), [w('2026-11-01T00:00:00.000Z')]);
  assert.deepEqual(loadExercises(s), ['a']);
  assert.deepEqual(loadWorkouts(fakeStore()), []);
});

test('種目の保存がなければ初期の12種目', () => {
  const ex = loadExercises(fakeStore());
  assert.equal(ex.length, 12);
  assert.deepEqual(ex, [...DEFAULT_EXERCISES]);
  assert.notEqual(ex, DEFAULT_EXERCISES, '初期の一覧そのものは渡さない（書き換えられないように）');
});
