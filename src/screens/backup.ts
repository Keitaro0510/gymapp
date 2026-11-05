// バックアップの画面（エクスポート・インポート）
import { backupFileName, buildBackup, mergeBackup, parseBackup, replaceWithBackup } from '../backup.ts';
import { persistExercises, persistWorkouts, state } from '../state.ts';
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

export function importData(file: File | undefined): void {
  if (!file) return;
  const statusEl = byId('backup-status');
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseBackup(String(reader.result));
    if (!parsed.ok) {
      toast(parsed.reason === 'unreadable' ? 'ファイルを読み込めませんでした' : 'バックアップ形式が正しくありません');
      return;
    }
    const merge = state.workouts.length
      ? confirm(`現在${state.workouts.length}件の記録があります。\nOK: 読み込んだデータを追加でマージ\nキャンセル: 既存データを全て置き換え`)
      : true;
    if (merge && state.workouts.length) {
      const r = mergeBackup(state.workouts, state.exercises, parsed);
      state.workouts = r.workouts;
      state.exercises = r.exercises;
      statusEl.textContent = `${r.added}件の記録を追加しました`;
    } else {
      const r = replaceWithBackup(state.exercises, parsed);
      state.workouts = r.workouts;
      state.exercises = r.exercises;
      statusEl.textContent = `${state.workouts.length}件の記録で置き換えました`;
    }
    persistWorkouts();
    persistExercises();
    renderExSelect(); renderExList();
    toast('インポート完了 ✓');
    byId<HTMLInputElement>('import-file').value = '';
  };
  reader.readAsText(file);
}
