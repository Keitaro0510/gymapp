// 履歴の画面（保存した記録の一覧・削除）
import { groupByExercise, volume } from '../stats.ts';
import { deleteWorkoutChanges } from '../gym-rows.ts';
import { state } from '../state.ts';
import { commit } from '../sync.ts';
import { byId, esc } from '../ui.ts';

export function renderHist(): void {
  const c = byId('hist-list');
  if (!state.workouts.length) {
    c.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)">まだ記録がありません</div>';
    return;
  }
  c.innerHTML = state.workouts.map((w, wi) => {
    const ds = new Date(w.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const groups = groupByExercise(w.sets);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <span style="font-size:13px;color:var(--text2)">${ds}</span>
        <button class="btn btn-sm btn-danger" data-action="del-workout" data-index="${wi}">🗑</button>
      </div>
      ${[...groups].map(([ex, ss]) => `
        <div style="margin-bottom:6px">
          <div style="font-size:14px;font-weight:500">${esc(ex)}</div>
          <div style="font-size:13px;color:var(--text2)">${ss.map(s => `${s.kg}kg×${s.reps}`).join(' · ')}</div>
        </div>`).join('')}
      <div class="hist-vol">総ボリューム: <strong>${volume(w).toLocaleString()} kg</strong> · ${w.sets.length}セット</div>
    </div>`;
  }).join('');
}

export function delWorkout(i: number): void {
  const w = state.workouts[i];
  if (!w) return;
  if (!confirm('削除しますか？')) return;
  if (commit(rows => deleteWorkoutChanges(rows, w.id))) renderHist();
}
