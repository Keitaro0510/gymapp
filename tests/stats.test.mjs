// 集計（src/stats.ts）のテスト。今の 1 ファイル版の計算と同じ答えになることを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calc1RM, volume, dayKey, workoutsByDay, groupByExercise, computeMonthStats,
  formatMonthComparison, previousMonth, exerciseTotals, overallTotals,
} from '../src/stats.ts';

const set = (ex, kg, reps) => ({ ex, kg, reps, rpe: null, note: '' });
// 端末の時刻で作る（集計も端末の日付で見るので、どのタイムゾーンでも同じ日になる）
const at = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString();

test('推定1RM: 1回はそのまま、ほかは Epley の式を四捨五入', () => {
  assert.equal(calc1RM(100, 1), 100);
  assert.equal(calc1RM(60, 10), 80);   // 60 × (1 + 10/30)
  assert.equal(calc1RM(62.5, 8), 79);  // 79.16… → 79
});

test('総ボリューム: 重量 × 回数の合計', () => {
  assert.equal(volume({ date: at(2026, 10, 1), sets: [set('a', 60, 10), set('a', 62.5, 8)] }), 1100);
  assert.equal(volume({ date: at(2026, 10, 1), sets: [] }), 0);
});

test('日付のキーは月が0始まり', () => {
  assert.equal(dayKey(new Date(2026, 10, 5)), '2026-10-5');
  const map = workoutsByDay([{ date: at(2026, 10, 5, 8), sets: [] }, { date: at(2026, 10, 5, 20), sets: [] }]);
  assert.equal(map.get('2026-10-5').length, 2);
});

test('種目ごとにまとめる（最初に出てきた順）', () => {
  const g = groupByExercise([set('b', 1, 1), set('a', 1, 1), set('b', 2, 2)]);
  assert.deepEqual([...g.keys()], ['b', 'a']);
  assert.equal(g.get('b').length, 2);
});

test('月の集計: 日数・合計・種目数・記録更新', () => {
  const workouts = [
    { date: at(2026, 10, 3), sets: [set('ベンチ', 60, 10), set('スクワット', 100, 5)] },
    { date: at(2026, 10, 3, 18), sets: [set('ベンチ', 60, 10)] },     // 同じ日
    { date: at(2026, 10, 20), sets: [set('ベンチ', 70, 5)] },
    { date: at(2026, 9, 10), sets: [set('ベンチ', 70, 8), set('スクワット', 120, 5)] }, // 前の月
  ];
  const s = computeMonthStats(workouts, 2026, 10);
  assert.equal(s.days, 2);
  assert.equal(s.totalSets, 4);
  assert.equal(s.totalReps, 30);
  assert.equal(s.totalWeight, 600 + 500 + 600 + 350);
  assert.equal(s.exCount, 2);
  // ベンチ: 今月の最大 83（70×5）、前の月の最大 89（70×8）→ 更新なし。スクワット: 117（100×5）< 140（120×5）→ 更新なし
  assert.equal(s.prCount, 0);
  // 前の月に記録がない種目は更新に数える
  assert.equal(computeMonthStats(workouts, 2026, 9).prCount, 2);
});

test('月の比較の表示', () => {
  const cur = { days: 5, totalWeight: 12000, totalSets: 0, totalReps: 0, exCount: 0, prCount: 0 };
  const prev = { ...cur, days: 3, totalWeight: 10000 };
  assert.deepEqual(formatMonthComparison(cur, prev), { dayDiff: '+2days', weightPct: '+20.00%', tons: '12.0' });
  assert.equal(formatMonthComparison(prev, cur).dayDiff, '-2days');
  assert.equal(formatMonthComparison(prev, cur).weightPct, '-16.67%');
  assert.equal(formatMonthComparison(cur, cur).dayDiff, '±0days');
  const none = { ...cur, days: 0, totalWeight: 0 };
  assert.equal(formatMonthComparison(cur, none).weightPct, 'NEW');
  assert.equal(formatMonthComparison(none, none).weightPct, '±0.00%');
});

test('1つ前の月は年をまたぐ', () => {
  assert.deepEqual(previousMonth(2026, 0), { y: 2025, m: 11 });
  assert.deepEqual(previousMonth(2026, 5), { y: 2026, m: 4 });
});

test('種目別の最大1RMと合計ボリューム', () => {
  const t = exerciseTotals([
    { date: at(2026, 10, 1), sets: [set('a', 60, 10), set('b', 10, 10)] },
    { date: at(2026, 10, 2), sets: [set('a', 70, 5)] },
  ]);
  assert.deepEqual([...t.keys()], ['a', 'b']);
  assert.deepEqual(t.get('a'), { rm: 82, vol: 600 + 350 }); // max(80, 82)
});

test('全期間の合計', () => {
  const t = overallTotals([
    { date: '2026-11-01T01:00:00.000Z', sets: [set('a', 10, 10)] },
    { date: '2026-11-01T05:00:00.000Z', sets: [set('a', 10, 10), set('a', 10, 10)] },
    { date: '2026-11-02T01:00:00.000Z', sets: [] },
  ]);
  assert.deepEqual(t, { sessions: 3, sets: 3, volume: 300, days: 2 });
});
