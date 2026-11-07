// タイマーの計算（画面に触らない部分。テストできるように分けてある）

/** ミリ秒を「m:ss」に直す（1時間以上は「h:mm:ss」）。負の値は 0 とみなす */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 休憩の残りミリ秒。終了の時刻（restEnd）と今（now）から決める。ズレが出ないよう、数えるのではなく時刻の差で出す */
export function restRemaining(restEnd: number | null, now: number): number | null {
  if (restEnd === null) return null;
  return Math.max(0, restEnd - now);
}

/** 休憩の長さ（秒）として使える値か。選択肢以外（壊れた保存値など）は既定に戻す */
export const REST_CHOICES = [60, 90, 120, 180, 300] as const;
export const DEFAULT_REST_SEC = 90;
export function normalizeRestSec(v: unknown): number {
  const n = Number(v);
  return (REST_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_REST_SEC;
}
