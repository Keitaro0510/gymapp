// 新しいテーブル（gym_exercises・gym_workouts・gym_sets）を読み書きするデータの層。
// 作りは maney-app の src/data.ts と同じ（サーバーの写し＋送信待ち＋ apply_op）。DB 側は maney-app の supabase/migrations（D23）。
// 画面のための変換（種目名 ↔ ID など）は src/gym-rows.ts に分けている。

// ---------- 型 ----------
/** DB の行。どのテーブルも id を持つ。updated_at はサーバーが決める（まだ送っていない行は null） */
export interface Row {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  [column: string]: unknown;
}
/** テーブルの名前 → 行の一覧（currentRows() の形） */
export type Rows = Record<string, Row[]>;

export type Action = 'insert' | 'update' | 'delete';
/** 1行の変更。base は、その行を読んだときの updated_at（前の送信待ちが変えた行は 'pending:<その操作の id>'） */
export interface Change { table: string; action: Action; id: string; base?: string | null; row?: Record<string, unknown> }
/** 送信待ちの操作（1回のユーザーの操作） */
export interface Op { id: string; epoch: number; createdAt: string; changes: Change[] }
/** サーバーの写し */
export interface Server { rows: Rows; epoch: number; loadedAt: string }

/** apply_op が返す、保存できた行の updated_at */
export interface AppliedResult { status: 'applied'; rows: { table: string; id: string; updated_at: string }[] }
/** apply_op が返す競合。index は changes の何番目か（1から）。table・id はぶつかった行 */
export interface Conflict { index: number; table: string; id: string; reason: string; server: Row | null }
type ApplyOpResult = AppliedResult | { status: 'conflict'; conflicts: Conflict[] } | { status: 'stale_epoch'; epoch: number };
export type SendResult =
  | { kind: 'applied'; result: AppliedResult }
  | { kind: 'conflict'; conflicts: Conflict[] }
  | { kind: 'stale_epoch'; epoch: number }
  | { kind: 'network' | 'error'; error: unknown };

// ---------- Supabase のクライアント（ここで使う分だけ）----------
export interface SupaError { message?: string }
export interface SupaResponse<T> { data: T | null; error: SupaError | null; count?: number | null; status?: number }
export interface SupaQuery {
  order(column: string): SupaQuery;
  range(from: number, to: number): PromiseLike<SupaResponse<Row[]>>;
  maybeSingle(): PromiseLike<SupaResponse<{ epoch: number }>>;
}
export interface SupaClient {
  from(table: string): { select(columns: string, options?: { count: 'exact' }): SupaQuery };
  rpc(fn: 'apply_op', args: { op: { id: string; epoch: number; changes: Change[] } }): PromiseLike<SupaResponse<ApplyOpResult>>;
}

/** 参照される側が先（種目・トレーニング → セット） */
export const TABLES: string[] = ['gym_exercises', 'gym_workouts', 'gym_sets'];

// Supabase が1回に返す件数には上限（既定は1,000件）があるので、それより小さく分けて読む
export const PAGE_SIZE = 500;
/** apply_op が1回の操作で受け付ける変更の数の上限 */
export const MAX_CHANGES_PER_OP = 500;

// 1つのテーブルを、決まった順番（position, id）でページに分けて読む。
// 件数を一緒に受け取り、読んだ行数と合うかを確かめる。合わなければエラーにする。
export async function loadTable(supa: SupaClient, table: string, pageSize = PAGE_SIZE): Promise<Row[]> {
  const rows: Row[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += pageSize) {
    const query = supa.from(table).select('*', { count: 'exact' }).order('position').order('id');
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    if (typeof count !== 'number') throw new Error(`${table}: 件数を受け取れませんでした`);
    if (total === null) total = count;
    else if (count !== total) throw new Error(`${table}: 読んでいる間に件数が変わりました（${total} → ${count}）`);
    if (!data) throw new Error(`${table}: 行を受け取れませんでした`);
    rows.push(...data);
    if (data.length < pageSize || rows.length >= total) break;
  }
  if (rows.length !== total) throw new Error(`${table}: 読んだ行数（${rows.length}）が件数（${total}）と合いません`);
  return rows;
}

// 全テーブルと移行の番号を読む。1つでも失敗したら全体を失敗にする。
// 呼んだ側は、成功したときだけサーバーの写しを置き換える（読めなかった行を「消えた」と扱わない）。
export async function loadAllTables(supa: SupaClient, pageSize = PAGE_SIZE): Promise<Server> {
  const lists = await Promise.all(TABLES.map(t => loadTable(supa, t, pageSize)));
  const rows: Rows = {};
  TABLES.forEach((t, i) => { rows[t] = lists[i] ?? []; });

  const { data, error } = await supa.from('sync_state').select('epoch').maybeSingle();
  if (error) throw error;
  return { rows, epoch: data ? data.epoch : 1, loadedAt: new Date().toISOString() };
}

