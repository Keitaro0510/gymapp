// データの層（src/data.ts）のテスト。Supabase の代わりに、ページ分けと件数を真似る偽物を使う
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLES, loadTable, loadAllTables, checkChanges, makeOp, applyOutbox, acknowledge, discardOp, rewriteForOverwrite, remapId, sendOp, isReady,
} from '../src/data.ts';

function fakeSupabase(tables, options = {}) {
  let requests = 0;
  return {
    from(table) {
      const query = {
        select() { return query; },
        order() { return query; },
        async range(from, to) {
          requests += 1;
          if (options.errorTable === table) return { data: null, error: new Error(`${table} を読めない`), count: null };
          const rows = tables[table] || [];
          const count = options.countAfterFirstPage && requests > 1 ? rows.length + 1 : rows.length;
          return { data: rows.slice(from, to + 1), error: null, count };
        },
        async maybeSingle() { return { data: { epoch: 3 }, error: null }; },
      };
      return query;
    },
  };
}

const sets = Array.from({ length: 1201 }, (_, i) => ({ id: `id-${String(i).padStart(4, '0')}`, position: i }));

test('対象のテーブルは gym_ の3つ（参照される側が先）', () => {
  assert.deepEqual(TABLES, ['gym_exercises', 'gym_workouts', 'gym_sets']);
});

test('ページに分けて最後まで読み、件数と合うことを確かめる', async () => {
  assert.deepEqual(await loadTable(fakeSupabase({ gym_sets: sets }), 'gym_sets', 500), sets);
});

test('読んでいる間に件数が変わったら失敗にする', async () => {
  await assert.rejects(loadTable(fakeSupabase({ gym_sets: sets }, { countAfterFirstPage: true }), 'gym_sets', 500), /件数が変わりました/);
});

test('全部読む: 1つでも失敗したら全体を失敗にし、移行の番号も読む', async () => {
  const ok = await loadAllTables(fakeSupabase({ gym_sets: sets.slice(0, 3) }));
  assert.equal(ok.epoch, 3);
  assert.equal(ok.rows.gym_sets.length, 3);
  assert.deepEqual(Object.keys(ok.rows), TABLES);
  await assert.rejects(loadAllTables(fakeSupabase({}, { errorTable: 'gym_workouts' })), /gym_workouts を読めない/);
});

test('変更の確かめ: gym_ 以外・id なし・同じ行の2回・サーバーの列・500件超は断る', () => {
  const ins = { table: 'gym_exercises', action: 'insert', id: 'a', row: { name: 'x' } };
  assert.equal(checkChanges([ins]).length, 1);
  assert.throws(() => checkChanges([]), /変更がありません/);
  assert.throws(() => checkChanges([{ ...ins, table: 'tasks' }]), /保存できません/);
  assert.throws(() => checkChanges([{ ...ins, id: '' }]), /id がありません/);
  assert.throws(() => checkChanges([ins, ins]), /2回/);
  assert.throws(() => checkChanges([{ ...ins, row: { user_id: 'u' } }]), /サーバーが決める列/);
  assert.throws(() => checkChanges(Array.from({ length: 501 }, (_, i) => ({ ...ins, id: `i${i}` }))), /500件/);
});

const server = () => ({ epoch: 1, loadedAt: 'x', rows: { gym_exercises: [{ id: 'e1', name: 'a', updated_at: 'T1' }], gym_workouts: [], gym_sets: [] } });

test('操作の base: サーバーの updated_at、前の送信待ちが変えた行は pending:', () => {
  const s = server();
  const op1 = makeOp([{ table: 'gym_exercises', action: 'update', id: 'e1', row: { name: 'b' } }], { id: 'o1', epoch: 1, now: 'N', server: s, outbox: [] });
  assert.equal(op1.changes[0].base, 'T1');
  const op2 = makeOp([{ table: 'gym_exercises', action: 'delete', id: 'e1' }], { id: 'o2', epoch: 1, now: 'N', server: s, outbox: [op1] });
  assert.equal(op2.changes[0].base, 'pending:o1');
  assert.equal(isReady(op2), false);
  assert.throws(() => makeOp([{ table: 'gym_exercises', action: 'update', id: 'ない', row: {} }], { id: 'o3', epoch: 1, now: 'N', server: s, outbox: [] }), /状態がわかりません/);
  assert.equal(applyOutbox(s.rows, [op1]).gym_exercises[0].name, 'b');
  assert.equal(s.rows.gym_exercises[0].name, 'a', '元の写しは変えない');
});

