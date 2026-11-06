// 種目の画面（一覧・追加・並べ替え・削除）と、記録画面の種目の選択欄
import { addExerciseChanges, deleteExerciseChanges, moveExerciseChanges, setMusclesChanges } from '../gym-rows.ts';
import { describeParts, isMuscle, MUSCLES, type Muscle } from '../muscles.ts';
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

/** 部位を編集中の種目の id（一度に1つだけ） */
let editingId: string | null = null;

function musclesEditor(id: string): string {
  const info = state.exerciseInfos.find(e => e.id === id);
  if (!info) return '';
  const options = MUSCLES.map(m => `<option value="${m.id}"${info.primary === m.id ? ' selected' : ''}>${m.label}</option>`).join('');
  const checks = MUSCLES.map(m => `<label class="mus-check"><input type="checkbox" name="mus-sec" value="${m.id}"${info.secondary.includes(m.id) ? ' checked' : ''}${info.primary === m.id ? ' disabled' : ''}> ${m.label}</label>`).join('');
  return `
    <div class="muscle-editor">
      <label class="lbl">主に使う部位</label>
      <select id="mus-primary"><option value="">未設定</option>${options}</select>
      <label class="lbl" style="margin-top:10px">補助の部位（複数）</label>
      <div class="mus-checks">${checks}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-primary btn-sm" data-action="save-muscles" data-id="${esc(id)}">保存</button>
        <button class="btn btn-sm" data-action="cancel-muscles">キャンセル</button>
      </div>
    </div>`;
}

export function renderExList(): void {
  const c = byId('ex-list');
  const exs = state.exerciseInfos;
  if (!exs.length) {
    c.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text2);font-size:14px">種目がありません</div>';
    return;
  }
  c.innerHTML = `<div class="card">${exs.map((e, i) => {
    const parts = describeParts(e);
    return `
    <div class="set-row" style="flex-wrap:wrap">
      <span style="flex:1;min-width:0;cursor:pointer" data-action="open-exercise" data-id="${esc(e.id)}">
        <div style="font-size:14px">${esc(e.name)} <span class="ex-open">${e.notes ? '📝' : ''}${e.videoUrl ? '▶' : ''} ›</span></div>
        <div class="ex-parts${parts ? '' : ' none'}">${parts ? esc(parts) : '部位: 未設定'}</div>
      </span>
      <button class="btn btn-sm" data-action="edit-muscles" data-id="${esc(e.id)}" style="padding:4px 8px">部位</button>
      <button class="btn btn-sm" data-action="move-ex" data-index="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} style="padding:4px 8px">↑</button>
      <button class="btn btn-sm" data-action="move-ex" data-index="${i}" data-dir="1" ${i === exs.length - 1 ? 'disabled' : ''} style="padding:4px 8px">↓</button>
      <button class="btn btn-sm btn-danger" data-action="del-ex" data-index="${i}">✕</button>
      ${editingId === e.id ? musclesEditor(e.id) : ''}
    </div>`;
  }).join('')}</div>`;
}

/** 部位の編集を開く・閉じる */
export function toggleEditMuscles(id: string): void {
  editingId = editingId === id ? null : id;
  renderExList();
}

export function cancelEditMuscles(): void {
  editingId = null;
  renderExList();
}

/** 主の部位を選んだら、同じ部位は補助から外して選べなくする */
export function syncMuscleChecks(): void {
  const primary = byId<HTMLSelectElement>('mus-primary').value;
  document.querySelectorAll<HTMLInputElement>('input[name="mus-sec"]').forEach(box => {
    const same = box.value === primary;
    box.disabled = same;
    if (same) box.checked = false;
  });
}

export function saveMuscles(id: string): void {
  const value = byId<HTMLSelectElement>('mus-primary').value;
  const primary: Muscle | null = isMuscle(value) ? value : null;
  const secondary = [...document.querySelectorAll<HTMLInputElement>('input[name="mus-sec"]:checked')]
    .map(b => b.value).filter(isMuscle);
  if (!commit(rows => setMusclesChanges(rows, id, primary, secondary))) return;
  editingId = null;
  renderExList();
  toast('部位を保存しました ✓');
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
