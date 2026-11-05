// 保存・送信・読み込み（src/sync.ts）と、古い記録の案内（src/legacy.ts）のテスト。
// Supabase の代わりに、テーブルと apply_op を真似る偽物を使う
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initSync, commit, flushOutbox, loadRemote, currentRows, useServerVersion, loadStored } from '../src/sync.ts';
import { state } from '../src/state.ts';
import { saveWorkoutChanges, addExerciseChanges, deleteExerciseChanges, deleteWorkoutChanges } from '../src/gym-rows.ts';
import { offerLegacyImport } from '../src/legacy.ts';

function fakeSupabase(initial = {}) {
  const tables = { gym_exercises: [], gym_workouts: [], gym_sets: [], ...initial };
  let clock = 0;
  const sv = {
    tables, ops: [], mode: 'ok', conflicts: null, epoch: 1,
    from(table) {
      const query = {
        select() { return query; },
        order() { return query; },
        async range(from, to) { const rows = tables[table] || []; return { data: rows.slice(from, to + 1), error: null, count: rows.length }; },
        async maybeSingle() { return { data: { epoch: sv.epoch }, error: null }; },
      };
      return query;
    },
    async rpc(_fn, { op }) {
      sv.ops.push(op);
      if (sv.mode === 'network') throw new TypeError('Failed to fetch');
      if (sv.mode === 'conflict') return { data: { status: 'conflict', conflicts: sv.conflicts }, error: null, status: 200 };
      if (sv.mode === 'error') return { data: null, error: { message: 'check constraint violated' }, status: 400 };
      const rows = [];
      for (const c of op.changes) {
        const list = tables[c.table];
        const i = list.findIndex(r => r.id === c.id);
        const updated_at = `2026-11-05T00:00:${String(++clock).padStart(2, '0')}Z`;
        if (c.action === 'delete') { if (i >= 0) list.splice(i, 1); rows.push({ table: c.table, id: c.id, action: 'delete', updated_at: null }); continue; }
        if (c.action === 'insert') list.push({ id: c.id, ...c.row, updated_at });
        else list[i] = { ...list[i], ...c.row, updated_at };
        rows.push({ table: c.table, id: c.id, action: c.action, updated_at });
      }
      return { data: { status: 'applied', op_id: op.id, rows }, error: null, status: 200 };
    },
  };
  return sv;
}

function fakeStorage() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m };
}

let sv, ui, storage, n;
function setup(initial) {
  sv = fakeSupabase(initial);
  storage = fakeStorage();
  n = 0;
  ui = { banners: [], hidden: 0, renders: 0, statuses: 0, showBanner(msg, actions) { this.banners.push({ msg, actions }); }, hideBanner() { this.hidden++; }, renderCurrentSection() { this.renders++; }, updateSyncStatus() { this.statuses++; }, downloadJson() {} };
  initSync({ supa: sv, ui, storagePrefix: 'gym:', storage, newId: () => `id-${++n}`, now: () => new Date('2026-11-05T00:00:00Z') });
  Object.assign(state, { sets: [], workouts: [], exercises: [], server: null, outbox: [], currentUser: { id: 'u1', email: 'a@example.com' }, remoteReady: false, loadingRemote: false, sending: false, sendBlocked: null });
}
// commit のあとに自動で始まる送信が終わるのを待つ（そのあと、もう一度送る）
async function drain() {
  for (let i = 0; i < 50 && state.sending; i++) await new Promise(r => setTimeout(r, 0));
  await flushOutbox();
}
const ex = (id, name, position, deleted_at = null) => ({ id, name, position, deleted_at, updated_at: '2026-11-01T00:00:00Z' });
const set = (e, kg, reps) => ({ ex: e, kg, reps, rpe: null, note: '' });

beforeEach(() => setup({ gym_exercises: [ex('e1', 'ベンチ', 0), ex('e2', 'スクワット', 1)] }));