// ============================================================
// 保存（送信待ちの操作と apply_op）
//
// 手元に持つもの:
// - サーバーの写し（server.rows）: サーバーが保存できたと返した行と、その updated_at
// - 送信待ち（outbox）: まだ送れていない操作の列。端末に保存し、再起動しても残す
// - 今の行: サーバーの写しに、送信待ちの操作を重ねたもの（applyOutbox）
//
// 操作: { id, epoch, createdAt, changes: [{ table, action, id, base?, row? }] }
// - 1回のユーザーの操作を1つの操作にする。行の内容はすべて入れて固定する（送っている間に編集しても変わらない）
// - base は、その行を読んだときの updated_at。前の送信待ちの操作が変えた行は 'pending:<その操作の id>' にしておき、
//   その操作が保存できたら、返ってきた updated_at に置き換える
// ============================================================

// サーバーが決める列（送らない・比べない）
const SERVER_COLUMNS = ['id', 'user_id', 'created_at', 'updated_at'];
const PENDING = 'pending:';
const keyOf = (table: string, id: string): string => `${table}:${id}`;

// 変更の列を確かめる。正しくなければエラーにする（送信待ちに積まない）
// - テーブルは gym_ の3つだけ。id があり、追加と更新には行の中身（row）がある。サーバーが決める列は入れない
export function checkChanges(changes: unknown): Change[] {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('保存する変更がありません');
  if (changes.length > MAX_CHANGES_PER_OP) throw new Error(`1つの操作の変更は${MAX_CHANGES_PER_OP}件までです（${changes.length}件）`);
  const seen = new Set<string>();
  for (const c of changes as Change[]) {
    if (!TABLES.includes(c.table)) throw new Error(`${c.table} は保存できません`);
    if (!['insert', 'update', 'delete'].includes(c.action)) throw new Error(`action が正しくありません: ${c.action}`);
    if (!c.id) throw new Error(`${c.table} の行の id がありません`);
    if (seen.has(keyOf(c.table, c.id))) throw new Error(`${c.table} の行 ${c.id} を1つの操作で2回変えています`);
    seen.add(keyOf(c.table, c.id));
    if (c.action !== 'delete') {
      if (!c.row || typeof c.row !== 'object') throw new Error(`${c.table} の行 ${c.id} の中身がありません`);
      const bad = Object.keys(c.row).filter(k => SERVER_COLUMNS.includes(k));
      if (bad.length) throw new Error(`サーバーが決める列は送れません: ${bad.join(', ')}`);
    }
  }
  return changes as Change[];
}

// 変更の列を、送信待ちの操作にする（base を付ける）
export function makeOp(changes: Change[], { id, epoch, now, server, outbox }: { id: string; epoch: number; now: string; server: Server; outbox: Op[] }): Op {
  const touched = new Map<string, string>();
  for (const op of outbox) for (const c of op.changes) touched.set(keyOf(c.table, c.id), op.id);
  const serverRows = new Map<string, Row>();
  for (const table of TABLES) for (const r of server.rows[table] || []) serverRows.set(keyOf(table, r.id), r);
  return {
    id, epoch, createdAt: now,
    changes: changes.map(c => {
      if (c.action === 'insert') return c;
      const key = keyOf(c.table, c.id);
      const pending = touched.get(key);
      const base = pending !== undefined ? PENDING + pending : serverRows.get(key)?.updated_at;
      if (!base) throw new Error(`${c.table} の行 ${c.id} の、読み込んだときの状態がわかりません`);
      return { ...c, base };
    }),
  };
}

// 行の集まりに変更を重ねる（元の集まりは変えない）
export function applyChanges(rows: Rows, changes: Change[], createdAt: string): Rows {
  const out: Rows = { ...rows };
  const copied = new Set<string>();
  for (const c of changes) {
    if (!copied.has(c.table)) { out[c.table] = [...(out[c.table] || [])]; copied.add(c.table); }
    const list = out[c.table] as Row[];
    const i = list.findIndex(r => r.id === c.id);
    const cur = list[i];
    if (c.action === 'delete') {
      if (i >= 0) list.splice(i, 1);
    } else if (c.action === 'insert') {
      if (cur) list[i] = { ...cur, ...c.row };
      else list.push({ id: c.id, ...c.row, created_at: createdAt, updated_at: null });
    } else if (cur) {
      // 消えた行の更新は重ねない（送ると競合になり、そこで選んでもらう）
      list[i] = { ...cur, ...c.row };
    }
  }
  return out;
}

// サーバーの写しに、送信待ちの操作を順に重ねた「今の行」
export function applyOutbox(rows: Rows, outbox: Op[]): Rows {
  return outbox.reduce((acc, op) => applyChanges(acc, op.changes, op.createdAt), rows);
}

// 送ってよい状態か（base がすべて決まっているか）
export const isReady = (op: Op): boolean => op.changes.every(c => !(typeof c.base === 'string' && c.base.startsWith(PENDING)));

