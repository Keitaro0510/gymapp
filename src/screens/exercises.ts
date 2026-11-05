// 種目の画面（一覧・追加・並べ替え・削除）と、記録画面の種目の選択欄
import { addExerciseChanges, deleteExerciseChanges, moveExerciseChanges } from '../gym-rows.ts';
import { state } from '../state.ts';
import { commit, newId } from '../sync.ts';
import { byId, esc, toast } from '../ui.ts';
import { renderLastSession } from './last.ts';

export function renderExSelect(): void {
  const sel = byId<HTMLSelectElement>('ex-sel');
  const cur = sel.value;
  sel.innerHTML = state.exercises.map(e => `<option${e === cur ? ' selected' : ''}>${esc(e)}</option>`).join('');
  renderLastSession();
}

export function renderExList(): void {
  const c = byId('ex-list');
  const exs = state.exercises;
  if (!exs.length) {
    c.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text2);font-size:14px">種目がありません</div>';
    return;
  }
  c.innerHTML = `<div class="card">${exs.map((e, i) => `
    <div class="set-row">
      <span style="flex:1;font-size:14px">${esc(e)}</span>
      <button class="btn btn-sm" data-action="move-ex" data-index="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} style="padding:4px 8px">↑</button>
      <button class="btn btn-sm" data-action="move-ex" data-index="${i}" data-dir="1" ${i === exs.length - 1 ? 'disabled' : ''} style="padding:4px 8px">↓</button>
      <button class="btn btn-sm btn-danger" data-action="del-ex" data-index="${i}">✕</button>
    </div>`).join('')}</div>`;
}

export function addEx(): void {
  const inp = byId<HTMLInputElement>('new-ex-input');
  const name = inp.value.trim();
  if (!name) { toast('種目名を入力してください'); return; }
  if (state.exercises.includes(name)) { toast('すでに登録されています'); return; }
  if (!commit(rows => addExerciseChanges(rows, name, newId))) return;
  renderExSelect(); renderExList();
  inp.value = '';
  toast(`「${name}」を追加しました`);
}

export function delEx(i: number): void {
  const name = state.exercises[i];
  if (name === undefined) return;
  if (!confirm(`「${name}」を削除しますか？\n（過去の記録は残ります）`)) return;
  if (commit(rows => deleteExerciseChanges(rows, name, new Date().toISOString()))) { renderExSelect(); renderExList(); }
}

export function moveEx(i: number, dir: number): void {
  const name = state.exercises[i];
  if (name === undefined || state.exercises[i + dir] === undefined) return;
  if (commit(rows => moveExerciseChanges(rows, name, dir))) { renderExSelect(); renderExList(); }
}
