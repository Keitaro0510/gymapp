// 部位（筋肉）の一覧と、種目ごとの標準の割り当て。DOM にも通信にも触れない。
// 部位の値は DB（gym_exercises.primary_muscle・secondary_muscles）の check と同じ（maney-app の D24）。一覧を増やすときは、DB の check と一緒に直す

export const MUSCLES = [
  { id: 'chest', label: '胸' },
  { id: 'delt_front', label: '肩（前部）' },
  { id: 'delt_side', label: '肩（中部）' },
  { id: 'delt_rear', label: '肩（後部）' },
  { id: 'lats', label: '広背筋' },
  { id: 'upper_back', label: '僧帽筋・菱形筋' },
  { id: 'biceps', label: '上腕二頭筋' },
  { id: 'triceps', label: '上腕三頭筋' },
  { id: 'forearm', label: '前腕' },
  { id: 'abs', label: '腹' },
  { id: 'glutes', label: '臀部' },
  { id: 'quads', label: '大腿四頭筋' },
  { id: 'hamstrings', label: 'ハムストリング' },
  { id: 'calves', label: 'ふくらはぎ' },
] as const;

export type Muscle = typeof MUSCLES[number]['id'];

const IDS: readonly string[] = MUSCLES.map(m => m.id);

export const MUSCLE_LABEL: Record<Muscle, string> = Object.fromEntries(MUSCLES.map(m => [m.id, m.label])) as Record<Muscle, string>;

export function isMuscle(v: unknown): v is Muscle {
  return typeof v === 'string' && IDS.includes(v);
}

/** 種目の部位。主は1つ（なければ null）、補助は複数（主は入れない） */
export interface Parts {
  primary: Muscle | null;
  secondary: Muscle[];
}

/** 部位の表示（例: 「胸　補助: 肩（前部）・上腕三頭筋」）。未設定は null */
export function describeParts(p: Parts): string | null {
  if (!p.primary) return null;
  const sub = p.secondary.length ? `　補助: ${p.secondary.map(m => MUSCLE_LABEL[m]).join('・')}` : '';
  return MUSCLE_LABEL[p.primary] + sub;
}

const P = (primary: Muscle, ...secondary: Muscle[]): Parts => ({ primary, secondary });

/**
 * 種目名ごとの標準の割り当て（調べた内容。gymapp の #10 に出典）。
 * 新しい種目を、この名前で足したときに、部位を最初から入れる。本番の今の種目にも、これを入れた（2026-11-05）
 * 暫定: チェストプレス・ペックデックフライの補助、シーテッドロウ・スタンディングケーブルロウの主、
 *       デッドリフト（脊柱起立筋が一覧にないので、近い部位で代用）
 */
export const DEFAULT_PARTS: Readonly<Record<string, Parts>> = {
  // 胸
  'ベンチプレス': P('chest', 'delt_front', 'triceps'),
  'スミスインクラインプレス': P('chest', 'delt_front', 'triceps'),
  'チェストプレス': P('chest', 'delt_front', 'triceps'),
  'ペックデックフライ': P('chest', 'delt_front'),
  'チェストディップ': P('chest', 'triceps', 'delt_front'),
  'ダンベルベンチプレス': P('chest', 'delt_front', 'triceps'),
  'ダンベルフライ': P('chest', 'delt_front'),
  // 肩
  'スミスショルダープレス': P('delt_front', 'triceps', 'chest'),
  'ダンベルショルダープレス': P('delt_front', 'triceps', 'chest', 'delt_side'),
  'オーバーヘッドプレス': P('delt_front', 'triceps', 'delt_side', 'upper_back'),
  'ダンベルサイドレイズ': P('delt_side', 'upper_back'),
  'マシンラテラルレイズ': P('delt_side', 'upper_back'),
  'アップライトロウ': P('delt_side', 'upper_back', 'biceps'),
  'フェイスプル': P('delt_rear', 'upper_back'),
  'ダンベルリアレイズ': P('delt_rear', 'upper_back'),
  // 背中
  'ラットプルダウン': P('lats', 'upper_back', 'delt_rear', 'biceps', 'forearm'),
  'シーテッドロウ': P('upper_back', 'lats', 'biceps'),
  'スタンディングケーブルロウ': P('lats', 'upper_back', 'delt_rear', 'biceps'),
  '懸垂': P('lats', 'biceps', 'upper_back', 'forearm', 'delt_rear'),
  'ベントオーバーロウ': P('lats', 'upper_back', 'delt_rear', 'biceps'),
  'ワンハンドダンベルロウ': P('lats', 'upper_back', 'delt_rear', 'biceps'),
  'デッドリフト': P('glutes', 'hamstrings', 'upper_back', 'lats', 'quads', 'forearm'),
  // 腕
  'ダンベルカール': P('biceps', 'forearm'),
  'ハンマーカール': P('biceps', 'forearm'),
  'EZバーカール': P('biceps', 'forearm'),
  'バーベルカール': P('biceps', 'forearm'),
  'トライセプスプレスダウン': P('triceps'),
  'スカルクラッシャー': P('triceps'),
  // 足
  'バーベルスクワット': P('quads', 'glutes', 'hamstrings'),
  'レッグプレス': P('quads', 'glutes', 'hamstrings'),
  'ブルガリアンスクワット': P('quads', 'glutes', 'hamstrings'),
  'ルーマニアンデッドリフト': P('hamstrings', 'glutes'),
  'レッグエクステンション': P('quads'),
  'レッグカール': P('hamstrings', 'calves'),
  'ヒップスラスト': P('glutes', 'hamstrings'),
  'カーフレイズ': P('calves'),
  // 腹
  'クランチ': P('abs'),
  'レッグレイズ': P('abs'),
  'アブローラー': P('abs', 'lats', 'delt_front'),
};
