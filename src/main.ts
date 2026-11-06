// アプリの入口。画面の初期表示・ログイン・同期と、ボタン（data-action）の受け付けをつなぐ。
import { initAuth, loadData, loginWithGoogle } from './auth.ts';
import { downloadJson, hideBanner, showBanner } from './banner.ts';
import { ENV } from './env.ts';
import { offerLegacyImport } from './legacy.ts';
import { exportData, importData } from './screens/backup.ts';
import { changeMonth, renderCal } from './screens/calendar.ts';
import { addEx, cancelEditMuscles, delEx, moveEx, renderExList, renderExSelect, saveMuscles, syncMuscleChecks, toggleEditMuscles } from './screens/exercises.ts';
import { delWorkout, renderHist } from './screens/history.ts';
import { addSet, clearSets, removeSet, renderLogDate, renderSets, saveWorkout } from './screens/log.ts';
import { renderLastSession } from './screens/last.ts';
import { renderBody } from './screens/body.ts';
import { renderStats, setStatsPeriod } from './screens/stats.ts';
import { state } from './state.ts';
import type { SupaClient } from './data.ts';
import { initSync, resyncRemote } from './sync.ts';
import { createSupa } from './supa.ts';
import { byId, toast } from './ui.ts';

// ── タブ ──
type TabName = 'log' | 'cal' | 'hist' | 'ex' | 'stats';
let currentTab: TabName = 'log';

function showTab(name: TabName): void {
  currentTab = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.tab === name));
  byId('sec-' + name).classList.add('active');
  renderCurrentSection();
}

/** 開いている画面を描き直す（タブを開いたときと、サーバーから読み込み直したとき） */
function renderCurrentSection(): void {
  renderExSelect();
  if (currentTab === 'log') { renderSets(); renderBody(); }
  if (currentTab === 'ex') renderExList();
  if (currentTab === 'cal') renderCal();
  if (currentTab === 'hist') renderHist();
  if (currentTab === 'stats') renderStats();
}

// ── ボタン ──
// 画面に data-action="名前" のボタンがあり、押されたらここの同じ名前の関数を呼ぶ（index.html に onclick は書かない）
const num = (el: HTMLElement, key: string): number => Number(el.dataset[key]);
const actions: Record<string, (el: HTMLElement) => void> = {
  'tab': el => showTab(el.dataset.tab as TabName),
  'stats-period': el => setStatsPeriod(el.dataset.period === 'month' ? 'month' : 'week'),
  'login': () => { void loginWithGoogle(); },
  'add-set': addSet,
  'save-workout': saveWorkout,
  'clear-sets': clearSets,
  'rm-set': el => removeSet(num(el, 'index')),
  'change-month': el => changeMonth(num(el, 'dir')),
  'del-workout': el => delWorkout(num(el, 'index')),
  'add-ex': addEx,
  'del-ex': el => delEx(num(el, 'index')),
  'move-ex': el => moveEx(num(el, 'index'), num(el, 'dir')),
  'edit-muscles': el => toggleEditMuscles(el.dataset.id ?? ''),
  'save-muscles': el => saveMuscles(el.dataset.id ?? ''),
  'cancel-muscles': cancelEditMuscles,
  'export-data': exportData,
  'pick-import': () => byId('import-file').click(),
};

document.addEventListener('click', e => {
  const el = (e.target as Element).closest<HTMLElement>('[data-action]');
  const handler = el && actions[el.dataset.action ?? ''];
  if (el && handler) handler(el);
});

// 部位の編集で、主の部位を選んだら、同じ部位を補助から外す
document.addEventListener('change', e => { if ((e.target as Element).id === 'mus-primary') syncMuscleChecks(); });

// 種目を選び直したら、その種目の前回の記録を出す
byId('ex-sel').addEventListener('change', renderLastSession);

byId<HTMLInputElement>('import-file').addEventListener('change', e => {
  importData((e.target as HTMLInputElement).files?.[0]);
});

// ── 同期の状態の表示（種目の画面の「同期」） ──
function updateSyncStatus(): void {
  const el = byId('sync-status');
  const user = state.currentUser;
  const lines: string[] = [];
  lines.push(user ? `ログイン中: ${user.email ?? user.id}` : 'ログインしていません');
  if (state.outbox.length) lines.push(`送れていない変更: ${state.outbox.length}件（この端末に保存済み）`);
  else if (state.remoteReady) lines.push('すべてサーバーに保存されています ✓');
  el.replaceChildren(...lines.map(t => { const d = document.createElement('div'); d.textContent = t; return d; }));
}

// ── ログイン・同期 ──
const supa = createSupa(ENV);
const loginScreen = byId('login-screen');

initSync({
  supa: supa as unknown as SupaClient,
  storagePrefix: ENV.storagePrefix,
  ui: { showBanner, hideBanner, renderCurrentSection, updateSyncStatus, downloadJson },
});
initAuth({
  supa,
  ui: {
    showLogin: () => loginScreen.classList.add('show'),
    hideLogin: () => loginScreen.classList.remove('show'),
    renderFirst: renderCurrentSection,
    updateSyncStatus,
    afterSync: () => offerLegacyImport({ showBanner, hideBanner, toast }),
  },
});

// アプリに戻ってきたとき・通信が戻ったとき: 送れていない変更を送って、読み込み直す
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void resyncRemote(); });
window.addEventListener('online', () => { void resyncRemote(); });

// ── 初期表示 ──
renderLogDate();
renderExSelect();
renderExList();
updateSyncStatus();
void loadData();

// ── ホーム画面に追加（PWA） ──
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const banner = byId('install-banner');
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  banner.style.display = 'flex';
});
byId('install-btn').onclick = async () => {
  if (!deferredPrompt) return;
  void deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  banner.style.display = 'none';
};
byId('install-close').onclick = () => { banner.style.display = 'none'; };

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
