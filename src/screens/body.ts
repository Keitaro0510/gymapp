// 記録画面の「今日の負荷」: 今日トレーニングした部位が、人体図で赤くなる（#11）
import { bodySvg } from '../body-svg.ts';
import { intensity, muscleLoad, SECONDARY_WEIGHT } from '../load.ts';
import { MUSCLE_LABEL, MUSCLES } from '../muscles.ts';
import { state } from '../state.ts';
import { byId, esc } from '../ui.ts';

export function renderBody(): void {
  // 「今日」は、描くときの日付（アプリを開いたまま日をまたいでも、新しい日になる）
  const load = muscleLoad(state.workouts, state.partsByName, new Date());
  const level = (m: Parameters<typeof intensity>[1]): number => intensity(load, m);

  byId('body-figs').innerHTML = `
    <figure class="body-fig-wrap">${bodySvg('front', level)}<figcaption>前面</figcaption></figure>
    <figure class="body-fig-wrap">${bodySvg('back', level)}<figcaption>背面</figcaption></figure>`;

  byId('body-sub').textContent = load.max > 0
    ? `濃いほど、今日のボリュームが大きい部位です（いちばん大きい部位を最も濃く）。補助の部位は${Math.round(SECONDARY_WEIGHT * 100)}%で数えています。`
    : load.hasWorkout
      ? '今日の記録は、部位が未設定の種目だけなので、色がつきません。'
      : '今日はまだ記録がありません。保存すると、効いた部位が赤くなります。';

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
