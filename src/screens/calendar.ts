// カレンダーの画面（月の表・日ごとの詳細）。直近52週は、統計の「年間のトレーニング」（ヒートマップ）に移した
import { groupByExercise, volume, workoutsByDay } from '../stats.ts';
import { state } from '../state.ts';
import type { Workout } from '../types.ts';
import { byId, esc } from '../ui.ts';
import { renderRedStats } from './redstats.ts';

let calYear = state.now.getFullYear();
let calMonth = state.now.getMonth();

export function renderCal(): void {
  const now = state.now;
  const map = workoutsByDay(state.workouts);
  byId('cal-title').textContent = new Date(calYear, calMonth, 1).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });

  const first = new Date(calYear, calMonth, 1).getDay();
  const last = new Date(calYear, calMonth + 1, 0).getDate();
  const prevLast = new Date(calYear, calMonth, 0).getDate();

  renderRedStats('cal-redstats', calYear, calMonth);

  const grid = byId('cal-grid');
  const lbls = ['日', '月', '火', '水', '木', '金', '土'];
  grid.innerHTML = lbls.map((l, i) => `<div class="day-lbl${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${l}</div>`).join('');

  // 前の月・今月・次の月の日で、6週間（42マス）を埋める
  const cells: { d: number; m: 'p' | 'c' | 'n' }[] = [];
  for (let i = first - 1; i >= 0; i--) cells.push({ d: prevLast - i, m: 'p' });
  for (let i = 1; i <= last; i++) cells.push({ d: i, m: 'c' });
  while (cells.length < 42) cells.push({ d: cells.length - last - first + 1, m: 'n' });

  for (const c of cells) {
    const isToday = c.m === 'c' && c.d === now.getDate() && calYear === now.getFullYear() && calMonth === now.getMonth();
    const yr = c.m === 'p' ? (calMonth === 0 ? calYear - 1 : calYear) : c.m === 'n' ? (calMonth === 11 ? calYear + 1 : calYear) : calYear;
    const mo = c.m === 'p' ? (calMonth === 0 ? 11 : calMonth - 1) : c.m === 'n' ? (calMonth === 11 ? 0 : calMonth + 1) : calMonth;
    const ws = map.get(`${yr}-${mo}-${c.d}`) ?? [];

    const div = document.createElement('div');
    div.className = `day-cell${c.m !== 'c' ? ' other' : ''}${ws.length ? ' has-w' : ''}${isToday ? ' today' : ''}`;
    div.innerHTML = `<span class="dn">${c.d}</span>`;
    if (c.m === 'c' && ws.length) div.onclick = () => showCalDetail(c.d, ws);
    grid.appendChild(div);
  }
}

function showCalDetail(d: number, ws: Workout[]): void {
  const dateStr = new Date(calYear, calMonth, d).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  const groups = groupByExercise(ws.flatMap(w => w.sets));
  const tv = ws.reduce((a, w) => a + volume(w), 0);
  const detail = byId('cal-detail');
  detail.innerHTML = `
    <div class="detail-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:600">${dateStr}</span>
        <span class="rm-chip">${tv.toLocaleString()} kg</span>
      </div>
      ${[...groups].map(([ex, ss]) => `
        <div style="margin-bottom:6px">
          <div style="font-size:14px;font-weight:500;color:var(--accent-text)">${esc(ex)}</div>
          <div style="font-size:13px;color:var(--text2)">${ss.map(s => `${s.kg}kg×${s.reps}`).join(' · ')}</div>
        </div>`).join('')}
    </div>`;
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function changeMonth(d: number): void {
  calMonth += d;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  byId('cal-detail').innerHTML = '';
  renderCal();
}
