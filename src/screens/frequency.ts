// 統計の「頻度」: 週ごとのトレーニング日数（目標つき）・部位ごとの最後にやってから・年間のヒートマップ（#17）
import { barChart, heatmap, type Bar, type HeatCellView } from '../chart-svg.ts';
import { MUSCLE_LABEL } from '../muscles.ts';
import { heatmapCells, muscleGaps, periodSeries } from '../stats.ts';
import { state } from '../state.ts';
import { byId } from '../ui.ts';

const GOAL_KEY = 'gym:weekly-goal';
const GOAL_MIN = 1;
const GOAL_MAX = 7;
const GOAL_DEFAULT = 3;
/** 部位が、これだけの日数あいたら、赤く目立たせる */
const GAP_WARN_DAYS = 7;

function loadGoal(): number {
  try {
    const n = Number(localStorage.getItem(GOAL_KEY));
    return Number.isInteger(n) && n >= GOAL_MIN && n <= GOAL_MAX ? n : GOAL_DEFAULT;
  } catch { return GOAL_DEFAULT; }
}

/** 週のトレーニング日数の目標（週何日）。端末に覚える */
let goal = loadGoal();

export function changeGoal(delta: number): void {
  goal = Math.min(GOAL_MAX, Math.max(GOAL_MIN, goal + delta));
  try { localStorage.setItem(GOAL_KEY, String(goal)); } catch { /* 覚えられなくても、今の表示は変わる */ }
  renderFrequency();
}

const md = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`;
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

function renderWeekly(): void {
  const points = periodSeries(state.workouts, 'week', new Date(), 12);
  const top = Math.max(3, goal, ...points.map(p => p.days));
  const bars: Bar[] = points.map((p, i) => ({
    label: (points.length - 1 - i) % 2 === 0 ? md(p.start) : '',
    value: p.days,
    hit: p.days >= goal,
    now: p.current,
    title: `${md(p.start)} の週${p.current ? '（今週）' : ''}`,
  }));
  byId('goal-text').textContent = `目標 週${goal}日`;
  const box = byId('freq-chart');
  box.innerHTML = barChart(bars, v => `${v}`, top, { top, goal });

  const done = points.slice(0, -1); // 終わった週（今週は途中なので、目標に届いたかを数えない）
  const hits = done.filter(p => p.days >= goal).length;
  const cur = points[points.length - 1];
  byId('freq-summary').innerHTML = `今週 <strong>${cur ? cur.days : 0}日</strong>（目標 ${goal}日）　終わった ${done.length} 週のうち、目標に届いた週: <strong>${hits}週</strong>`;
  byId('freq-readout').textContent = '棒をタップすると、値が出ます';
  box.onclick = e => {
    const bar = (e.target as Element).closest<SVGElement>('.chart-bar');
    if (!bar) return;
    box.querySelectorAll('.chart-bar.sel').forEach(b => b.classList.remove('sel'));
    bar.classList.add('sel');
    byId('freq-readout').textContent = `${bar.dataset.title}: ${bar.dataset.value}日`;
  };
}

function renderGaps(): void {
  const box = byId('muscle-gaps');
  if (!state.partsByName.size) {
    box.innerHTML = '<div style="font-size:13px;color:var(--text2)">種目に部位を設定すると表示されます（種目の画面）</div>';
    return;
  }
  box.innerHTML = muscleGaps(state.workouts, state.partsByName, new Date()).map(g => {
    const text = g.days === null ? '記録なし' : g.days === 0 ? '今日' : `${g.days}日前`;
    const cls = g.days === null ? 'none' : g.days >= GAP_WARN_DAYS ? 'warn' : '';
    return `<div class="gap-row ${cls}"><span>${MUSCLE_LABEL[g.muscle]}</span><span class="gap-days">${text}</span></div>`;
  }).join('');
}

function renderHeatmap(): void {
  const now = new Date();
  const weeks = 52;
  const { cells } = heatmapCells(state.workouts, now, weeks);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const views: HeatCellView[] = cells.map(c => ({
    col: c.col, row: c.row, level: c.level, future: c.future,
    today: c.date.getTime() === today,
    title: `${md(c.date)}（${WEEKDAY[c.date.getDay()]}）: ${c.volume > 0 ? (c.volume >= 1000 ? `${(c.volume / 1000).toFixed(1)}t` : `${Math.round(c.volume)}kg`) : '記録なし'}`,
  }));
  // 月が変わる週（月曜の日付が1〜7日）に、月の名前を出す
  const labels = cells.filter(c => c.row === 0 && c.date.getDate() <= 7).map(c => ({ col: c.col, text: `${c.date.getMonth() + 1}月` }));
  const box = byId('heatmap');
  box.innerHTML = heatmap(views, weeks, labels);
  byId('heat-readout').textContent = '濃いほど、その日のボリュームが大きい日です（マスをタップすると値が出ます）';
  box.onclick = e => {
    const cell = (e.target as Element).closest<SVGElement>('.heat');
    if (!cell) return;
    box.querySelectorAll('.heat.sel').forEach(c => c.classList.remove('sel'));
    cell.classList.add('sel');
    byId('heat-readout').textContent = cell.dataset.title ?? '';
  };
}

export function renderFrequency(): void {
  renderWeekly();
  renderGaps();
  renderHeatmap();
}
