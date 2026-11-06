// 期間（週・月）の計算と比較・推移（src/stats.ts）、棒グラフの部品（src/chart-svg.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeRange, computeMonthStats, periodStart, shiftPeriod, comparePeriods, periodSeries, formatDiff, addDays,
} from '../src/stats.ts';
import { barChart, niceMax } from '../src/chart-svg.ts';

const set = (ex, kg, reps) => ({ ex, kg, reps, rpe: null, note: '' });
const at = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString(); // m は 0 始まり
const ymd = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test('週は月曜始まり、月は1日始まり（端末の日付の0時）', () => {
  // 2026-11-05 は木曜
  assert.equal(ymd(periodStart('week', new Date(2026, 10, 5, 15))), '2026-11-2');
  assert.equal(ymd(periodStart('week', new Date(2026, 10, 2))), '2026-11-2', '月曜はその日');
  assert.equal(ymd(periodStart('week', new Date(2026, 10, 8, 23, 59))), '2026-11-2', '日曜は、その週の最後');
  assert.equal(ymd(periodStart('week', new Date(2026, 10, 1))), '2026-10-26', '月をまたぐ');
  assert.equal(ymd(periodStart('month', new Date(2026, 10, 30))), '2026-11-1');
  assert.equal(periodStart('week', new Date(2026, 10, 5, 15)).getHours(), 0);
});

test('期間をずらす: 週は7日、月は月（年をまたぐ）', () => {
  assert.equal(ymd(shiftPeriod('week', new Date(2026, 10, 2), -1)), '2026-10-26');
  assert.equal(ymd(shiftPeriod('week', new Date(2026, 10, 2), 2)), '2026-11-16');
  assert.equal(ymd(shiftPeriod('month', new Date(2026, 0, 1), -1)), '2025-12-1');
  assert.equal(ymd(shiftPeriod('month', new Date(2026, 10, 1), -11)), '2025-12-1');
  assert.equal(ymd(addDays(new Date(2026, 10, 30), 1)), '2026-12-1');
});

test('範囲の集計: 日数・ボリューム・セット・更新。終わりの日は入らない', () => {
  const ws = [
    { date: at(2026, 10, 2), sets: [set('ベンチ', 60, 10), set('ベンチ', 60, 10)] },
    { date: at(2026, 10, 2, 20), sets: [set('スクワット', 100, 5)] }, // 同じ日
    { date: at(2026, 10, 4), sets: [set('ベンチ', 70, 5)] },
    { date: at(2026, 10, 9), sets: [set('ベンチ', 999, 1)] },          // 範囲の終わりの日
  ];
  const s = summarizeRange(ws, new Date(2026, 10, 2), new Date(2026, 10, 9));
  assert.equal(s.days, 2);
  assert.equal(s.totalSets, 4);
  assert.equal(s.totalWeight, 1200 + 500 + 350);
  assert.equal(s.exCount, 2);
  assert.equal(computeMonthStats(ws, 2026, 10).days, 3, '月の集計も同じ関数（11月は3日）');
});

test('最高重量の更新: 期間より前の最高重量を超えたとき。回数が増えただけでは更新ではない', () => {
  const ws = [
    { date: at(2026, 9, 20), sets: [set('ベンチ', 80, 5), set('スクワット', 100, 5)] },
    { date: at(2026, 10, 3), sets: [set('ベンチ', 80, 10), set('スクワット', 102.5, 1), set('デッド', 120, 3)] },
  ];
  // ベンチ: 80 → 80（更新なし）／スクワット: 100 → 102.5（更新）／デッド: 初めて（更新）
  assert.equal(summarizeRange(ws, new Date(2026, 10, 1), new Date(2026, 11, 1)).prCount, 2);
});

test('比較: 今週が水曜なら、今週の月〜水と、先週の月〜水', () => {
  // 今日は 2026-11-04（水）。今週は 11/2〜、先週は 10/26〜
  const now = new Date(2026, 10, 4, 18);
  const ws = [
    { date: at(2026, 9, 26), sets: [set('ベンチ', 60, 10)] },   // 先週の月 → 数える
    { date: at(2026, 9, 28), sets: [set('ベンチ', 60, 10)] },   // 先週の水 → 数える
    { date: at(2026, 9, 30), sets: [set('ベンチ', 60, 10)] },   // 先週の金 → 同じ日数を過ぎている → 数えない
    { date: at(2026, 10, 2), sets: [set('ベンチ', 70, 10)] },   // 今週の月
    { date: at(2026, 10, 4, 9), sets: [set('ベンチ', 70, 10)] }, // 今週の水（今日）
  ];
  const c = comparePeriods(ws, 'week', now);
  assert.equal(c.elapsed, 3);
  assert.equal(ymd(c.curStart), '2026-11-2');
  assert.equal(ymd(c.prevStart), '2026-10-26');
  assert.equal(c.cur.days, 2);
  assert.equal(c.prev.days, 2, '先週の金曜は入らない');
  assert.equal(c.cur.totalWeight, 1400);
  assert.equal(c.prev.totalWeight, 1200);
});

