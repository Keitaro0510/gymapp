// 最高重量の推移（src/stats.ts の bestSeries など）と折れ線グラフの部品（src/chart-svg.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestSeries, exercisesByFrequency, currentBest, recentRecords, sinceMonths } from '../src/stats.ts';
import { lineChart, niceScale } from '../src/chart-svg.ts';

const set = (ex, kg, reps) => ({ ex, kg, reps, rpe: null, note: '' });
const at = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString(); // m は 0 始まり
const ymd = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const workouts = [ // 新しい順（アプリと同じ）
  { date: at(2026, 10, 4), sets: [set('ベンチ', 80, 6), set('ベンチ', 80, 8), set('ベンチ', 77.5, 10), set('スクワット', 100, 5)] },
  { date: at(2026, 9, 28), sets: [set('ベンチ', 80, 5)] },
  { date: at(2026, 9, 20), sets: [set('ベンチ', 75, 10), set('ベンチ', 70, 12)] },
  { date: at(2026, 9, 20, 20), sets: [set('ベンチ', 77.5, 3)] }, // 同じ日の2回目
  { date: at(2026, 9, 10), sets: [set('ベンチ', 70, 8), set('スクワット', 90, 8)] },
  { date: at(2026, 9, 1), sets: [set('スクワット', 85, 10)] },
];

test('日ごとの最高重量（古い順）。同じ日は、重量の最大と、その重量での最大の回数', () => {
  const s = bestSeries(workouts, 'ベンチ');
  assert.deepEqual(s.map(p => ymd(p.date)), ['2026-10-10', '2026-10-20', '2026-10-28', '2026-11-4']);
  assert.deepEqual(s.map(p => p.kg), [70, 77.5, 80, 80]);
  assert.equal(s[3].reps, 8, '80kg で 6回と8回 → 8回');
  assert.equal(s[1].reps, 3, '同じ日に 75×10 と 77.5×3 → 重い 77.5kg の 3回');
});

test('更新した日: それまでの最高を超えた日だけ。最初の日と、同じ重量の日は更新ではない', () => {
  const s = bestSeries(workouts, 'ベンチ');
  assert.deepEqual(s.map(p => p.pr), [false, true, true, false]);
  // 80kg×5 → 80kg×8 のように、回数が増えただけでは更新にならない
  assert.equal(s[3].pr, false);
  assert.deepEqual(bestSeries(workouts, '知らない種目'), []);
});

test('記録のある種目を、トレーニングした日数の多い順に', () => {
  assert.deepEqual(exercisesByFrequency(workouts), [{ name: 'ベンチ', days: 4 }, { name: 'スクワット', days: 3 }]);
  assert.deepEqual(exercisesByFrequency([]), []);
});

test('今の最高重量: 最後に更新した日（更新がなければ最初の日）', () => {
  const s = bestSeries(workouts, 'ベンチ');
  assert.equal(ymd(currentBest(s).date), '2026-10-28', '80kg に初めて届いた日');
  assert.equal(ymd(currentBest(bestSeries(workouts, 'スクワット')).date), '2026-11-4', '100kg に届いた日');
  const flat = bestSeries([{ date: at(2026, 10, 1), sets: [set('a', 50, 5)] }, { date: at(2026, 10, 3), sets: [set('a', 50, 8)] }], 'a');
  assert.equal(ymd(currentBest(flat).date), '2026-11-1', '更新がなければ最初の日');
  assert.equal(currentBest([]), null);
});

test('更新の一覧: 新しい順で、上がり幅つき', () => {
  const r = recentRecords(bestSeries(workouts, 'ベンチ'));
  assert.deepEqual(r.map(x => [ymd(x.point.date), x.point.kg, x.gain]), [['2026-10-28', 80, 2.5], ['2026-10-20', 77.5, 7.5]]);
  assert.equal(recentRecords(bestSeries(workouts, 'ベンチ'), 1).length, 1);
  assert.deepEqual(recentRecords([]), []);
});

test('直近3か月: 3か月前の同じ日以降。更新の判定は全期間の記録のまま', () => {
  const s = bestSeries(workouts, 'ベンチ');
  const recent = sinceMonths(s, new Date(2026, 10, 20), 3); // 8/20 以降 → 全部
  assert.equal(recent.length, 4);
  const late = sinceMonths(s, new Date(2027, 0, 25), 3); // 2026-10-25 以降
  assert.deepEqual(late.map(p => ymd(p.date)), ['2026-10-28', '2026-11-4']);
  assert.equal(late[0].pr, true, '10/28 の更新は、期間より前の記録と比べた結果のまま');
  assert.equal(sinceMonths(s, new Date(2028, 0, 1), 3).length, 0);
});

test('縦軸: 最小〜最大が収まるきりのよい範囲（0 から始めない）', () => {
  assert.deepEqual(niceScale(70, 80), { lo: 70, hi: 80, step: 2.5 });
  const a = niceScale(62.5, 90);
  assert.ok(a.lo <= 62.5 && a.hi >= 90 && a.lo > 0, `${JSON.stringify(a)}`);
  const flat = niceScale(80, 80);
  assert.ok(flat.lo < 80 && flat.hi > 80 && flat.lo >= 0, '1つの値でも、上下に幅がある');
  assert.ok(niceScale(1, 2).lo >= 0);
  assert.ok(niceScale(0, 3).lo === 0);
});

test('折れ線グラフ: 点の数・更新の強調・横軸のラベル・タップの文', () => {
  const pts = [
    { t: Date.UTC(2026, 9, 10), value: 70, title: '10/10: 70kg×8' },
    { t: Date.UTC(2026, 9, 20), value: 77.5, highlight: true, title: '10/20: 77.5kg×3（更新）' },
    { t: Date.UTC(2026, 10, 4), value: 80, highlight: true, title: '11/4: 80kg×8（更新）' },
  ];
  const svg = lineChart(pts, v => `${v}`, t => `D${new Date(t).getUTCDate()}`);
  assert.equal((svg.match(/<circle/g) || []).length, 3);
  assert.equal((svg.match(/chart-pt pr/g) || []).length, 2);
  assert.match(svg, /<polyline class="chart-line"/);
  assert.match(svg, /data-title="10\/20: 77.5kg×3（更新）"/);
  assert.equal((svg.match(/class="chart-xl"/g) || []).length, 3, '横軸は、最初・真ん中・最後');
  assert.ok(!svg.includes('NaN'));
  // 右の点ほど x が大きく、重い点ほど y が小さい（上にある）
  const cx = [...svg.matchAll(/cx="([0-9.]+)" cy="([0-9.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.ok(cx[0][0] < cx[1][0] && cx[1][0] < cx[2][0]);
  assert.ok(cx[0][1] > cx[1][1] && cx[1][1] > cx[2][1]);
});

test('折れ線グラフ: 点が1つだけ・全部同じ重量でも壊れない', () => {
  const one = lineChart([{ t: 1000, value: 80, title: 'x' }], v => `${v}`, () => 'a');
  assert.ok(!one.includes('NaN'));
  assert.ok(!one.includes('<polyline'), '1つなら線はない');
  assert.equal((one.match(/<circle/g) || []).length, 1);
  const flat = lineChart([{ t: 1000, value: 80, title: 'x' }, { t: 5000, value: 80, title: 'y' }], v => `${v}`, () => 'a');
  assert.ok(!flat.includes('NaN'));
});
