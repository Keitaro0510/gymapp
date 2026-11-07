// 記録の画面（今日のセットを入力して保存する）
import { saveWorkoutChanges } from '../gym-rows.ts';
import { state } from '../state.ts';
import { commit, newId } from '../sync.ts';
import { byId, esc, toast } from '../ui.ts';
import { renderBody } from './body.ts';
import { renderLastSession } from './last.ts';
import { elapsedSec, onSetAdded, resetTimer } from './timer.ts';

export function renderLogDate(): void {
  byId('log-date').textContent = state.now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

export function addSet(): void {
  const kg = parseFloat(byId<HTMLInputElement>('w-kg').value);
  const reps = parseInt(byId<HTMLInputElement>('w-reps').value);
  if (!kg || !reps || kg < 0 || reps < 1) { toast('重量と回数を入力してください'); return; }
  const rpe = byId<HTMLInputElement>('w-rpe').value;
  const note = byId<HTMLTextAreaElement>('w-note').value.trim();
  const ex = byId<HTMLSelectElement>('ex-sel').value || 'カスタム';
  state.sets.push({ ex, kg, reps, rpe: rpe || null, note });
  byId<HTMLInputElement>('w-rpe').value = '';
  byId<HTMLTextAreaElement>('w-note').value = '';
  renderSets();
  onSetAdded();
}

export function renderSets(): void {
  const c = byId('sets-area');
  if (!state.sets.length) { c.innerHTML = ''; return; }
  // 番号は、入力した順の通し番号（種目ごとにまとめても変えない）
  const numbered = state.sets.map((s, i) => ({ ...s, i }));
  const groups = new Map<string, typeof numbered>();
  for (const s of numbered) {
    const list = groups.get(s.ex);
    if (list) list.push(s);
    else groups.set(s.ex, [s]);
  }
  c.innerHTML = [...groups].map(([ex, ss]) => `
    <div class="card">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">${esc(ex)}</div>
      ${ss.map(s => `
        <div class="set-row">
          <span class="set-num">${s.i + 1}</span>
          <span style="flex:1">${s.kg} kg × ${s.reps} rep${s.rpe ? ` <span style="font-size:12px;color:var(--text2)">RPE ${esc(s.rpe)}</span>` : ''}</span>
          ${s.note ? `<span style="font-size:12px;color:var(--text2);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.note)}</span>` : ''}
          <button class="btn btn-sm btn-danger" data-action="rm-set" data-index="${s.i}">✕</button>
        </div>`).join('')}
    </div>`).join('');
}

export function removeSet(i: number): void {
  state.sets.splice(i, 1);
  if (!state.sets.length) resetTimer();
  renderSets();
}

export function clearSets(): void {
  if (state.sets.length && !confirm('今日の記録をクリアしますか？')) return;
  state.sets = [];
  resetTimer();
  renderSets();
}

export function saveWorkout(): void {
  if (!state.sets.length) { toast('セットを追加してください'); return; }
  // 保存できなければ、入力中のセットは残す
  if (!commit(rows => saveWorkoutChanges(rows, state.sets, new Date(), newId, elapsedSec()))) return;
  state.sets = [];
  resetTimer();
  renderSets();
  renderLastSession(); // 今保存した記録が、次の「前回」になる
  renderBody(); // 今日の負荷（人体図）にも反映する
  toast('保存しました ✓');
}
