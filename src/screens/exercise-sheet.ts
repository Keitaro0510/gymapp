// 種目の詳細シート（下から出る）: やり方・フォーム・意識することのメモと、解説動画のリンク（#23）
import { checkNotes, isSafeLink, normalizeVideoUrl, NOTES_MAX, youtubeSearchUrl } from '../exercise-detail.ts';
import { setDetailChanges } from '../gym-rows.ts';
import { describeParts } from '../muscles.ts';
import { state } from '../state.ts';
import { commit } from '../sync.ts';
import { byId, esc, toast } from '../ui.ts';

/** 開いている種目の id（なければ閉じている） */
let openId: string | null = null;

function render(): void {
  const info = state.exerciseInfos.find(e => e.id === openId);
  const sheet = byId('ex-sheet');
  if (!info) { sheet.classList.remove('show'); openId = null; return; }
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
  sheet.classList.add('show');
}

/** 種目の詳細を開く */
export function openExercise(id: string): void {
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