test('読み込み: サーバーの行から画面の形ができ、端末に写しを保存する', async () => {
  await loadRemote();
  assert.deepEqual(state.exercises, ['ベンチ', 'スクワット']);
  assert.equal(state.remoteReady, true);
  assert.ok(loadStored('server'));
  assert.ok(ui.renders >= 1);
});

test('保存: 画面にすぐ出て、送り終えたらサーバーに入り、送信待ちは空になる', async () => {
  await loadRemote();
  assert.equal(commit(rows => saveWorkoutChanges(rows, [set('ベンチ', 60, 10)], new Date('2026-11-05T00:00:00Z'), () => `r-${++n}`)), true);
  assert.equal(state.workouts.length, 1, '送る前から画面に出る');
  assert.equal(state.outbox.length, 1);
  assert.equal(loadStored('outbox').length, 1, '送信待ちは端末に保存される');
  await drain();
  assert.equal(state.outbox.length, 0);
  assert.equal(sv.tables.gym_workouts.length, 1);
  assert.equal(sv.tables.gym_sets.length, 1);
  assert.equal(sv.tables.gym_sets[0].exercise_id, 'e1');
  assert.equal(state.workouts.length, 1);
  assert.equal(loadStored('outbox').length, 0);
});

test('読み込む前は保存できない（知らせを出して、積まない）', () => {
  assert.equal(commit(rows => addExerciseChanges(rows, 'x', () => 'x')), false);
  assert.equal(state.outbox.length, 0);
  assert.match(ui.banners.at(-1).msg, /読み込めていない/);
});

test('通信できないとき: 端末に残して知らせ、つながったら送る', async () => {
  await loadRemote();
  sv.mode = 'network';
  commit(rows => addExerciseChanges(rows, 'デッド', () => 'new-ex'));
  await drain();
  assert.equal(state.outbox.length, 1);
  assert.match(ui.banners.at(-1).msg, /通信できない/);
  assert.equal(state.exercises.at(-1), 'デッド', '送れていなくても画面には出ている');
  sv.mode = 'ok';
  await drain();
  assert.equal(state.outbox.length, 0);
  assert.ok(sv.tables.gym_exercises.some(r => r.name === 'デッド'));
});

test('続けた操作は順に送る。送る前の行を、あとの操作が変えても base が決まる（追加して、すぐ消す）', async () => {
  await loadRemote();
  commit(rows => addExerciseChanges(rows, 'デッド', () => 'new-ex'));
  commit(rows => deleteExerciseChanges(rows, 'デッド', '2026-11-05T00:00:00Z'));
  assert.equal(state.outbox.length, 2);
  assert.ok(state.outbox[1].changes[0].base.startsWith('pending:'));
  await drain();
  assert.equal(state.outbox.length, 0);
  assert.equal(sv.ops.length, 2);
  assert.ok(!sv.ops[1].changes[0].base.startsWith('pending:'), '送るときには、サーバーの updated_at になっている');
  assert.ok(sv.tables.gym_exercises.find(r => r.name === 'デッド').deleted_at);
  assert.ok(!state.exercises.includes('デッド'));
});

test('トレーニングを消す: セットが先、記録があとの順に送る', async () => {
  await loadRemote();
  commit(rows => saveWorkoutChanges(rows, [set('ベンチ', 60, 10), set('スクワット', 100, 5)], new Date('2026-11-05T00:00:00Z'), () => `r-${++n}`));
  await drain();
  const w = state.workouts[0];
  assert.equal(commit(rows => deleteWorkoutChanges(rows, w.id)), true);
  await drain();
  assert.deepEqual(sv.ops.at(-1).changes.map(c => c.table), ['gym_sets', 'gym_sets', 'gym_workouts']);
  assert.equal(sv.tables.gym_workouts.length, 0);
  assert.equal(sv.tables.gym_sets.length, 0);
});

