// 統計の画面（今月のサマリー・全期間の合計・種目別の推定1RMとボリューム）
import { exerciseTotals, overallTotals } from '../stats.ts';
import { state } from '../state.ts';
import { byId, esc } from '../ui.ts';
import { renderRedStats } from './redstats.ts';

export function renderStats(): void {
  const now = state.now;
  byId('stats-month-lbl').textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }) + 'のサマリー';
  renderRedStats('stats-redstats', now.getFullYear(), now.getMonth());

  const t = overallTotals(state.workouts);
  const tv = t.volume;
  byId('stats-top').innerHTML = `
    <div class="stat-card"><div class="stat-num">${t.sessions}</div><div class="stat-lbl">総セッション</div></div>
    <div class="stat-card"><div class="stat-num">${t.sets}</div><div class="stat-lbl">総セット数</div></div>
    <div class="stat-card"><div class="stat-num">${tv > 999 ? (tv / 1000).toFixed(1) + 't' : tv.toLocaleString() + 'kg'}</div><div class="stat-lbl">総ボリューム</div></div>
    <div class="stat-card"><div class="stat-num">${t.days}</div><div class="stat-lbl">記録した日数</div></div>`;

  const exs = [...exerciseTotals(state.workouts)];
  const empty = '<div style="font-size:13px;color:var(--text2)">記録後に表示されます</div>';
  byId('rm-list').innerHTML = exs.length ? [...exs].sort((a, b) => b[1].rm - a[1].rm).map(([ex, d]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:0.5px solid var(--border)">
      <span style="font-size:14px">${esc(ex)}</span><span class="rm-chip">${d.rm} kg</span>
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
