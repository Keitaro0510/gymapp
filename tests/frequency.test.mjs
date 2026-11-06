// 頻度（src/stats.ts の週の日数・部位の空き日数・ヒートマップ）と、そのグラフの部品（src/chart-svg.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodSeries, muscleGaps, dailyVolumes, percentile90, heatmapCells } from '../src/stats.ts';
import { barChart, heatmap } from '../src/chart-svg.ts';
import { MUSCLES } from '../src/muscles.ts';

const set = (ex, kg, reps) => ({ ex, kg, reps, rpe: null, note: '' });
const at = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString(); // m は 0 始まり
const ymd = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test('週ごとのトレーニング日数: 同じ日に2回やっても1日。記録のない週は 0', () => {
  const now = new Date(2026, 10, 6, 12); // 金曜。今週は 11/2〜
  const ws = [
    { date: at(2026, 10, 2), sets: [set('a', 10, 10)] },
    { date: at(2026, 10, 2, 20), sets: [set('a', 10, 10)] },  // 同じ日
    { date: at(2026, 10, 4), sets: [set('a', 10, 10)] },
    { date: at(2026, 9, 27), sets: [set('a', 10, 10)] },      // 先週
  ];
  const s = periodSeries(ws, 'week', now, 12);
  assert.equal(s[11].days, 2);
  assert.equal(s[10].days, 1);
  assert.equal(s[0].days, 0);
  assert.equal(s[11].volume, 300, '従来のボリュームも変わらない');
});

const parts = new Map([
  ['ベンチ', { primary: 'chest', secondary: ['delt_front', 'triceps'] }],
  ['スクワット', { primary: 'quads', secondary: ['glutes'] }],
  ['サイドレイズ', { primary: 'delt_side', secondary: [] }],
]);

test('部位ごとの最後にやってから: 主の部位の日だけ数える。補助だけの日は数えない', () => {
  const now = new Date(2026, 10, 10, 20);
  const ws = [
    { date: at(2026, 10, 8), sets: [set('ベンチ', 60, 10)] },       // 胸: 2日前。肩前部・三頭筋は補助
    { date: at(2026, 10, 1), sets: [set('スクワット', 100, 5)] },    // 大腿四頭筋: 9日前。臀部は補助
    { date: at(2026, 10, 10, 9), sets: [set('サイドレイズ', 10, 10)] }, // 肩中部: 今日
    { date: at(2026, 9, 1), sets: [set('ベンチ', 60, 10)] },        // 胸の昔の記録（新しいほうが優先）
  ];
  const g = muscleGaps(ws, parts, now);
  const days = Object.fromEntries(g.map(x => [x.muscle, x.days]));
  assert.equal(days.chest, 2);
  assert.equal(days.quads, 9);
  assert.equal(days.delt_side, 0, '今日は 0');
  assert.equal(days.delt_front, null, '補助だけでは数えない');
  assert.equal(days.glutes, null);
  assert.equal(days.calves, null, '一度もなければ null');
  assert.equal(g.length, MUSCLES.length, '14 の部位が全部入る');
});

test('部位の並び: 一度もない部位が先、次に長くあいた順。同じなら一覧の順', () => {
  const now = new Date(2026, 10, 10, 12);
  const ws = [
    { date: at(2026, 10, 8), sets: [set('ベンチ', 60, 10)] },
    { date: at(2026, 10, 1), sets: [set('スクワット', 100, 5)] },
    { date: at(2026, 10, 10), sets: [set('サイドレイズ', 10, 10)] },
  ];
  const g = muscleGaps(ws, parts, now);
  const idx = m => g.findIndex(x => x.muscle === m);
  const nulls = g.filter(x => x.days === null).length;
  assert.deepEqual(g.slice(0, nulls).map(x => x.days), Array(nulls).fill(null), '記録なしが先頭にまとまる');
  assert.ok(idx('quads') < idx('chest') && idx('chest') < idx('delt_side'), '9日前 → 2日前 → 今日');
  assert.deepEqual(g.slice(0, nulls).map(x => x.muscle), MUSCLES.map(m => m.id).filter(m => !['chest', 'quads', 'delt_side'].includes(m)), '記録なしどうしは、一覧の順');
  assert.deepEqual(muscleGaps([], new Map(), now).map(x => x.days), Array(14).fill(null));
});

