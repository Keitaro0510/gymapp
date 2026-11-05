// 同期の知らせ（画面の上に出すバナー）と、ファイルの保存
import type { BannerAction } from './sync.ts';
import { byId } from './ui.ts';

export function showBanner(msg: string, actions: BannerAction[]): void {
  const el = byId('sync-banner');
  el.replaceChildren();
  const text = document.createElement('div');
  text.className = 'banner-msg';
  text.textContent = msg;
  el.appendChild(text);
  const row = document.createElement('div');
  row.className = 'banner-actions';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn btn-sm' + (a.primary ? ' btn-primary' : '');
    b.textContent = a.label;
    b.onclick = () => { void a.onclick(); };
    row.appendChild(b);
  }
  el.appendChild(row);
  el.style.display = 'block';
}

export function hideBanner(): void {
  const el = byId('sync-banner');
  el.style.display = 'none';
  el.replaceChildren();
}

/** JSON の文字をファイルにして保存させる */
export function downloadJson(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
