// 記録画面の「今日の負荷」「今週の負荷」: トレーニングした部位が、人体図で赤くなる（#11・#8）
import { bodySvg } from '../body-svg.ts';
import { intensity, muscleLoadRange, SECONDARY_WEIGHT } from '../load.ts';
import { MUSCLE_LABEL, MUSCLES } from '../muscles.ts';
import { addDays, periodStart } from '../stats.ts';
import { state } from '../state.ts';
import { byId, esc } from '../ui.ts';

const RANGE_KEY = 'gym:body-range';
type BodyRange = 'day' | 'week';

function loadRange(): BodyRange {
  try { return localStorage.getItem(RANGE_KEY) === 'week' ? 'week' : 'day'; } catch { return 'day'; }
}

/** 人体図の期間: 今日 / 今週（月曜から今日まで）。標準は今日 */
let range: BodyRange = loadRange();

export function setBodyRange(r: BodyRange): void {
  range = r;
  try { localStorage.setItem(RANGE_KEY, r); } catch { /* 覚えられなくても、今の表示は変わる */ }
  renderBody();
}

export function renderBody(): void {
  // 「今日」「今週」は、描くときの日付（アプリを開いたまま日をまたいでも、新しい日になる）
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = range === 'week' ? periodStart('week', now) : today;
  const load = muscleLoadRange(state.workouts, state.partsByName, start, addDays(today, 1));
  const level = (m: Parameters<typeof intensity>[1]): number => intensity(load, m);
  const unit = range === 'week' ? '今週' : '今日';

  byId('body-title').textContent = `🔥 ${unit}の負荷`;
  document.querySelectorAll<HTMLElement>('#body-seg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.range === range));

  byId('body-figs').innerHTML = `
    <figure class="body-fig-wrap">${bodySvg('front', level)}<figcaption>前面</figcaption></figure>
    <figure class="body-fig-wrap">${bodySvg('back', level)}<figcaption>背面</figcaption></figure>`;

  byId('body-sub').textContent = load.max > 0
    ? `濃いほど、${unit}のボリュームが大きい部位です（いちばん大きい部位を最も濃く）。補助の部位は${Math.round(SECONDARY_WEIGHT * 100)}%で数えています。`
    : load.hasWorkout
      ? `${unit}の記録は、部位が未設定の種目だけなので、色がつきません。`
      : `${unit}はまだ記録がありません。保存すると、効いた部位が赤くなります。`;

  // 部位ごとの割合（濃い順）
  const chips = MUSCLES
    .map(m => ({ m: m.id, t: level(m.id) }))
    .filter(x => x.t > 0)
    .sort((a, b) => b.t - a.t)
    .map(x => `<span class="body-chip" style="--t:${x.t.toFixed(2)}">${MUSCLE_LABEL[x.m]} ${Math.round(x.t * 100)}%</span>`)
    .join('');
  byId('body-chips').innerHTML = chips;

  byId('body-note').innerHTML = load.unset.length
    ? `部位が未設定の種目は、数えていません: ${esc(load.unset.join('、'))}（種目の画面で設定できます）`
    : '';
}
