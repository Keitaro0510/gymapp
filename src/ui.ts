// 画面の共通の道具: 要素の取得・HTML のエスケープ・トースト
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が index.html にありません`);
  return el as T;
}

/** テンプレートで innerHTML に入れる文字列（種目名・メモなど、人が入力したもの）のエスケープ */
export function esc(text: string | number): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toast(msg: string): void {
  const t = byId('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
