// バックアップ JSON の作成・読み込み。DOM に触れない。サーバーへの取り込みは src/importing.ts
import type { Backup, Workout } from './types.ts';

/** バックアップの形は今までの版と同じ（行の id は入れない）。取り込みで、同じ記録を二重に足さないように date と sets で見分ける（src/gym-rows.ts の workoutKey） */
export function buildBackup(workouts: Workout[], exercises: string[], now: Date): Backup {
  return {
    app: 'gym-tracker-backup',
    version: 1,
    exportedAt: now.toISOString(),
    workouts: workouts.map(w => ({ date: w.date, sets: w.sets })),
    exercises,
  };
}

export function backupFileName(now: Date): string {
  return `gym-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type ParsedBackup =
  | { ok: true; workouts: Workout[]; exercises: string[] | null }
  | { ok: false; reason: 'unreadable' | 'format' };

/** ファイルの中身を読む。workouts が配列でなければ形式エラー。exercises は配列のときだけ使う */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { return { ok: false, reason: 'unreadable' }; }
  const d = data as { workouts?: unknown; exercises?: unknown } | null;
  if (!d || !Array.isArray(d.workouts)) return { ok: false, reason: 'format' };
  return { ok: true, workouts: d.workouts as Workout[], exercises: Array.isArray(d.exercises) ? d.exercises as string[] : null };
}
