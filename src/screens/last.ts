// 記録画面の「前回の記録」: 種目を選ぶと、その種目をいつ・何kg・何セットやったかを出す
import { daysBetween, formatDaysAgo, lastSession } from '../stats.ts';
import { state } from '../state.ts';
import { byId, esc } from '../ui.ts';

export function renderLastSession(): void {
  const box = byId('last-session');
  const ex = byId<HTMLSelectElement>('ex-sel').value;
  if (!ex) { box.innerHTML = ''; return; }
  const last = lastSession(state.workouts, ex);
  if (!last) {
    box.innerHTML = `<div class="last-none">${esc(ex)} の記録は、まだありません</div>`;
    return;
  }
  const d = new Date(last.date);
  const ago = formatDaysAgo(daysBetween(d, state.now));
  const top = Math.max(...last.sets.map(s => s.kg));
  // 重量が違うセットがあるときだけ、いちばん重いセットを太字にする（全部同じ重量なら、目立たせる意味がない）
  const differ = last.sets.some(s => s.kg !== top);
  const sets = last.sets.map(s => `<span${differ && s.kg === top ? ' class="top"' : ''}>${s.kg}kg×${s.reps}</span>`).join(' · ');
  box.innerHTML = `
    <div class="last-box">
      <div class="last-head">前回 ${d.getMonth() + 1}/${d.getDate()}（${ago}）</div>
      <div class="last-sets">${sets} <span class="n">— ${last.sets.length}セット</span></div>
    </div>`;
}