test('日ごとのボリュームと、上位10%', () => {
  const d = dailyVolumes([
    { date: at(2026, 10, 2), sets: [set('a', 10, 10)] },
    { date: at(2026, 10, 2, 20), sets: [set('a', 10, 5)] },
    { date: at(2026, 10, 3), sets: [set('a', 20, 10)] },
  ]);
  assert.equal(d.get('2026-10-2'), 150);
  assert.equal(d.get('2026-10-3'), 200);
  assert.equal(percentile90([]), 0);
  assert.equal(percentile90([0, 0]), 0, '0 の日は数えない');
  assert.equal(percentile90([5]), 5);
  assert.equal(percentile90(Array.from({ length: 10 }, (_, i) => (i + 1) * 100)), 900, '10日なら9番目（上位10%の手前）');
  assert.equal(percentile90(Array.from({ length: 20 }, (_, i) => i + 1)), 18);
});

test('ヒートマップ: 52週×7日。今の週が右端で、先の日は future。濃さは上位10%を1として割合', () => {
  const now = new Date(2026, 10, 4, 12); // 水曜
  const ws = [
    { date: at(2026, 10, 4), sets: [set('a', 100, 10)] }, // 今日 1000
    { date: at(2026, 10, 3), sets: [set('a', 50, 10)] },  // 500
    { date: at(2026, 9, 1), sets: [set('a', 100, 10)] },  // 1000
  ];
  const { cells, ref } = heatmapCells(ws, now, 52);
  assert.equal(cells.length, 52 * 7);
  assert.equal(ref, 1000);
  assert.equal(ymd(cells[0].date), '2025-11-10', '最初の列は 51 週前の月曜');
  const cur = cells.filter(c => c.col === 51);
  assert.equal(ymd(cur[0].date), '2026-11-2');
  assert.deepEqual(cur.map(c => c.future), [false, false, false, true, true, true, true], '水曜までが過去');
  const lv = date => cells.find(c => ymd(c.date) === date).level;
  assert.equal(lv('2026-11-4'), 1);
  assert.equal(lv('2026-11-3'), 0.5);
  assert.equal(lv('2026-11-2'), 0);
  assert.deepEqual(heatmapCells([], now).cells.every(c => c.level === 0), true, '記録がなくても壊れない');
});

test('棒グラフ: 目標の線と、届いた棒・今の期間の棒の印。縦軸の上端を指定できる', () => {
  const bars = [
    { label: 'a', value: 1, title: 't1' },
    { label: 'b', value: 3, hit: true, title: 't2' },
    { label: 'c', value: 2, now: true, title: 't3' },
  ];
  const svg = barChart(bars, v => `${v}`, 4, { top: 4, goal: 3 });
  assert.match(svg, /<line class="chart-goal"/);
  assert.match(svg, />目標 3</);
  assert.equal((svg.match(/chart-bar hit/g) || []).length, 1);
  assert.equal((svg.match(/chart-bar now/g) || []).length, 1);
  assert.ok(svg.includes('>4<') && svg.includes('>1<'), '縦軸は 0〜4 の整数');
  assert.ok(!svg.includes('>2.5<'));
  assert.ok(!barChart(bars, v => `${v}`).includes('chart-goal'), '目標がなければ線は出ない');
  assert.ok(!barChart(bars, v => `${v}`, 4, { goal: 99 }).includes('chart-goal'), '縦軸の外の目標は線にしない');
});

test('ヒートマップの SVG: 先の日は出さない。濃さが色に出る。今日に印', () => {
  const cells = [
    { col: 0, row: 0, level: 1, future: false, today: false, title: 'a' },
    { col: 0, row: 1, level: 0.5, future: false, today: true, title: 'b' },
    { col: 0, row: 2, level: 0, future: false, today: false, title: 'c' },
    { col: 1, row: 0, level: 0, future: true, today: false, title: 'd' },
  ];
  const svg = heatmap(cells, 2, [{ col: 0, text: '11月' }]);
  assert.equal((svg.match(/<rect/g) || []).length, 3, '先の日は描かない');
  assert.match(svg, /data-title="a"[^>]*style="fill-opacity:1\.00"/);
  assert.match(svg, /data-title="b"[^>]*style="fill-opacity:0\.60"/);
  assert.match(svg, /class="heat empty" data-title="c"/);
  assert.match(svg, /class="heat today" data-title="b"/);
  assert.match(svg, />11月</);
  assert.ok(!svg.includes('NaN'));
});
