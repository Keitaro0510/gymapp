// 画面が共有する状態。記録と種目は localStorage から読む（Phase 3 までこのまま）
import { loadExercises, loadWorkouts, saveExercises, saveWorkouts } from './storage.ts';
import type { SetEntry, Workout } from './types.ts';

export const state = {
  /** 今日の入力中のセット（保存するまで端末に残さない） */
  sets: [] as SetEntry[],
  workouts: loadWorkouts(localStorage) as Workout[],
  exercises: loadExercises(localStorage) as string[],
  /** アプリを開いた時刻。カレンダーの「今日」と今月の統計に使う（開き直すまで変えない。今までの版と同じ） */
  now: new Date(),
};

export function persistWorkouts(): void { saveWorkouts(localStorage, state.workouts); }
export function persistExercises(): void { saveExercises(localStorage, state.exercises); }
