// 人体図（前面・背面）の SVG。部位ごとの色の濃さを受け取って、赤く塗る。DOM には触れず、文字列を返すだけ。
// 自作の図形（楕円と角丸の四角）。右半身を描いて、左は左右反転で作る。座標は viewBox 0 0 200 410
import { MUSCLE_LABEL, type Muscle } from './muscles.ts';

interface Blob { m: Muscle; cx: number; cy: number; rx: number; ry: number; rot?: number }

// 右半身の部位（前面）。あとに描くものが上に重なる
const FRONT: Blob[] = [
  { m: 'chest', cx: 118, cy: 88, rx: 21, ry: 17 },
  { m: 'abs', cx: 115, cy: 140, rx: 12, ry: 31 },
  { m: 'delt_front', cx: 142, cy: 76, rx: 11, ry: 12 },
  { m: 'delt_side', cx: 154, cy: 86, rx: 8, ry: 12 },
  { m: 'biceps', cx: 150, cy: 118, rx: 9, ry: 20 },
  { m: 'forearm', cx: 154, cy: 192, rx: 8.5, ry: 28 },
  { m: 'quads', cx: 118, cy: 252, rx: 16, ry: 44 },
];

// 右半身の部位（背面）
const BACK: Blob[] = [
  { m: 'upper_back', cx: 112, cy: 82, rx: 14, ry: 16 },
  { m: 'lats', cx: 125, cy: 122, rx: 14, ry: 28, rot: -12 },
  { m: 'delt_rear', cx: 142, cy: 76, rx: 11, ry: 12 },
  { m: 'delt_side', cx: 154, cy: 86, rx: 8, ry: 12 },
  { m: 'triceps', cx: 150, cy: 118, rx: 9, ry: 20 },
  { m: 'forearm', cx: 154, cy: 192, rx: 8.5, ry: 28 },
  { m: 'glutes', cx: 115, cy: 214, rx: 17, ry: 15 },
  { m: 'hamstrings', cx: 118, cy: 266, rx: 16, ry: 36 },
  { m: 'calves', cx: 119, cy: 342, rx: 12.5, ry: 31 },
];

/** 体の輪郭（右半身）。胴・腕・手・脚・足 */
const SILHOUETTE = `
  <path class="base" d="M100 62 L136 64 Q141 118 131 168 L129 204 L100 204 Z"/>
  <rect class="base" x="138" y="68" width="24" height="86" rx="12"/>
  <rect class="base" x="144" y="156" width="20" height="80" rx="10"/>
  <ellipse class="base" cx="154" cy="244" rx="8" ry="10"/>
  <rect class="base" x="101" y="204" width="34" height="96" rx="15"/>
  <rect class="base" x="106" y="302" width="26" height="82" rx="12"/>
  <ellipse class="base" cx="119" cy="392" rx="14" ry="6"/>`;

function blobs(list: Blob[], intensityOf: (m: Muscle) => number): string {
  return list.map(b => {
    const t = Math.max(0, Math.min(1, intensityOf(b.m)));
    // 負荷がなければ、輪郭だけ（塗らない）。あれば、薄い赤（0.2）から濃い赤（1）まで
    const opacity = t > 0 ? (0.2 + 0.8 * t).toFixed(2) : '0';
    const rot = b.rot ? ` transform="rotate(${b.rot} ${b.cx} ${b.cy})"` : '';
    return `<ellipse class="mu" data-muscle="${b.m}" data-t="${t.toFixed(2)}" cx="${b.cx}" cy="${b.cy}" rx="${b.rx}" ry="${b.ry}"${rot} style="fill-opacity:${opacity}"><title>${MUSCLE_LABEL[b.m]}</title></ellipse>`;
  }).join('');
}

/** 人体図 1 枚（前面か背面）。intensityOf は部位 → 0〜1 */
export function bodySvg(view: 'front' | 'back', intensityOf: (m: Muscle) => number): string {
  const half = SILHOUETTE + blobs(view === 'front' ? FRONT : BACK, intensityOf);
  const label = view === 'front' ? '前面' : '背面';
  return `<svg class="body-fig" viewBox="0 0 200 410" role="img" aria-label="人体図（${label}）">
    <circle class="base" cx="100" cy="28" r="18"/>
    <rect class="base" x="91" y="42" width="18" height="18" rx="6"/>
    <g>${half}</g>
    <g transform="translate(200 0) scale(-1 1)">${half}</g>
  </svg>`;
}
