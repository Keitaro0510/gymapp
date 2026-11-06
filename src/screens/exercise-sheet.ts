// 種目の詳細シート（下から出る）: フォームの 3D アニメーション・やり方のメモ・解説動画のリンク（#23・#24）
import { checkNotes, isSafeLink, normalizeVideoUrl, NOTES_MAX, youtubeSearchUrl } from '../exercise-detail.ts';
import { FORM_VIEWS, formModelFor, type FormViewName } from '../form-models.ts';
import type { FormViewer } from '../form3d.ts';
import { setDetailChanges } from '../gym-rows.ts';
import { describeParts } from '../muscles.ts';
import { state } from '../state.ts';
import { commit } from '../sync.ts';
import { byId, esc, toast } from '../ui.ts';

/** 開いている種目の id（なければ閉じている） */
let openId: string | null = null;

// ── 3D のビューア（押したときにだけ読み込む。シートを描き直しても、同じ種目の間は同じものを使い続ける） ──
let viewer: FormViewer | null = null;
let viewerFor: string | null = null;
let loading = false;
let loadError = '';
let speed = 1;
let viewName: FormViewName = 'side';

const SPEEDS = [0.5, 1] as const;

function disposeViewer(): void {
  viewer?.dispose();
  viewer = null;
  viewerFor = null;
  loading = false;
  loadError = '';
}

function formBoxHtml(id: string, name: string): string {
  if (!formModelFor(name)) return '';
  if (viewer && viewerFor === id) {
    const views = (Object.keys(FORM_VIEWS) as FormViewName[]).map(v =>
      `<button class="mini-btn${v === viewName ? ' active' : ''}" data-action="form-view" data-view="${v}">${FORM_VIEWS[v].label}</button>`).join('');
    const speeds = SPEEDS.map(s =>
      `<button class="mini-btn${s === speed ? ' active' : ''}" data-action="form-speed" data-speed="${s}">${s}×</button>`).join('');
    return `<div class="form-box"><div id="form-slot"></div>
      <div class="form-controls">
        <button class="mini-btn" data-action="form-toggle" id="form-toggle" aria-label="再生・一時停止">${viewer.playing ? '⏸' : '▶'}</button>
        <span class="mini-group">${speeds}</span>
        <span class="mini-group">${views}</span>
      </div>
      <div class="form-hint">ドラッグで回せます。ピンチで寄れます。</div></div>`;
  }
  if (loading) return '<div class="form-box"><div class="form-msg">3D を読み込んでいます…</div></div>';
  return `<div class="form-box"><div class="form-msg">
    ${loadError ? `<div class="sheet-error">${esc(loadError)}</div>` : ''}
    <button class="btn" data-action="open-form" data-id="${esc(id)}">🎬 3D でフォームを見る</button></div></div>`;
}

