// この端末の localStorage に残っている、今までの版の記録（キー gw・gw_ex）を読む。
// 記録の正は Supabase になったので、ここには書かない（読むだけ。サーバーへ移す案内は src/legacy.ts）。Storage を引数で受けるので、テストでは偽物を渡せる
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

/** 保存がなければ（または null なら）初期の種目 */
export function loadExercises(store: KeyValueStore): string[] {
  return (JSON.parse(store.getItem(EXERCISES_KEY) || 'null') as string[] | null) || [...DEFAULT_EXERCISES];
}
