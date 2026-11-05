// 保存データの形。今の localStorage の中身（キー gw・gw_ex）と同じ。
// Phase 3 で DB につなぐときに、名前 → ID の変換をここから始める（docs/PLAN.md）

/** 1セット。種目は名前の文字列で指す（ID はない） */
export interface SetEntry {
  ex: string;
  kg: number;
  reps: number;
  /** 入力欄の文字列のまま保存している（空なら null）。バックアップに数値で入っていることもある */
  rpe: string | number | null;
  note: string;
}

/** 1回のトレーニング。date は保存した瞬間の ISO 時刻 */
export interface Workout {
  date: string;
  sets: SetEntry[];
}

/** DB から読んだトレーニング（画面が使う形）。id は gym_workouts の行の id */
export interface StoredWorkout extends Workout {
  id: string;
}

/** バックアップ JSON（アプリの「エクスポート」） */
export interface Backup {
  app: 'gym-tracker-backup';
  version: 1;
  exportedAt: string;
  workouts: Workout[];
  exercises: string[];
}
