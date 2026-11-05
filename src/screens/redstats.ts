// 赤いサマリーカード（カレンダーと統計の画面で使う）
import { computeMonthStats, formatMonthComparison, previousMonth } from '../stats.ts';
import { state } from '../state.ts';
import { byId } from '../ui.ts';

export function renderRedStats(containerId: string, y: number, m: number): void {
  const cur = computeMonthStats(state.workouts, y, m);
  const p = previousMonth(y, m);
  const prev = computeMonthStats(state.workouts, p.y, p.m);
  const { dayDiff, weightPct, tons } = formatMonthComparison(cur, prev);
  byId(containerId).innerHTML = `
    <div class="redstat-card">
      <div class="redstat-jp">合計筋トレ日数</div>
      <div class="redstat-en">TOTAL TRAINING DAY</div>
      <div><span class="redstat-num">${cur.days}</span><span class="redstat-unit">days</span></div>
      <div class="redstat-sub">(${dayDiff})</div>
    </div>
    <div class="redstat-card">
      <div class="redstat-jp">合計負荷量</div>
      <div class="redstat-en">TOTAL WEIGHT</div>
      <div><span class="redstat-num">${tons}</span><span class="redstat-unit">t</span></div>
      <div class="redstat-sub">(${weightPct})</div>
    </div>
    <div class="redstat-card">
      <div class="redstat-jp">合計セット数</div>
      <div class="redstat-en">TOTAL SETS</div>
      <div><span class="redstat-num">${cur.totalSets}</span><span class="redstat-unit">sets</span></div>
    </div>
    <div class="redstat-card">
      <div class="redstat-jp">合計レップ数</div>
      <div class="redstat-en">TOTAL REPS</div>
      <div><span class="redstat-num">${cur.totalReps}</span><span class="redstat-unit">reps</span></div>
    </div>
    <div class="redstat-card">
      <div class="redstat-jp">合計種目数</div>
      <div class="redstat-en">TOTAL EXERCISES</div>
      <div><span class="redstat-num">${cur.exCount}</span><span class="redstat-unit">exercises</span></div>
    </div>
    <div class="redstat-card">
      <div class="redstat-jp">記録更新種目数</div>
      <div class="redstat-en">UPDATE EXERCISES</div>
      <div><span class="redstat-num">${cur.prCount}</span><span class="redstat-unit">exercises</span></div>
    </div>`;
}
