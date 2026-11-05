// 保存・送信・読み込みの流れ。作りは maney-app の src/sync.ts と同じ。
// - DOM には触らず、起動するときに渡す UiPort だけを呼ぶ（バナーのボタンで動かす操作も、ここで作って渡す）
// - サーバーの写し（server）: gym の3つのテーブルから読んだ行と、その updated_at
// - 送信待ち（outbox）: まだ送れていない操作の列。この端末に保存し、再起動しても残す
// - 画面のデータ（state.workouts・exercises）: サーバーの写しに送信待ちを重ねた行から作る（src/gym-rows.ts）
// - 保存: 画面の操作を変更の列にして（commit）、送信待ちに積み、順に apply_op で送る
import {
  acknowledge, applyOutbox, checkChanges, discardOp, loadAllTables, makeOp, rewriteForOverwrite, sendOp,
  type Change, type Conflict, type Op, type Rows, type Server, type SupaClient,
} from './data.ts';
import { rowsToView } from './gym-rows.ts';
import { state } from './state.ts';

/** 同期のバナーのボタン */
export interface BannerAction { label: string; onclick: () => unknown; primary?: boolean }

/** 流れが画面に頼むこと */
export interface UiPort {
  showBanner(msg: string, actions: BannerAction[]): void;
  hideBanner(): void;
  /** 開いている画面を描き直す */
  renderCurrentSection(): void;
  /** 送信待ちの件数を出し直す */
  updateSyncStatus(): void;
  /** JSON のファイルにして保存させる */
  downloadJson(name: string, text: string): void;
}

export interface SyncDeps {
  supa: SupaClient;
  ui: UiPort;
  /** 端末の保存場所のキーの頭（src/env.ts） */
  storagePrefix: string;
  /** テストで差し替える */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  newId?(): string;
  now?(): Date;
}

type Deps = Required<SyncDeps>;
let deps: Deps | null = null;

/** 起動するときに src/main.ts が1回呼ぶ（テストは何度でも呼んでよい） */
export function initSync(d: SyncDeps): void {
  deps = {
    storage: globalThis.localStorage,
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
    ...d,
  };
}

function need(): Deps {
  if (!deps) throw new Error('保存の流れ（src/sync.ts）を、initSync の前に使いました');
  return deps;
}

function errText(e: unknown): string {
  const m = e && typeof e === 'object' ? (e as { message?: unknown }).message : undefined;
  return m ? String(m) : String(e);
}

/** 新しい ID（行・操作の ID） */
export function newId(): string { return need().newId(); }

const TABLE_LABELS: Record<string, string> = { gym_exercises: '種目', gym_workouts: 'トレーニング', gym_sets: 'セット' };

// ---------- 端末の保存場所 ----------

/** ログイン中のユーザーの、端末の保存場所のキー（`<頭><ユーザーの id>:<name>`） */
export function userKey(name: string): string {
  if (!state.currentUser) throw new Error('ログインしていないので、端末の保存場所を決められません');
  return `${need().storagePrefix}${state.currentUser.id}:${name}`;
}

/** サーバーの写し・送信待ちのキー */
function storageKey(name: string): string { return userKey(`v1:${name}`); }

export function loadStored<T = unknown>(name: string): T | null {
  try {
    const s = need().storage.getItem(storageKey(name));
    return s ? JSON.parse(s) as T : null;
  } catch { return null; }
}

export function store(name: string, value: unknown): void {
  const { storage, ui } = need();
  try { storage.setItem(storageKey(name), JSON.stringify(value)); }
  catch (e) {
    console.warn('端末に保存できませんでした:', e);
    ui.showBanner('この端末に保存できませんでした（容量がいっぱいかもしれません）。送れていない変更は、アプリを閉じると消えます。',
      [{ label: '閉じる', onclick: () => ui.hideBanner() }]);
  }
}

// ---------- 今の行と画面の形 ----------

/** 今の行（サーバーの写しに、送信待ちを重ねたもの）。まだサーバーから読み込めていないときは空 */
export function currentRows(): Rows {
  return state.server ? applyOutbox(state.server.rows, state.outbox) : {};
}

/** 今の行から、画面の形（記録・種目）を作り直す。サーバーの写しがなければ false */
export function rebuildView(): boolean {
  if (!state.server) return false;
  const view = rowsToView(currentRows());
  state.workouts = view.workouts;
  state.exercises = view.exercises;
  return true;
}

