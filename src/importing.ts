// 記録をサーバーに取り込む（バックアップ JSON と、この端末に残った古い記録の両方が通る入口）。
// 同じ記録（日時とセットの中身が同じ）は足さないので、何度取り込んでも二重にならない
import { importChanges, newWorkouts } from './gym-rows.ts';
import { state } from './state.ts';
import { commit, newId } from './sync.ts';
import type { Workout } from './types.ts';

/** 取り込む。足した記録の件数を返す。保存できなければ null（知らせは sync.ts が出す） */
export function importIntoDb(workouts: Workout[], exercises: string[] | null): number | null {
  const news = newWorkouts(state.workouts, workouts);
  const ok = commit(rows => importChanges(rows, news, exercises, new Date(), newId));
  return ok ? news.length : null;
}