function render(): void {
  const info = state.exerciseInfos.find(e => e.id === openId);
  const sheet = byId('ex-sheet');
  if (!info) { sheet.classList.remove('show'); openId = null; disposeViewer(); return; }
  const parts = describeParts(info);
  const link = isSafeLink(info.videoUrl) ? info.videoUrl : null;
  byId('ex-sheet-body').innerHTML = `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">${esc(info.name)}</div>
        <div class="ex-parts${parts ? '' : ' none'}">${parts ? esc(parts) : '部位: 未設定'}</div>
      </div>
      <button class="btn btn-sm" data-action="close-sheet" aria-label="閉じる">✕</button>
    </div>

    ${formBoxHtml(info.id, info.name)}

    <label class="lbl" for="ex-notes">やり方・フォーム・意識すること（メモ）</label>
    <textarea id="ex-notes" rows="9" maxlength="${NOTES_MAX}" placeholder="例:&#10;・肩甲骨を寄せて、胸を張る&#10;・足で床を踏む&#10;・バーは乳首の真上におろす&#10;・よくある間違い: 肘を開きすぎる">${esc(info.notes)}</textarea>

    <label class="lbl" for="ex-video" style="margin-top:10px">解説動画のリンク（YouTube など）</label>
    <input type="text" id="ex-video" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="https://www.youtube.com/watch?v=…" value="${esc(info.videoUrl ?? '')}">

    <div class="sheet-error" id="ex-error" role="alert"></div>

    <div class="sheet-actions">
      <button class="btn btn-primary" data-action="save-detail" data-id="${esc(info.id)}">💾 保存</button>
      ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">▶ 動画を開く</a>` : ''}
      <a class="btn" href="${esc(youtubeSearchUrl(info.name))}" target="_blank" rel="noopener noreferrer">🔍 YouTube で検索</a>
    </div>
    <div class="sheet-hint">リンクを貼って「保存」すると、次から「▶ 動画を開く」で、その動画に飛べます。貼っていない種目でも、「YouTube で検索」で「${esc(info.name)} やり方」の結果が開きます。</div>`;
  // 描き直しても、同じ種目の 3D は、そのまま入れ直す（再生が途切れない）
  const slot = document.getElementById('form-slot');
  if (slot && viewer && viewerFor === info.id) slot.appendChild(viewer.el);
  sheet.classList.add('show');
}

/** 種目の詳細を開く */
export function openExercise(id: string): void {
  if (viewerFor !== id) disposeViewer(); // 別の種目に替わったら、前の 3D は手放す
  openId = id;
  render();
}

/** 記録画面の「📖」: 今、選んでいる種目の詳細を開く */
export function openCurrentExercise(): void {
  const name = byId<HTMLSelectElement>('ex-sel').value;
  const info = state.exerciseInfos.find(e => e.name === name);
  if (!info) { toast('先に種目を選んでください'); return; }
  openExercise(info.id);
}

export function closeSheet(): void {
  openId = null;
  disposeViewer(); // 3D は、閉じたら手放す（WebGL の資源を残さない）
  byId('ex-sheet').classList.remove('show');
}

export function saveDetail(id: string): void {
  const notes = byId<HTMLTextAreaElement>('ex-notes').value;
  const video = byId<HTMLInputElement>('ex-video').value;
  // 入力の間違いは、シートの中に出す（シートを開いている間、同期の知らせは背面に隠れるため）
  try { checkNotes(notes); normalizeVideoUrl(video); }
  catch (e) { byId('ex-error').textContent = e instanceof Error ? e.message : String(e); return; }
  byId('ex-error').textContent = '';
  if (!commit(rows => setDetailChanges(rows, id, notes, video))) return;
  render(); // 保存した内容（補った https:// など）と、「動画を開く」のボタンを出し直す
  toast('保存しました ✓');
}

// ── 3D の操作 ──

/** 「3D でフォームを見る」: 3D のライブラリと GLB を、このときに初めて読み込む */
export async function loadForm(id: string): Promise<void> {
  const info = state.exerciseInfos.find(e => e.id === id);
  const url = info ? formModelFor(info.name) : null;
  if (!info || !url || loading || viewerFor === id) return;
  loading = true;
  loadError = '';
  render();
  try {
    const { createFormViewer } = await import('../form3d.ts');
    const v = await createFormViewer(url);
    if (openId !== id) { v.dispose(); loading = false; return; } // 読み込み中に、閉じた・別の種目を開いた
    v.setSpeed(speed);
    v.setView(viewName);
    viewer = v;
    viewerFor = id;
  } catch (e) {
    console.warn('3D を読み込めませんでした:', e);
    loadError = '3D を読み込めませんでした（通信と、WebGL が使えるかを確かめてください）';
  }
  loading = false;
  if (openId === id) render();
}

export function formToggle(): void {
  if (!viewer) return;
  const playing = viewer.toggle();
  const b = document.getElementById('form-toggle');
  if (b) b.textContent = playing ? '⏸' : '▶';
}

export function formSpeed(s: number): void {
  speed = s;
  viewer?.setSpeed(s);
  document.querySelectorAll<HTMLElement>('[data-action="form-speed"]').forEach(b => b.classList.toggle('active', Number(b.dataset.speed) === s));
}

export function formView(name: FormViewName): void {
  viewName = name;
  viewer?.setView(name);
  document.querySelectorAll<HTMLElement>('[data-action="form-view"]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
}