test('競合: 送るのを止めて選んでもらい、「サーバーの内容にする」で送信待ちを捨てる', async () => {
  await loadRemote();
  sv.mode = 'conflict';
  sv.conflicts = [{ index: 1, table: 'gym_exercises', id: 'e1', reason: 'changed', server: sv.tables.gym_exercises[0] }];
  commit(rows => deleteExerciseChanges(rows, 'ベンチ', '2026-11-05T00:00:00Z'));
  await drain();
  assert.equal(state.sendBlocked, 'conflict');
  assert.deepEqual(ui.banners.at(-1).actions.map(a => a.label), ['サーバーの内容にする', 'この端末の内容で上書き']);
  assert.equal(state.outbox.length, 1, '勝手に捨てない');
  sv.mode = 'ok';
  await useServerVersion();
  assert.equal(state.outbox.length, 0);
  assert.equal(state.sendBlocked, null);
  assert.ok(state.exercises.includes('ベンチ'), 'サーバーの内容に戻る');
});

test('サーバーが受け付けない: 止めて、「捨てる」で続きを送れる', async () => {
  await loadRemote();
  sv.mode = 'error';
  commit(rows => addExerciseChanges(rows, 'デッド', () => 'new-ex'));
  await drain();
  assert.equal(state.sendBlocked, 'error');
  assert.match(ui.banners.at(-1).msg, /check constraint/);
  ui.banners.at(-1).actions[0].onclick(); // この変更を捨てる
  assert.equal(state.outbox.length, 0);
  assert.equal(state.sendBlocked, null);
});

test('作れない操作は積まず、入力中の状態を変えない', async () => {
  await loadRemote();
  assert.equal(commit(rows => saveWorkoutChanges(rows, [set('ベンチ', 60, 0)], new Date(), () => `r-${++n}`)), false);
  assert.equal(state.outbox.length, 0);
  assert.match(ui.banners.at(-1).msg, /回数が範囲外/);
});

// ---------- この端末の古い記録 ----------

const legacyW = { date: '2026-10-01T09:00:00.000Z', sets: [{ ex: 'ベンチ', kg: 60, reps: 10, rpe: '8', note: '' }] };
function legacyUi() {
  return { banners: [], hidden: 0, toasts: [], showBanner(msg, actions) { this.banners.push({ msg, actions }); }, hideBanner() { this.hidden++; }, toast(m) { this.toasts.push(m); } };
}

test('古い記録: サーバーにまだないものがあれば案内し、移すと入る。端末の記録は消さない', async () => {
  await loadRemote();
  const store = fakeStorage();
  store.setItem('gw', JSON.stringify([legacyW]));
  store.setItem('gw_ex', JSON.stringify(['ベンチ', '新しい種目']));
  const lui = legacyUi();
  offerLegacyImport(lui, store);
  assert.match(lui.banners[0].msg, /1件/);
  lui.banners[0].actions[0].onclick(); // サーバーに移す
  await drain();
  assert.equal(sv.tables.gym_workouts.length, 1);
  assert.equal(sv.tables.gym_sets[0].rpe, 8);
  assert.ok(sv.tables.gym_exercises.some(r => r.name === '新しい種目' && !r.deleted_at));
  assert.ok(store.getItem('gw'), '端末の記録は残す');
  assert.match(lui.toasts[0], /1件/);
  // もう一度案内しても、足す記録がなければ出ない（二重にならない）
  const lui2 = legacyUi();
  offerLegacyImport(lui2, store);
  assert.equal(lui2.banners.length, 0);
});

test('古い記録: 端末に記録がなければ何も出さない', async () => {
  await loadRemote();
  const lui = legacyUi();
  offerLegacyImport(lui, fakeStorage());
  assert.equal(lui.banners.length, 0);
});

test('currentRows: 送信待ちが重なる', async () => {
  await loadRemote();
  commit(rows => addExerciseChanges(rows, 'デッド', () => 'new-ex'));
  assert.equal(currentRows().gym_exercises.length, 3);
  assert.equal(state.server.rows.gym_exercises.length, 2);
});
