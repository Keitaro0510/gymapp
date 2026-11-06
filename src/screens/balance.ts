// 統計の「部位バランス」: 今週・今月の、部位ごとのボリュームの割合と、押す・引く・脚・体幹の割合（#8）
import { groupShares, muscleLoadRange, muscleShares, MUSCLE_GROUPS } from '../load.ts';
import { MUSCLE_LABEL, MUSCLES } from '../muscles.ts';
import { addDays, periodStart, type PeriodKind } from '../stats.ts';
import { state } from '../state.ts';
import { byId, esc } from '../ui.ts';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** period は、統計の「週 | 月」の切り替え。今の期間（今日まで）を見る */
export function renderBalance(period: PeriodKind): void {
  const now = new Date();
  const start = periodStart(period, now);
  const load = muscleLoadRange(state.workouts, state.partsByName, start, addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1));
  const unit = period === 'week' ? '今週' : '今月';
  byId('balance-title').textContent = `部位バランス（${unit}）`;
  const unsetNote = load.unset.length ? `部位が未設定の種目は、数えていません: ${load.unset.join('、')}` : '';

  if (load.max <= 0) {
    byId('balance-groups').innerHTML = '';
    byId('balance-list').innerHTML = `<div style="font-size:13px;color:var(--text2)">${unit}は、部位のある種目の記録がまだありません</div>`;
    byId('balance-note').textContent = unsetNote;
    return;
  }

  // 押す・引く・脚・体幹の割合（横の帯）
  const groups = groupShares(load);
  byId('balance-groups').innerHTML = `
    <div class="bal-bar">${groups.filter(g => g.share > 0).map(g => `<span class="bal-seg g-${g.id}" style="flex:${g.share}" title="${g.label} ${pct(g.share)}"></span>`).join('')}</div>
    <div class="bal-legend">${groups.map(g => {
      const names = (MUSCLE_GROUPS.find(x => x.id === g.id)?.muscles ?? []).map(m => MUSCLE_LABEL[m]).join('・');
      return `<span class="bal-key" title="${esc(names)}"><i class="bal-dot g-${g.id}"></i>${g.label} <strong>${pct(g.share)}</strong></span>`;
    }).join('')}</div>`;

  // 部位ごとの割合（棒）。部位の一覧の順（前の期間と見比べやすい）
  const shares = muscleShares(load);
  const top = Math.max(...shares.values());
  byId('balance-list').innerHTML = MUSCLES.map(m => {
    const s = shares.get(m.id) ?? 0;
    return `<div class="bal-row${s === 0 ? ' zero' : ''}">
      <span class="bal-name">${MUSCLE_LABEL[m.id]}</span>
      <span class="bal-track"><span class="bal-fill" style="width:${top > 0 ? (s / top * 100).toFixed(1) : 0}%"></span></span>
      <span class="bal-pct">${s === 0 ? '—' : pct(s)}</span>
    </div>`;
  }).join('');
  byId('balance-note').textContent = unsetNote;
}