// ---------- 保存 ----------

function showNotLoaded(): void {
  need().ui.showBanner('まだサーバーから読み込めていないので、保存できません。',
    [{ label: 'もう一度読み込む', onclick: loadRemote, primary: true }]);
}

/**
 * 保存: 画面の操作を変更の列にして（build に今の行を渡す）、送信待ちに積んで送る。
 * 複数の操作（Change[][]）を返すと、順に別々の操作にする（取り込みなど、1回の上限を超えるとき）。
 * 保存できたら true。できなければ知らせを出して false（送信待ちには積まない。変更の列を作れなかったときも同じ）
 */
export function commit(build: (rows: Rows) => Change[] | Change[][]): boolean {
  const { ui, now } = need();
  if (!state.server) { showNotLoaded(); return false; }
  const before = state.outbox;
  try {
    const built = build(currentRows());
    const ops = built.length > 0 && Array.isArray(built[0]) ? built as Change[][] : [built as Change[]];
    if (ops.every(c => c.length === 0)) return true; // 変える所がない
    const at = now().toISOString();
    for (const changes of ops) {
      const server = state.server;
      const op = makeOp(checkChanges(changes), { id: need().newId(), epoch: server.epoch, now: at, server, outbox: state.outbox });
      state.outbox = [...state.outbox, op];
    }
  } catch (e) {
    state.outbox = before; // 途中まで積んだ分も取り消す
    console.warn('保存できませんでした:', e);
    ui.showBanner('保存できませんでした。\n' + errText(e), [{ label: '閉じる', onclick: () => ui.hideBanner() }]);
    return false;
  }
  store('outbox', state.outbox);
  rebuildView();
  ui.renderCurrentSection(); // 取り込みなど、画面の外から変えたときも、開いている画面（種目の選択欄・前回の記録）に出す
  ui.updateSyncStatus();
  void flushOutbox();
  return true;
}

// ---------- 送る ----------

/** 送信待ちを、古いものから1つずつ送る */
export async function flushOutbox(): Promise<void> {
  if (!state.currentUser || state.sending || state.loadingRemote || state.sendBlocked || !state.outbox.length) return;
  const { supa, ui } = need();
  state.sending = true;
  try {
    while (state.outbox.length && !state.sendBlocked) {
      const op = state.outbox[0] as Op;
      const res = await sendOp(supa, op);
      if (res.kind === 'applied') {
        const server = state.server;
        if (!server) throw new Error('サーバーの写しがないまま、送った結果を受け取りました');
        const next = acknowledge({ server, outbox: state.outbox }, op, res.result);
        state.server = next.server;
        state.outbox = next.outbox;
        store('server', state.server);
        store('outbox', state.outbox);
      } else if (res.kind === 'conflict') {
        state.sendBlocked = 'conflict';
        showConflict(op, res.conflicts);
      } else if (res.kind === 'stale_epoch') {
        state.sendBlocked = 'stale_epoch';
        showStaleEpoch();
      } else if (res.kind === 'network') {
        ui.showBanner(`通信できないため、送れていない変更が${state.outbox.length}件あります。この端末に残っていて、通信が戻ったら送ります。`,
          [{ label: 'もう一度送る', onclick: flushOutbox, primary: true }]);
        break;
      } else {
        state.sendBlocked = 'error';
        showSendError(op, res.error);
      }
    }
    if (!state.outbox.length) ui.hideBanner();
  } finally {
    state.sending = false;
    ui.updateSyncStatus();
  }
}

// ---------- 読み込む ----------

/**
 * サーバーから読み込む（起動時と、アプリに戻ってきたとき）。
 * すべてのテーブルを読み終えて件数が合ったときだけ、サーバーの写しを置き換える。送信待ちは、新しい写しに重ね直す
 */
export async function loadRemote(): Promise<void> {
  if (!state.currentUser || state.loadingRemote || state.sending) return;
  const { supa, ui } = need();
  state.loadingRemote = true;
  try {
    const server: Server = await loadAllTables(supa);
    state.server = server;
    store('server', server);
    state.remoteReady = true;
    rebuildView();
    if (!state.sendBlocked) ui.hideBanner();
    ui.renderCurrentSection();
  } catch (e) {
    console.warn('サーバーから読み込めませんでした:', e);
    ui.showBanner(
      (state.server ? 'サーバーから読み込めませんでした。前に読み込んだ内容を表示しています。' : 'サーバーから読み込めませんでした。')
        + '\n' + errText(e),
      [{ label: 'もう一度読み込む', onclick: loadRemote, primary: true }]);
  } finally {
    state.loadingRemote = false;
  }
}

