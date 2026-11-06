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

/**
 * 期間 [start, end) の集計。start・end は端末の日付（0時）。日数は端末の日付で数える。
 * 記録更新種目数は、その期間の最高重量が、期間より前の最高重量を超えた種目の数（実際に上がった重量で比べる。推定はしない）
 */
export function summarizeRange(workouts: Workout[], start: Date, end: Date): MonthStats {
  const days = new Set<string>();
  let totalWeight = 0, totalSets = 0, totalReps = 0;
  const exSet = new Set<string>();
  const rangeMax = new Map<string, number>();
  const priorMax = new Map<string, number>();
  for (const w of workouts) {
    const d = new Date(w.date);
    const inRange = d >= start && d < end;
    const before = d < start;
    for (const s of w.sets) {
      if (inRange) {
        const cur = rangeMax.get(s.ex);
        if (!cur || s.kg > cur) rangeMax.set(s.ex, s.kg);
      } else if (before) {
        const cur = priorMax.get(s.ex);
        if (!cur || s.kg > cur) priorMax.set(s.ex, s.kg);
      }
    }
    if (inRange) {
      days.add(dayKey(d));
      totalSets += w.sets.length;
      for (const s of w.sets) {
        totalWeight += s.kg * s.reps;
        totalReps += s.reps;
        exSet.add(s.ex);
      }
    }
  }
  let prCount = 0;
  for (const [ex, max] of rangeMax) {
    const prior = priorMax.get(ex);
    if (!prior || max > prior) prCount++;
  }
  return { days: days.size, totalWeight, totalSets, totalReps, exCount: exSet.size, prCount };
}

/** 月ごとの集計。m は 0 始まり */
export function computeMonthStats(workouts: Workout[], y: number, m: number): MonthStats {
  return summarizeRange(workouts, new Date(y, m, 1), new Date(y, m + 1, 1));
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

// ---------- 期間（週・月）の比較と推移（統計画面） ----------

export type PeriodKind = 'week' | 'month';

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** d を含む期間の始まり（端末の日付の0時）。週は月曜始まり、月は1日 */
export function periodStart(kind: PeriodKind, d: Date): Date {
  if (kind === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  const sinceMonday = (d.getDay() + 6) % 7; // 月曜 0 … 日曜 6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

/** 期間の始まりを n 期間ずらす（負なら前） */
export function shiftPeriod(kind: PeriodKind, start: Date, n: number): Date {
  return kind === 'month' ? new Date(start.getFullYear(), start.getMonth() + n, 1) : addDays(start, 7 * n);
}

export interface PeriodComparison {
  cur: MonthStats;
  prev: MonthStats;
  /** 今の期間が始まってから今日まで何日目か（今日を含む） */
  elapsed: number;
  curStart: Date;
  prevStart: Date;
}

/**
 * 今の期間（今日まで）と、前の期間の「同じ日数まで」を比べる。
 * 今週が水曜なら、今週の月〜水と、先週の月〜水。今月が6日なら、今月の1〜6日と、先月の1〜6日（先月が短いときは、先月の終わりまで）
 */
export function comparePeriods(workouts: Workout[], kind: PeriodKind, now: Date): PeriodComparison {
  const curStart = periodStart(kind, now);
  const elapsed = daysBetween(curStart, now) + 1;
  const prevStart = shiftPeriod(kind, curStart, -1);
  const prevEnd = new Date(Math.min(addDays(prevStart, elapsed).getTime(), curStart.getTime()));
  return {
    cur: summarizeRange(workouts, curStart, addDays(curStart, elapsed)),
    prev: summarizeRange(workouts, prevStart, prevEnd),
    elapsed, curStart, prevStart,
  };
}

export interface PeriodPoint {
  start: Date;
  /** その期間の総ボリューム（重量×回数）。今の期間は、今日までの分 */
  volume: number;
  current: boolean;
}

/** 直近 count 期間（古い順。最後が今の期間）の総ボリューム */
export function periodSeries(workouts: Workout[], kind: PeriodKind, now: Date, count = 12): PeriodPoint[] {
  const curStart = periodStart(kind, now);
  const out: PeriodPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftPeriod(kind, curStart, -i);
    const end = shiftPeriod(kind, start, 1);
    out.push({ start, volume: summarizeRange(workouts, start, end).totalWeight, current: i === 0 });
  }
  return out;
}

/** 前の期間との差の表示。count は「+2」「±0」「-1」、volume は「+12.5%」「NEW」「±0%」 */
export function formatDiff(kind: 'count' | 'volume', cur: number, prev: number): string {
  if (kind === 'count') {
    const d = cur - prev;
    return d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`;
  }
  if (prev > 0) {
    const pct = (cur - prev) / prev * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  }
  return cur > 0 ? 'NEW' : '±0%';
}
