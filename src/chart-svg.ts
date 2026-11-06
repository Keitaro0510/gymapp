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