test('保存できた: 写しを更新し、あとの操作の base を決める', () => {
  const s = server();
  const op1 = makeOp([{ table: 'gym_exercises', action: 'update', id: 'e1', row: { name: 'b' } }], { id: 'o1', epoch: 1, now: 'N', server: s, outbox: [] });
  const op2 = makeOp([{ table: 'gym_exercises', action: 'delete', id: 'e1' }], { id: 'o2', epoch: 1, now: 'N', server: s, outbox: [op1] });
  const next = acknowledge({ server: s, outbox: [op1, op2] }, op1, { rows: [{ table: 'gym_exercises', id: 'e1', updated_at: 'T2' }] });
  assert.equal(next.server.rows.gym_exercises[0].updated_at, 'T2');
  assert.equal(next.outbox.length, 1);
  assert.equal(next.outbox[0].changes[0].base, 'T2');
  assert.equal(isReady(next.outbox[0]), true);
});

test('捨てる: その操作を前提にしたあとの操作も捨てる', () => {
  const s = server();
  const op1 = makeOp([{ table: 'gym_exercises', action: 'update', id: 'e1', row: { name: 'b' } }], { id: 'o1', epoch: 1, now: 'N', server: s, outbox: [] });
  const op2 = makeOp([{ table: 'gym_exercises', action: 'delete', id: 'e1' }], { id: 'o2', epoch: 1, now: 'N', server: s, outbox: [op1] });
  const other = { id: 'o3', epoch: 1, createdAt: 'N', changes: [{ table: 'gym_exercises', action: 'insert', id: 'z', row: { name: 'z' } }] };
  assert.deepEqual(discardOp([op1, op2, other], 'o1').map(o => o.id), ['o3']);
});

test('上書き: 同じ名前の種目が別の端末にあったとき、その行に合わせ、セットの参照も付け替える', () => {
  const op = { id: 'o1', epoch: 1, createdAt: 'N', changes: [{ table: 'gym_exercises', action: 'insert', id: 'mine', row: { name: 'ベンチ', position: 0, deleted_at: null } }] };
  const setOp = { id: 'o2', epoch: 1, createdAt: 'N', changes: [{ table: 'gym_sets', action: 'insert', id: 's1', row: { workout_id: 'w', exercise_id: 'mine', kg: 1, reps: 1 } }] };
  const out = rewriteForOverwrite([op, setOp], op, [{ index: 1, table: 'gym_exercises', id: 'mine', reason: 'duplicate', server: { id: 'theirs', updated_at: 'T9' } }], 'o9');
  assert.equal(out[0].id, 'o9');
  assert.deepEqual([out[0].changes[0].action, out[0].changes[0].id, out[0].changes[0].base], ['update', 'theirs', 'T9']);
  assert.equal(out[1].changes[0].row.exercise_id, 'theirs');
  assert.equal(remapId([setOp], 'mine', 'x')[0].changes[0].row.exercise_id, 'x');
});

test('送信の結果: applied・conflict・stale_epoch・通信できない・サーバーの拒否を区別する', async () => {
  const op = { id: 'o1', epoch: 1, createdAt: 'N', changes: [{ table: 'gym_exercises', action: 'insert', id: 'a', row: {} }] };
  const rpc = response => ({ rpc: async () => (response instanceof Error ? Promise.reject(response) : response) });
  assert.equal((await sendOp(rpc({ data: { status: 'applied', rows: [] }, error: null }), op)).kind, 'applied');
  assert.equal((await sendOp(rpc({ data: { status: 'conflict', conflicts: [] }, error: null }), op)).kind, 'conflict');
  assert.equal((await sendOp(rpc({ data: { status: 'stale_epoch', epoch: 2 }, error: null }), op)).kind, 'stale_epoch');
  assert.equal((await sendOp(rpc(new TypeError('Failed to fetch')), op)).kind, 'network');
  assert.equal((await sendOp(rpc({ data: null, error: { message: 'x' }, status: 503 }), op)).kind, 'network');
  assert.equal((await sendOp(rpc({ data: null, error: { message: 'bad' }, status: 400 }), op)).kind, 'error');
});