// 操作が保存できた: サーバーの写しを更新し、送信待ちから外し、あとの操作の base を決める
export function acknowledge({ server, outbox }: { server: Server; outbox: Op[] }, op: Op, result: Pick<AppliedResult, 'rows'>): { server: Server; outbox: Op[] } {
  const updatedAt = new Map(result.rows.map(r => [keyOf(r.table, r.id), r.updated_at]));
  const rows: Rows = { ...server.rows };
  const copied = new Set<string>();
  for (const c of op.changes) {
    if (!copied.has(c.table)) { rows[c.table] = [...(rows[c.table] || [])]; copied.add(c.table); }
    const list = rows[c.table] as Row[];
    const i = list.findIndex(r => r.id === c.id);
    if (c.action === 'delete') {
      if (i >= 0) list.splice(i, 1);
      continue;
    }
    const prev: Row = list[i] ?? { id: c.id, created_at: op.createdAt };
    const row: Row = { ...prev, ...c.row, updated_at: updatedAt.get(keyOf(c.table, c.id)) };
    if (i >= 0) list[i] = row; else list.push(row);
  }
  const rest = outbox.filter(o => o.id !== op.id).map(o => ({
    ...o,
    changes: o.changes.map(c => (c.base === PENDING + op.id
      ? { ...c, base: updatedAt.get(keyOf(c.table, c.id)) }
      : c)),
  }));
  return { server: { ...server, rows }, outbox: rest };
}

// 競合した操作を「この端末の内容で上書き」する形に書き換える（新しい操作 ID を付ける）
// - changed: 今のサーバーの版（updated_at）を基準にして送り直す
// - missing: 別の端末が消した行を作り直す（追加にする）
// - exists: すでにある行を、この端末の内容で更新する
// - duplicate: 一意制約に当たったサーバーの行（同じ名前の種目）を、この端末の内容で更新する（あとの操作の ID も付け替える）
export function rewriteForOverwrite(outbox: Op[], op: Op, conflicts: Conflict[], newOpId: string): Op[] {
  const remaps: { from: string; to: string }[] = [];
  const changes = op.changes.map((c, i): Change => {
    const conflict = conflicts.find(x => x.index === i + 1);
    if (!conflict) return c;
    const server = conflict.server;
    switch (conflict.reason) {
      case 'changed': return server ? { ...c, base: server.updated_at } : c;
      case 'missing': return { table: c.table, action: 'insert', id: c.id, row: c.row };
      case 'exists': return server ? { ...c, action: 'update', base: server.updated_at } : c;
      case 'duplicate':
        if (!server) return c;
        remaps.push({ from: c.id, to: server.id });
        return { ...c, action: 'update', id: server.id, base: server.updated_at };
      default: return c;
    }
  });
  const rewritten = { ...op, id: newOpId, changes };
  let result = outbox.map(o => (o.id === op.id ? rewritten : o));
  for (const { from, to } of remaps) result = remapId(result, from, to);
  return result;
}

// 送れない操作を捨てる。その操作を前提にした（base が 'pending:<その操作>' の）あとの操作も、続けて捨てる
export function discardOp(outbox: Op[], opId: string): Op[] {
  const dropped = new Set([opId]);
  for (const op of outbox) {
    const dependsOnDropped = op.changes.some(c => typeof c.base === 'string' && c.base.startsWith(PENDING)
      && dropped.has(c.base.slice(PENDING.length)));
    if (dependsOnDropped) dropped.add(op.id);
  }
  return outbox.filter(op => !dropped.has(op.id));
}

// 行の id を付け替える（行そのものと、ほかの行からの参照）
export function remapId(outbox: Op[], from: string, to: string): Op[] {
  const swap = <T>(v: T): T | string => (v === from ? to : v);
  return outbox.map(o => ({
    ...o,
    changes: o.changes.map(c => {
      const next: Change = { ...c, id: swap(c.id) };
      if (c.row) {
        next.row = { ...c.row };
        for (const k of ['exercise_id', 'workout_id']) if (k in next.row) next.row[k] = swap(next.row[k]);
      }
      return next;
    }),
  }));
}

// 操作を1つ送る。結果の種類: applied・conflict・stale_epoch・network（あとで送り直す）・error（送り直しても通らない）
export async function sendOp(supa: SupaClient, op: Op): Promise<SendResult> {
  if (!isReady(op)) throw new Error('前の操作がまだ保存できていません');
  let response: SupaResponse<ApplyOpResult>;
  try {
    response = await supa.rpc('apply_op', { op: { id: op.id, epoch: op.epoch, changes: op.changes } });
  } catch (e) {
    return { kind: 'network', error: e };
  }
  const { data, error, status } = response;
  if (error) {
    const offline = !status || status >= 500 || /fetch|network|load failed/i.test(error.message || '');
    return { kind: offline ? 'network' : 'error', error };
  }
  if (data && data.status === 'applied') return { kind: 'applied', result: data };
  if (data && data.status === 'conflict') return { kind: 'conflict', conflicts: data.conflicts };
  if (data && data.status === 'stale_epoch') return { kind: 'stale_epoch', epoch: data.epoch };
  return { kind: 'error', error: new Error('apply_op の結果の形が違います') };
}
