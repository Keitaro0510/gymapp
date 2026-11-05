// localStorage への保存と読み込み。Storage を引数で受けるので、テストでは偽物を渡せる。
// Phase 3 で、ここが「端末の写し」になり、Supabase が正になる（docs/PLAN.md）
import type { Workout } from './types.ts';

export const WORKOUTS_KEY = 'gw';
export const EXERCISES_KEY = 'gw_ex';

export const DEFAULT_EXERCISES: readonly string[] = [
  'ベンチプレス', 'スクワット', 'デッドリフト', 'ショルダープレス', 'ラットプルダウン', 'バーベルロウ',
  'ダンベルカール', 'トライセプスプレス', 'レッグプレス', 'チェストフライ', 'インクラインプレス', 'ケーブルクロス',
];

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export function loadWorkouts(store: KeyValueStore): Workout[] {
  return JSON.parse(store.getItem(WORKOUTS_KEY) || '[]') as Workout[];
}

export function saveWorkouts(store: KeyValueStore, workouts: Workout[]): void {
  store.setItem(WORKOUTS_KEY, JSON.stringify(workouts));
}

/** 保存がなければ（または null なら）初期の種目 */
export function loadExercises(store: KeyValueStore): string[] {
  return (JSON.parse(store.getItem(EXERCISES_KEY) || 'null') as string[] | null) || [...DEFAULT_EXERCISES];
}

export function saveExercises(store: KeyValueStore, exercises: string[]): void {
  store.setItem(EXERCISES_KEY, JSON.stringify(exercises));
}
