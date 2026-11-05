// この端末に残っている、今までの版（localStorage だけに保存していた版）の記録を、サーバーに移すための案内。
// - 古い記録（キー gw・gw_ex）は、消さない（サーバーに移したあとも残す。バックアップの代わりになる）
// - 同じ記録は足さないので、移したあとにもう一度案内が出ても二重にならない。移し終えたら（または、足す記録がなければ）案内を止める
import { importIntoDb } from './importing.ts';
import { loadExercises, loadWorkouts, type KeyValueStore } from './storage.ts';
import { state } from './state.ts';
import { newWorkouts } from './gym-rows.ts';
import { userKey, type BannerAction } from './sync.ts';
import type { Workout } from './types.ts';

export interface LegacyUi {
  showBanner(msg: string, actions: BannerAction[]): void;
  hideBanner(): void;
  toast(msg: string): void;
}

function readLegacy(store: KeyValueStore): { workouts: Workout[]; exercises: string[] } | null {
  try {
    const workouts = loadWorkouts(store);
    if (!Array.isArray(workouts) || !workouts.length) return null;
    return { workouts, exercises: loadExercises(store) };
  } catch { return null; }
}

/** ログインして、サーバーから読み込んだあとに呼ぶ */
export function offerLegacyImport(ui: LegacyUi, store: KeyValueStore = localStorage): void {
  const doneKey = userKey('legacy-done');
  if (store.getItem(doneKey)) return;
  const legacy = readLegacy(store);
  if (!legacy) return;
  const missing = newWorkouts(state.workouts, legacy.workouts);
  if (!missing.length) { store.setItem(doneKey, '1'); return; }
  ui.showBanner(
    `この端末に、サーバーにまだない記録が${missing.length}件あります（今までの版が、この端末だけに保存していたもの）。\n` +
    'サーバーに移すと、ほかの端末でも見られます。この端末の記録は、消さずに残します。',
    [
      { label: 'サーバーに移す', primary: true, onclick: () => {
        const added = importIntoDb(legacy.workouts, legacy.exercises);
        if (added === null) return; // 保存できなかった（知らせは出ている）
        store.setItem(doneKey, '1');
        ui.hideBanner();
        ui.toast(`${added}件の記録をサーバーに移しました ✓`);
      } },
      { label: 'あとで', onclick: () => ui.hideBanner() },
    ]);
}
