// 集計（画面に出す数字）。DOM に触れない純粋な関数だけ。
import type { SetEntry, Workout } from './types.ts';

/** 1回のトレーニングの総ボリューム（重量 × 回数の合計） */
export function volume(w: Workout): number {
  return w.sets.reduce((a, s) => a + s.kg * s.reps, 0);
}

/** 端末の日付（月は 0 始まり）をキーにする。カレンダーの日の判定に使う */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 日付ごとのトレーニング */
export function workoutsByDay(workouts: Workout[]): Map<string, Workout[]> {
  const m = new Map<string, Workout[]>();
  for (const w of workouts) {
    const k = dayKey(new Date(w.date));
    const list = m.get(k);
    if (list) list.push(w);
    else m.set(k, [w]);
  }
  return m;
}

/** セットを種目ごとにまとめる（最初に出てきた順） */
export function groupByExercise(sets: SetEntry[]): Map<string, SetEntry[]> {
  const g = new Map<string, SetEntry[]>();
  for (const s of sets) {
    const list = g.get(s.ex);
    if (list) list.push(s);
    else g.set(s.ex, [s]);
  }
  return g;
}

export interface MonthStats {
  days: number;
  totalWeight: number;
  totalSets: number;
  totalReps: number;
  exCount: number;
  prCount: number;
}

/** 月ごとの集計。m は 0 始まり。記録更新種目数は、その月の最高重量が月より前の最高重量を超えた種目の数（実際に上がった重量で比べる。推定はしない） */
export function computeMonthStats(workouts: Workout[], y: number, m: number): MonthStats {
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  const days = new Set<number>();
  let totalWeight = 0, totalSets = 0, totalReps = 0;
  const exSet = new Set<string>();
  const monthMax = new Map<string, number>();
  const priorMax = new Map<string, number>();
  for (const w of workouts) {
    const d = new Date(w.date);
    const inMonth = d >= start && d < end;
    const before = d < start;
    for (const s of w.sets) {
      if (inMonth) {
        const cur = monthMax.get(s.ex);
        if (!cur || s.kg > cur) monthMax.set(s.ex, s.kg);
      } else if (before) {
        const cur = priorMax.get(s.ex);
        if (!cur || s.kg > cur) priorMax.set(s.ex, s.kg);
      }
    }
    if (inMonth) {
      days.add(d.getDate());
      totalSets += w.sets.length;
      for (const s of w.sets) {
        totalWeight += s.kg * s.reps;
        totalReps += s.reps;
        exSet.add(s.ex);
      }
    }
  }
  let prCount = 0;
  for (const [ex, max] of monthMax) {
    const prior = priorMax.get(ex);
    if (!prior || max > prior) prCount++;
  }
  return { days: days.size, totalWeight, totalSets, totalReps, exCount: exSet.size, prCount };
}

/** 前の月と比べた表示（赤いカードの括弧の中）と、トン表示 */
export function formatMonthComparison(cur: MonthStats, prev: MonthStats): { dayDiff: string; weightPct: string; tons: string } {
  const diff = cur.days - prev.days;
  const dayDiff = diff === 0 ? '±0days' : (diff > 0 ? `+${diff}days` : `${diff}days`);
  let weightPct: string;
  if (prev.totalWeight > 0) {
    const pct = (cur.totalWeight - prev.totalWeight) / prev.totalWeight * 100;
    weightPct = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
  } else {
    weightPct = cur.totalWeight > 0 ? 'NEW' : '±0.00%';
  }
  return { dayDiff, weightPct, tons: (cur.totalWeight / 1000).toFixed(1) };
}

/** 1つ前の月（m は 0 始まり） */
export function previousMonth(y: number, m: number): { y: number; m: number } {
  return m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
}

export interface ExerciseTotal {
  /** 最高重量: その種目で実際に上がった最高の重量（回数は問わない） */
  best: number;
  vol: number;
}

/** 全期間の種目別の最高重量と合計ボリューム（最初に出てきた順） */
export function exerciseTotals(workouts: Workout[]): Map<string, ExerciseTotal> {
  const by = new Map<string, ExerciseTotal>();
  for (const w of workouts) {
    for (const s of w.sets) {
      let t = by.get(s.ex);
      if (!t) { t = { best: 0, vol: 0 }; by.set(s.ex, t); }
      if (s.kg > t.best) t.best = s.kg;
      t.vol += s.kg * s.reps;
    }
  }
  return by;
}

/** 全期間の合計 */
export function overallTotals(workouts: Workout[]): { sessions: number; sets: number; volume: number; days: number } {
  return {
    sessions: workouts.length,
    sets: workouts.reduce((a, w) => a + w.sets.length, 0),
    volume: workouts.reduce((a, w) => a + volume(w), 0),
    // 日数は ISO 時刻の日付部分（UTC の日）で数える。今までの版と同じ
    days: new Set(workouts.map(w => w.date.split('T')[0])).size,
  };
}

// ---------- 前回の記録（記録画面で種目を選んだとき） ----------

export interface LastSession {
  /** そのトレーニングの日時（ISO） */
  date: string;
  /** その種目のセットだけ（入力した順） */
  sets: SetEntry[];
}

/** その種目の前回の記録。workouts は新しい順。その種目のセットを含む、いちばん新しいトレーニング。なければ null */
export function lastSession(workouts: Workout[], exercise: string): LastSession | null {
  for (const w of workouts) {
    const sets = w.sets.filter(s => s.ex === exercise);
    if (sets.length) return { date: w.date, sets };
  }
  return null;
}

/** 端末の日付で、from から to まで何日か（時刻は見ない。同じ日は 0） */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/** 「今日」「昨日」「3日前」 */
export function formatDaysAgo(days: number): string {
  return days <= 0 ? '今日' : days === 1 ? '昨日' : `${days}日前`;
}
