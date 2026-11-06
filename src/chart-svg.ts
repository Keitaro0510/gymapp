// グラフ（棒グラフ）の SVG。自作で、DOM には触れず、文字列を返すだけ（人体図の src/body-svg.ts と同じ作り）。
// 軸・目盛り・ラベルを持つ。色は CSS 変数（css/app.css の .chart-*）で、ライト／ダークに合わせる。
// 棒をタップしたときの値の表示は、画面側（src/screens/stats.ts）が data-label・data-value を読んで出す

export interface Bar {
  /** 横軸のラベル（空なら出さない） */
  label: string;
  value: number;
  /** 今の期間（強調する） */
  current?: boolean;
  /** タップしたときに出す名前（例: 「11/3 の週」） */
  title: string;
}

const W = 320;
const H = 190;
const PAD = { left: 40, right: 8, top: 10, bottom: 24 };

/** 縦軸の上端。値の最大を、1・2・5 のどれか × 10 の累乗に切り上げる（目盛りがきれいな数になる） */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  for (const m of [1, 2, 5, 10]) if (v <= m * base) return m * base;
  return 10 * base;
}

/** 棒グラフ。format は縦軸・値の表示（例: kg → 「1.2t」）。tickCount は縦軸の区切り数 */
export function barChart(bars: Bar[], format: (v: number) => string, tickCount = 4): string {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(0, ...bars.map(b => b.value)));
  const y = (v: number): number => PAD.top + plotH - (v / top) * plotH;
  const slot = plotW / Math.max(1, bars.length);
  const barW = slot * 0.62;

  const grid = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (top / tickCount) * i;
    return `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`
      + `<text x="${PAD.left - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${format(v)}</text>`;
  }).join('');

  const rects = bars.map((b, i) => {
    const x = PAD.left + slot * i + (slot - barW) / 2;
    const h = Math.max(b.value > 0 ? 1.5 : 0, (b.value / top) * plotH);
    const label = b.label
      ? `<text class="chart-xl" x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${b.label}</text>`
      : '';
    return `<rect class="chart-bar${b.current ? ' current' : ''}" data-i="${i}" data-title="${b.title}" data-value="${b.value}" `
      + `x="${x.toFixed(1)}" y="${(PAD.top + plotH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>${label}`;
  }).join('');

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="棒グラフ">
    <g class="chart-grid">${grid}</g>
    ${rects}
  </svg>`;
}

// ---------- 折れ線グラフ ----------

export interface LinePoint {
  /** 時刻（ミリ秒）。横軸は時間に比例する */
  t: number;
  value: number;
  /** 強調する点（最高重量を更新した日など） */
  highlight?: boolean;
  /** タップしたときに出す文 */
  title: string;
}

/** きりのよい目盛りの間隔（1・2・2.5・5 × 10 の累乗） */
function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * base;
}

/** 縦軸の下端・上端・間隔。値の最小〜最大が収まるように、きりのよい数に広げる（0 から始めない） */
export function niceScale(min: number, max: number, targetTicks = 4): { lo: number; hi: number; step: number } {
  let lo = min, hi = max;
  if (hi - lo === 0) { lo = Math.max(0, lo - 5); hi = hi + 5; }
  const step = niceStep((hi - lo) / targetTicks);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi += step;
  return { lo, hi, step };
}

/** 折れ線グラフ（点は日ごと）。format は縦軸の表示、dateLabel は横軸の日付 */
export function lineChart(points: LinePoint[], format: (v: number) => string, dateLabel: (t: number) => string): string {
  const plotW = W - PAD.left - PAD.right - 6; // 右の端の点が切れないように、少し空ける
  const plotH = H - PAD.top - PAD.bottom;
  const { lo, hi, step } = niceScale(Math.min(...points.map(p => p.value)), Math.max(...points.map(p => p.value)));
  const y = (v: number): number => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const t0 = Math.min(...points.map(p => p.t)), t1 = Math.max(...points.map(p => p.t));
  const x = (t: number): number => PAD.left + 3 + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);

  const ticks: string[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) {
    const yy = y(v).toFixed(1);
    ticks.push(`<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${yy}" y2="${yy}"/><text x="${PAD.left - 5}" y="${(Number(yy) + 3).toFixed(1)}" text-anchor="end">${format(v)}</text>`);
  }

  const xl = t1 === t0
    ? `<text class="chart-xl" x="${x(t0).toFixed(1)}" y="${H - 8}" text-anchor="middle">${dateLabel(t0)}</text>`
    : [[t0, 'start'], [(t0 + t1) / 2, 'middle'], [t1, 'end']].map(([t, anchor]) =>
      `<text class="chart-xl" x="${x(Number(t)).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${dateLabel(Number(t))}</text>`).join('');

  const line = points.length > 1
    ? `<polyline class="chart-line" points="${points.map(p => `${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>`
    : '';
  const dots = points.map((p, i) =>
    `<circle class="chart-pt${p.highlight ? ' pr' : ''}" data-i="${i}" data-title="${p.title}" cx="${x(p.t).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${p.highlight ? 5 : 3.5}"/>`).join('');

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="折れ線グラフ">
    <g class="chart-grid">${ticks.join('')}</g>
    ${xl}${line}${dots}
  </svg>`;
}
