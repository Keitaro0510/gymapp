// 統計の画面: 週・月の切り替え、前の期間との比較、ボリュームの推移、全期間の合計・種目別（#15）
import { barChart, type Bar } from '../chart-svg.ts';
import {
  addDays, comparePeriods, exerciseTotals, formatDiff, overallTotals, periodSeries, type PeriodKind,
} from '../stats.ts';
import { state } from '../state.ts';
import { byId, esc } from '../ui.ts';

const PERIOD_KEY = 'gym:stats-period';

function loadPeriod(): PeriodKind {
  try { return localStorage.getItem(PERIOD_KEY) === 'month' ? 'month' : 'week'; } catch { return 'week'; }
}

/** 今の期間の単位。標準は週 */
let period: PeriodKind = loadPeriod();

export function setStatsPeriod(kind: PeriodKind): void {
  period = kind;
  try { localStorage.setItem(PERIOD_KEY, kind); } catch { /* 覚えられなくても、今の表示は変わる */ }
  renderStats();
}

/** ボリューム（kg）の表示。1,000kg 以上は t */
export function formatVolume(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg).toLocaleString()}kg`;
}

const md = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`;
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

function renderCompare(): void {
  const now = new Date();
  const { cur, prev, elapsed, curStart, prevStart } = comparePeriods(state.workouts, period, now);
  const unit = period === 'week' ? '週' : '月';
  const last = addDays(curStart, elapsed - 1);
  const range = period === 'week' ? `月〜${WEEKDAY[last.getDay()]}` : `1〜${last.getDate()}日`;
  byId('cmp-title').textContent = `今${unit}（${range}）と、先${unit}の同じ日数まで（${md(prevStart)}〜）の比較`;

  const card = (label: string, curText: string, unitText: string, diffText: string, prevText: string, up: boolean): string => `
    <div class="cmp-card">
      <div class="cmp-lbl">${label}</div>
      <div class="cmp-num">${curText}<small>${unitText}</small></div>
      <div class="cmp-diff${up ? ' up' : ''}">${diffText}</div>
      <div class="cmp-prev">先${unit} ${prevText}</div>
    </div>`;
  const vol = formatVolume(cur.totalWeight);
  byId('cmp-cards').innerHTML = [
    card('トレーニングした日', String(cur.days), '日', formatDiff('count', cur.days, prev.days) + '日', `${prev.days}日`, cur.days > prev.days),
    card('総ボリューム', vol.replace(/(t|kg)$/, ''), vol.endsWith('t') ? 't' : 'kg', formatDiff('volume', cur.totalWeight, prev.totalWeight), formatVolume(prev.totalWeight), cur.totalWeight > prev.totalWeight),
    card('セット数', String(cur.totalSets), 'セット', formatDiff('count', cur.totalSets, prev.totalSets), `${prev.totalSets}セット`, cur.totalSets > prev.totalSets),
    card('最高重量を更新した種目', String(cur.prCount), '種目', formatDiff('count', cur.prCount, prev.prCount), `${prev.prCount}種目`, cur.prCount > prev.prCount),
  ].join('');
}

function renderVolumeChart(): void {
  const points = periodSeries(state.workouts, period, new Date(), 12);
  const bars: Bar[] = points.map((p, i) => {
    const d = p.start;
    // 横軸のラベルは、混み合わないように1つおき（今の期間は必ず出す）
    const show = (points.length - 1 - i) % 2 === 0;
    const label = period === 'week' ? md(d) : `${d.getMonth() + 1}月`;
    const title = period === 'week'
      ? `${md(d)} の週${p.current ? '（今週）' : ''}`
      : `${d.getFullYear()}年${d.getMonth() + 1}月${p.current ? '（今月）' : ''}`;
    return { label: show ? label : '', value: p.volume, current: p.current, title };
  });
  byId('vol-chart-title').textContent = `ボリュームの推移（直近12${period === 'week' ? '週' : 'か月'}）`;
  const box = byId('vol-chart');
  box.innerHTML = barChart(bars, v => (v >= 1000 ? `${+(v / 1000).toFixed(1)}t` : `${Math.round(v)}`));
  byId('chart-readout').textContent = '棒をタップすると、値が出ます';
  // 棒をタップしたら、その期間の値を出す
  box.onclick = e => {
    const bar = (e.target as Element).closest<SVGElement>('.chart-bar');
    if (!bar) return;
    box.querySelectorAll('.chart-bar.sel').forEach(b => b.classList.remove('sel'));
    bar.classList.add('sel');
    byId('chart-readout').textContent = `${bar.dataset.title}: ${formatVolume(Number(bar.dataset.value))}`;
  };
}

export function renderStats(): void {
  document.querySelectorAll<HTMLElement>('#stats-seg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  renderCompare();
  renderVolumeChart();

  const t = overallTotals(state.workouts);
  const tv = t.volume;
  byId('stats-top').innerHTML = `
    <div class="stat-card"><div class="stat-num">${t.sessions}</div><div class="stat-lbl">総セッション</div></div>
    <div class="stat-card"><div class="stat-num">${t.sets}</div><div class="stat-lbl">総セット数</div></div>
    <div class="stat-card"><div class="stat-num">${tv > 999 ? (tv / 1000).toFixed(1) + 't' : tv.toLocaleString() + 'kg'}</div><div class="stat-lbl">総ボリューム</div></div>
    <div class="stat-card"><div class="stat-num">${t.days}</div><div class="stat-lbl">記録した日数</div></div>`;

  const exs = [...exerciseTotals(state.workouts)];
  const empty = '<div style="font-size:13px;color:var(--text2)">記録後に表示されます</div>';
  byId('rm-list').innerHTML = exs.length ? [...exs].sort((a, b) => b[1].best - a[1].best).map(([ex, d]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:0.5px solid var(--border)">
      <span style="font-size:14px">${esc(ex)}</span><span class="rm-chip">${d.best} kg</span>
    </div>`).join('') : empty;

  const maxV = Math.max(...exs.map(e => e[1].vol), 1);
  byId('vol-list').innerHTML = exs.length ? [...exs].sort((a, b) => b[1].vol - a[1].vol).map(([ex, d]) => `
    <div style="padding:7px 0;border-bottom:0.5px solid var(--border)">
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span>${esc(ex)}</span><span style="color:var(--text2)">${d.vol.toLocaleString()} kg</span>
      </div>
      <div class="vol-bar-wrap"><div class="vol-bar-fill" style="width:${Math.round(d.vol / maxV * 100)}%"></div></div>
    </div>`).join('') : empty;
}