test('比較: 月は、1〜今日の日までを、先月の1〜同じ日までと比べる。先月が短くても止まらない', () => {
  const ws = [
    { date: at(2026, 1, 28), sets: [set('ベンチ', 50, 10)] }, // 2月28日
    { date: at(2026, 2, 3), sets: [set('ベンチ', 60, 10)] },
  ];
  // 今日は3月31日: 先月（2月）は28日までしかない → 2月全体と比べる
  const c = comparePeriods(ws, 'month', new Date(2026, 2, 31, 12));
  assert.equal(c.elapsed, 31);
  assert.equal(c.prev.days, 1);
  assert.equal(c.cur.days, 1);
  // 今日が3月3日なら、先月の1〜3日だけ（28日の記録は入らない）
  assert.equal(comparePeriods(ws, 'month', new Date(2026, 2, 3, 12)).prev.days, 0);
});

test('今の期間が始まった日（月曜・1日）でも、1日分を比べる', () => {
  const c = comparePeriods([], 'week', new Date(2026, 10, 2, 0, 5));
  assert.equal(c.elapsed, 1);
  assert.equal(comparePeriods([], 'month', new Date(2026, 10, 1)).elapsed, 1);
});

test('推移: 直近12期間が古い順で、最後が今の期間。記録のない期間は 0', () => {
  const now = new Date(2026, 10, 4);
  const ws = [
    { date: at(2026, 10, 3), sets: [set('ベンチ', 100, 10)] },  // 今週
    { date: at(2026, 9, 27), sets: [set('ベンチ', 50, 10)] },   // 先週
  ];
  const s = periodSeries(ws, 'week', now, 12);
  assert.equal(s.length, 12);
  assert.deepEqual(s.map(p => p.current), [...Array(11).fill(false), true]);
  assert.equal(s[11].volume, 1000);
  assert.equal(s[10].volume, 500);
  assert.equal(s[0].volume, 0);
  assert.equal(ymd(s[11].start), '2026-11-2');
  assert.equal(ymd(s[0].start), '2026-8-17');
  const m = periodSeries(ws, 'month', now, 12);
  assert.equal(ymd(m[0].start), '2025-12-1');
  assert.equal(m[11].volume, 1000, '11月は 11/3 の分だけ（10/27 は10月）');
  assert.equal(m[10].volume, 500);
});

test('差の表示', () => {
  assert.equal(formatDiff('count', 5, 3), '+2');
  assert.equal(formatDiff('count', 3, 5), '-2');
  assert.equal(formatDiff('count', 3, 3), '±0');
  assert.equal(formatDiff('volume', 12000, 10000), '+20.0%');
  assert.equal(formatDiff('volume', 5000, 10000), '-50.0%');
  assert.equal(formatDiff('volume', 100, 0), 'NEW');
  assert.equal(formatDiff('volume', 0, 0), '±0%');
});

test('グラフの縦軸の上端: 1・2・5 × 10 の累乗に切り上げる', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(1), 1);
  assert.equal(niceMax(1.1), 2);
  assert.equal(niceMax(2.5), 5);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(12400), 20000);
  assert.equal(niceMax(50000), 50000);
  assert.equal(niceMax(0.3), 0.5);
});

test('棒グラフ: 棒の数・今の期間の強調・値の高さ・ラベル', () => {
  const bars = [
    { label: '11/2', value: 0, title: 'a' },
    { label: '', value: 5000, title: 'b' },
    { label: '11/16', value: 10000, current: true, title: 'c' },
  ];
  const svg = barChart(bars, v => `${v}`);
  assert.equal((svg.match(/class="chart-bar/g) || []).length, 3);
  assert.equal((svg.match(/chart-bar current/g) || []).length, 1);
  assert.match(svg, /data-title="c" data-value="10000"/);
  assert.match(svg, />11\/2</);
  assert.equal((svg.match(/class="chart-xl"/g) || []).length, 2, '空のラベルは出さない');
  const height = i => Number(svg.match(new RegExp(`data-i="${i}"[^>]*height="([0-9.]+)"`))[1]);
  assert.equal(height(0), 0, '値が 0 の棒は高さ 0');
  assert.ok(Math.abs(height(2) - 2 * height(1)) < 0.2, '値が2倍なら、高さも2倍');
  assert.ok(svg.includes('>10000<') || svg.includes('>10000</text>'), '縦軸の上端の目盛りが出る');
});

test('棒グラフ: 全部 0 でも壊れない', () => {
  const svg = barChart([{ label: 'a', value: 0, title: 't' }, { label: 'b', value: 0, title: 'u' }], v => `${v}`);
  assert.ok(!svg.includes('NaN'));
  assert.match(svg, /<svg/);
});
