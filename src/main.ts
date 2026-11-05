// アプリの入口。画面の初期表示と、ボタン（data-action）の受け付けをつなぐ。
import { exportData, importData } from './screens/backup.ts';
import { changeMonth, renderCal } from './screens/calendar.ts';
import { addEx, delEx, moveEx, renderExList, renderExSelect } from './screens/exercises.ts';
import { delWorkout, renderHist } from './screens/history.ts';
import { addSet, clearSets, removeSet, renderLogDate, saveWorkout } from './screens/log.ts';
import { renderStats } from './screens/stats.ts';
import { initTimer, isTimerRunning, resetTimer, setCustom, setDur, toggleTimer } from './screens/timer.ts';
import { byId } from './ui.ts';

// ── タブ ──
type TabName = 'log' | 'timer' | 'cal' | 'hist' | 'ex' | 'stats';

function showTab(name: TabName): void {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.tab === name));
  byId('sec-' + name).classList.add('active');
  if (name === 'ex') renderExList();
  if (name === 'cal') renderCal();
  if (name === 'hist') renderHist();
  if (name === 'stats') renderStats();
}

/** 記録画面の「レスト」: タイマーに移って、止まっていれば始める */
function goTimer(): void {
  showTab('timer');
  setTimeout(() => { if (!isTimerRunning()) toggleTimer(); }, 100);
}

// ── ボタン ──
// 画面に data-action="名前" のボタンがあり、押されたらここの同じ名前の関数を呼ぶ（index.html に onclick は書かない）
const num = (el: HTMLElement, key: string): number => Number(el.dataset[key]);
const actions: Record<string, (el: HTMLElement) => void> = {
  'tab': el => showTab(el.dataset.tab as TabName),
  'add-set': addSet,
  'go-timer': goTimer,
  'save-workout': saveWorkout,
  'clear-sets': clearSets,
  'rm-set': el => removeSet(num(el, 'index')),
  'set-dur': el => setDur(num(el, 'sec')),
  'toggle-timer': toggleTimer,
  'reset-timer': resetTimer,
  'set-custom': setCustom,
  'change-month': el => changeMonth(num(el, 'dir')),
  'del-workout': el => delWorkout(num(el, 'index')),
  'add-ex': addEx,
  'del-ex': el => delEx(num(el, 'index')),
  'move-ex': el => moveEx(num(el, 'index'), num(el, 'dir')),
  'export-data': exportData,
  'pick-import': () => byId('import-file').click(),
};

document.addEventListener('click', e => {
  const el = (e.target as Element).closest<HTMLElement>('[data-action]');
  const handler = el && actions[el.dataset.action ?? ''];
  if (el && handler) handler(el);
});

byId<HTMLInputElement>('import-file').addEventListener('change', e => {
  importData((e.target as HTMLInputElement).files?.[0]);
});

// ── 初期表示 ──
renderLogDate();
renderExSelect();
renderExList();
initTimer();

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
