// レストタイマー。画面の中だけで完結する（DB は要らない。docs/PLAN.md）
import { byId, toast } from '../ui.ts';

let tDur = 90;
let tRem = 90;
let tRunning = false;
let tIv: ReturnType<typeof setInterval> | undefined;

export function isTimerRunning(): boolean { return tRunning; }

export function formatTime(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function updTimer(): void {
  byId('t-display').textContent = formatTime(tRem);
  const pct = Math.round(tRem / tDur * 100);
  const fill = byId('t-fill');
  fill.style.width = pct + '%';
  fill.style.background = tRem <= 10 ? '#8f1a17' : tRem <= 30 ? '#BA7517' : 'var(--accent)';
}

export function initTimer(): void { updTimer(); }

export function setDur(s: number): void {
  clearInterval(tIv);
  tRunning = false;
  tDur = tRem = s;
  byId('t-btn').textContent = '▶ スタート';
  byId('t-status').textContent = '準備完了';
  updTimer();
}

export function setCustom(): void {
  const m = parseInt(byId<HTMLInputElement>('c-min').value) || 0;
  const s = parseInt(byId<HTMLInputElement>('c-sec').value) || 0;
  if (m + s > 0) setDur(m * 60 + s);
}

export function resetTimer(): void { setDur(tDur); }

function beep(): void {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    for (const [f, t] of [[880, 0], [660, 0.3], [880, 0.5]] as const) o.frequency.setValueAtTime(f, a.currentTime + t);
    g.gain.setValueAtTime(0.3, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 1);
    o.start(); o.stop(a.currentTime + 1);
  } catch { /* 音が出せない端末では、振動と表示だけ */ }
}

export function toggleTimer(): void {
  if (tRunning) {
    clearInterval(tIv);
    tRunning = false;
    byId('t-btn').textContent = '▶ 再開';
    byId('t-status').textContent = '一時停止中';
    return;
  }
  if (tRem <= 0) tRem = tDur;
  tRunning = true;
  byId('t-btn').textContent = '⏸ 一時停止';
  byId('t-status').textContent = 'カウントダウン中...';
  tIv = setInterval(() => {
    tRem--;
    updTimer();
    if (tRem <= 0) {
      clearInterval(tIv);
      tRunning = false;
      byId('t-status').textContent = '✓ 終了！';
      byId('t-btn').textContent = '▶ スタート';
      beep();
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      toast('レスト終了！');
    }
  }, 1000);
}
