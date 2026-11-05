// 画面が共有する状態。記録と種目は Supabase が正で、ここにあるのは、サーバーの写しに送信待ちを重ねて作った「画面の形」
import type { User } from '@supabase/supabase-js';
import type { Op, Server } from './data.ts';
import type { ExerciseInfo } from './gym-rows.ts';
import type { SetEntry, StoredWorkout } from './types.ts';

/** 送るのを止めている理由。選んでもらうまで送らない */
export type SendBlocked = 'conflict' | 'stale_epoch' | 'error';

export const state = {
  /** 今日の入力中のセット（保存するまで DB にも端末にも残さない） */
  sets: [] as SetEntry[],
  /** 新しい順。サーバーの写し＋送信待ちから作る（src/sync.ts の rebuildView） */
  workouts: [] as StoredWorkout[],
  /** 消していない種目（並び順） */
  exercises: [] as string[],
  /** 消していない種目（部位つき） */
  exerciseInfos: [] as ExerciseInfo[],
  /** アプリを開いた時刻。カレンダーの「今日」と今月の統計に使う（開き直すまで変えない。今までの版と同じ） */
  now: new Date(),

  /** サーバーの写し */
  server: null as Server | null,
  /** 送信待ちの操作 */
  outbox: [] as Op[],
  currentUser: null as User | null,
  /** サーバーから読み込めた */
  remoteReady: false,
  loadingRemote: false,
  sending: false,
  sendBlocked: null as SendBlocked | null,
};
