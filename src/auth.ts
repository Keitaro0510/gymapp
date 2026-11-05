// ログインと起動の流れ。作りは maney-app の src/auth.ts と同じ。
// - ログインの状態は maney-app と共有する（保存キーが同じ。src/env.ts）。maney-app でログイン済みなら、ここでもログイン済みになる
// - DOM には触らず、src/main.ts から渡す AuthUi だけを呼ぶ
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Op, Server } from './data.ts';
import { state } from './state.ts';
import { flushOutbox, loadRemote, loadStored, rebuildView, type UiPort } from './sync.ts';

/** 流れが画面に頼むこと */
export interface AuthUi extends Pick<UiPort, 'updateSyncStatus'> {
  showLogin(): void;
  /** ログイン画面を閉じ、アプリを出す */
  hideLogin(user: User): void;
  /** 端末の写しで、最初の画面を描く */
  renderFirst(): void;
  /** サーバーから読み込んで送り終えたあとに呼ぶ（この端末の古い記録の案内） */
  afterSync(): void;
}

export interface AuthDeps {
  supa: Pick<SupabaseClient, 'auth'>;
  ui: AuthUi;
  /** ログインしたあとに戻る場所 */
  currentUrl?(): string;
}

type Deps = Required<AuthDeps>;
let deps: Deps | null = null;

/** 起動するときに src/main.ts が1回呼ぶ（テストは何度でも呼んでよい） */
export function initAuth(d: AuthDeps): void {
  deps = { currentUrl: () => globalThis.location.origin + globalThis.location.pathname, ...d };
}

function need(): Deps {
  if (!deps) throw new Error('ログインの流れ（src/auth.ts）を、initAuth の前に使いました');
  return deps;
}

export async function loginWithGoogle(): Promise<void> {
  const { supa, currentUrl } = need();
  await supa.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: currentUrl() }, // ログイン後に、このアプリに戻る
  });
}

/** ログインした直後: 端末に保存したサーバーの写しと送信待ちをすぐ表示し、そのあとサーバーから読み込んで送る */
export async function startWithUser(user: User): Promise<void> {
  const { ui } = need();
  state.currentUser = user;
  ui.hideLogin(user);
  state.server = loadStored<Server>('server');
  state.outbox = loadStored<Op[]>('outbox') || [];
  rebuildView();
  ui.updateSyncStatus();
  ui.renderFirst();
  await loadRemote();
  await flushOutbox();
  ui.afterSync();
}

/** アプリを開いたとき（src/main.ts が最後に1回呼ぶ） */
export async function loadData(): Promise<void> {
  const { supa, ui } = need();
  const { data: { session } } = await supa.auth.getSession();
  let initialLoadDone = false;

  if (session) {
    initialLoadDone = true;
    await startWithUser(session.user);
  } else {
    ui.showLogin();
  }

  // 認証状態の変化を監視（ログイン後のリダイレクト時に発火。maney-app でログアウトしたときにも）
  supa.auth.onAuthStateChange(async (event: string, session: Session | null) => {
    if (event === 'SIGNED_IN' && session) {
      // 初回ログイン時だけ読み込む（アプリ復帰時の再発火を防ぐ）
      if (!initialLoadDone) {
        initialLoadDone = true;
        await startWithUser(session.user);
      }
    } else if (event === 'SIGNED_OUT') {
      state.currentUser = null;
      initialLoadDone = false;
      state.remoteReady = false;
      state.server = null;
      state.outbox = [];
      state.workouts = [];
      state.exercises = [];
      state.exerciseInfos = [];
      ui.showLogin();
    }
  });
}
