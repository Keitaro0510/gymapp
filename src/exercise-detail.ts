// 種目の詳細（やり方のメモ・解説動画のリンク。#23）の、純粋な関数。DOM にも通信にも触れない。
// 上限は DB（maney-app の D25）の check と同じ

/** メモの文字数の上限 */
export const NOTES_MAX = 5000;
/** 動画のリンクの文字数の上限 */
export const VIDEO_URL_MAX = 2000;

/**
 * 入力された動画のリンクを、保存できる形にする。空なら null。
 * - 前後の空白は取る。「https://」を付けずに貼られたら（例: youtu.be/abc）、https:// を補う
 * - http:// か https:// のものだけ（javascript: などは、エラーにする）。空白を含むもの・長すぎるものもエラー
 */
export function normalizeVideoUrl(input: string): string | null {
  let url = input.trim();
  if (!url) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('動画のリンクは、http:// か https:// で始まる、空白のないものだけ使えます');
  if (url.length > VIDEO_URL_MAX) throw new Error(`動画のリンクが長すぎます（${VIDEO_URL_MAX}文字まで）`);
  return url;
}

/** 開いてよいリンクか（画面で href に入れる前の確認。DB が守っているが、画面でも確かめる） */
export function isSafeLink(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url);
}

/** メモを確かめる（上限を超えていたらエラー） */
export function checkNotes(notes: string): string {
  if (notes.length > NOTES_MAX) throw new Error(`メモが長すぎます（${NOTES_MAX}文字まで。今は${notes.length}文字）`);
  return notes;
}

/** YouTube で「種目名 やり方」を検索するリンク（API キーは要らない。押すと YouTube（アプリ）で開く） */
export function youtubeSearchUrl(exerciseName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName} やり方`)}`;
}
