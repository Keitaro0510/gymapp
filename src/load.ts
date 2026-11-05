// 部位ごとの負荷（その日の総ボリューム）の計算。DOM にも通信にも触れない純粋な関数。
// - セットのボリューム（重量×回数）を、その種目の部位に足す。主の部位は 100%、補助の部位は 50%
// - 色の濃さは、その日いちばん負荷が高い部位を 1（最も濃い）として、ほかを割合にする（gymapp の #11）
import { dayKey } from './stats.ts';
import type { Muscle, Parts } from './muscles.ts';
import type { Workout } from './types.ts';

/** 補助の部位に足す割合（主の部位を 1 として）。調整したいときはここだけ直す */
export const SECONDARY_WEIGHT = 0.5;

export interface MuscleLoad {
  /** 部位ごとの負荷（ボリューム）。負荷のない部位は入らない */
  raw: Map<Muscle, number>;
  /** いちばん大きい負荷（なければ 0） */
  max: number;
  /** その日に記録があったか */
  hasWorkout: boolean;
  /** その日の記録にあるが、部位が未設定で数えられなかった種目（最初に出てきた順） */
  unset: string[];
}

/** day（端末の日付）の記録から、部位ごとの負荷を数える。partsByName は種目名 → 部位（消した種目も含む） */
export function muscleLoad(workouts: Workout[], partsByName: ReadonlyMap<string, Parts>, day: Date): MuscleLoad {
  const key = dayKey(day);
  const raw = new Map<Muscle, number>();
  const unset: string[] = [];
  let hasWorkout = false;
  const add = (m: Muscle, v: number): void => { raw.set(m, (raw.get(m) ?? 0) + v); };
  for (const w of workouts) {
    if (dayKey(new Date(w.date)) !== key) continue;
    hasWorkout = true;
    for (const s of w.sets) {
      const parts = partsByName.get(s.ex);
      if (!parts || !parts.primary) {
        if (!unset.includes(s.ex)) unset.push(s.ex);
        continue;
      }
      const volume = s.kg * s.reps;
      add(parts.primary, volume);
      for (const m of parts.secondary) add(m, volume * SECONDARY_WEIGHT);
    }
  }
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  return { raw, max, hasWorkout, unset };
}

/** 色の濃さ（0〜1）。いちばん負荷が高い部位が 1。負荷がなければ 0 */
export function intensity(load: MuscleLoad, muscle: Muscle): number {
  const v = load.raw.get(muscle) ?? 0;
  return load.max > 0 ? v / load.max : 0;
}