/** アプリに戻ってきたとき・通信が戻ったとき: 送信待ちを送ってから、読み込み直す */
export async function resyncRemote(): Promise<void> {
  if (!state.currentUser) return;
  await flushOutbox();
  if (state.outbox.length) return;
  await loadRemote();
}

// ---------- 同期の知らせ（送れない・別の端末との競合） ----------

const CONFLICT_REASONS: Record<string, string> = {
  changed: '別の端末で変更されています',
  missing: '別の端末で削除されています',
  exists: 'すでにあります',
  duplicate: '同じ名前の種目が、別の端末で登録されています',
};

/** 別の端末の変更とぶつかった */
export function showConflict(op: Op, conflicts: Conflict[]): void {
  const lines = conflicts.map(c => `・${TABLE_LABELS[c.table] || c.table}: ${CONFLICT_REASONS[c.reason] || c.reason}`);
  need().ui.showBanner(
    '別の端末の変更とぶつかったため、この端末の変更を保存していません。\n' + lines.join('\n') + '\n\n' +
    '・サーバーの内容にする: この端末の送れていない変更は、すべて消えます\n' +
    '・この端末の内容で上書き: ぶつかった記録を、この端末の内容にします',
    [
      { label: 'サーバーの内容にする', onclick: useServerVersion },
      { label: 'この端末の内容で上書き', onclick: () => overwriteWithMine(op, conflicts) },
    ]);
}

/** 競合を解く: 送信待ちを捨てて、サーバーの内容を読み込み直す */
export async function useServerVersion(): Promise<void> {
  const { ui } = need();
  state.outbox = [];
  store('outbox', state.outbox);
  state.sendBlocked = null;
  ui.hideBanner();
  ui.updateSyncStatus();
  await loadRemote();
}

/** 競合を解く: ぶつかった記録を、この端末の内容で上書きして送り直す */
export async function overwriteWithMine(op: Op, conflicts: Conflict[]): Promise<void> {
  const { ui } = need();
  state.outbox = rewriteForOverwrite(state.outbox, op, conflicts, need().newId());
  store('outbox', state.outbox);
  state.sendBlocked = null;
  ui.hideBanner();
  rebuildView();
  ui.renderCurrentSection();
  await flushOutbox();
  if (!state.outbox.length) await loadRemote(); // 別の端末の、ほかの変更も読み込む
}

/** サーバーのデータが移し直された（移行の番号が上がった） */
export function showStaleEpoch(): void {
  need().ui.showBanner(
    `サーバーのデータが移し直されたため、この端末の送れていない変更（${state.outbox.length}件）は保存できません。\n` +
    '必要なら書き出して（JSON のファイル）から、捨てて読み込み直してください。',
    [
      { label: '書き出す', onclick: downloadOutbox },
      { label: '捨てて読み込み直す', onclick: useServerVersion, primary: true },
    ]);
}

/** 送信待ちを JSON のファイルにして保存する（捨てる前の退避） */
export function downloadOutbox(): void {
  const { ui, now } = need();
  ui.downloadJson('gym-outbox', JSON.stringify({ exportedAt: now().toISOString(), outbox: state.outbox }, null, 2));
}

function sendErrorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    if (e.message) return String(e.message);
    if (e.code) return String(e.code);
  }
  return String(error);
}

/** サーバーが受け付けなかった（制約違反など。送り直しても通らない） */
export function showSendError(op: Op, error: unknown): void {
  const { ui } = need();
  ui.showBanner(
    'サーバーがこの端末の変更を受け付けませんでした。\n' + sendErrorText(error) + '\n' +
    '・この変更を捨てる: この変更と、これを前提にしたあとの変更を捨てます',
    [
      { label: 'この変更を捨てる', onclick: () => {
        state.outbox = discardOp(state.outbox, op.id);
        store('outbox', state.outbox);
        state.sendBlocked = null;
        ui.hideBanner();
        rebuildView();
        ui.renderCurrentSection();
        void flushOutbox();
      } },
      { label: 'もう一度送る', onclick: () => { state.sendBlocked = null; ui.hideBanner(); void flushOutbox(); }, primary: true },
    ]);
}
