// 集計（src/stats.ts）のテスト。今の 1 ファイル版の計算と同じ答えになることを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  volume, dayKey, workoutsByDay, groupByExercise, computeMonthStats,
  formatMonthComparison, previousMonth, exerciseTotals, overallTotals, lastSession, daysBetween, formatDaysAgo,
} from '../src/stats.ts';

const set = (ex, kg, reps) => ({ ex, kg, reps, rpe: null, note: '' });
// 端末の時刻で作る（集計も端末の日付で見るので、どのタイムゾーンでも同じ日になる）
const at = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString();

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
  // 記録更新は、実際に上がった最高重量で比べる（推定はしない）
  // ベンチ: 今月の最高 70kg、前の月の最高 70kg → 同じなので更新なし（70×5 と 70×8 で回数が違っても、重量は同じ）
  // スクワット: 今月 100kg < 前の月 120kg → 更新なし
  assert.equal(s.prCount, 0);
  // 前の月に記録がない種目は更新に数える
  assert.equal(computeMonthStats(workouts, 2026, 9).prCount, 2);
  // 重量が上がれば更新。回数が増えただけ（80×5 → 80×10）では更新にならない
  const w2 = [
    { date: at(2026, 9, 1), sets: [set('ベンチ', 80, 5), set('スクワット', 100, 5)] },
    { date: at(2026, 10, 1), sets: [set('ベンチ', 80, 10), set('スクワット', 102.5, 1)] },
  ];
  assert.equal(computeMonthStats(w2, 2026, 10).prCount, 1);
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

test('種目別の最高重量（実際に上がった最高の重量）と合計ボリューム', () => {
  const t = exerciseTotals([
    { date: at(2026, 10, 1), sets: [set('a', 60, 10), set('b', 10, 10)] },
    { date: at(2026, 10, 2), sets: [set('a', 80, 5), set('a', 75, 8)] },
  ]);
  assert.deepEqual([...t.keys()], ['a', 'b']);
  // 80×5 が上がったので最高重量は 80（推定の 93 ではない）。回数は問わない
  assert.deepEqual(t.get('a'), { best: 80, vol: 600 + 400 + 600 });
  assert.equal(t.get('b').best, 10);
});

test('全期間の合計', () => {
  const t = overallTotals([
    { date: '2026-11-01T01:00:00.000Z', sets: [set('a', 10, 10)] },
    { date: '2026-11-01T05:00:00.000Z', sets: [set('a', 10, 10), set('a', 10, 10)] },
    { date: '2026-11-02T01:00:00.000Z', sets: [] },
  ]);
  assert.deepEqual(t, { sessions: 3, sets: 3, volume: 300, days: 2 });
});

test('前回の記録: その種目を含むいちばん新しいトレーニングの、その種目のセットだけ', () => {
  const workouts = [ // 新しい順
    { date: at(2026, 10, 5), sets: [set('スクワット', 100, 5)] },
    { date: at(2026, 10, 3), sets: [set('ベンチ', 80, 5), set('スクワット', 90, 8), set('ベンチ', 77.5, 6)] },
    { date: at(2026, 9, 28), sets: [set('ベンチ', 75, 8)] },
  ];
  const last = lastSession(workouts, 'ベンチ');
  assert.equal(last.date, workouts[1].date);
  assert.deepEqual(last.sets.map(s => `${s.kg}x${s.reps}`), ['80x5', '77.5x6'], '他の種目のセットは入らない');
  assert.equal(lastSession(workouts, 'スクワット').date, workouts[0].date);
  assert.equal(lastSession(workouts, 'デッドリフト'), null);
  assert.equal(lastSession([], 'ベンチ'), null);
});

test('何日前か: 端末の日付で数える（時刻は見ない）', () => {
  assert.equal(daysBetween(new Date(2026, 10, 5, 23, 59), new Date(2026, 10, 5, 0, 1)), 0);
  assert.equal(daysBetween(new Date(2026, 10, 4, 23, 59), new Date(2026, 10, 5, 0, 1)), 1, '時刻が近くても、日付が違えば1日前');
  assert.equal(daysBetween(new Date(2026, 9, 31), new Date(2026, 10, 5)), 5, '月をまたぐ');
  assert.equal(daysBetween(new Date(2026, 2, 28), new Date(2026, 3, 1)), 4, '夏時間の国でも日数がずれない');
  assert.deepEqual([0, 1, 3, -1].map(formatDaysAgo), ['今日', '昨日', '3日前', '今日']);
});
