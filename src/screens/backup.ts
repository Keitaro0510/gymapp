// バックアップの画面（エクスポート・インポート）
import { backupFileName, buildBackup, parseBackup } from '../backup.ts';
import { importIntoDb } from '../importing.ts';
import { state } from '../state.ts';
import { byId, toast } from '../ui.ts';
import { renderExList, renderExSelect } from './exercises.ts';

export function exportData(): void {
  const now = new Date();
  const payload = buildBackup(state.workouts, state.exercises, now);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('バックアップをダウンロードしました');
}

/** 読み込んだファイルを、サーバーに足す（同じ記録は足さない。全部置き換えはしない） */
export function importData(file: File | undefined): void {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseBackup(String(reader.result));
    if (!parsed.ok) {
      toast(parsed.reason === 'unreadable' ? 'ファイルを読み込めませんでした' : 'バックアップ形式が正しくありません');
      return;
    }
    const added = importIntoDb(parsed.workouts, parsed.exercises);
    byId<HTMLInputElement>('import-file').value = '';
    if (added === null) return; // 保存できなかった（知らせは出ている）
    byId('backup-status').textContent = `${added}件の記録を追加しました`;
    renderExSelect(); renderExList();
    toast('インポート完了 ✓');
  };
  reader.readAsText(file);
}
