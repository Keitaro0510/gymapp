// バックアップ JSON の作成・読み込み・マージ。DOM に触れない。
import type { Backup, Workout } from './types.ts';

export function buildBackup(workouts: Workout[], exercises: string[], now: Date): Backup {
  return {
    app: 'gym-tracker-backup',
    version: 1,
    exportedAt: now.toISOString(),
    workouts,
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

/** 同じ記録かどうかの判定（日時とセットの中身が同じ） */
function workoutKey(w: Workout): string {
  return w.date + JSON.stringify(w.sets);
}

/** 追加でマージする。同じ記録は足さない。新しい順に並べ、知らない種目は後ろに足す。元の配列は変えない */
export function mergeBackup(
  workouts: Workout[], exercises: string[],
  incoming: { workouts: Workout[]; exercises: string[] | null },
): { workouts: Workout[]; exercises: string[]; added: number } {
  const merged = [...workouts];
  const keys = new Set(workouts.map(workoutKey));
  let added = 0;
  for (const w of incoming.workouts) {
    if (!keys.has(workoutKey(w))) { merged.push(w); added++; }
  }
  merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const mergedEx = [...exercises];
  for (const e of incoming.exercises ?? []) {
    if (!mergedEx.includes(e)) mergedEx.push(e);
  }
  return { workouts: merged, exercises: mergedEx, added };
}

/** 全部置き換える。種目は、読み込んだ中身が空でないときだけ置き換える */
export function replaceWithBackup(
  exercises: string[],
  incoming: { workouts: Workout[]; exercises: string[] | null },
): { workouts: Workout[]; exercises: string[] } {
  return {
    workouts: incoming.workouts,
    exercises: incoming.exercises && incoming.exercises.length ? incoming.exercises : exercises,
  };
}
